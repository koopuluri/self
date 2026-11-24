import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const within = (dir, file) => file === dir || file.startsWith(dir + path.sep);
const literal = dir => '(literal ' + JSON.stringify(dir) + ')';
const subtree = dir => '(subpath ' + JSON.stringify(dir) + ')';

async function nodeRuntime() {
  // GUI launches have a different PATH from Terminal. Prefer the installed
  // Stream toolchain, then use the same runtime as the packaged service.
  const toolchain = path.join(os.homedir(), '.local/share/stream-toolchain');
  const versions = await fs.readdir(toolchain).catch(() => []);
  const installed = versions.filter(v => /^node-v\d+[\d.]*-darwin-(arm64|x64)$/.test(v))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const candidates = [process.env.PI_NODE_BINARY, ...installed.map(v => path.join(toolchain, v, 'bin/node')), process.execPath];
  for (const file of candidates.filter(Boolean)) {
    if (file !== process.execPath && process.env.PI_NODE_ELECTRON === '1' && file === process.env.PI_NODE_BINARY) continue;
    try { await fs.access(file, fs.constants.X_OK); return await fs.realpath(file); } catch {}
  }
  throw new Error('No local Node runtime is available.');
}

function profile(root, source, temp, node, check, network) {
  const system = ['/bin', '/sbin', '/usr', '/System', '/Library/Developer/CommandLineTools', '/Applications/Xcode.app', '/opt/homebrew'];
  const runtimeRoot = node.includes('.app/Contents/') ? node.split('.app/Contents/')[0] + '.app' : path.dirname(path.dirname(node));
  const hidden = '(regex #"/([.]git-credentials|[.]netrc|[.]npmrc|[.]ssh|[.]aws|[.]codex|[.]gnupg|[.]env([.][^/]*)?)(/|$)|[.](pem|key)$")';
  const piSource = path.resolve(source,'../../../π/service');
  const privateData = ['π/.runtime', 'π/chats', 'π/threads', 'π/logs'].map(p => subtree(path.join(root, p)));
  // The Preview workspace itself lives under source/.runtime.
  const runtime = path.join(source, '.runtime');
  const siblingData = within(runtime, root)
    ? '(require-all ' + subtree(runtime) + ' (require-not ' + subtree(root) + '))' : subtree(runtime);
  const build = path.join(source, 'build');
  const exportDir = path.join(build, 'preview-export');
  const protectedWrites = ['<3/stream.md', '<3/stream', 'π/config.json', '.agents'].map(p => subtree(path.join(root, p)));
  protectedWrites.push('(regex #"/([.]git|node_modules)(/|$)")', '(require-all ' + subtree(build) + ' (require-not ' + subtree(exportDir) + '))');
  return [
    '(version 1)', '(deny default)', '(import "system.sb")',
    '(allow process-exec* process-fork)', '(allow signal (target same-sandbox))',
    '(allow file-read-metadata)',
    '(allow file-read* file-map-executable ' + [...system, runtimeRoot, root, source, piSource, temp, path.resolve(source,'../../../π/functions'), '/private/etc', path.resolve(source,'../personal-site/app/workspace-fonts.css'), path.resolve(source,'../personal-site/fonts')].map(subtree).join(' ') + ')',
    // Preview checks use shared instructions, not a copy in the Preview data root.
    '(allow file-read-data ' + literal(path.resolve(source, '../../../AGENTS.md')) + ')',
    '(allow file-write* ' + [root, source, piSource, temp].map(subtree).join(' ') + ')',
    '(deny file-read-data file-map-executable file-write* ' + [hidden, siblingData, ...privateData].join(' ') + ')',
    '(deny file-write* ' + protectedWrites.join(' ') + ')',
    '(deny file-write-unlink ' + [root, source, build, path.join(root,'π'), path.join(root,'<3'), runtime].map(literal).join(' ') + ')',
    ...(network ? ['(allow network-outbound (remote ip "*:*"))', '(allow mach-lookup (global-name "com.apple.mDNSResponder") (global-name "com.apple.SystemConfiguration.configd"))'] : []),
    ...(check === 'test' ? ['(allow network* (local ip "localhost:*") (remote ip "localhost:*"))'] : []),
  ].join('\n');
}

function execute(args, cwd, env, signal, timeout) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/sandbox-exec', args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let bytes = 0, truncated = false, timedOut = false;
    const chunks = [];
    const collect = chunk => {
      const n = Math.min(chunk.length, 65536 - bytes);
      if (n) { chunks.push(chunk.subarray(0, n)); bytes += n; }
      if (n < chunk.length) truncated = true;
    };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    const stop = () => { if (child.pid) try { process.kill(-child.pid, 'SIGKILL'); } catch {} };
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeout);
    signal?.addEventListener('abort', stop, { once: true });
    child.once('exit', stop);
    child.on('error', error => { clearTimeout(timer); signal?.removeEventListener('abort', stop); reject(error); });
    child.on('close', (code, exitSignal) => {
      clearTimeout(timer); signal?.removeEventListener('abort', stop);
      if (signal?.aborted) return reject(signal.reason);
      resolve({ exitCode: code, signal: exitSignal, timedOut, truncated, output: Buffer.concat(chunks).toString('utf8') });
    });
  });
}

export async function workspaceCommand(store, { command, cwd = '.', check, network = false }, signal, approveNetwork) {
  if (process.platform !== 'darwin') throw new Error('Stream workspace commands require macOS.');
  const root = await fs.realpath(store.root);
  const product = '<3/artifacts/stream-app';
  const source = await fs.realpath(process.env.PI_STREAM_SOURCE || path.join(root, product));
  const rel = path.normalize(cwd);
  if (path.isAbsolute(rel) || rel === '..' || rel.startsWith('../')) throw new Error('Use a directory relative to self.');
  const productPath = check || rel === product || rel.startsWith(product + '/');
  const piPath = !check && (rel === 'π/service' || rel.startsWith('π/service/'));
  const base = piPath ? path.resolve(source,'../../../π/service') : productPath ? source : root;
  const working = await fs.realpath(check ? source : path.join(base, piPath ? path.relative('π/service',rel) : productPath ? path.relative(product, rel) : rel));
  if (!within(base, working)) throw new Error('Directory outside the workspace.');
  const node = await nodeRuntime();
  const checks = { check: ['node_modules/typescript/bin/tsc', '--noEmit'], test: ['--test', 'tests/*.test.mjs'], build: ['node_modules/next/dist/bin/next', 'build', '--webpack'] };
  if (check && !Object.hasOwn(checks, check)) throw new Error('Unknown check.');
  if (!check && (typeof command !== 'string' || !command.trim() || command.length > 16000)) throw new Error('Provide a shell command of up to 16000 characters.');
  if (network) {
    if (check || !await approveNetwork?.({ command, cwd: working }, signal)) throw new Error('Network permission was declined. The command did not run.');
    signal?.throwIfAborted();
  }
  const temp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'stream-shell-')));
  try {
    const electron = node.includes('.app/Contents/MacOS/') && path.basename(node) !== 'node';
    if (electron) await fs.symlink(node, path.join(temp,'node'));
    const env = { HOME: temp, TMPDIR: temp, PATH: [temp, path.dirname(node), '/Library/Developer/CommandLineTools/usr/bin', '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':'), LANG: 'en_US.UTF-8', NEXT_TELEMETRY_DISABLED: '1', ...(electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) };
    const args = check ? [node, ...checks[check]] : ['/bin/bash', '--noprofile', '--norc', '-c', command];
    return await execute(['-p', profile(root, source, temp, node, check, network), ...args], working, env, signal, check ? 120000 : 60000);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
}

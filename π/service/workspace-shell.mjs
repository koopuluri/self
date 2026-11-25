import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

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

function execute(binary, args, cwd, env, signal, timeout) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
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

const checks = {
  check: ['node_modules/typescript/bin/tsc', '--noEmit'],
  test: ['--test', 'tests/*.test.mjs'],
  build: ['node_modules/next/dist/bin/next', 'build', '--webpack'],
};

export async function workspaceCommand(store, { command, cwd = '.', check }, signal) {
  if (process.platform !== 'darwin') throw new Error('Stream workspace commands require macOS.');
  signal?.throwIfAborted();
  if (check && !Object.hasOwn(checks, check)) throw new Error('Unknown check.');
  if (!check && (typeof command !== 'string' || !command.trim() || command.length > 16000)) throw new Error('Provide a shell command of up to 16000 characters.');

  const product = '<3/artifacts/stream-app';
  const source = process.env.PI_STREAM_SOURCE || path.join(store.root, product);
  const rel = path.normalize(cwd);
  let working = path.resolve(store.root, rel);
  if (check) working = source;
  else if (rel === product || rel.startsWith(product + '/')) working = path.resolve(source, path.relative(product, rel));
  else if (rel === 'π/service' || rel.startsWith('π/service/')) working = path.resolve(source, '../../../', rel);
  else if (rel === '~' || rel.startsWith('~/')) working = path.resolve(os.homedir(), rel.slice(2));

  const node = await nodeRuntime();
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
  const bins = [path.dirname(node), ...((env.PATH || '').split(':').filter(Boolean)), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  let shim;
  try {
    if (node.includes('.app/Contents/MacOS/') && path.basename(node) !== 'node') {
      shim = await fs.mkdtemp(path.join(os.tmpdir(), 'stream-node-'));
      await fs.symlink(node, path.join(shim, 'node'));
      bins.unshift(shim);
      env.ELECTRON_RUN_AS_NODE = '1';
    }
    env.PATH = [...new Set(bins)].join(':');
    return check
      ? await execute(node, checks[check], working, env, signal, 120000)
      : await execute('/bin/bash', ['--noprofile', '--norc', '-c', command], working, env, signal, 60000);
  } finally {
    if (shim) await fs.rm(shim, { recursive: true, force: true });
  }
}

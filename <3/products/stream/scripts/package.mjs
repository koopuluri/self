import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
const product = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = path.join(product, 'build/stream.app');
await fs.mkdir(path.dirname(bundle), { recursive: true });
await fs.rm(bundle, { recursive: true, force: true });
await fs.cp(path.join(product, 'node_modules/electron/dist/Electron.app'), bundle, { recursive: true, verbatimSymlinks: true });
const plist = path.join(bundle, 'Contents/Info.plist');
for (const [key, value] of Object.entries({ CFBundleName: 'stream', CFBundleDisplayName: 'stream', CFBundleIdentifier: 'local.self.stream' })) {
  await exec('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist]);
}
const bootstrap = path.join(bundle, 'Contents/Resources/app');
await fs.mkdir(bootstrap, { recursive: true });
await fs.writeFile(path.join(bootstrap, 'package.json'), JSON.stringify({ name: 'stream', version: '0.1.0', main: 'main.cjs' }));
await fs.writeFile(path.join(bootstrap, 'main.cjs'), `require(${JSON.stringify(path.join(product, 'electron/main.cjs'))});\n`);
await exec('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--preserve-metadata=entitlements', bundle]);
console.log(bundle);

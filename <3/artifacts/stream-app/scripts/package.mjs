import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
const product = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const preview = process.argv.includes('--preview');
const name = preview ? 'Stream Preview' : 'stream';
const bundle = path.join(product, 'build', name + '.app');
await fs.mkdir(path.dirname(bundle), { recursive: true });
await fs.rm(bundle, { recursive: true, force: true });
await fs.cp(path.join(product, 'node_modules/electron/dist/Electron.app'), bundle, { recursive: true, verbatimSymlinks: true });
await fs.copyFile(path.join(product, 'electron/stream.icns'), path.join(bundle, 'Contents/Resources/stream.icns'));
const plist = path.join(bundle, 'Contents/Info.plist');
for (const [key, value] of Object.entries({ CFBundleName: name, CFBundleDisplayName: name, CFBundleIdentifier: preview ? 'local.self.stream.preview' : 'local.self.stream', CFBundleIconFile: 'stream.icns' })) {
  await exec('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist]);
}
const bootstrap = path.join(bundle, 'Contents/Resources/app');
await fs.mkdir(bootstrap, { recursive: true });
await fs.writeFile(path.join(bootstrap, 'package.json'), JSON.stringify({ name: 'stream', version: '0.1.0', main: 'main.cjs' }));
await fs.writeFile(path.join(bootstrap, 'main.cjs'), `require(${JSON.stringify(path.join(product, preview ? 'electron/preview.cjs' : 'electron/main.cjs'))});\n`);
await exec('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--preserve-metadata=entitlements', bundle]);
console.log(bundle);

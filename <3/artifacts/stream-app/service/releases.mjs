import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const copy = promisify(execFile);
async function select(product, version) {
  const pointer = path.join(product, 'build/stable.json');
  const temp = pointer + '.' + randomUUID();
  await fs.writeFile(temp, JSON.stringify({ version }) + '\n', { flag: 'wx' });
  await fs.rename(temp, pointer);
}

export async function stageRelease(product, ui = path.join(product, 'build/export')) {
  await fs.access(path.join(ui, 'index.html'));
  const releases = path.join(product, 'build/releases');
  await fs.mkdir(releases, { recursive: true });
  const version = randomUUID(), folder = path.join(releases, version);
  await fs.mkdir(folder);
  try {
    for (const item of ['electron', 'service', 'package.json', 'node_modules']) {
      await copy('/bin/cp', ['-cR', path.join(product, item), path.join(folder, item)]);
    }
    // Freeze the shared record-format modules into this release.
    for (const name of await fs.readdir(path.join(product, 'service'))) {
      const src = path.join(product, 'service', name);
      if ((await fs.lstat(src)).isSymbolicLink()) {
        const dest = path.join(folder, 'service', name);
        await fs.unlink(dest); await fs.copyFile(src, dest);
      }
    }
    await copy('/bin/cp', ['-cR', ui, path.join(folder, 'out')]);
    await select(product, version);
    return version;
  } catch (error) {
    await fs.rm(folder, { recursive: true, force: true });
    throw error;
  }
}

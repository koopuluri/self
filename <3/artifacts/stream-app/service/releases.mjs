import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const copy = promisify(execFile);
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/;
const runningFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function releaseVersion(product, channel) {
  const { version } = JSON.parse(await fs.readFile(path.join(product, 'build', channel + '.json'), 'utf8'));
  if (!uuid.test(version)) throw new Error('Invalid release selection.');
  return version;
}

async function select(product, channel, version) {
  const pointer = path.join(product, 'build', channel + '.json');
  const temp = pointer + '.' + randomUUID();
  await fs.writeFile(temp, JSON.stringify({ version }) + '\n', { flag: 'wx' });
  await fs.rename(temp, pointer);
}

export async function stageRelease(product, ui = path.join(product, 'build/preview-export')) {
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
    await select(product, 'preview', version);
    return version;
  } catch (error) {
    await fs.rm(folder, { recursive: true, force: true });
    throw error;
  }
}

export async function promoteRelease(product, useRunningPreview = false, previewFolder = runningFolder) {
  const version = useRunningPreview ? path.basename(previewFolder) : await releaseVersion(product, 'preview');
  const folder = path.join(await fs.realpath(product), 'build/releases', version);
  if (!uuid.test(version) || (useRunningPreview && previewFolder !== folder)) {
    throw new Error('Open the packaged Stream Preview to adopt the release you are using.');
  }
  await fs.access(path.join(folder, 'out/index.html'));
  await select(product, 'stable', version);
  return version;
}

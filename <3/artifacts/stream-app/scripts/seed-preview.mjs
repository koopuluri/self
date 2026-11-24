import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const product = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(product, '../../../<3/stream');
const parent = path.join(product, '.runtime');
const dest = path.join(parent, 'preview-self');
await fs.mkdir(parent, { recursive: true });
async function seed() {
  try { await fs.access(dest); return; } catch (err) { if (err.code !== 'ENOENT') throw err; }
  const temp = await fs.mkdtemp(path.join(parent, 'seed-'));
  try {
    const records = path.join(temp, '<3/stream');
    await fs.mkdir(records, { recursive: true });
    let filename;
    for (const name of ['index.md','../stream.md','stream.md']) {
      const stat = await fs.lstat(path.join(source, name)).catch(error => { if (error.code !== 'ENOENT') throw error; });
      if (stat?.isFile()) { filename = name; break; }
    }
    if (!filename) throw new Error('No stream source found.');
    const streamFile = path.join(source, filename);
    for (let attempt = 0; ; attempt++) {
      const md = await fs.readFile(streamFile);
      const meta = await fs.readFile(path.join(source, 'metadata.json'));
      const ids = [...md.toString().matchAll(/<!-- beat:(\d+) -->$/gm)].map(m => m[1]);
      const parsed = JSON.parse(meta);
      if (ids.every(id => parsed.beats[id]) && md.equals(await fs.readFile(streamFile)) &&
          meta.equals(await fs.readFile(path.join(source, 'metadata.json')))) {
        await fs.writeFile(path.join(records, filename), md);
        await fs.writeFile(path.join(records, 'metadata.json'), meta);
        break;
      }
      if (attempt === 19) throw new Error('Could not capture a consistent stream. Try Preview setup again.');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    await fs.rename(temp, dest);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
}
await seed();

// Older Preview seeds copied only the stream index. Supply only referenced,
// missing transcripts. Existing Preview conversations keep their own history.
const metadata = JSON.parse(await fs.readFile(path.join(dest, '<3/stream/metadata.json'), 'utf8'));
const chatDir = path.join(dest, 'π/chats');
await fs.mkdir(chatDir, { recursive: true });
for (const id of new Set(Object.values(metadata.beats).filter(b => b.kind === 'chat').map(b => b.chatId))) {
  if (!id || !/^[\w-]+$/.test(id)) continue;
  for (const extension of ['.md', '.json']) {
    const name = id + extension;
    try { await fs.copyFile(path.join(source, '../../π/chats', name), path.join(chatDir, name), fs.constants.COPYFILE_EXCL); }
    catch (error) { if (!['ENOENT', 'EEXIST'].includes(error.code)) throw error; }
  }
}

// Make the workspace's single-document artifacts available to edit in Preview.
// Seed missing documents only, preserving edits made in either app.
const artifacts = path.resolve(source, '../artifacts');
const copies = path.join(dest, '<3/artifacts');
await fs.mkdir(copies, { recursive: true });
for (const entry of await fs.readdir(artifacts, { withFileTypes: true })) {
  if (!entry.isFile() || !/\.(md|txt)$/i.test(entry.name)) continue;
  await fs.copyFile(path.join(artifacts, entry.name), path.join(copies, entry.name), fs.constants.COPYFILE_EXCL)
    .catch(error => { if (error.code !== 'EEXIST') throw error; });
}

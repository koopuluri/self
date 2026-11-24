import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { StreamStore } from '../service/store.mjs';
const product = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const self = path.resolve(product, '../../..');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-stream-qa-'));
const records = '<3/stream';
await fs.mkdir(path.join(root, records), { recursive: true });
for (const name of ['index.md', 'metadata.json']) {
  await fs.copyFile(path.join(self, records, name), path.join(root, records, name));
}
const store = await new StreamStore(root).init();
const text = store.beats.map(b => b.text).join(' ');
console.log(JSON.stringify({ root, beats: store.beats.length, words: text.split(/\s+/).length }));

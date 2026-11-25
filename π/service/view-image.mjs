import fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';

// Only Stream-owned local assets, never arbitrary markdown URLs or files.
export async function viewImage(store, id) {
  const { status, beat } = store.resolve(id);
  if (status !== 'live' || beat.kind !== 'asset') throw new Error('Choose a live image asset beat.');
  const ref = beat.asset?.path ?? decodeURIComponent(beat.text.match(/^!\[.*\]\((assets\/[^)]+)\)$/)?.[1] ?? '').replace(/^assets\//, '<3/stream/assets/');
  if (path.dirname(ref) !== '<3/stream/assets' || path.basename(ref).startsWith('.')) throw new Error('Only images in Stream assets can be viewed.');
  const file = path.resolve(store.root, ref);
  if (await fs.realpath(file) !== path.join(await fs.realpath(store.root), ref)) throw new Error('Linked assets cannot be viewed.');
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 12 * 1024 * 1024) throw new Error('Choose an image file of 12 MiB or less.');
    const bytes = await handle.readFile();
    const mimeType = bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a','hex')) ? 'image/png' :
      bytes.subarray(0, 3).equals(Buffer.from('ffd8ff','hex')) ? 'image/jpeg' :
      bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP' ? 'image/webp' : null;
    if (!mimeType) throw new Error('Choose a PNG, JPEG, or WebP image beat. Videos stay path-only.');
    return { type: 'image', mimeType, data: bytes.toString('base64') };
  } finally { await handle.close(); }
}

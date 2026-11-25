import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { StreamStore } from '../store.mjs';
import { viewImage } from '../view-image.mjs';

test('media references are discoverable without opening video or following a link outside assets', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'view-image-'));
  t.after(() => fs.rm(root, {recursive:true, force:true}));
  const store = await new StreamStore(root).init();
  const file = path.join(root, 'movie.mp4');
  await fs.writeFile(file, Buffer.from('000000146674797069736f6d','hex'));
  const id = await store.importAsset(file);
  assert.equal(store.precedingTextBeats(null, 1, true)[0].id, id);
  assert.deepEqual(store.precedingTextBeats(null, 1), []);
  await assert.rejects(viewImage(store, id), /Videos stay path-only/);
  const target = path.join(root, store.resolve(id).beat.asset.path);
  await fs.unlink(target); await fs.symlink(file, target);
  await assert.rejects(viewImage(store, id), /Linked assets/);
  await assert.rejects(viewImage(store, 999), /live image/);
});

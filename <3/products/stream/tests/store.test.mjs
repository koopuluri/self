import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { StreamStore, parse, serialize } from '../service/store.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-stream-store-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return new StreamStore(root).init();
}
test('Markdown is authoritative, including empty permanent slots and whitespace', async t => {
  const store = await fixture(t);
  await store.edit([{ id: 0, before: '', text: 'first thought  ' }]); await store.complete(0);
  await store.edit([{ id: 1, before: '', text: 'second thought' }]); await store.complete(1);
  await store.remove(0);
  const markdown = await fs.readFile(store.file, 'utf8');
  assert.deepEqual(parse(markdown).map(b => b.text), ['', 'second thought', '']);
  const reopened = await new StreamStore(store.root).init();
  assert.equal(reopened.beats[1].id, 1); assert.equal(reopened.metadata.nextId, 3);
  assert.equal(await fs.access(path.join(store.directory, 'history')).then(() => true, () => false), false);
  assert.equal(serialize([{ id: 0, text: 'two spaces  ' }]), 'two spaces   <!-- beat:0 -->\n');
  assert.equal(parse('two spaces   <!-- beat:0 -->\n')[0].text, 'two spaces  ');
});
test('external edits are read; a stale app edit never overwrites them', async t => {
  const store = await fixture(t);
  await store.edit([{ id: 0, before: '', text: 'original' }]);
  await fs.writeFile(store.file, 'external edit <!-- beat:0 -->\n');
  await assert.rejects(store.edit([{ id: 0, before: 'original', text: 'stale app edit' }]), /changed outside/);
  assert.match(await fs.readFile(store.file, 'utf8'), /external edit/);
  await store.edit([{ id: 0, before: 'external edit', text: 'new wording' }]);
  assert.doesNotMatch(await fs.readFile(store.file, 'utf8'), /original|external edit/);
});
test('import preserves wording and provenance without invented creation times', async t => {
  const store = await fixture(t), file = path.join(store.root, 'source.md');
  const original = '  a thought with spaces  \n\nπ — a question\n'; await fs.writeFile(file, original);
  await store.importNotes([file]);
  assert.equal(await fs.readFile(file, 'utf8'), original);
  assert.equal(store.beats[0].text, '  a thought with spaces  ');
  assert.equal(store.metadata.beats[0].createdAt, null);
  assert.equal(store.metadata.beats[1].source.line, 3);
  assert.equal(store.metadata.beats[0].completedAt, null);
});
test('redaction retains original; clearing content does not renumber or create revisions', async t => {
  const store = await fixture(t); await store.append('retained original');
  await store.redact(0); assert.equal(store.beats[0].text, 'retained original');
  await store.remove(0); assert.equal(store.beats[0].text, ''); assert.equal(store.beats[1].id, 1);
  assert.doesNotMatch(await fs.readFile(store.file, 'utf8'), /retained original/);
});
test('concurrent appends allocate unique monotonically increasing IDs', async t => {
  const store = await fixture(t);
  await Promise.all(Array.from({ length: 20 }, (_, i) => store.append(`thought ${i}`)));
  assert.deepEqual(store.beats.map(b => b.id), Array.from({ length: 21 }, (_, i) => i));
});
test('marker deletion leaves an empty slot, malformed Markdown blocks writes', async t => {
  const store = await fixture(t); await store.append('zero'); await store.append('one');
  await fs.writeFile(store.file, 'one <!-- beat:1 -->\n'); await store.reloadExternal();
  assert.equal(store.beats[0].text, ''); assert.equal(store.beats.length, 3);
  await fs.writeFile(store.file, 'unmarked external prose\n');
  await assert.rejects(store.append('new text'), /without a beat marker/);
  assert.equal(await fs.readFile(store.file, 'utf8'), 'unmarked external prose\n');
});
test('asset ingestion copies original bytes and uses a stable managed path', async t => {
  const store = await fixture(t), file = path.join(store.root, 'test asset.txt');
  await fs.writeFile(file, 'original bytes'); const id = await store.importAsset(file);
  const asset = store.metadata.beats[id].asset;
  assert.equal(path.isAbsolute(asset.path), false);
  assert.equal(await fs.readFile(path.resolve(store.root, asset.path), 'utf8'), 'original bytes');
  assert.equal(await fs.readFile(file, 'utf8'), 'original bytes');
  assert.match(store.beats[id].text, /!\[test asset.txt\]/);
});
test('focus visit interrupted by restart retains an unknown exit', async t => {
  const store = await fixture(t); await store.focus(0);
  const reopened = await new StreamStore(store.root).init();
  assert.equal(reopened.metadata.beats[0].visits[0].exitedAt, null);
});
test('media references migrate and survive moving the entire workspace', async t => {
  const store = await fixture(t), file = path.join(store.root, 'original.txt');
  await fs.writeFile(file, 'unchanged original');
  const id = await store.importAsset(file);
  store.metadata.beats[id].asset.path = path.resolve(store.root, store.metadata.beats[id].asset.path);
  await store.persistMetadata();
  const migrated = await new StreamStore(store.root).init();
  assert.equal(path.isAbsolute(migrated.metadata.beats[id].asset.path), false);
  const destination = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-stream-moved-'));
  t.after(() => fs.rm(destination, { recursive: true, force: true }));
  await fs.cp(store.root, destination, { recursive: true });
  const reopened = await new StreamStore(destination).init();
  assert.equal(await fs.readFile(path.resolve(destination, reopened.metadata.beats[id].asset.path), 'utf8'), 'unchanged original');
  assert.equal(await fs.readFile(reopened.file, 'utf8'), await fs.readFile(store.file, 'utf8'));
});

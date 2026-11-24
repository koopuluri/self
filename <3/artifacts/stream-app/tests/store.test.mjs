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
test('Markdown preserves whitespace and identities after deletion', async t => {
  const store = await fixture(t);
  await store.edit([{ id: 0, before: '', text: 'first thought  ' }]); await store.complete(0);
  await store.edit([{ id: 1, before: '', text: 'second thought' }]); await store.complete(1);
  await store.remove(0);
  const markdown = await fs.readFile(store.file, 'utf8');
  assert.deepEqual(parse(markdown).map(b => b.text), ['second thought', '']);
  const reopened = await new StreamStore(store.root).init();
  assert.equal(reopened.beats[0].id, 1); assert.equal(reopened.resolve(0).status, 'deleted'); assert.equal(reopened.metadata.nextId, 3);
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
  await store.remove(0); assert.equal(store.resolve(0).status, 'deleted'); assert.equal(store.beats[0].id, 1);
  assert.doesNotMatch(await fs.readFile(store.file, 'utf8'), /retained original/);
});
test('concurrent appends allocate unique monotonically increasing IDs', async t => {
  const store = await fixture(t);
  await Promise.all(Array.from({ length: 20 }, (_, i) => store.append(`thought ${i}`)));
  assert.deepEqual(store.beats.map(b => b.id), Array.from({ length: 21 }, (_, i) => i));
});
test('marker deletion retires the ID, malformed Markdown blocks writes', async t => {
  const store = await fixture(t); await store.append('zero'); await store.append('one');
  await fs.writeFile(store.file, 'one <!-- beat:1 -->\n'); await store.reloadExternal();
  assert.equal(store.resolve(0).status, 'deleted'); assert.equal(store.beats[0].id, 1); assert.equal(store.beats.length, 1);
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
  assert.deepEqual(store.beats.map(beat => beat.id), [id, 0]);
  assert.match(store.beat(id).text, /!\[test asset.txt\]/);
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

test('a multiline paste saves every line, including blank beats, in one edit', async t => {
  const store = await fixture(t);
  await store.append('earlier');
  await store.edit([
    { id: 1, before: '', text: '  first', complete: true },
    { id: 2, before: null, text: '', complete: true },
    { id: 3, before: null, text: 'π, pasted text  ', complete: true },
    { id: 4, before: null, text: '' },
  ]);
  const reopened = await new StreamStore(store.root).init();
  assert.deepEqual(reopened.beats.map(b => b.text), ['earlier', '  first', '', 'π, pasted text  ', '']);
  assert.ok(reopened.metadata.beats[2].completedAt);
  assert.equal(reopened.metadata.beats[4].completedAt, null);
  await assert.rejects(reopened.edit([{ id: 4, before: '', text: 'overwrite' }, { id: 4, before: null, text: 'stale paste' }]), /changed outside/);
  assert.equal(reopened.beats[4].text, '');
});

test('migrating preserves IDs, prose and provenance and retires old paste separators', async t => {
  const store = await fixture(t);
  await fs.writeFile(store.file, serialize([{ id: 0, text: 'source  ' }, { id: 1, text: '' }, { id: 2, text: 'next' }, { id: 3, text: '' }]));
  const source = { path: 'note.md', line: 9 };
  await fs.writeFile(store.metadataFile, JSON.stringify({ version: 1, nextId: 4, beats: {
    0: { kind: 'text', source, createdAt: null, completedAt: null }, 1: { kind: 'text', completedAt: 'batch' },
    2: { kind: 'text', completedAt: 'batch' }, 3: { kind: 'text', completedAt: null },
  } }));
  const migrated = await new StreamStore(store.root).init();
  assert.deepEqual(migrated.beats.map(b => b.id), [0, 2, 3]);
  assert.equal(migrated.resolve(1).status, 'deleted');
  assert.deepEqual(migrated.resolve(0).beat.source, source);
  assert.equal(migrated.resolve(0).beat.text, 'source  ');
  assert.equal(migrated.metadata.nextId, 4);
  const reopened = await new StreamStore(store.root).init();
  assert.deepEqual(reopened.snapshot(), migrated.snapshot());
});

test('permalinks follow joins and moves, survive restart and stay retired after deletion', async t => {
  const store = await fixture(t);
  await store.append('a'); await store.append('b'); await store.redact(1);
  const snapshot = store.snapshot();
  const change = { baseHash: snapshot.hash, baseNextId: 3, nextId: 4, retired: { 1: 0 },
    rows: [{ id: 3, text: 'before' }, { id: 0, text: 'ab' }, { id: 2, text: '' }] };
  await store.saveDocument(change);
  assert.equal(store.resolve(1).beat.id, 0);
  assert.equal(store.resolve(0).beat.redacted, true);
  await assert.rejects(store.saveDocument(change), /changed outside/);
  const reopened = await new StreamStore(store.root).init();
  assert.equal(reopened.resolve(1).beat.text, 'ab');
  await reopened.remove(0);
  assert.equal(reopened.resolve(1).status, 'deleted');
  assert.equal(reopened.resolve(0).status, 'deleted');
  assert.equal(reopened.resolve(2000).status, 'missing');
  assert.equal(await reopened.complete(2), 4);
});

test('a pending metadata commit recovers after Markdown has reached disk', async t => {
  const store = await fixture(t);
  await store.append('existing');
  const original = await fs.readFile(store.metadataFile);
  await store.remove(0);
  await fs.writeFile(store.journal, JSON.stringify({ hash: store.hash, metadata: store.metadata }));
  await fs.writeFile(store.metadataFile, original);
  const recovered = await new StreamStore(store.root).init();
  assert.equal(recovered.resolve(0).status, 'deleted');
  assert.equal(recovered.metadata.nextId, 2);
  assert.equal(await fs.stat(store.journal).catch(() => null), null);
});

test('the live legacy alias migrates managed links and preserves the writer’s text and IDs', async t => {
  const store = await fixture(t);
  const legacyPath = path.join(store.directory, 'stream.md');
  const prose = 'keep [my link](../../π/chats/example.md)  ';
  const rows = [
    { id: 4, text: '![photo](../assets/photo.jpg)' },
    { id: 8, text: '[chat with π](../../π/chats/example.md)' },
    { id: 9, text: prose },
  ];
  await fs.writeFile(legacyPath, serialize(rows));
  await fs.unlink(store.file);
  await fs.symlink('stream/stream.md', path.join(store.directory, '../stream.md'));
  await fs.writeFile(store.metadataFile, JSON.stringify({ version: 2, nextId: 10, beats: {
    4: { kind: 'asset' }, 8: { kind: 'chat' }, 9: { kind: 'text' },
  } }));
  const migrated = await new StreamStore(store.root).init();
  assert.equal((await fs.lstat(migrated.file)).isFile(), true);
  assert.deepEqual(migrated.beats, [
    { id: 4, text: '![photo](assets/photo.jpg)' },
    { id: 8, text: '[chat with π](../../π/chats/example.md)' },
    { id: 9, text: prose },
  ]);
  assert.equal(await fs.readFile(legacyPath, 'utf8'), serialize(rows));
});

test('a writer index alias follows the latest save over the stale nested copy', async t => {
  const store = await fixture(t);
  const old = path.join(store.directory, '../stream.md');
  const latest = serialize([{ id: 0, text: 'latest prose  ' }]);
  await fs.writeFile(old, latest);
  await fs.writeFile(path.join(store.directory, 'stream.md'), serialize([{ id: 0, text: 'earlier' }]));
  await fs.unlink(store.file);
  await fs.symlink('../stream.md', store.file);
  const migrated = await new StreamStore(store.root).init();
  assert.equal(migrated.beats[0].text, 'latest prose  ');
  assert.equal((await fs.lstat(migrated.file)).isFile(), true);
  assert.equal(await fs.readFile(old, 'utf8'), latest);
  await migrated.edit([{ id: 0, before: 'latest prose  ', text: 'new writing' }]);
  assert.equal((await new StreamStore(store.root).init()).beats[0].text, 'new writing');
});

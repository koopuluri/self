import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inventory, pageEntries, canonicalPath, resolveLink, prepareMarkdown, readDocument, essaySources } from '../lib/workspace.mjs';
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'self-workspace-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (name, text) => { mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); writeFileSync(path.join(root, name), text); };
  write('README.md', 'intro'); write('<3/README.md', '# expressions');
  write('<3/notes/hello world.md', '# my note\n\nunchanged text');
  write('<3/assets/photo.png', 'image');
  write('<3/essays/new-essay.md', '---\ntitle: My Essay\n---\n\nDraft');
  write('π/README.md', '# personal ai'); write('$/README.md', '# stock');
  return { root, write };
}
test('new records and essays appear without a selection list', t => {
  const { root, write } = fixture(t);
  assert(pageEntries(root).has('/%3C3/notes/hello%20world'));
  write('<3/chats/new.md', '# conversation');
  assert(pageEntries(root).has('/%3C3/chats/new'));
  assert.deepEqual(essaySources(root), ['<3/essays/new-essay.md']);
  assert.equal(canonicalPath('<3/essays/new-essay.md'), '/new-essay');
});
test('runtime state, dependencies, symlinks and traversal cannot expose files', t => {
  const { root, write } = fixture(t);
  write('<3/products/app/.env.local', 'secret'); write('<3/products/app/node_modules/package/key.json', 'secret'); write('.ghost/private.md', 'secret');
  symlinkSync(path.join(root, '.ghost'), path.join(root, '<3/leak'));
  const files = inventory(root).files;
  assert(![...files.keys()].some(name => /secret|\.env|node_modules|leak|\.ghost/.test(name)));
  assert.equal(readDocument('../outside.md', root), null);
});
test('relative links, README links and symbol/space paths resolve', t => {
  const { root } = fixture(t);
  assert.equal(resolveLink('<3/README.md', 'notes/', root), '/%3C3/notes');
  assert.equal(resolveLink('<3/notes/hello world.md', '../essays/new-essay.md', root), '/new-essay');
  assert.equal(resolveLink('<3/notes/hello world.md', '../../π/README.md', root), '/%CF%80');
  assert.equal(resolveLink('<3/README.md', 'notes/hello%20world.md#section', root), '/%3C3/notes/hello%20world#section');
});
test('Obsidian embeds resolve without changing source records', t => {
  const { root } = fixture(t);
  assert.equal(prepareMarkdown('<3/notes/hello world.md', '![[photo.png]]', root), '![photo.png](/api/files/%3C3/assets/photo.png)');
  assert.equal(prepareMarkdown('<3/README.md', '[[new-essay|read this]]', root), '[read this](/new-essay)');
  assert.equal(readDocument('<3/notes/hello world.md', root).markdown, '# my note\n\nunchanged text');
});

test('historical attachment paths resolve without rewriting transcripts', t => {
  const { root, write } = fixture(t);
  write('<3/chats/old.md', '![original](../../assets/photo.png)');
  assert.equal(resolveLink('<3/chats/old.md', '../../assets/photo.png', root), '/%3C3/assets/photo.png');
  assert.equal(resolveLink('<3/chats/old.md', '/Users/example/code/ghost/assets/photo.png', root), '/%3C3/assets/photo.png');
  assert.equal(prepareMarkdown('<3/chats/old.md', '![[assets/photo.png]]', root), '![assets/photo.png](/api/files/%3C3/assets/photo.png)');
  assert.equal(readDocument('<3/chats/old.md', root).markdown, '![original](../../assets/photo.png)');
});

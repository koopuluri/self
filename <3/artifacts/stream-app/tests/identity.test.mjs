import { mergeEmbeds } from '../lib/merge-embeds.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { history, undo, redo } from '@codemirror/commands';
import { deletePassages, identity, movePassage, trackIdentity, undoIdentity } from '../lib/identity.ts';

test('editing acts on passages, including undo, fresh allocation and moves', () => {
  let state = EditorState.create({
    doc: 'a\nbravo\nc', extensions: [
      identity.init(() => ({ ids: [90, 3, 11], nextId: 91, retired: {} })),
      trackIdentity, undoIdentity, history(),
    ],
  });
  const view = { get state() { return state; }, dispatch(spec) { state = spec.state || state.update(spec).state; } };
  const layout = () => state.field(identity);
  view.dispatch({ changes: { from: 2, insert: 'before\n' } });
  assert.deepEqual(layout().ids, [90, 91, 3, 11]);
  const line = state.doc.line(3);
  view.dispatch({ changes: { from: line.from + 2, insert: '\n' } });
  assert.deepEqual(layout().ids, [90, 91, 3, 92, 11]);
  view.dispatch({ changes: { from: line.from + 2, to: line.from + 3 } });
  assert.equal(layout().retired[92], 3);
  undo(view);
  assert.equal(layout().ids[3], 92);
  redo(view);
  assert.equal(layout().retired[92], 3);
  view.dispatch({ selection: { anchor: state.doc.line(3).from } });
  movePassage(view, -1);
  assert.deepEqual(layout().ids, [90, 3, 91, 11]);
  assert.equal(state.doc.line(2).text, 'bravo');
  view.dispatch({ selection: { anchor: state.doc.line(2).from, head: state.doc.line(2).to } });
  deletePassages(view);
  assert.deepEqual(layout().ids, [90, 91, 11]);
  assert.equal(layout().retired[3], null);
  assert.equal(layout().nextId, 93);
});

test('deleting the last passage under a bubble leaves the caret ready to type', () => {
  let state = EditorState.create({
    doc: '[reply]\ndraft', selection: { anchor: 8, head: 13 },
    extensions: [identity.init(() => ({ ids: [0, 1], nextId: 2, retired: {} })), trackIdentity, undoIdentity, history()],
  });
  const view = { get state() { return state; }, dispatch(spec) { state = spec.state || state.update(spec).state; } };
  const isBlock = id => id === 0;
  deletePassages(view, isBlock);
  assert.deepEqual(state.field(identity).ids, [0, 2]);
  assert.equal(state.field(identity).retired[1], null);
  assert.equal(state.doc.toString(), '[reply]\n');
  assert.equal(state.selection.main.head, state.doc.length);
  undo(view);
  assert.equal(state.doc.toString(), '[reply]\ndraft');
  redo(view);
  view.dispatch(state.replaceSelection('next'));
  assert.equal(state.doc.toString(), '[reply]\nnext');
  movePassage(view, -1, isBlock);
  assert.equal(state.doc.toString(), 'next\n[reply]\n');
  assert.deepEqual(state.field(identity).ids, [2, 0, 3]);
});

test('a delivered reply and concurrent paragraph split keep distinct IDs and preserve both edits', () => {
  const base = { nextId: 8, beats: [{ id: 5, text: '/question' }, { id: 7, text: '' }] };
  const reply = { id: 8, kind: 'bubble', text: '[reply]' };
  const remote = { nextId: 9, beats: [base.beats[0], reply, base.beats[1]] };
  const local = { ids: [5, 7, 8], nextId: 10, retired: { 9: 8 }, origins: { 8: 7 } };
  const merged = mergeEmbeds(base, remote, local, ['/question', 'still', 'writing']);
  assert.deepEqual(merged.identity, { ids: [5, 8, 7, 9], nextId: 11, retired: { 10: 9 }, origins: { 9: 7 } });
  assert.deepEqual(merged.rows.map(b => b.text), ['/question', '[reply]', 'still', 'writing']);
  assert.equal(mergeEmbeds(base, { ...remote, beats: [base.beats[0], reply, { id: 7, text: 'external edit' }] }, local, []), null);
});

test('a reply appended during typing preserves the new empty writing beat and unsaved prose', () => {
  const base = { nextId: 11, beats: [{ id: 10, kind: 'text', text: 'draft' }] };
  const reply = { id: 11, kind: 'bubble', text: '[reply]' };
  const slot = { id: 12, kind: 'text', text: '' };
  const local = { ids: [10, 11], nextId: 12, retired: {}, origins: { 11: 10 } };
  const text = ['draft continued', 'another line'];
  const remote = { nextId: 13, beats: [...base.beats, reply, slot] };
  const merged = mergeEmbeds(base, remote, local, text);
  assert.deepEqual(merged.rows, [
    { id: 10, text: text[0] }, { id: 11, text: reply.text }, { id: 12, text: '' }, { id: 13, text: text[1] },
  ]);
  assert.deepEqual(merged.identity.origins, { 13: 10 });
  assert.equal(mergeEmbeds(base, { ...remote, beats: [...base.beats, reply, { ...slot, text: 'external writing' }] }, local, text), null);
});

test('Select All cannot grow beyond the current beat or delete its neighbors', async () => {
  const { guardStreamSelection, selectCurrentBeat } = await import('../lib/beat-selection.ts');
  for (const text of ['a wrapped passage', '/multiple\u2028draft lines', '']) {
    let state = EditorState.create({ doc: `before\n${text}\nafter`, extensions: [guardStreamSelection,
      identity.init(() => ({ ids: [10, 11, 12], nextId: 13, retired: {} })), trackIdentity] });
    const view = { get state() { return state; }, dispatch(spec) { state = state.update(spec).state; } };
    const { from, to } = state.doc.line(2);
    view.dispatch({ selection: { anchor: state.doc.length, head: from } });
    for (const select of [selectCurrentBeat, selectCurrentBeat, () => view.dispatch({ selection: { anchor: state.doc.length, head: 0 } })]) {
      select(view);
      assert.deepEqual([state.selection.main.from, state.selection.main.to], [from, to]);
    }
    if (text) {
      deletePassages(view);
      assert.equal(state.doc.toString(), 'before\nafter');
      assert.deepEqual(state.field(identity).ids, [10, 12]);
    }
  }
});

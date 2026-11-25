import test from 'node:test';
import assert from 'node:assert/strict';
import { marginRows } from '../lib/margin-rows.ts';

const cards = ['a', 'b', 'c'].map(id => ({ id }));
const sync = (rows, cards) => marginRows(rows, { type: 'sync', cards });
const act = (rows, type, id) => marginRows(rows, { type, id });

test('archive starts locally; stale margin updates cannot undo a dismissal', () => {
  let rows = act(sync([], cards), 'archive', 'b');
  assert.equal(rows[1].exit, 'sliding');
  rows = act(rows, 'finish', 'b');
  assert.equal(sync(rows, cards)[1].exit, 'hidden');
  rows = sync(rows, [cards[0], cards[2]]);
  assert.equal(rows.length, 2);
  assert.equal(sync(rows, cards)[1].exit, undefined); // reopened later
});

test('a fast confirmation preserves the exit; a failed second archive restores just its row', () => {
  let rows = act(act(sync([], cards), 'archive', 'a'), 'archive', 'b');
  rows = sync(rows, cards.slice(1));
  assert.deepEqual(rows.map(row => row.card.id), ['a', 'b', 'c']);
  assert.equal(rows[0].exit, 'sliding');
  rows = act(act(rows, 'finish', 'b'), 'restore', 'b');
  assert.equal(rows[1].exit, undefined);
  assert.deepEqual(act(rows, 'finish', 'a').map(row => row.card.id), ['b', 'c']);
});

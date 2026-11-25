import test from 'node:test';
import assert from 'node:assert/strict';
import { revealDelta, snapshotEdit } from '../lib/message-scroll.ts';

test('measure the message frame, with no alignment margin on either edge', () => {
  for (const [top, bottom, expected] of [
    [120, 290, 0], [100, 300, 0], [92, 180, -8], [210, 306, 6],
    [400, 450, 150], [40, 70, -60],
    // Oversized replies: maximize visible text using the nearer edge.
    [40, 320, 0], [120, 440, 20], [-120, 290, -10],
  ]) assert.equal(revealDelta(top, bottom, 100, 300), expected);
});

test('applying a receipt retains the unchanged document on both sides', () => {
  assert.deepEqual(snapshotEdit('ask\n\nwriting', 'ask\nreceipt\n\nwriting'), { from: 4, to: 4, insert: 'receipt\n' });
  assert.deepEqual(snapshotEdit('ask\n', 'ask\nreceipt\n'), { from: 4, to: 4, insert: 'receipt\n' });
});

test('include the empty writing beat even if the reply itself is already visible', () => {
  assert.equal(revealDelta(100, 250, 0, 300, 48), 0);
  assert.equal(revealDelta(100, 280, 0, 300, 48), 28);
  assert.equal(revealDelta(100, 320, 0, 300, 48), 68);
  assert.equal(revealDelta(-160, 480, 0, 300, 48), 228);
});

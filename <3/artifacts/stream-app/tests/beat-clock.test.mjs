import test from 'node:test';
import assert from 'node:assert/strict';
import { beatClock } from '../lib/beat-clock.ts';

test('the day and 24-hour clock roll over together at local midnight', () => {
  const clock = (day, h, m, s) => beatClock({ createdAt: new Date(2026, 10, day, h, m, s).toISOString() });
  assert.deepEqual(clock(24, 19, 2, 40), { day: 'nov 24, 2026', time: '19:02:40' });
  assert.deepEqual(clock(25, 0, 0, 1), { day: 'nov 25, 2026', time: '00:00:01' });
});

test('dated source notes provide a calendar day but never a made-up clock', () => {
  assert.deepEqual(beatClock({ createdAt: null, source: { path: '<3/stream/notes/_nov-12-2026.md' } }), { day: 'nov 12, 2026', time: '' });
  assert.deepEqual(beatClock({ createdAt: null, completedAt: '2026-11-25T03:00:00Z' }), { day: '', time: '' });
});

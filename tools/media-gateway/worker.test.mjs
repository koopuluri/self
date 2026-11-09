import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './worker.mjs';
const source = '<3/assets/clip.mp4';
const item = { key: 'sha256/abc', sha256: 'abc', bytes: 10, type: 'video/mp4' };
function fixture() {
  const calls = [];
  const env = { SERVING_ENABLED: 'true', MEDIA: {
    async get(...args) { calls.push(['get', ...args]); return { size: 10, body: '0123456789' }; },
    async head(...args) { calls.push(['head', ...args]); return { size: 10 }; },
  } };
  const handler = createHandler({ [source]: item });
  const send = (tail = '/%3C3/assets/clip.mp4', init) => handler(new Request('https://media.example' + tail, init), env);
  return { calls, env, send };
}
test('unknown files and writes never access storage', async () => {
  const f = fixture();
  assert.equal((await f.send('/%3C3/assets/missing')).status, 404);
  assert.equal((await f.send('/%3C3/assets/clip.mp4', { method: 'PUT' })).status, 405);
  assert.equal((await f.send('/%3C3/assets/%252e%252e/secret')).status, 404);
  assert.equal(f.calls.length, 0);
});
test('disabled gateway fails closed', async () => {
  const f = fixture(); f.env.SERVING_ENABLED = 'false';
  assert.equal((await f.send()).status, 503); assert.equal(f.calls.length, 0);
});
test('one read per request; video suffix ranges use bundled size', async () => {
  const f = fixture();
  const response = await f.send(undefined, { headers: { Range: 'bytes=-4' } });
  assert.equal(response.status, 206); assert.equal(response.headers.get('Content-Range'), 'bytes 6-9/10');
  assert.deepEqual(f.calls, [['get', 'sha256/abc', { range: { offset: 6, length: 4 } }]]);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
test('conditional and invalid range requests need no read', async () => {
  const f = fixture();
  assert.equal((await f.send(undefined, { headers: { 'If-None-Match': '"abc"' } })).status, 304);
  assert.equal((await f.send(undefined, { headers: { Range: 'bytes=100-' } })).status, 416);
  assert.equal((await f.send(undefined, { headers: { Range: 'bytes=0-1,3-4' } })).status, 416);
  assert.equal(f.calls.length, 0);
});
test('HEAD uses one metadata read and no body', async () => {
  const f = fixture(); const response = await f.send(undefined, { method:'HEAD' });
  assert.deepEqual(f.calls, [['head', 'sha256/abc']]); assert.equal(await response.text(), '');
});

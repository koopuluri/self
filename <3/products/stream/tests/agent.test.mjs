import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { StreamStore } from '../service/store.mjs';
import { Coordinator } from '../service/agent.mjs';
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-stream-agent-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = await new StreamStore(root).init(), agent = new Coordinator(store);
  await agent.initialized; return { store, agent };
}
test('local redaction uses the viewed beat and reveals a chat without replacing the writing slot', async t => {
  const { store, agent } = await fixture(t); await store.append('keep the original');
  const chatId = await agent.prompt({ text: 'redact this', contextBeatId: 0 });
  assert.equal(store.metadata.beats[0].redacted, true); assert.equal(store.beats[0].text, 'keep the original');
  const id = await agent.reveal(); assert.equal(id, 2);
  assert.equal(store.beats[1].text, ''); assert.equal(store.metadata.beats[1].kind, 'text');
  assert.equal(store.metadata.beats[id].chatId, chatId); assert.equal(await agent.reveal(), null);
});
test('a model request logs usage and yields on ask_user without another model call', async t => {
  const { store, agent } = await fixture(t); let calls = 0;
  const reply = { role: 'assistant', provider: 'test', model: 'test-model', api: 'test', timestamp: Date.now(), stopReason: 'toolUse', content: [{ type: 'toolCall', id: 'request-1', name: 'ask_user', arguments: { question: 'Which direction?' } }], usage: { input: 10, output: 3, cacheRead: 0, cacheWrite: 0, totalTokens: 13, cost: { input: .01, output: .02, cacheRead: 0, cacheWrite: 0, total: .03, totalFromProvider: false } } };
  agent.available = () => true;
  agent.catalog = { getModel: () => ({ cost: { input: 1, output: 2 } }), streamSimple: () => { calls++; return { async *[Symbol.asyncIterator]() {}, async result() { return reply; } }; } };
  const id = await agent.prompt({ text: 'Help me decide.' });
  while (agent.running.size || agent.runQueue.length) await new Promise(resolve => setTimeout(resolve, 10));
  const chat = await agent.chat(id); assert.equal(chat.status, 'waiting_for_you'); assert.equal(calls, 1);
  const log = JSON.parse((await fs.readFile(path.join(store.pi, 'logs/model-calls.jsonl'), 'utf8')).trim());
  assert.equal(log.usage.totalTokens, 13); assert.equal(log.costUSD, .03); assert.equal(log.costBasis, 'catalog-estimate');
  assert.equal(chat.messages.at(-1).text, 'Which direction?');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { StreamStore } from '../store.mjs';
import { Coordinator } from '../agent.mjs';
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-stream-agent-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = await new StreamStore(root).init(), agent = new Coordinator(store);
  // These coordinator tests isolate task execution. architecture.test exercises the organizer.
  t.mock.method(agent, 'organize', async () => {});
  await agent.initialized; return { store, agent };
}
test('local redaction uses the viewed beat and reveals a chat without replacing the writing slot', async t => {
  const { store, agent } = await fixture(t); await store.append('keep the original');
  const chatId = await agent.prompt({ text: 'redact this', contextBeatId: 0 });
  assert.equal(store.metadata.beats[0].redacted, true); assert.equal(store.beats[0].text, 'keep the original');
  const id = await agent.reveal(); assert.equal(id, 2);
  assert.deepEqual(store.beats.map(beat => beat.id), [0, id, 1]); assert.equal(store.beats.at(-1).text, ''); assert.equal(store.metadata.beats[1].kind, 'text');
  assert.equal(store.metadata.beats[id].chatId, chatId); assert.equal(await agent.reveal(), null);
});

test('previous writing beats follow document order across moved, deleted and embedded beats', async t => {
  const { agent, store } = await fixture(t);
  const one = await store.append('first'), two = await store.append('second'), gone = await store.append('deleted');
  await store.remove(gone);
  await store.browser('https://example.com/');
  const three = await store.append('third'), anchor = await store.append('question');
  await store.transact(() => {
    const moved = store.beats.splice(store.beats.findIndex(b => b.id === three), 1)[0];
    store.beats.unshift(moved);
  });
  const thread = { sourceBeatId: anchor };
  const run = (before, count) => agent.execute('read_previous_beats', { before, count }, thread);
  assert.deepEqual(await run(null, 2), [{ id: one, text: 'first' }, { id: two, text: 'second' }]);
  assert.deepEqual(await run(one, 10), [{ id: three, text: 'third' }]);
  await assert.rejects(run(gone, 3), /missing or deleted/);
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

test('one request can read nine beats and answer from the final tool result', async t => {
  const { store, agent } = await fixture(t);
  const ids = [];
  for (let i = 1; i <= 9; i++) ids.push(await store.append('Passage ' + i));
  let calls = 0;
  agent.available = () => true;
  agent.catalog = {
    getModel: () => ({}),
    streamSimple(_model, { messages }) {
      const id = ids[calls++];
      const reply = id === undefined
        ? { stopReason: 'stop', content: [{ type: 'text', text: JSON.parse(messages.at(-1).content[0].text).beat.text }] }
        : { stopReason: 'toolUse', content: [{ type: 'toolCall', id: 'read-' + id, name: 'read_beat', arguments: { id } }] };
      return {
        async *[Symbol.asyncIterator]() {},
        async result() { return { role: 'assistant', ...reply }; },
      };
    },
  };
  const chatId = await agent.prompt({ text: 'Read my passages and repeat the last one.' });
  while (agent.running.size || agent.runQueue.length) await new Promise(resolve => setTimeout(resolve, 10));
  const chat = await agent.chat(chatId);
  assert.equal(calls, 10);
  assert.equal(chat.messages.at(-1).text, 'Passage 9');
  assert.equal(chat.status, 'idle');
});

test('π can promote the staged release from a conversational request in Main', async t => {
  const { store, agent } = await fixture(t);
  const product = path.join(store.root, 'product');
  const version = 'c2a8f857-5924-4b74-b427-d8f626c85879';
  const build = path.join(product, 'build');
  const output = path.join(build, 'releases', version, 'out');
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'index.html'), '');
  await fs.writeFile(path.join(build, 'preview.json'), JSON.stringify({ version }));
  t.mock.method(agent, 'product', () => product);
  agent.available = () => true;
  agent.catalog = {
    getModel: () => ({}),
    streamSimple(_model, context) {
      assert.ok(context.tools.some(tool => tool.name === 'promote_preview'));
      const last = context.messages.at(-1);
      const done = last.role === 'toolResult';
      const content = done ? last.content : [{ type: 'toolCall', id: 'adopt', name: 'promote_preview', arguments: {} }];
      return {
        async *[Symbol.asyncIterator]() {},
        async result() { return { role: 'assistant', content, stopReason: done ? 'stop' : 'toolUse' }; },
      };
    },
  };
  const id = await agent.prompt({ text: 'Make this the version I open in Main.' });
  while (agent.running.size || agent.runQueue.length) await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(build, 'stable.json'), 'utf8')), { version });
  assert.equal((await agent.chat(id)).messages.at(-1).text, 'Main will use release ' + version + ' on its next ordinary launch.');
});

test('model settings are available through a conversation without credentials', async t => {
  const { agent } = await fixture(t);
  agent.available = () => false;
  const chatId = await agent.prompt({ text: 'use openai/gpt-5.4-mini' });
  await agent.prompt({ chatId, text: 'current model' });
  const chat = await agent.chat(chatId);
  assert.match(chat.messages.at(-1).text, /openai\/gpt-5\.4-mini/);
  assert.equal(chat.status, 'idle');
  assert.equal(chat.messages.at(-1).source, 'local-command');
  assert.deepEqual(await agent.config(), { provider: 'openai', model: 'gpt-5.4-mini', reasoning: 'low' });
});

test('a submitted beat keeps its words and ID, streams before completion, and retains a stopped answer', async t => {
  const { store, agent } = await fixture(t);
  const source = 'π, compare these passages';
  const sourceBeatId = await store.append(source);
  const partial = { role: 'assistant', model: 'fixture', provider: 'fixture', api: 'fixture', timestamp: Date.now(), content: [{ type: 'text', text: 'First difference' }] };
  agent.available = () => true;
  agent.catalog = {
    getModel: () => ({}),
    streamSimple: (_model, _context, { signal }) => ({
      async *[Symbol.asyncIterator]() {
        yield { type: 'text_delta', delta: 'First difference', partial };
        if (!signal.aborted) await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
      },
      async result() { return { ...partial, stopReason: 'aborted' }; },
    }),
  };
  const { promise: visible, resolve } = Promise.withResolvers();
  store.on('chat-update', chat => { if (chat.liveText) resolve(chat); });
  const id = await agent.prompt({ sourceBeatId, sourceText: source, text: 'compare these passages' });
  const live = await visible;
  assert.equal(live.canStop, true);
  assert.equal((await agent.chatView(id)).liveText, 'First difference');
  assert.equal(store.beat(sourceBeatId).text, source);
  assert.equal(store.metadata.beats[sourceBeatId].chatId, id);
  assert.equal(await agent.reveal(), null);
  await agent.stop(id);
  while (agent.running.size) await new Promise(r => setTimeout(r, 5));
  const chat = await agent.chatView(id);
  assert.equal(chat.status, 'stopped');
  assert.equal(chat.messages.at(-1).text, 'First difference');
  assert.equal(chat.messages.at(-1).partial, true);
  assert.equal((await agent.thread(chat.threadId)).messages.at(-1).content[0].text, 'First difference');
  await agent.prompt({ chatId: id, text: 'current model' });
  assert.equal((await agent.chat(id)).status, 'idle');
});

test('provider failures retain exact SDK text and original exception causes per concurrent call', async t => {
  const { store, agent } = await fixture(t);
  agent.available = () => true;
  const message = 'Provider says: original detail.\n  Keep indentation and punctuation!';
  const cause = Object.assign(new Error('socket closed by peer'), { code: 'ECONNRESET' });
  agent.catalog = {
    getModel: () => ({ provider: 'openai' }),
    streamSimple(_model, context) {
      if (context.messages.at(-1).content === 'throw') throw new TypeError('Unable to read response', { cause });
      return { async *[Symbol.asyncIterator]() {}, async result() { return { stopReason: 'error', errorMessage: message }; } };
    },
  };
  // Bind each prompt to a different writing beat, as two independent chats would.
  const one = await store.append('first'), two = await store.append('second');
  const [sdkChat, thrownChat] = await Promise.all([
    agent.prompt({ text: 'sdk', sourceBeatId: one }), agent.prompt({ text: 'throw', sourceBeatId: two }),
  ]);
  while (agent.running.size || agent.runQueue.length) await new Promise(r => setTimeout(r, 5));
  const logs = (await fs.readFile(path.join(store.pi, 'logs/model-calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(logs.length, 2);
  const sdk = logs.find(row => row.chatId === sdkChat);
  assert.equal(sdk.error, message);
  assert.equal(sdk.failureDetails.sdkMessage, message);
  const thrown = logs.find(row => row.chatId === thrownChat);
  assert.equal(thrown.error, 'Unable to read response');
  assert.equal(thrown.failureDetails.exception.name, 'TypeError');
  assert.equal(thrown.failureDetails.exception.cause.message, cause.message);
  assert.equal(thrown.failureDetails.exception.cause.code, cause.code);
  assert.equal(thrown.failureDetails.exception.cause.stack, cause.stack);
});

test('a slash URL routes locally and leaves an editable writing slot after the page', async t => {
  const { agent, store } = await fixture(t);
  const source = await store.append('/example.org');
  await agent.prompt({ text: 'example.org', bubble: true, sourceBeatId: source, sourceText: '/example.org' });
  const [message, page, slot] = store.snapshot().beats;
  assert.equal(message.id, source);
  assert.equal(message.bubble.text, 'example.org');
  assert.equal(message.bubble.reaction, undefined);
  assert.equal(page.url, 'https://example.org/');
  assert.equal(slot.text, '');
  assert.deepEqual(await fs.readdir(path.join(store.pi, 'logs')), ['events.jsonl']);
});

test('five beats of context are frozen at send and a result survives restart for explicit retrieval', async t => {
  const { agent, store } = await fixture(t);
  for (let i = 0; i < 8; i++) await store.append('paragraph ' + i);
  const source = await store.append('/help');
  agent.available = () => true;
  const send = Promise.withResolvers();
  t.mock.method(agent, 'route', async (_config, text, beats) => ({ action: 'new', title: text, tier: 'easy', context: beats.slice(-5) }));
  let context;
  agent.catalog = { getModel: () => ({}), streamSimple: (_model, input) => {
    context = input; return { async *[Symbol.asyncIterator]() { await send.promise; },
      async result() { return { role: 'assistant', content: [{ type: 'text', text: 'The complete answer.' }], stopReason: 'stop' }; } };
  } };
  const chat = await agent.prompt({ text: 'help', bubble: true, sourceBeatId: source, sourceText: '/help' });
  await store.append('keep writing');
  send.resolve();
  while (agent.running.size) await new Promise(r => setTimeout(r, 5));
  assert.match(context.systemPrompt, /paragraph 3/);
  assert.doesNotMatch(context.systemPrompt, /paragraph 2|keep writing/);
  assert.equal(store.snapshot().beats.filter(b => b.kind === 'bubble').length, 1);
  const reopened = new Coordinator(store);
  await reopened.initialized;
  reopened.available = () => false;
  const pull = async text => {
    const source = await store.append('/' + text);
    return reopened.prompt({ text, sourceBeatId: source, sourceText: '/' + text, bubble: true });
  };
  await pull('');
  assert.equal(store.snapshot().beats.at(-3).bubble.text, '');
  assert.equal(store.snapshot().beats.at(-2).bubble.text, '1. help (read the result)');
  await pull('1');
  assert.equal(store.snapshot().beats.at(-2).bubble.text, 'The complete answer.');
  await pull('show me 1');
  assert.equal(store.snapshot().beats.at(-2).bubble.text, 'The complete answer.');
  assert.equal((await reopened.chat(chat)).messages.at(-1).text, 'The complete answer.');
});

test('historical multi-turn records expand once, retaining the old anchor, wording and transcript', async t => {
  const { store } = await fixture(t);
  const { expandHistoricalChats } = await import('../bubbles.mjs');
  const id = await store.transact(() => store.insertBlock('[chat with π](../../π/chats/old.md)', 'chat', { chatId: 'old', redacted: true }));
  const transcript = '**you**\n\nfirst\n\n> π: second\n> line\n\n**you**\n\nthird\n';
  const file = path.join(store.pi, 'chats/old.md');
  await fs.writeFile(file, transcript);
  await expandHistoricalChats(store); await expandHistoricalChats(store);
  const rows = store.snapshot().beats.filter(b => b.kind === 'bubble');
  assert.deepEqual(rows.map(b => b.bubble.text), ['first', 'second\nline', 'third']);
  assert.equal(rows[0].id, id);
  assert.equal(new Set(rows.map(b => b.id)).size, 3);
  assert.ok(rows.every(b => b.redacted));
  assert.equal(await fs.readFile(file, 'utf8'), transcript);
});

test('a background thread cannot react or insert a browser beat', async t => {
  const { agent, store } = await fixture(t);
  const source = await store.append('still writing');
  const original = store.snapshot().beats;
  for (const [tool, args] of [['react', { emoji: '🫶🏽' }], ['open_page', { url: 'https://example.org' }]]) {
    await assert.rejects(agent.execute(tool, args, { sourceBeatId: source }), /Unknown tool/);
  }
  assert.deepEqual(store.snapshot().beats, original);
});

test('page recall routes a unique hostname locally and leaves ambiguous references for π', async () => {
  const { routePage } = await import('../bubbles.mjs');
  const pages = ['https://codemirror.net/docs/', 'https://marijnhaverbeke.nl/'];
  assert.equal(routePage('open the CodeMirror site again', pages), pages[0]);
  assert.equal(routePage('open the CodeMirror site again', [...pages, 'https://codemirror.net/']), null);
  assert.equal(routePage('open the website for the CodeMirror author', pages), null);
  assert.equal(routePage('pi.dev', []), 'https://pi.dev/');
});

test('requested replies require the original invitation and delivery is idempotent', async t => {
  const { agent, store } = await fixture(t);
  agent.available = () => false;
  const source = await store.append('/current model');
  const slot = store.beats.at(-1).id;
  const chatId = await agent.prompt({ bubble: true, sourceBeatId: source, slot, sourceText: '/current model', text: 'current model' });
  await store.edit([{ id: slot, before: '', text: 'still writing' }]);
  await agent.deliver(chatId, source, slot);
  const empty = await store.append('/');
  const next = store.beats.at(-1).id;
  const status = await agent.prompt({ bubble: true, sourceBeatId: empty, slot: next, sourceText: '/', text: '' });
  await Promise.all(agent.displays);
  await agent.deliver(chatId, empty, next);
  assert.equal(store.snapshot().beats.filter(b => b.bubble?.role === 'assistant').length, 0);
  await Promise.all([agent.deliver(status, empty, next), agent.deliver(status, empty, next)]);
  assert.equal(store.snapshot().beats.at(-2).bubble.text, 'nothing open or newly closed.');
  assert.equal(store.metadata.statusHistory.length, 1);
  assert.equal(store.snapshot().beats.at(-1).id, next);
});

test('reasoning can change alone or with an account model and survives restart', async t => {
  const { agent, store } = await fixture(t);
  let lookups = 0;
  agent.plan = async action => { assert.equal(action, 'models'); lookups++; return [{id:'gpt-6.2-astra',name:'Astra'}]; };
  await agent.updateConfig(c => ({ ...c, provider:'chatgpt', chatgpt:true, model:'gpt-6.2-sol' }));
  assert.match(await agent.localControl('use Astra med'), /gpt-6.2-astra · medium/);
  assert.equal(lookups, 1);
  assert.match(await agent.localControl('reasoning high'), /high reasoning/);
  assert.equal(lookups, 1);
  await assert.rejects(agent.localControl('reasoning nope'), /Choose a reasoning effort/);
  const reopened = new Coordinator(store);
  await reopened.initialized;
  assert.match(await reopened.localControl('current model'), /gpt-6.2-astra · high/);
  await reopened.execute('set_reasoning', {reasoning:'default'}, {});
  assert.equal((await reopened.config()).reasoning, 'default');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { refreshStatusRanking } from '../functions.mjs';
import { Coordinator } from '../agent.mjs';
import { StreamStore } from '../store.mjs';
import { hydrate, serializeThread, taskContext } from '../thread-session.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stream-architecture-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = await new StreamStore(root).init();
  const agent = new Coordinator(store);
  await agent.initialized;
  agent.available = () => true;
  return { agent, store };
}
function modelReply(content, stopReason = 'stop') {
  return { role: 'assistant', api: 'openai-responses', provider: 'openai', model: 'fixture', timestamp: Date.now(),
    content, stopReason, usage: { input: 10, output: 3, cacheRead: 0, cacheWrite: 0, totalTokens: 13 } };
}
function answer(value) { return modelReply([{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }]); }
async function send(agent, store, text) {
  const sourceText = '/' + text;
  const sourceBeatId = await store.append(sourceText);
  const id = await agent.prompt({ bubble: true, sourceBeatId, sourceText, text });
  return agent.chat(id);
}
async function idle(agent) {
  const end = Date.now() + 5000;
  while (agent.running.size || agent.runQueue.length) {
    assert.ok(Date.now() < end, 'work should finish');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
function useMock(agent, respond) {
  agent.catalog = { getModel: () => ({ id: 'fixture', contextWindow: 100000 }),
    streamSimple(_model, context, options) {
      return { async *[Symbol.asyncIterator]() {}, result: () => respond(context, options.signal) };
    } };
}
function route(data, action, threadId) {
  return answer({ action, threadId, title: data.message, tier: 'medium', beatIds: data.beats.slice(-1).map(b => b.id) });
}
function organize(data) {
  return answer({ title: data.task.title, summary: data.outcome.answer || 'Reading', nextAction: 'read the result', disposition: 'read' });
}

test('router selects an open thread across writing beats; organizer holds the result through restart', async t => {
  const { agent, store } = await fixture(t);
  useMock(agent, context => {
    if (context.systemPrompt.includes('name: process-message')) {
      const data = JSON.parse(context.messages[0].content);
      return route(data, data.threads.length ? 'resume' : 'new', data.threads[0]?.id);
    }
    if (context.systemPrompt.includes('name: update-thread')) return organize(JSON.parse(context.messages[0].content));
    return answer('Scroll fix staged.');
  });
  const chat = await send(agent, store, 'fix scrolling');
  await idle(agent);
  await store.append('coffee');
  const second = await send(agent, store, 'explain the scroll fix');
  await idle(agent);
  assert.equal(chat.threadId, second.threadId);
  const reopened = new Coordinator(store);
  await reopened.initialized;
  reopened.available = () => false;
  await send(reopened, store, '');
  await send(reopened, store, '1');
  assert.equal(store.snapshot().beats.at(-2).bubble.text, 'Scroll fix staged.');
  const events = (await fs.readFile(path.join(store.pi, 'logs/events.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(events.some(e => e.action === 'resume' && e.targetThreadId === chat.threadId));
  assert.ok(events.some(e => e.function === 'update-thread' && e.affectedThreadIds.includes(chat.threadId)));
  const calls = (await fs.readFile(path.join(store.pi, 'logs/model-calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(calls.map(c => c.function), ['process-message','run-thread','update-thread','process-message','run-thread','update-thread']);
  assert.ok(calls.every(c => c.traceId && c.request && c.response));
});

test('each call reads fresh workspace guidance before its own system instructions', async t => {
  const { agent, store } = await fixture(t);
  agent.instructionsFile = path.join(store.root, 'AGENTS.md');
  const seen = [];
  const guidance = n => 'test workspace revision ' + n;
  await fs.writeFile(agent.instructionsFile, guidance(0));
  useMock(agent, async context => {
    const prompt = context.systemPrompt;
    assert.ok(prompt.includes(guidance(seen.length) + '\n\nInstructions for this call:\n'));
    assert.ok(!JSON.stringify(context.messages).includes('test workspace revision'));
    await fs.writeFile(agent.instructionsFile, guidance(seen.length + 1));
    if (prompt.includes('name: process-message')) {
      seen.push('route');
      return route(JSON.parse(context.messages[0].content), 'new', null);
    }
    if (prompt.includes('name: update-thread')) {
      seen.push('organize');
      return organize(JSON.parse(context.messages[0].content));
    }
    seen.push('reply');
    return answer('done');
  });
  await send(agent, store, 'test shared instructions');
  await idle(agent);
  assert.deepEqual(seen, ['route', 'reply', 'organize']);
});

test('steering reaches the next model call and follow-up waits for the tool loop to finish', async t => {
  const { agent, store } = await fixture(t);
  const first = Promise.withResolvers(), release = Promise.withResolvers();
  const turns = [];
  useMock(agent, async context => {
    if (context.systemPrompt.includes('name: process-message')) {
      const data = JSON.parse(context.messages[0].content);
      const action = data.message.startsWith('after') ? 'follow-up' : data.threads.length ? 'steer' : 'new';
      return route(data, action, data.threads[0]?.id);
    }
    if (context.systemPrompt.includes('name: update-thread')) return organize(JSON.parse(context.messages[0].content));
    turns.push(context.messages.filter(m => m.role === 'user').map(m => m.content));
    if (turns.length === 1) {
      first.resolve(); await release.promise;
      return modelReply([{ type: 'toolCall', id: 'read', name: 'read_beat', arguments: { id: 0 } }], 'toolUse');
    }
    return answer('Done');
  });
  await send(agent, store, 'fix scrolling');
  await first.promise;
  await send(agent, store, 'keep the previous beat visible');
  await send(agent, store, 'after that explain the fix');
  release.resolve();
  await idle(agent);
  assert.deepEqual(turns.map(turn => turn.at(-1)), ['fix scrolling', 'keep the previous beat visible', 'after that explain the fix']);
});

test('natural language references use the delivered order across new tasks, drafts and restart', async t => {
  const { agent, store } = await fixture(t);
  const routed = [];
  const mock = a => {
    a.available = () => true;
    useMock(a, context => {
      if (context.systemPrompt.includes('name: process-message')) {
        const d = JSON.parse(context.messages[0].content);
        routed.push(d);
        if (['the first one please', 'show me 1', '1'].includes(d.message)) return route(d, 'result', ['1', 'show me 1'].includes(d.message) ? d.threads[0]?.id : d.lastStatus.open[0].id);
        if (d.message === 'where are we at?') return route(d, 'check-in');
        if (d.message === 'what did the last two updates say?') return answer({ action: 'status-history', count: 2, title: '', tier: 'easy', beatIds: [] });
        return route(d, 'new');
      }
      if (context.systemPrompt.includes('name: update-thread')) return organize(JSON.parse(context.messages[0].content));
      if (context.systemPrompt.includes('name: compose-status')) {
        const { open } = JSON.parse(context.messages[0].content);
        return answer({ open: open.sort((a,b) => a.title.localeCompare(b.title)).map(t => ({ id: t.id, action: 'read the lesson' })) });
      }
      return answer('lesson for ' + context.messages.at(-1).content);
    });
  };
  mock(agent);
  await send(agent, store, 'botany'); await idle(agent);
  await send(agent, store, 'astronomy'); await idle(agent);
  await store.append('still writing');
  assert.equal(store.snapshot().beats.filter(b => b.bubble?.role === 'assistant').length, 0);
  await refreshStatusRanking(agent);
  await send(agent, store, 'where are we at?');
  const status = store.snapshot().beats.at(-2).bubble.text;
  assert.equal(status, '1. astronomy (read the lesson)\n2. botany (read the lesson)');
  await send(agent, store, 'algebra'); await idle(agent);
  await refreshStatusRanking(agent);
  const source = await store.append('/'), slot = store.beats.at(-1).id;
  const draft = await agent.prompt({ bubble: true, text: '', sourceText: '/', sourceBeatId: source, slot });
  await Promise.all(agent.displays);
  await store.edit([{ id: slot, before: '', text: 'keep writing' }]);
  await agent.deliver(draft, source, slot);
  assert.equal(store.metadata.statusHistory.length, 1);
  const reopened = new Coordinator(store); await reopened.initialized; mock(reopened);
  for (const text of ['the first one please','1','show me 1']) {
    await send(reopened, store, text);
    assert.equal(store.snapshot().beats.at(-2).bubble.text, 'lesson for astronomy');
  }
  await send(reopened, store, '');
  assert.match(store.snapshot().beats.at(-2).bubble.text, /completed and closed\n- astronomy/);
  await send(reopened, store, '');
  assert.equal(store.snapshot().beats.at(-2).bubble.text, '1. algebra (read the lesson)\n2. botany (read the lesson)');
  await send(reopened, store, 'what did the last two updates say?');
  assert.equal(store.snapshot().beats.at(-2).bubble.text, store.metadata.statusHistory.slice(-2).reverse().map(r => r.text).join('\n\n—\n\n'));
  assert.ok(routed.every(d => d.message !== ''));
  assert.equal(store.metadata.statusHistory.length, 3);
});

test('an open pre-routing thread can be read without rewriting its historical transcript', async t => {
  const { agent, store } = await fixture(t);
  const thread = { id: 'legacy-thread', title: 'Links', status: 'idle', lifecycle: 'open', messages: [] };
  const chat = agent.newChat(thread);
  chat.messages = [{ role: 'user', text: 'beat links?' }, { role: 'assistant', text: 'An old answer.' }];
  await agent.saveThread(thread); await agent.saveChat(chat);
  const file = path.join(store.pi, 'chats', chat.id + '.md'), before = await fs.readFile(file, 'utf8');
  agent.available = () => false;
  await send(agent, store, '');
  assert.match(store.snapshot().beats.at(-2).bubble.text, /1. Links/);
  await send(agent, store, '1');
  assert.equal(store.snapshot().beats.at(-2).bubble.text, 'An old answer.');
  assert.equal(await fs.readFile(file, 'utf8'), before);
});

test('Pi compaction survives a JSON round trip and preserves tool evidence in the session', async t => {
  const { agent, store } = await fixture(t);
  const user = content => ({ role: 'user', content, timestamp: Date.now() });
  const thread = { id: 'round-trip', title: 'Scrolling', status: 'idle', messages: [
    user('fix scrolling ' + 'older text '.repeat(1800)), answer('Inspecting'),
    user('run checks'), modelReply([{ type: 'toolCall', id: 'check', name: 'run_check', arguments: { check: 'test' } }], 'toolUse'),
    { role: 'toolResult', toolCallId: 'check', toolName: 'run_check', content: [{ type: 'text', text: '33 passed' }], timestamp: Date.now(), isError: false },
    answer('Tests passed.'), user('what remains?')] };
  await agent.saveThread(thread);
  const model = { id: 'fixture', api: 'openai-responses', provider: 'openai', contextWindow: 4200, maxTokens: 1024 };
  let count = 0;
  const call = async (_context, fn) => { assert.equal(fn, 'compact-thread'); count++; return answer('Fix staged. Tests passed. Visual check pending.'); };
  await taskContext(agent, thread, model, {}, 'π', [], new AbortController().signal, call, true);
  assert.ok(count);
  const raw = JSON.parse(await fs.readFile(path.join(store.pi, 'threads/round-trip.json'), 'utf8'));
  assert.equal(raw.status, 'open');
  assert.ok(raw.session.some(e => e.type === 'compaction'));
  assert.ok(raw.session.some(e => e.message?.toolCallId === 'check'));
  const restored = hydrate(raw);
  restored.messages.push(user('promote that'));
  const ctx = await taskContext(agent, restored, { ...model, contextWindow: 128000 }, {}, 'π', [], new AbortController().signal, call);
  assert.match(JSON.stringify(ctx.messages), /Visual check pending/);
  assert.doesNotMatch(JSON.stringify(ctx.messages), /older text older text/);
  assert.equal(ctx.messages.at(-1).content, 'promote that');
  assert.equal(serializeThread(restored, store.root).session[0].id, 'round-trip');
});

test('a routed cancellation stops its target and leaves a second task independent', async t => {
  const { agent, store } = await fixture(t);
  const started = Promise.withResolvers();
  useMock(agent, async (context, signal) => {
    if (context.systemPrompt.includes('name: process-message')) {
      const data = JSON.parse(context.messages[0].content);
      const target = data.threads.find(item => item.title === 'long task');
      return route(data, data.message === 'stop the long task' ? 'abort' : 'new', target?.id);
    }
    if (context.systemPrompt.includes('name: update-thread')) return organize(JSON.parse(context.messages[0].content), 'now');
    if (context.messages.at(-1).content === 'long task') {
      started.resolve();
      await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
      signal.throwIfAborted();
    }
    return answer('Second task complete');
  });
  const first = await send(agent, store, 'long task');
  await started.promise;
  const second = await send(agent, store, 'second task');
  const stopped = await send(agent, store, 'stop the long task');
  await idle(agent);
  assert.equal(stopped.threadId, first.threadId);
  assert.equal((await agent.thread(first.threadId)).status, 'stopped');
  assert.equal((await agent.thread(second.threadId)).status, 'idle');
  assert.ok(!store.snapshot().beats.some(b => b.bubble?.text === 'Second task complete'));
});

test('a completed action is reported once even when two status replies are prepared together', async t => {
  const { agent, store } = await fixture(t);
  useMock(agent, context => {
    if (context.systemPrompt.includes('name: process-message')) return route(JSON.parse(context.messages[0].content), 'new');
    if (context.systemPrompt.includes('name: update-thread')) return answer({ title: 'filed receipt', summary: 'filed', nextAction: '', disposition: 'closed' });
    return answer('filed');
  });
  await send(agent, store, 'file receipt'); await idle(agent);
  const request = async () => {
    const after = await store.append('/'), slot = store.beats.at(-1).id;
    const id = await agent.prompt({ text: '', sourceText: '/', sourceBeatId: after, slot, bubble: true });
    await Promise.all(agent.displays);
    return () => agent.deliver(id, after, slot);
  };
  const first = await request();
  // Reserve a new writing beat after the first slot before requesting again.
  await store.complete(store.beats.at(-1).id);
  const second = await request();
  await Promise.all([first(), second()]);
  assert.deepEqual(store.metadata.statusHistory.map(r => r.closed.length), [1, 0]);
});

test('network work yields without opening a dialog until the writer requests review', async t => {
  const { agent, store } = await fixture(t);
  await fs.mkdir(path.join(store.root, '<3/artifacts/stream-app'), { recursive: true });
  let dialogs = 0, runs = 0;
  agent.approveNetwork = async request => { dialogs++; assert.equal(request.command, 'pwd'); return false; };
  useMock(agent, context => {
    if (context.systemPrompt.includes('name: process-message')) {
      const d = JSON.parse(context.messages[0].content);
      return d.threads.length ? route(d, 'review-network', d.threads[0].id) : route(d, 'new');
    }
    if (context.systemPrompt.includes('name: update-thread')) return organize(JSON.parse(context.messages[0].content));
    if (++runs === 1) return modelReply([{ type: 'toolCall', id: 'net', name: 'run_shell', arguments: { command: 'pwd', cwd: '.', network: true } }], 'toolUse');
    assert.match(context.systemPrompt, /"allowed":false/);
    return answer('declined');
  });
  const task = await send(agent, store, 'research the site');
  await idle(agent);
  assert.equal((await agent.thread(task.threadId)).status, 'waiting_for_you');
  assert.equal(dialogs, 0);
  assert.equal(store.snapshot().beats.filter(b => b.bubble?.role === 'assistant').length, 0);
  await send(agent, store, 'let me review the network request');
  await idle(agent);
  assert.equal(dialogs, 1);
  assert.equal((await agent.thread(task.threadId)).networkRequest, undefined);
});

test('a large tool result triggers SDK compaction mid-run; restart resumes without repeating the tool', async t => {
  const { agent, store } = await fixture(t);
  await fs.writeFile(path.join(store.root, 'report.txt'), 'passed '.repeat(8000));
  const small = { id: 'fixture', provider: 'openai', api: 'openai-responses', contextWindow: 11000, maxTokens: 2048 };
  let reads = 0, summaries = 0;
  const configure = a => {
    a.available = () => true;
    useMock(a, context => {
      if (context.systemPrompt?.includes('name: process-message')) {
        const data = JSON.parse(context.messages[0].content);
        return route(data, data.threads.length ? 'resume' : 'new', data.threads[0]?.id);
      }
      if (context.systemPrompt?.includes('name: update-thread')) return organize(JSON.parse(context.messages[0].content));
      if (!context.tools?.length) { summaries++; return answer('Read report.txt. Checks passed.'); }
      if (!reads) {
        reads++;
        return modelReply([{ type: 'toolCall', id: 'read-report', name: 'read_file', arguments: { path: 'report.txt' } }], 'toolUse');
      }
      assert.ok(JSON.stringify(context.messages).length < small.contextWindow * 4);
      return answer('Checks passed.');
    });
    a.catalog.getModel = () => small;
  };
  configure(agent);
  const first = await send(agent, store, 'read report.txt and report back');
  await idle(agent);
  assert.equal(first.status, 'idle');
  assert.ok(summaries > 0, JSON.stringify((await agent.thread(first.threadId)).messages.filter(m => m.role === 'toolResult').map(m => [m.isError, m.content[0].text.slice(0,90)])));
  const reopened = new Coordinator(store);
  await reopened.initialized;
  configure(reopened);
  const next = await send(reopened, store, 'what did the check find?');
  await idle(reopened);
  assert.equal(next.threadId, first.threadId);
  assert.equal(next.messages.at(-1).text, 'Checks passed.');
  const raw = JSON.parse(await fs.readFile(path.join(store.pi, 'threads', first.threadId + '.json')));
  assert.ok(raw.session.some(e => e.type === 'compaction'));
  assert.equal(raw.session.filter(e => e.message?.toolName === 'read_file').length, 1);
});

test('a check-in reads live cards while model routing and ranking are blocked', async t => {
  const { agent, store } = await fixture(t);
  const thread = { id: 'example', title: 'one task', status: 'idle', lifecycle: 'open', messages: [] };
  const chat = agent.newChat(thread);
  await agent.saveChat(chat);
  await agent.saveThread(thread);
  const started = Promise.withResolvers(), release = Promise.withResolvers();
  let calls = 0;
  useMock(agent, async () => {
    calls++;
    started.resolve();
    await release.promise;
    return answer({open:[{id:thread.id,action:'read the result'}]});
  });
  const ranking = refreshStatusRanking(agent);
  await started.promise;
  agent.intake = release.promise;
  try {
    thread.status = 'waiting_for_you';
    thread.question = 'which day?';
    await agent.saveThread(thread);
    const check = await send(agent, store, '');
    assert.equal(check.messages.at(-1).text, '1. one task (which day?)');
    assert.equal(calls, 1);
  } finally { release.resolve(); await ranking; }
  assert.equal((await send(agent, store, 'status')).messages.at(-1).text, '1. one task (which day?)');
  assert.deepEqual(await agent.archiveThreads([thread.id]), [thread.id]);
  assert.equal((await send(agent, store, '')).messages.at(-1).text, 'nothing open or newly closed.');
  assert.equal((await agent.chat(chat.id)).id, chat.id);
  assert.equal(calls, 1);
});

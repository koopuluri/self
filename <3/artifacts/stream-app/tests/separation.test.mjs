import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { StreamStore } from '../service/store.mjs';
import { piClient } from '../service/pi-client.mjs';
import { startWorker } from '../../../../π/service/worker.mjs';

async function wait(check) {
  for (let i=0;i<100;i++) { const result=await check(); if (result) return result; await delay(60); }
  throw new Error('Timed out waiting for π');
}
test('a queued request survives a closed editor, client replacement and a worker restart', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'self-separation-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  let store=await new StreamStore(root).init(), client=await piClient(store,()=>{});
  const source=await store.append('/current model');
  const slot=store.beats.at(-1).id;
  const args={bubble:true,text:'current model',sourceText:'/current model',sourceBeatId:source,slot};
  const id=await client.prompt(args);
  assert.equal(await client.prompt(args),id);
  const prose=await store.append('π is a subject I can write about.');
  assert.equal(store.beat(prose).text,'π is a subject I can write about.');
  const work = await startWorker(root);
  t.after(()=>work.close());
  const out=path.join(root,'π/.runtime/mailbox-v1/out',id+'.json');
  await wait(()=>fs.stat(out).catch(()=>false));
  work.close();
  store=await new StreamStore(root).init(); client=await piClient(store,()=>{});
  await client.sync();
  const c=await client.chat(store.metadata.beats[source].chatId);
  assert.match(c.messages.at(-1).text,/current model/i);
  assert.equal(c.messages.filter(m=>m.role==='user').length,1);
  const check=await store.append('/'), next=store.beats.at(-1).id;
  await client.prompt({bubble:true,text:'',sourceText:'/',sourceBeatId:check,slot:next});
  assert.equal(store.metadata.beats[check].bubble.text,'');
  const nextWorker = await startWorker(root); t.after(()=>nextWorker.close());
  await wait(async()=>{await client.sync();return (await client.state(check)).phase==='ready';});
  const state=await client.state(check);
  await client.deliver({chatId:state.chatId,after:check,slot:next,messageIndex:state.messageIndex});
  assert.equal(store.metadata.statusHistory.length,1);
  assert.equal(JSON.parse(await fs.readFile(store.metadataFile)).statusHistory,undefined);
  assert.equal(JSON.parse(await fs.readFile(store.receiptsFile)).statusHistory.length,1);
  const page=await store.append('/example.org');
  await client.prompt({bubble:true,text:'example.org',sourceText:'/example.org',sourceBeatId:page});
  assert.equal(store.snapshot().beats.at(-2).url,'https://example.org/');
  assert.deepEqual(await fs.readdir(path.join(root,'π/.runtime/mailbox-v1/in')),[]);
});

test('opening a document records its path, and stale saves preserve the newer file', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'stream-document-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = await new StreamStore(root).init();
  const { documentActions, readWorkspaceDocument } = await import('../service/documents.mjs');
  const client = await piClient(store, () => {});
  const name = '<3/artifacts/words with spaces.md';
  const file = path.join(root, name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, 'original');
  const sourceText = '/open ' + name;
  const source = await store.append(sourceText);
  await client.prompt({ bubble: true, text: sourceText.slice(1), sourceText, sourceBeatId: source });
  const doc = store.snapshot().beats.find(b => b.kind === 'document');
  assert.equal(doc.filepath, name);
  const actions = documentActions(store);
  const { hash } = await actions.readBlockDocument(doc);
  const writes = await Promise.allSettled(['first', 'second'].map(text => actions.saveBlockDocument({ id: doc.id, hash, text })));
  assert.deepEqual(writes.map(w => w.status), ['fulfilled', 'rejected']);
  assert.equal(await fs.readFile(file, 'utf8'), 'first');
  await fs.symlink(file, path.join(root, 'alias.md'));
  await assert.rejects(readWorkspaceDocument(root, 'alias.md'));
  await assert.rejects(readWorkspaceDocument(root, '../outside.md'));
  assert.equal((await readWorkspaceDocument(root, '<3/stream/index.md')).readOnly, true);
});

test('the margin restores context on demand and binds the adjacent reply to its original chat', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stream-margin-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = await new StreamStore(root).init();
  const events = [];
  const client = await piClient(store, event => events.push(event));
  const source = await store.append('/which draft?');
  const card = { id: 'thread', chatId: 'draft', title: 'Choose a Draft', summary: 'comparing two drafts', human_context: 'you asked which draft to use.', humanContextTraceId: 'turn', state: 'idle' };
  const chat = { id: 'draft', threadId: 'thread', messages: [
    { role: 'user', text: 'which draft?', traceId: 'turn' }, { role: 'assistant', text: 'the second draft' },
  ] };
  await fs.mkdir(path.join(store.pi, 'chats'), { recursive: true });
  await fs.writeFile(path.join(store.pi, 'chats/draft.json'), JSON.stringify(chat));
  await fs.writeFile(path.join(store.pi, '.runtime/open-threads.json'), JSON.stringify([card]));
  await store.transact(() => Object.assign(store.metadata.beats[source], {
    kind: 'bubble', chatId: 'draft', messageIndex: 0, bubble: chat.messages[0],
  }));
  await client.syncMargin();
  await client.syncMargin();
  assert.deepEqual(events, [{ event: 'open-threads', cards: [{ ...card, title: 'choose a draft', unread: true }] }]);
  const shown = await client.showThread({ threadId: card.id, visible: [source] });
  assert.equal(store.metadata.beats[shown.first].bubble.text, 'the second draft');
  assert.equal((await client.openThreads()).find(c => c.id === card.id).unread, false);
  const tail = await client.showThread({ threadId: card.id, visible: [] });
  assert.equal(store.metadata.beats[tail.first].bubble.text, 'choose a draft recapped: you asked which draft to use.');
  assert.equal(store.metadata.beats[tail.first].bubble.source, 'thread-recap');
  assert.notEqual(tail.result, tail.first);
  assert.equal(store.metadata.beats[tail.result].bubble.text, 'the second draft');
  assert.deepEqual(store.beats.slice(-2).map(b => b.id), [tail.result, tail.slot]);
  await store.edit([{ id: tail.slot, before: '', text: '/yes' }]);
  const request = await client.prompt({ bubble: true, sourceBeatId: tail.slot, sourceText: '/yes', text: 'yes' });
  const queued = JSON.parse(await fs.readFile(path.join(store.pi, '.runtime/mailbox-v1/in', request + '.json')));
  assert.equal(queued.args.chatId, chat.id);
  assert.equal(await fs.readFile(path.join(store.pi, 'chats/draft.json'), 'utf8'), JSON.stringify(chat));
  chat.messages.push({ role: 'user', text: 'next?' }, { role: 'assistant', text: 'send it' });
  await fs.writeFile(path.join(store.pi, 'chats/draft.json'), JSON.stringify(chat));
  assert.equal((await client.openThreads()).find(c => c.id === card.id).unread, true);
  const next = await client.showThread({ threadId: card.id, visible: [] });
  assert.equal(store.metadata.beats[next.first].bubble.text, 'choose a draft recapped: you wrote: “next?”');
  await store.transact(() => { store.metadata.readResults = { thread: { chatId: 'draft', index: 3 } }; });
  assert.equal((await client.openThreads()).find(c => c.id === card.id).unread, false);
});

test('routing hands off to one working row in either publication order', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stream-routing-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = await new StreamStore(root).init();
  const client = await piClient(store, () => {});
  const dir = path.join(store.pi, '.runtime');
  await fs.mkdir(path.join(store.pi, 'chats'), { recursive: true });
  const submit = async text => {
    const id = await store.append('/' + text);
    await client.prompt({ bubble: true, text, sourceText: '/' + text, sourceBeatId: id });
    return id;
  };
  const ids = async () => (await client.openThreads()).map(c => [c.id, c.state]);
  const card = { id: 'task', title: 'draft', chatId: 'chat', state: 'running' };
  const margin = cards => fs.writeFile(path.join(dir, 'open-threads.json'), JSON.stringify(cards));
  const conversation = { id: 'chat', threadId: 'task', status: 'running', messages: [] };
  const route = async id => {
    conversation.messages.push({ role: 'user', text: 'draft', sourceBeatId: id, traceId: 'beat-' + id });
    await fs.writeFile(path.join(store.pi, 'chats/chat.json'), JSON.stringify(conversation));
  };
  const result = async (source, data) => {
    await fs.writeFile(path.join(dir, 'mailbox-v1/out', `beat-${source}.json`), JSON.stringify({ source, sourceText: store.beat(source).text, ...data }));
    await client.sync();
  };
  const first = await submit('draft');
  const placeholder = ['routing-' + first, 'routing'];
  assert.deepEqual(await ids(), [placeholder]);
  await route(first);
  await result(first, { chatId: 'chat' }); // receipt before ranked list
  assert.deepEqual(await ids(), [placeholder]);
  await margin([card]);
  assert.deepEqual(await ids(), [['task', 'running']]);
  const follow = await submit('continue');
  assert.deepEqual(await ids(), [['routing-' + follow, 'routing'], ['task', 'running']]);
  await route(follow); // already-running target accepts input before receipt
  assert.deepEqual(await ids(), [['task', 'running']]);
  await result(follow, { chatId: 'chat' });
  assert.deepEqual(await ids(), [['task', 'running']]);
  const failed = await submit('another task');
  await result(failed, { error: 'routing failed' });
  assert.deepEqual(await ids(), [['request-' + failed, 'failed'], ['task', 'running']]);
});

test('an archive receipt appears once below the command even after writing continues', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stream-archive-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = await new StreamStore(root).init(), client = await piClient(store, () => {});
  const source = await store.append('/archive'), traceId = await client.prompt({
    bubble: true, text: 'archive', sourceText: '/archive', sourceBeatId: source });
  const next = await store.append('keep writing');
  const chat = { id: 'draft', messages: [ { role: 'user', text: 'archive', traceId },
    { role: 'assistant', source: 'archive-receipt', traceId, text: 'archived: First Draft' } ] };
  await fs.mkdir(path.join(store.pi, 'chats'), { recursive: true });
  await fs.writeFile(path.join(store.pi, 'chats/draft.json'), JSON.stringify(chat));
  const out = path.join(store.pi, '.runtime/mailbox-v1/out', traceId+'.json');
  for (let i=0; i<2; i++) {
    await fs.writeFile(out, JSON.stringify({ source, sourceText: '/archive', chatId: chat.id }));
    await client.sync();
  }
  const beats = store.snapshot().beats, receipt = beats[beats.findIndex(b => b.id === source)+1];
  assert.equal(receipt.author, 'π');
  assert.equal(receipt.bubble.text, 'archived: First Draft');
  assert.equal(beats.filter(b => b.bubble?.source === 'archive-receipt').length, 1);
  assert.equal(store.beat(next).text, 'keep writing');
});

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
  let store=await new StreamStore(root).init(), client=await piClient(store,()=>{},'/preview/a');
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
  store=await new StreamStore(root).init(); client=await piClient(store,()=>{},'/preview/b');
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
  const client = await piClient(store, () => {}, '/preview');
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

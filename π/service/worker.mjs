import fs from 'node:fs/promises';
import path from 'node:path';
import { composeStatus, eventLog, refreshStatusRanking } from './functions.mjs';
import { Coordinator } from './agent.mjs';
import { isStatusCheck } from './status.mjs';
import { StreamStore } from './store.mjs';
import { atomicWrite, readJSON } from './io.mjs';
import { observeModelFetch } from './model-diagnostics.mjs';

// Indexed context belongs to this service. The real document is writable
// only by the client. Navigation decisions travel back as requested effects.
class Context extends StreamStore {
  use(request, receipts) {
    this.requestId = request.id;
    const { beats, nextId, retired } = request.context;
    this.beats = beats.map(({ id, text }) => ({ id, text }));
    this.metadata = { ...receipts, nextId, beats: Object.fromEntries(beats.map(b => [b.id, { ...b }])) };
    for (const [id, redirect] of Object.entries(retired)) this.metadata.beats[id] ??= { redirect };
    this.effects = [];
    this.on('open-beat', id => this.effects.push({ kind: 'open-beat', id }));
  }
  insertBlock(text, kind, details) {
    if (kind === 'chat') this.effects.push({kind,chatId:details.chatId});
    return super.insertBlock(text,kind,details);
  }
  async transact(change) { return change(); }
  async browser(url, after) { this.effects.push({ kind: 'browser', url, after }); }
  async redact(id, value) { this.effects.push({ kind: 'redact', id, value }); }
  async remove(id) { this.effects.push({ kind: 'remove', id }); }
}

export async function startWorker(root, plan, shouldRetire = async () => false, retire = () => {}) {
  globalThis.fetch = observeModelFetch(globalThis.fetch);
  const store = new Context(root);
  const box = path.join(store.pi, '.runtime/mailbox-v1');
  for (const dir of ['chats','threads','logs','memory','.runtime']) await fs.mkdir(path.join(store.pi, dir), { recursive: true });
  for (const dir of ['in','running','out']) await fs.mkdir(path.join(box, dir), { recursive: true });
  const receipts = () => readJSON(path.join(store.pi, '.runtime/delivery.json'), {});
  store.receipts = await receipts();
  Object.assign(store.metadata, store.receipts);
  const agent = new Coordinator(store, plan);
  await agent.initialized;
  const writeResult = (file, result) => atomicWrite(path.join(box,'out',file), JSON.stringify(result));
  // A previous process might have reached an external tool. Recover its
  // saved chat or report interruption; never execute an ambiguous claim again.
  for (const file of await fs.readdir(path.join(box,'running'))) {
    if (!file.endsWith('.json')) continue;
    const request = await readJSON(path.join(box,'running',file));
    if (!await readJSON(path.join(box,'out',file), null) && !await readJSON(path.join(box,'applied',file), null)) {
      let result = { error: 'π restarted during this request. Check its outcome before retrying.' };
      for (const t of await agent.threads()) {
        const chat = await agent.chat(t.chatId);
        if (chat.messages.some(m => m.traceId === request.id)) { result = { chatId: chat.id }; break; }
      }
      await writeResult(file, { ...result, source: request.args.sourceBeatId, sourceText: request.args.sourceText });
    }
    await fs.unlink(path.join(box,'running',file));
  }
  let statusDirty = true, marginDirty = true, ranking = false;
  store.on('thread-changed', () => { statusDirty = marginDirty = true; });
  function refreshIfNeeded() {
    if (!statusDirty || ranking) return;
    statusDirty = false;
    ranking = true;
    void refreshStatusRanking(agent)
      .catch(error => eventLog(agent, { function: 'compose-status', error: error.message }))
      .catch(error => console.error(error.message))
      .finally(() => { ranking = false; marginDirty = true; });
  }
  const busy = new Set();
  async function handle(file, request) {
    const input = path.join(box,'in',file), claim = path.join(box,'running',file);
    await fs.rename(input, claim);
    if (!await readJSON(path.join(box,'out',file), null) && !await readJSON(path.join(box,'applied',file), null)) {
      let result;
      try {
        if (request.version !== 1) throw new Error('Unsupported π request version.');
        const context = new Context(root);
        context.use(request, store.receipts);
        result = await agent.requestContext.run(context, async () => {
          const controls = {
            stop: () => agent.stop(request.args.chatId),
            models: () => agent.models(request.args.provider),
            configure: () => agent.configure(request.args),
            threads: () => agent.threads(),
            archiveThreads: () => agent.archiveThreads(request.args.ids, request.args.click),
            statusSnapshot: () => composeStatus(agent),
            continueThread: () => agent.continueThread(request.args),
            reveal: () => agent.reveal(),
          };
          if (request.method) {
            if (!Object.hasOwn(controls, request.method)) throw new Error('Unknown π operation.');
            const value = await controls[request.method]();
            if (request.method === 'continueThread') await agent.reveal();
            return { value, effects: context.effects };
          }
          const chatId = await agent.prompt({ ...request.args, lastStatus: request.lastStatus, slot: request.args.slot ?? -1 });
          if (!isStatusCheck(request.args)) {
            while (agent.pending.length) await agent.reveal();
          }
          return { chatId, effects: context.effects };
        });
      } catch (e) { result = { error: e.message }; }
      await writeResult(file, { ...result, source: request.args.sourceBeatId, sourceText: request.args.sourceText });
    }
    await fs.unlink(claim);
  }
  let polling = false, checkedStatuses = 0;
  async function poll() {
    if (polling) return;
    polling = true;
    try {
      store.receipts = await receipts();
      Object.assign(store.metadata, store.receipts);
      const history = store.receipts.statusHistory ?? [];
      for (const receipt of history.slice(checkedStatuses)) {
        if (!receipt.chatId) continue;
        const c = await agent.chat(receipt.chatId);
        const m = c.messages[receipt.messageIndex];
        if (m?.report && m.text !== receipt.text) { m.text = receipt.text; await agent.saveChat(c); }
      }
      checkedStatuses = history.length;
      if (marginDirty) {
        marginDirty = false;
        try {
          const { open } = await composeStatus(agent);
          await atomicWrite(path.join(store.pi, '.runtime/open-threads.json'), JSON.stringify(open));
        } catch (error) { marginDirty = true; throw error; }
      }
      if (await shouldRetire()) {
        if (!busy.size && !agent.running.size && !agent.displays.size && !agent.connecting && !agent.submissions.size) retire();
        return;
      }
      refreshIfNeeded();
      const requests = [];
      for (const file of await fs.readdir(path.join(box,'in'))) {
        if (/^[\w-]+\.json$/.test(file)) requests.push({ file, request: await readJSON(path.join(box,'in',file)) });
      }
      for (const { file, request } of requests.sort((a,b) => a.request.at - b.request.at)) {
        const lane = !request.method && isStatusCheck(request.args) ? 'status' : 'intake';
        if (busy.has(lane)) continue;
        busy.add(lane);
        void handle(file, request).catch(error => console.error(error.message)).finally(() => busy.delete(lane));
      }
    } finally { polling = false; }
  }
  await poll();
  const timer = setInterval(() => poll().catch(e => console.error(e.message)), 250);
  return { close: () => clearInterval(timer), agent };
}

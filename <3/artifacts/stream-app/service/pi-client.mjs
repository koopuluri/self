import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { atomicWrite, readJSON, stamp } from './store.mjs';
import { expandHistoricalChats, attachMessage, pendingReplies, placeMessage, recentPages, routePage } from './bubbles.mjs';
import { reportText } from './report-text.mjs';

import { readWorkspaceDocument } from './documents.mjs';

export async function piClient(store, send) {
  const box = path.join(store.pi,'.runtime/mailbox-v1');
  for (const dir of ['in','out','running','applied']) await fs.mkdir(path.join(box,dir), {recursive:true});
  const chat = id => {
    if (!/^[\w-]+$/.test(id)) throw new Error('Invalid chat.');
    return readJSON(path.join(store.pi,'chats',id+'.json'), null);
  };
  const marginFile = path.join(store.pi, '.runtime/open-threads.json');
  // Intake can fail before π creates a thread. Keep these errors reachable in
  // the same margin, including failures recorded by older releases.
  function failedRequests() {
    return store.beats.flatMap(({ id }) => {
      const beat = store.metadata.beats[id];
      if (!beat.bubble?.failure || beat.failureArchived) return [];
      return [{ id: 'request-' + id, source: id, title: beat.bubble.text.slice(0, 100) || 'π request',
        state: 'failed', action: 'read the error', summary: '' }];
    });
  }
  let failures = failedRequests();
  store.on('changed', () => { failures = failedRequests(); });
  // Mailbox requests survive editor restarts. Keep their UI separate from
  // real threads: a routing row has neither a title nor thread actions.
  const pendingRequests = () => store.beats.filter(({ id }) => {
    const beat = store.metadata.beats[id];
    return beat.requestId && beat.requestId !== beat.appliedRequest && !beat.chatId && !beat.bubble?.failure;
  }).map(({ id }) => id);
  let pending = pendingRequests();
  store.on('changed', () => { pending = pendingRequests(); });
  // The result mailbox and ranked margin are two independent publications.
  // Bridge a routed, still-working chat until its card catches up.
  const handoffs = new Map();
  // A finished reply is unread until Stream has placed it (inline or on demand),
  // or a status pull delivered it. Match the reply, not just the thread ID.
  function shownReplies() {
    const shown = new Map();
    for (const beat of Object.values(store.metadata.beats)) {
      if (beat.chatId && beat.bubble?.role === 'assistant' && Number.isInteger(beat.messageIndex))
        shown.set(beat.chatId, Math.max(shown.get(beat.chatId) ?? -1, beat.messageIndex));
    }
    return shown;
  }
  let shown = shownReplies();
  store.on('changed', () => { shown = shownReplies(); });
  const transcripts = new Map();
  async function chatActivity(id) {
    if (!id || !/^[\w-]+$/.test(id)) return null;
    const file = path.join(store.pi, 'chats', id + '.json');
    // Chats are atomically replaced. Don't parse every transcript on each margin poll.
    const stat = await fs.stat(file).catch(e => { if (e.code !== 'ENOENT') throw e; });
    if (!stat) return null;
    const version = `${stat.ino}:${stat.mtimeMs}:${stat.size}`;
    if (transcripts.get(id)?.version === version) return transcripts.get(id);
    const c = await chat(id);
    const last = c?.messages.findLastIndex(m => m.role === 'assistant' && !m.partial) ?? -1;
    const index = c && last > c.messages.findLastIndex(m => m.role === 'user') ? last : -1;
    const activity = { version, index, state: c?.status, sources: new Set(c?.messages.filter(m => m.role === 'user').map(m => m.sourceBeatId)) };
    transcripts.set(id, activity);
    return activity;
  }
  const rawCards = async () => [...failures, ...await readJSON(marginFile, [])];
  async function openThreads() {
    const cards = await rawCards();
    const unresolved = new Set(pending);
    const active = state => state === 'queued' || state === 'running';
    const keep = new Set();
    const ranked = await Promise.all(cards.map(async card => {
      const receipt = store.metadata.readResults?.[card.id];
      const read = Math.max(shown.get(card.chatId) ?? -1, receipt?.chatId === card.chatId ? receipt?.index ?? -1 : -1);
      const bridge = handoffs.has(card.chatId);
      let state = card.state, activity;
      if (state === 'idle' || bridge || (pending.length && card.chatId)) {
        keep.add(card.chatId);
        activity = await chatActivity(card.chatId);
        if (bridge) {
          if (!active(state) && active(activity?.state)) state = activity.state;
          else handoffs.delete(card.chatId);
        }
        for (const id of unresolved) {
          if (!activity?.sources.has(id)) continue;
          if (active(activity.state)) state = activity.state;
          if (active(state)) unresolved.delete(id);
        }
      }
      return { ...card, state, title: card.title.toLowerCase(), unread: state === 'idle' && (activity?.index ?? -1) > read };
    }));
    for (const [id, source] of handoffs) {
      if (cards.some(card => card.chatId === id)) continue;
      keep.add(id);
      if (active((await chatActivity(id))?.state)) unresolved.add(source);
      else handoffs.delete(id);
    }
    for (const id of transcripts.keys()) if (!keep.has(id)) transcripts.delete(id);
    return [...Array.from(unresolved, id => ({ id: 'routing-' + id, state: 'routing', title: '', action: '', summary: '', unread: false })), ...ranked];
  }
  async function archiveThread({ threadId, stopActive, click }) {
    const failed = failures.find(row => row.id === threadId);
    if (failed) return store.transact(() => { store.metadata.beats[failed.source].failureArchived = true; });
    return control('archiveThreads', { ids: [threadId], stopActive: stopActive === true, click });
  }
  let previousMargin;
  let marginQueue = Promise.resolve();
  function syncMargin() {
    const work = marginQueue.then(publishMargin);
    marginQueue = work.catch(() => {});
    return work;
  }
  async function publishMargin() {
    const cards = await openThreads();
    const version = JSON.stringify(cards);
    if (version !== previousMargin) {
      previousMargin = version;
      send({ event: 'open-threads', cards });
    }
  }
  async function showThread({ threadId, visible }) {
    const card = (await rawCards()).find(t => t.id === threadId);
    if (!card) throw new Error('This thread is no longer open.');
    if (card.source !== undefined) {
      return store.transact(() => {
        const failed = store.metadata.beats[card.source].bubble;
        const add = (text, source = 'system-status') => store.insertBlock('[π request](https://koopuluri.com/stream/' + card.source + ')', 'bubble', {
          author: 'π', bubble: { role: 'assistant', source, text } });
        const reminder = !visible.includes(card.source) && add(`thread recapped: you wrote: “${failed.text}”`, 'thread-recap');
        const result = add(failed.failure);
        return { first: reminder || result, slot: store.beats.at(-1).id };
      });
    }
    const c = await chat(card.chatId);
    if (!c) throw new Error('The conversation is unavailable.');
    const lastUser = c.messages.findLastIndex(m => m.role === 'user');
    const latest = c.messages.findLastIndex(m => m.role === 'assistant' && !m.partial);
    const active = ['running', 'queued'].includes(card.state);
    return store.transact(() => {
      const reference = '[chat with π](../../π/chats/' + c.id + '.md)';
      const bubble = (text, source = 'system-status') => store.insertBlock(reference, 'bubble', { chatId: c.id, author: 'π',
        bubble: { role: 'assistant', source, text } });
      const inView = visible.some(id => {
        const beat = store.metadata.beats[id];
        return beat?.chatId === c.id && beat.bubble?.role === 'user' && beat.messageIndex === lastUser;
      });
      let first;
      if (!inView) {
        const ask = c.messages[lastUser];
        const reminder = (ask?.traceId && ask.traceId === card.humanContextTraceId && card.human_context) || (ask?.text && `you wrote: “${ask.text}”`);
        if (reminder) first = bubble(`${card.title.toLowerCase()} recapped: ${reminder}`, 'thread-recap');
      }
      const result = !active && latest > lastUser
        ? placeMessage(store, c, latest, null)
        : bubble([card.state.replaceAll('_', ' '), card.action].filter(Boolean).join(' · '));
      store.metadata.beats[result].replyChatId = c.id;
      return { first: first ?? result, slot: store.beats.at(-1).id };
    });
  }
  async function prompt(args) {
    const { sourceBeatId:source, sourceText, text } = args;
    const beat = store.resolve(source).beat;
    if (args.bubble && (!beat || beat.text !== sourceText || beat.kind !== 'text' && !beat.requestId)) throw new Error('The submitted beat has changed.');
    if (beat?.requestId) return beat.requestId;
    const documentMatch = args.bubble && /^(?:open\s+)?(?:self\/)?((?:(?:<3|π|\$|tools)\/[^\n]+|[^\s/]+)\.(?:md|txt))$/iu.exec(text.trim());
    const filepath = documentMatch?.[1];
    if (filepath) await readWorkspaceDocument(store.root, filepath);
    let opened;
    const url = !filepath && args.bubble && routePage(text,recentPages(store,store.beats.findIndex(b => b.id === source)));
    const edit = args.bubble && /^(redact|unredact|clear) (?:beat )?(this|that|#?\d+)(?: beat)?[.!]?$/i.exec(text.trim());
    if (url || edit || filepath) {
      const link = url && /^https?:\/\/(?:www\.)?koopuluri\.com\/stream\/(\d+)\/?$/i.exec(url);
      if (link && store.resolve(Number(link[1])).status !== 'live') throw new Error('That beat is unavailable.');
      await store.transact(() => {
        if (store.beat(source)?.text !== sourceText || store.metadata.beats[source].kind !== 'text') throw new Error('The submitted beat has changed.');
        let edited, operation;
        if (edit) {
          operation = edit[1].toLowerCase();
          const before = store.beats.slice(0,store.beats.findIndex(b=>b.id===source));
          const id = /\d/.test(edit[2]) ? Number(edit[2].replace('#','')) : before.findLast(b=>b.text.trim())?.id;
          edited = store.resolve(id).beat;
          if (!edited) throw new Error('That beat is unavailable.');
        }
        Object.assign(store.metadata.beats[source],{kind:'bubble',author:'user',bubble:{role:'user',text}});
        if (filepath) opened = store.insertBlockAfter(source, '[' + filepath + '](../../' + encodeURI(filepath).replaceAll(')', '%29') + ')', 'document', { filepath });
        if (url && !link) opened = store.insertBlockAfter(source,'['+url+']('+url+')','browser',{url});
        if (edited) {
          if (operation === 'clear') store.deleteBeat(edited.id);
          else Object.assign(store.metadata.beats[edited.id],{redacted:operation === 'redact',redactedAt:operation === 'redact' ? stamp() : null});
        }
      });
      if (opened != null) send({event:'open-block',id:opened,source});
      if (link) send({event:'open-beat',id:Number(link[1])});
      return null;
    }
    const id = args.bubble ? 'beat-'+source : randomUUID();
    const context = store.snapshot();
    // The submission snapshot also permits execution after closing the editor.
    context.beats = context.beats.map(({id,text,kind,url,bubble}) => ({id,text,kind,url,bubble}));
    const position = context.beats.findIndex(b => b.id === source);
    const previous = position > 0 && store.metadata.beats[context.beats[position - 1].id];
    if (previous?.replyChatId && text.trim()) args = { ...args, chatId: previous.replyChatId };
    const request = { version:1,id,at:Date.now(),args,context, lastStatus:store.metadata.statusHistory?.at(-1) ?? null };
    await atomicWrite(path.join(box,'in',id+'.json'),JSON.stringify(request));
    if (beat) await store.transact(() => {
      if (store.beat(source)?.text === sourceText) Object.assign(store.metadata.beats[source],
        {kind:'bubble',author:'user',requestId:id,bubble:{role:'user',text}});
    });
    await syncMargin();
    return id;
  }
  async function state(source) {
    const beat = store.metadata.beats[source];
    if (!beat?.requestId && !beat?.chatId) return null;
    if (beat.bubble?.failure) return {id:source,phase:'done'};
    if (!beat.chatId) { waiting.add(source); return { id:source,phase:'working' }; }
    const c = await chat(beat.chatId);
    if (!c || c.displaySourceId !== source) return {id:source,phase:'done'};
    const i = c.messages.length-1;
    if (c.messages[i]?.role !== 'assistant' && c.status === 'running') waiting.add(source);
    return {event:'reply-state',id:source,chatId:c.id,messageIndex:i,
      phase:c.messages[i]?.role === 'assistant' ? 'ready' : c.status === 'running' ? 'working' : 'done'};
  }
  let syncing = false;
  const waiting = new Set();
  async function sync() {
    if (syncing) return;
    syncing = true;
    try {
      for (const file of await fs.readdir(path.join(box,'out'))) {
        if (!/^[\w-]+\.json$/.test(file)) continue;
        const result = await readJSON(path.join(box,'out',file));
        const c = result.chatId && await chat(result.chatId);
        const source = result.source;
        const id = file.slice(0,-5);
        if (source == null && !c && !result.effects?.length) {
          await fs.rename(path.join(box,'out',file),path.join(box,'applied',file));
          continue;
        }
        let opened;
        await store.transact(() => {
          if (source == null) {
            for (const effect of result.effects ?? []) {
              if (effect.kind==='chat' && !store.beats.some(b=>store.metadata.beats[b.id].chatId===effect.chatId))
                store.insertBlock('[chat with π](../../π/chats/'+effect.chatId+'.md)','chat',{chatId:effect.chatId});
            }
            if (c && !store.beats.some(b=>store.metadata.beats[b.id].chatId===c.id)) store.insertBlock('[chat with π](../../π/chats/'+c.id+'.md)','chat',{chatId:c.id});
            return;
          }
          const m = store.metadata.beats[source];
          if (!store.beat(source) || store.beat(source).text !== result.sourceText || m.appliedRequest === id) return;
          m.requestId = id;
          if (result.error) {
            m.kind = 'bubble'; m.bubble ??= {role:'user',text:result.sourceText.slice(1)};
            m.bubble.failure = result.error;
          } else {
            const i = c.messages.findIndex(m=>m.traceId===id && m.role==='user');
            if (i>=0) attachMessage(store,source,c,i);
            for (const effect of result.effects ?? []) {
              if (effect.kind==='chat') store.insertBlockAfter(source,'[chat with π](../../π/chats/'+effect.chatId+'.md)','chat',{chatId:effect.chatId});
              if (effect.kind==='browser') opened = store.insertBlockAfter(source,'['+effect.url+']('+effect.url+')','browser',{url:effect.url});
              if (effect.kind==='redact' && store.beat(effect.id)) Object.assign(store.metadata.beats[effect.id],{redacted:effect.value,redactedAt:effect.value?stamp():null});
              if (effect.kind==='open-beat') send({event:'open-beat',id:effect.id});
              if (effect.kind==='remove' && store.beat(effect.id)) store.deleteBeat(effect.id);
            }
          }
          m.appliedRequest = id;
        });
        if (source != null && c && ['queued', 'running'].includes(c.status) && c.displaySourceId !== source) handoffs.set(c.id, source);
        if (opened != null) send({event:'open-block',id:opened,source});
        if (source == null || result.effects?.some(e=>e.kind==='chat')) await expandHistoricalChats(store);
        await fs.rename(path.join(box,'out',file),path.join(box,'applied',file));
        if (source != null) waiting.add(source);
      }
      for (const source of waiting) {
        const event = await state(source);
        if (event?.phase === 'working') continue;
        waiting.delete(source);
        if (event) send({...event,event:'reply-state'});
      }
    } finally { syncing=false; }
  }
  async function deliver({chatId,after,slot,messageIndex}) {
    const c = await chat(chatId);
    if (!c || c.sourceBeatId!==after || c.displaySourceId!==after || c.messages.length-1!==messageIndex) return;
    const message=c.messages[messageIndex];
    await store.transact(() => {
      const index=store.beats.findIndex(b=>b.id===after), next=store.beats[index+1];
      if (index<0 || store.metadata.beats[after].chatId!==c.id || next?.id!==slot || next.text || !pendingReplies(store,c).includes(messageIndex)) return;
      const meta=store.metadata;
      let closed;
      if (message.report) ({text:message.text,closed}=reportText(message.report,meta.reportedClosures??{}));
      const beatId=placeMessage(store,c,messageIndex,after);
      if (closed) {
        (meta.statusHistory??=[]).push({beatId,chatId:c.id,messageIndex,text:message.text,open:message.report.open.map(({id,title})=>({id,title})),closed});
        for (const item of closed) (meta.reportedClosures??={})[item.closureId]=beatId;
      }
      if (message.read) (meta.readResults??={})[message.read.threadId]=message.read;
    });
  }
  async function control(method,args={}) {
    const id = randomUUID(), file=id+'.json';
    await atomicWrite(path.join(box,'in',file),JSON.stringify({version:1,id,at:Date.now(),method,args,context:store.snapshot()}));
    const start = Date.now();
    while (Date.now()-start<115000) {
      const result = await readJSON(path.join(box,'applied',file),null);
      if (result?.error) throw new Error(result.error);
      if (result) return result.value;
      await delay(100);
    }
    throw new Error('π has not answered yet. The request is saved.');
  }
  return { openThreads, archiveThread, showThread, syncMargin, prompt, state, sync, deliver, chat, control };
}

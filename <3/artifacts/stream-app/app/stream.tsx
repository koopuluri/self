'use client';
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { history } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { editorHistory, makeEditor, remote, sync, type EditorContext } from '../lib/editor';
import { closeBlock, openFileOrBrowser } from '../lib/block-viewer';
import { mergeEmbeds } from '../lib/merge-embeds';
import { identity, setIdentity } from '../lib/identity';
import { marginRows } from '../lib/margin-rows';
import type { Reply, Snapshot, StreamEvent, ThreadCard } from '../lib/types';

type Invitation = { source: number; slot: number; follow: boolean; delivering?: boolean };
const invitationKey = 'stream.reply-invitation';

// Only fade a title when it actually runs out of room, including on hover.
function MarginLabel({ title }: { title: string }) {
  const label = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const clip = label.current!, text = clip.firstElementChild!;
    const measure = () => clip.toggleAttribute('data-overflow', text.getBoundingClientRect().width > clip.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(clip); observer.observe(text);
    return () => observer.disconnect();
  }, [title]);
  return <span className="thread-label" ref={label}><span>{title}</span></span>;
}

export default function Stream() {
  const host = useRef<HTMLDivElement>(null), view = useRef<EditorView|null>(null), context = useRef<EditorContext|null>(null);
  const revisions = useRef({ local: 0, saved: 0 }), base = useRef<Snapshot|null>(null), saving = useRef<Promise<void>|null>(null), saveTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const returnFrame = useRef(0);
  const [away, setAway] = useState(false);
  const waiting = useRef<Invitation | null>(null);
  const revealing = useRef<Invitation | null>(null);
  const submitting = useRef(new Set<{ source: number; slot: number }>());
  const submissionQueue = useRef(Promise.resolve());
  const awayRef = useRef(false), initialized = useRef(false);
  const scrollFrame = useRef(0);
  const [ready, setReady] = useState(false), [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);
  const [rows, dispatchRows] = useReducer(marginRows, []);
  const visibleRows = rows.filter(row => row.exit !== 'hidden');
  async function archiveThread(card: ThreadCard) {
    dispatchRows({ type: 'archive', id: card.id });
    try {
      const state = view.current?.state;
      const focusedBeatId = state?.field(identity).ids[state.doc.lineAt(state.selection.main.head).number - 1] ?? null;
      await call('archiveThread', { threadId: card.id, stopActive: ['running', 'queued'].includes(card.state),
        click: { at: new Date().toISOString(), runStateAtClick: card.state, focusedBeatId } });
    } catch (e) {
      dispatchRows({ type: 'restore', id: card.id });
      error(e);
    }
  }
  const threadAction = useRef(false);
  async function selectThread(card: ThreadCard) {
    const cm = view.current;
    if (!cm || threadAction.current) return;
    threadAction.current = true;
    try {
      const bounds = cm.scrollDOM.getBoundingClientRect();
      const visible = Array.from(cm.contentDOM.querySelectorAll<HTMLElement>('.bubble-block.user')).filter(node => {
        const rect = node.getBoundingClientRect();
        return rect.bottom > bounds.top && rect.top < bounds.bottom;
      }).map(node => Number(node.dataset.beat));
      await flush();
      const revision = revisions.current.local;
      const { first, slot } = await call('showThread', { threadId: card.id, visible });
      if (revision !== revisions.current.local) return;
      goTo(slot, true, 'nearest');
      const index = cm.state.field(identity).ids.indexOf(first);
      if (index >= 0) cm.dispatch({ effects: EditorView.scrollIntoView(cm.state.doc.line(index + 1).from, { y: 'start', yMargin: 48 }) });
    } catch (e) { error(e); }
    finally { threadAction.current = false; }
  }
  const error = (e: unknown) => setNotice(e instanceof Error ? e.message : String(e));
  function apply(snapshot?: Snapshot) {
    const cm = view.current, ctx = context.current; if (!snapshot || !cm || !ctx) return;
    if (revisions.current.local !== revisions.current.saved) return;
    const old = cm.state.field(identity), ids = snapshot.beats.map(b => b.id);
    const doc = snapshot.beats.map(b => b.text).join('\n');
    const same = base.current?.hash === snapshot.hash && old.nextId === snapshot.nextId &&
      ids.length === old.ids.length && ids.every((id, i) => old.ids[i] === id);
    ctx.beats = snapshot.beats;
    ctx.byId = new Map(snapshot.beats.map(b => [b.id, b]));
    base.current = snapshot;
    if (same || doc === cm.state.doc.toString() && ids.length === old.ids.length && ids.every((id, i) => old.ids[i] === id) && old.nextId === snapshot.nextId) {
      cm.dispatch({ effects: sync.of(), annotations: remote });
    } else {
      const position = (pos: number) => {
        const line = cm.state.doc.lineAt(pos), index = ids.indexOf(old.ids[line.number - 1]);
        const row = index < 0 ? Math.min(line.number - 1, ids.length - 1) : index;
        return snapshot.beats.slice(0, row).reduce((n, beat) => n + beat.text.length + 1, 0)
          + Math.min(pos - line.from, snapshot.beats[row].text.length);
      };
      const { anchor, head } = cm.state.selection.main;
      cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: doc }, selection: { anchor: position(anchor), head: position(head) },
        effects: [setIdentity.of({ ids, nextId: snapshot.nextId, retired: snapshot.retired }), sync.of(), editorHistory.reconfigure([])], annotations: remote });
      cm.dispatch({ effects: editorHistory.reconfigure(history()), annotations: remote });
    }

  }
  async function receive(result: Reply|null) { if (result?.snapshot) apply(result.snapshot); return result?.value; }
  async function call(method: string, args: any = {}) { const result = await window.streamAPI!.call(method, args); return receive(result); }
  async function flush() {
    if (saving.current) return saving.current;
    if (revisions.current.local === revisions.current.saved) return;
    saving.current = (async () => {
      while (revisions.current.local !== revisions.current.saved) {
        const revision = revisions.current.local, state = view.current!.state;
        const { ids, nextId, retired, origins } = state.field(identity);
        const rows = ids.map((id, i) => ({ id, text: state.doc.line(i + 1).text }));
        let reply;
        try {
          reply = await window.streamAPI!.call('document', {
            baseHash: base.current!.hash, baseNextId: base.current!.nextId, rows, nextId, retired, origins,
          });
        } catch (failure) {
          if (!(failure instanceof Error) || !failure.message.includes('changed outside this editor')) throw failure;
          const snapshot: Snapshot = (await window.streamAPI!.call('snapshot')).value;
          const cm = view.current!, current = cm.state, local = current.field(identity);
          const merged = mergeEmbeds(base.current!, snapshot, local, current.doc.toString().split('\n'));
          if (!merged) throw failure;
          const position = (pos: number) => {
            const line = current.doc.lineAt(pos);
            const index = merged.identity.ids.indexOf(merged.remap(local.ids[line.number - 1]));
            return merged.rows.slice(0, index).reduce((n, b) => n + b.text.length + 1, 0) + pos - line.from;
          };
          for (const entry of new Set([...submitting.current, ...(waiting.current ? [waiting.current] : [])])) {
            entry.source = merged.remap(entry.source); entry.slot = merged.remap(entry.slot);
          }
          if (waiting.current) setInvitation(waiting.current);
          const { anchor, head } = current.selection.main;
          const ctx = context.current!;
          ctx.beats = snapshot.beats; ctx.byId = new Map(snapshot.beats.map(b => [b.id, b]));
          base.current = snapshot;
          cm.dispatch({ changes: { from: 0, to: current.doc.length, insert: merged.rows.map(b => b.text).join('\n') },
            selection: { anchor: position(anchor), head: position(head) },
            effects: [setIdentity.of(merged.identity), sync.of(), editorHistory.reconfigure([])], annotations: remote });
          cm.dispatch({ effects: editorHistory.reconfigure(history()), annotations: remote });
          continue;
        }
        base.current = reply.snapshot!;
        revisions.current.saved = revision;
        apply(reply.snapshot);
      }
    })();
    try { await saving.current; } catch (e) { error(e); throw e; } finally { saving.current = null; }
  }
  function openSlot(entry: Invitation) {
    const state = view.current?.state;
    if (!state) return false;
    const ids = state.field(identity).ids, i = ids.indexOf(entry.source);
    return i >= 0 && ids[i + 1] === entry.slot && !state.doc.line(i + 2).length;
  }
  function setInvitation(entry: Invitation | null) {
    waiting.current = entry;
    if (entry) sessionStorage.setItem(invitationKey, JSON.stringify({ source: entry.source, slot: entry.slot }));
    else sessionStorage.removeItem(invitationKey);

  }
  function changed(cm: EditorView) {
    const entry = waiting.current;
    if (entry) {
      const line = cm.state.doc.lineAt(cm.state.selection.main.head);
      const slotIndex = cm.state.field(identity).ids.indexOf(entry.slot);
      const writingBeyondSlot = line.number - 1 > slotIndex && line.length > 0;
      if (!openSlot(entry) || writingBeyondSlot) setInvitation(null);
    }
    revisions.current.local++;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void flush().catch(() => {}); }, 350);
  }
  function focus(id: number) {
    const ctx = context.current; if (!ctx) return;
    void call('focus', { id }).catch(error);
  }
  function goTo(id: number, takeFocus = true, align: 'center' | 'start' | 'nearest' = 'center') {
    const cm = view.current, ctx = context.current; if (!cm || !ctx) return;
    cancelReturn();
    const index = cm.state.field(identity).ids.indexOf(id);
    if (index < 0) return;
    const beat = ctx.byId.get(id);
    const line = cm.state.doc.line(index + 1);
    cm.dispatch({ selection: { anchor: line.to }, effects: EditorView.scrollIntoView(line.from, { y: align, yMargin: 48 }) });
    if (takeFocus && (!beat || beat.kind === 'text')) cm.focus();
    focus(id);
  }
  function leave(id: number) {
    const cm = view.current!, ids = cm.state.field(identity).ids;
    const next = id >= 0 && ids.slice(ids.indexOf(id) + 1).find(next => !context.current!.byId.get(next) || context.current!.byId.get(next)!.kind === 'text');
    goTo(typeof next === 'number' ? next : ids.at(-1)!, true, 'nearest');
  }
  async function entered(id: number, content: string) {
    if (!content.startsWith('/')) return;
    const cm = view.current!;
    const slot = cm.state.field(identity).ids[cm.state.doc.lineAt(cm.state.selection.main.head).number - 1];
    const entry: Invitation = { source: id, slot, follow: true };
    setInvitation(entry);
    submitting.current.add(entry);
    const text = content.slice(1).replaceAll('\u2028', '\n');
    const submit = submissionQueue.current.then(async () => {
      await flush();
      await call('prompt', { text, bubble: true, sourceBeatId: entry.source, slot: entry.slot, sourceText: content });
      if (waiting.current === entry) {
        const state = await call('replyState', { source: entry.source });
        if (state) await updateReply(state);
        else if (waiting.current === entry) setInvitation(null);
      }
    });
    submissionQueue.current = submit.catch(e => {
      if (waiting.current === entry) setInvitation(null);
      error(e);
    });
    try { await submissionQueue.current; } finally { submitting.current.delete(entry); }
  }
  function showAnswer(invitation: Invitation) {
    const cm = view.current, ctx = context.current;
    if (!cm || !ctx || !invitation.follow) return;
    const index = ctx.beats.findIndex(b => b.id === invitation.source);
    const answer = ctx.beats[index + 1];
    if (!answer || (answer.kind !== 'browser' && answer.bubble?.role !== 'assistant')) return;
    revealing.current = invitation;
    // A long bubble may initially have only its virtualized height estimate.
    // Reveal it, then correct against the rendered widget after layout settles.
    const reveal = (remaining: number) => requestAnimationFrame(() => {
      if (view.current !== cm || revealing.current !== invitation) return;
      cm.requestMeasure({
        read(view) {
          const state = view.state, ids = state.field(identity).ids;
          if (!invitation.follow || !view.hasFocus || ids[state.doc.lineAt(state.selection.main.head).number - 1] !== invitation.slot) return null;
          const i = ids.indexOf(answer.id);
          if (i < 0) return null;
          const bounds = view.scrollDOM.getBoundingClientRect();
          const rect = view.contentDOM.querySelector(`[data-beat="${answer.id}"]`)?.getBoundingClientRect();
          const block = view.lineBlockAt(state.doc.line(i + 1).from);
          const top = (rect?.top ?? view.documentTop + block.top) - bounds.top;
          const height = rect?.height ?? block.height;
          return top >= 48 && top + height <= bounds.height ? 0 : top - 48;
        },
        write(delta, view) {
          if (revealing.current !== invitation) return;
          if (delta !== null && Math.abs(delta) > 1) view.scrollDOM.scrollTop += delta;
          if (remaining && delta !== null) reveal(remaining - 1);
          else revealing.current = null;
        },
      });
    });
    reveal(3);
  }
  async function updateReply(event: StreamEvent) {
    const entry = waiting.current;
    if (!entry || event.id !== entry.source || entry.delivering || event.phase === 'working') return;
    if (event.phase === 'done' || !openSlot(entry)) {
      showAnswer(entry);
      setInvitation(null);
      return;
    }
    if (event.phase !== 'ready' || !event.chatId) return;
    entry.delivering = true;
    try {
      await flush();
      if (waiting.current === entry && openSlot(entry)) {
        await call('deliver', { chatId: event.chatId, messageIndex: event.messageIndex, after: entry.source, slot: entry.slot });
        if (waiting.current === entry) showAnswer(entry);
      }
    } finally {
      if (waiting.current === entry) setInvitation(null);
    }
  }
  async function recordVisit(url: string): Promise<number> {
    return receive(await window.streamAPI!.openBrowser(url));
  }
  async function openBlock(id: number, fromStream = false) {
    await flush();
    let beat = context.current?.byId.get(id);
    if (!beat) { apply(await call('snapshot')); beat = context.current?.byId.get(id); }
    if (!beat || !['document','browser'].includes(beat.kind)) return;
    let latest = fromStream && beat.kind === 'browser' && beat.url ? await recordVisit(beat.url) : id;
    focus(latest);
    await openFileOrBrowser(beat, () => { leave(latest); }, async url => {
      latest = await recordVisit(url);
      focus(latest);
    });
  }
  async function link(href: string) {
    try {
      const url = new URL(href);
      if (!['http:', 'https:'].includes(url.protocol)) return;
      const beat = /^(?:www\.)?koopuluri\.com$/.test(url.hostname) && /^\/stream\/(\d+)\/?$/.exec(url.pathname);
      await flush();
      if (beat) {
        const found = await call('resolve', { id: Number(beat[1]) });
        if (found.status === 'live') goTo(found.beat.id);
        else setNotice(found.status === 'deleted' ? 'That beat was deleted.' : 'Unknown beat.');
      } else {
        const id = await recordVisit(url.href);
        await openBlock(id);
      }
    } catch (e) { error(e); }
  }
  function onScroll() {
    if (!scrollFrame.current) scrollFrame.current = requestAnimationFrame(measureScroll);
  }
  function measureScroll() {
    scrollFrame.current = 0;
    const cm = view.current; if (!cm) return;
    const scroller = cm.scrollDOM;
    const bounds = scroller.getBoundingClientRect();
    const lastBeat = cm.lineBlockAt(cm.state.doc.length);
    const documentTop = cm.documentTop;
    // Limit native scrolling via the trailing space, not wheel interception.
    // Leave a line of context below the top fade, including the inter-beat gap.
    const contextHeight = 48 + cm.defaultLineHeight * 2;
    const room = Math.max(0, Math.floor(scroller.clientHeight - lastBeat.height - contextHeight));
    const tail = `${room}px`;
    if (cm.dom.style.getPropertyValue('--tail-room') !== tail) cm.dom.style.setProperty('--tail-room', tail);
    const isAway = documentTop + lastBeat.top >= bounds.bottom || documentTop + lastBeat.bottom <= bounds.top;
    if (awayRef.current !== isAway) {
      awayRef.current = isAway;
      setAway(isAway);
    }
  }
  function cancelReturn() {
    cancelAnimationFrame(returnFrame.current);
    returnFrame.current = 0;
  }
  function returnToLatest() {
    const cm = view.current;
    if (!cm) return;
    cancelReturn();
    const scroller = cm.scrollDOM;
    const start = scroller.scrollTop;
    const startTime = performance.now();
    const screens = Math.max(0, scroller.scrollHeight - scroller.clientHeight - start) / scroller.clientHeight;
    const duration = Math.min(1050, 350 + 140 * Math.log1p(screens));
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const step = (now: number) => {
      // CodeMirror refines offscreen beat heights as they enter the viewport.
      const target = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const t = reducedMotion ? 1 : Math.min(1, Math.max(0, (now - startTime) / duration));
      // Peak speed at two thirds of the trip, with zero velocity at both ends.
      const progress = t ** 3 * (4 - 3 * t);
      scroller.scrollTop = start + (target - start) * progress;
      if (t < 1) {
        returnFrame.current = requestAnimationFrame(step);
      } else {
        returnFrame.current = 0;
        const end = cm.state.doc.length;
        cm.dispatch({ selection: { anchor: end }, effects: EditorView.scrollIntoView(end, { y: 'nearest', yMargin: 48 }) });
        cm.focus();
      }
    };
    returnFrame.current = requestAnimationFrame(step);
  }
  async function attach(files?: File[]) {
    try {
      await flush();
      const reply = files ? await window.streamAPI!.importFiles(files) : await window.streamAPI!.pickFiles();
      const ids = await receive(reply);
      if (ids?.length) {
        goTo(view.current!.state.field(identity).ids.at(-1)!, true, 'nearest');
      }
    }
    catch (e) { error(e); }
  }
  useEffect(() => {
    if (initialized.current) return; initialized.current = true;
    let disposed = false, unsubscribe: (() => void)|undefined;
    if (!window.streamAPI) { setNotice('Open stream in the desktop app to use your local files.'); return; }
    void (async () => {
      try {
        const { value } = await window.streamAPI!.call('load'); if (disposed) return;
        const snapshot: Snapshot = value.snapshot;
        base.current = snapshot;
        dispatchRows({ type: 'sync', cards: value.cards ?? [] });
        const ctx: EditorContext = {
          beats: snapshot.beats, byId: new Map(snapshot.beats.map(b => [b.id, b])), initial: { ids: snapshot.beats.map(b => b.id), nextId: snapshot.nextId, retired: snapshot.retired },
          onChange: changed, onSelection: focus, onScroll, entered, leave, link,
          openBlock: id => { void openBlock(id, true).catch(error); },
          open: id => { void window.streamAPI!.openAsset(id).then(message => { if (message) setNotice(message); }); },

        };
        context.current = ctx; view.current = makeEditor(host.current!, ctx); setReady(true);
        requestAnimationFrame(() => goTo(view.current!.state.field(identity).ids.at(-1)!, true, 'start'));
        unsubscribe = window.streamAPI!.onEvent(event => {
          if (event.snapshot) apply(event.snapshot);
          if (event.event === 'open-threads') dispatchRows({ type: 'sync', cards: event.cards ?? [] });
          if (event.event === 'notice') setNotice(event.message || '');
          if (event.event === 'reply-state') void updateReply(event).catch(error);
          if (event.event === 'open-beat' && event.id !== undefined) { goTo(event.id); }
          if (event.event === 'open-block' && event.id !== undefined && waiting.current?.source === event.source && waiting.current?.follow) void openBlock(event.id).catch(error);
          if (event.event === 'return-to-stream') void closeBlock().catch(error);
          if (event.event === 'before-close') void closeBlock().then(flush).then(() => call('focus', { id: null })).then(() => window.streamAPI!.closeReady()).catch(error);
        });
        const saved = sessionStorage.getItem(invitationKey);
        if (saved) {
          const { source, slot } = JSON.parse(saved);
          const entry = { source, slot, follow: false };
          if (openSlot(entry)) {
            setInvitation(entry);
            const status = await call('replyState', { source });
            if (status) await updateReply(status);
            else if (waiting.current === entry) setInvitation(null);
          } else setInvitation(null);
        }
      } catch (e) { error(e); }
    })();
    const beforeUnload = (event: BeforeUnloadEvent) => { if (revisions.current.local !== revisions.current.saved) { event.preventDefault(); void flush().catch(() => {}); } };
    window.addEventListener('beforeunload', beforeUnload); window.addEventListener('resize', onScroll);
    const interrupts = ['wheel', 'pointerdown', 'touchstart', 'keydown'] as const;
    const interrupt = (event: Event) => {
      cancelReturn();
      revealing.current = null;
      const entry = waiting.current;
      if (entry && event.type !== 'keydown') {
        const beat = event.target instanceof Element && event.target.closest<HTMLElement>('[data-beat]')?.dataset.beat;
        entry.follow = event.type !== 'wheel' && beat === String(entry.slot);
      }
    };
    for (const type of interrupts) window.addEventListener(type, interrupt, { capture: true, passive: true });
    return () => {
      cancelReturn();
      for (const type of interrupts) window.removeEventListener(type, interrupt, true);
      disposed = true; cancelAnimationFrame(scrollFrame.current); scrollFrame.current = 0; unsubscribe?.(); view.current?.destroy(); window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('resize', onScroll); initialized.current = false; };
  }, []);

  return <main onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragging(true); } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDropCapture={event => {
      if (!event.dataTransfer.files.length) return;
      event.preventDefault(); event.stopPropagation(); setDragging(false);
      void attach([...event.dataTransfer.files]);
    }}>
    <div className="window-drag" aria-hidden="true" />
    {visibleRows.length > 0 && <nav className="thread-margin" aria-label="Open threads">
      {visibleRows.map(({ card, exit }) => {
        const active = ['running', 'queued'].includes(card.state);
        const state = active ? 'working' : card.unread ? 'unread' : card.state;
        const archive = active ? 'stop and archive' : 'archive';
        return <div className="thread-row" key={card.id} data-state={state} data-exit={exit} inert={!!exit}
          onAnimationEnd={event => {
            if (event.target === event.currentTarget && event.animationName === 'thread-exit') dispatchRows({ type: 'finish', id: card.id });
          }}>
          <button className="thread-title" title={card.title + ' · ' + card.action}
            aria-label={card.title + ', ' + (card.unread ? 'unread result' : card.state.replaceAll('_', ' '))} onClick={() => void selectThread(card)}>
            <MarginLabel title={card.title} />
            {(active || card.unread) && <span className="thread-indicator" aria-hidden="true" />}
          </button>
          <button className="archive-thread" title={archive} aria-label={archive + ' ' + card.title}
            onClick={() => void archiveThread(card)}>
            <span>{archive}</span>
            <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
              {active ? <rect x="4" y="4" width="8" height="8" rx="1" /> : <path d="M2 3h12v3H2z M3.5 6v7h9V6 M6.5 8.5h3" />}
            </svg>
          </button>
        </div>;
      })}
    </nav>}
    <div ref={host} className="editor-host" onClick={event => { const element = (event.target as HTMLElement).closest<HTMLElement>('[data-beat]'); if (element?.dataset.beat) focus(Number(element.dataset.beat)); }} />
    {!ready && <div className="opening">{notice || 'opening your stream…'}</div>}
    {away && <button type="button" className="return-to-latest" aria-label="Return to latest beat" title="Return to latest beat" onClick={returnToLatest}>↓</button>}
    {notice && ready && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
    {dragging && <div className="drop-overlay">drop it into the stream</div>}
  </main>;
}

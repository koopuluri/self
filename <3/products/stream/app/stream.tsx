'use client';
import { useEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { makeEditor, remote, sync, type EditorContext } from '../lib/editor';
import type { Beat, Chat, Reply, Snapshot } from '../lib/types';

type Edit = { id: number; before: string; text: string; startedAt: string };
const date = (value?: string|null) => value ? new Date(value).toLocaleString() : 'not recorded';
export default function Stream() {
  const host = useRef<HTMLDivElement>(null), view = useRef<EditorView|null>(null), context = useRef<EditorContext|null>(null);
  const dirty = useRef(new Map<number, Edit>()), saving = useRef<Promise<void>|null>(null), saveTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const lastTyped = useRef(0), selected = useRef(0), awayRef = useRef(false), initialized = useRef(false);
  const [ready, setReady] = useState(false), [notice, setNotice] = useState(''), [saveState, setSaveState] = useState('saved');
  const [count, setCount] = useState(0), [away, setAway] = useState(false), [tail, setTail] = useState(''), [lookingAt, setLookingAt] = useState(0);
  const [urlInput, setURLInput] = useState(false), [url, setURL] = useState(''), [panel, setPanel] = useState<'model'|'beat'|'threads'|null>(null);
  const [model, setModel] = useState<any>(null), [models, setModels] = useState<any[]>([]), [threads, setThreads] = useState<any[]>([]);
  const [activeBeat, setActiveBeat] = useState<Beat|null>(null), [dragging, setDragging] = useState(false);
  const overlay = useRef(false); overlay.current = !!panel || urlInput;
  const error = (e: unknown) => { setNotice(e instanceof Error ? e.message : String(e)); setSaveState(dirty.current.size ? 'unsaved' : 'saved'); };
  function syncWidgets() { view.current?.dispatch({ effects: sync.of() }); requestAnimationFrame(positionBrowser); }
  function apply(snapshot?: Snapshot) {
    const cm = view.current, ctx = context.current; if (!snapshot || !cm || !ctx) return;
    const changes: { from: number; to?: number; insert: string }[] = [];
    if (snapshot.beats.length < cm.state.doc.lines) {
      if (dirty.current.size) { setNotice('The stream changed outside the app. Your unsaved writing has been retained.'); return; }
      changes.push({ from: 0, to: cm.state.doc.length, insert: snapshot.beats.map(b => b.text).join('\n') });
    } else {
      for (let i = 0; i < cm.state.doc.lines; i++) {
        if (dirty.current.has(i)) continue;
        const line = cm.state.doc.line(i + 1), beat = snapshot.beats[i];
        if (beat && line.text !== beat.text) changes.push({ from: line.from, to: line.to, insert: beat.text });
      }
      if (snapshot.beats.length > cm.state.doc.lines) changes.push({ from: cm.state.doc.length, insert: '\n' + snapshot.beats.slice(cm.state.doc.lines).map(b => b.text).join('\n') });
    }
    ctx.beats = snapshot.beats;
    cm.dispatch({ changes, effects: sync.of(), annotations: remote });
    setCount(snapshot.nextId); setTail(cm.state.doc.line(cm.state.doc.lines).text);
    setActiveBeat(snapshot.beats[selected.current] || null);
    requestAnimationFrame(positionBrowser);
  }
  async function receive(result: Reply|null) { if (result?.snapshot) apply(result.snapshot); return result?.value; }
  async function call(method: string, args: any = {}) { const result = await window.streamAPI!.call(method, args); return receive(result); }
  async function flush() {
    if (saving.current) { await saving.current; if (dirty.current.size) return flush(); return; }
    if (!dirty.current.size) return;
    saving.current = (async () => {
      setSaveState('saving');
      while (dirty.current.size) {
        const edits = [...dirty.current.values()].map(e => ({ ...e }));
        await call('edit', { edits });
        for (const sent of edits) {
          const current = dirty.current.get(sent.id);
          if (current?.text === sent.text) dirty.current.delete(sent.id);
          else if (current) current.before = sent.text;
        }
      }
      setSaveState('saved');
    })();
    try { await saving.current; } catch (e) { error(e); throw e; } finally { saving.current = null; }
  }
  function changed(cm: EditorView, ids: number[]) {
    lastTyped.current = Date.now(); setSaveState('unsaved');
    for (const id of ids) {
      const text = cm.state.doc.line(id + 1).text, existing = dirty.current.get(id), beat = context.current!.beats[id];
      if (!beat || beat.kind !== 'text') continue;
      dirty.current.set(id, { id, before: existing?.before ?? beat.text, text, startedAt: existing?.startedAt ?? new Date().toISOString() });
    }
    setTail(cm.state.doc.line(cm.state.doc.lines).text);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void flush().catch(() => {}); }, 350);
  }
  function focus(id: number) {
    const ctx = context.current; if (!ctx) return;
    const previous = selected.current; selected.current = id; setLookingAt(id); setActiveBeat(ctx.beats[id] || null);
    if (previous !== id && ['chat', 'browser'].includes(ctx.beats[previous]?.kind) && ctx.expanded.delete(previous)) { window.streamAPI?.hideBrowser(); syncWidgets(); }
    void call('focus', { id }).catch(error);
  }
  function goTo(id: number, takeFocus = true) {
    const cm = view.current, ctx = context.current; if (!cm || !ctx) return;
    id = Math.max(0, Math.min(id, cm.state.doc.lines - 1));
    const beat = ctx.beats[id];
    if (beat?.kind !== 'text') {
      ctx.expanded.add(id); syncWidgets();
      if (beat.kind === 'chat') void loadChat(id).then(() => { requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(`section[data-beat="${id}"] textarea`)?.focus()); });
    }
    const line = cm.state.doc.line(id + 1);
    cm.dispatch({ selection: { anchor: line.to }, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) });
    if (takeFocus && beat?.kind === 'text') cm.focus();
    focus(id);
  }
  function leave(id: number) {
    const ctx = context.current; if (!ctx) return;
    if (id >= 0) ctx.expanded.delete(id);
    else for (const opened of ctx.expanded) if (['chat', 'browser'].includes(ctx.beats[opened]?.kind)) ctx.expanded.delete(opened);
    window.streamAPI?.hideBrowser(); syncWidgets();
    goTo(ctx.beats.length - 1);
  }
  async function complete(id: number, fromBubble = false) {
    try {
      await flush();
      const ctx = context.current!, b = ctx.beats[id];
      if (!b) return;
      const content = view.current!.state.doc.line(id + 1).text;
      if (id < ctx.beats.length - 1 && (b.completedAt || b.imported)) { if (!fromBubble) view.current?.contentDOM.blur(); return; }
      const next = await call('complete', { id });
      if (!fromBubble) goTo(next);
      if (/^(?:π\b|π(?=\s|[-—,:])|\/pi\b)/u.test(content.trim())) {
        await call('prompt', { text: content.replace(/^(?:π|\/pi)\s*[-—,:]?\s*/u, ''), sourceBeatId: id, contextBeatId: fromBubble ? selected.current : b.contextBeatId });
      }
    } catch (e) { error(e); }
  }
  async function loadChat(id: number) {
    const ctx = context.current!, b = ctx.beats[id]; if (!b?.chatId) return;
    try {
      const active = document.activeElement as HTMLTextAreaElement;
      const keep = active?.matches('.chat-input') && active.closest('section')?.getAttribute('data-beat') === String(id);
      const cursor = keep ? active.selectionStart : null;
      const chat = await call('chat', { chatId: b.chatId }); ctx.chats.set(b.chatId, chat); syncWidgets();
      if (keep) requestAnimationFrame(() => { const input = document.querySelector<HTMLTextAreaElement>(`section[data-beat="${id}"] textarea`); input?.focus(); if (cursor !== null) input?.setSelectionRange(cursor, cursor); });
    } catch (e) { error(e); }
  }
  async function send(id: number, text: string) {
    try { await flush(); const b = context.current!.beats[id]; await call('prompt', { chatId: b.chatId, text, contextBeatId: selected.current }); await loadChat(id); }
    catch (e) { error(e); throw e; }
  }
  function toggle(id: number) {
    const ctx = context.current!;
    if (ctx.expanded.has(id)) { ctx.expanded.delete(id); if (ctx.beats[id].kind === 'browser') window.streamAPI?.hideBrowser(); }
    else { if (ctx.beats[id].kind === 'browser') for (const other of ctx.expanded) if (ctx.beats[other].kind === 'browser') ctx.expanded.delete(other); ctx.expanded.add(id); }
    syncWidgets();
  }
  function positionBrowser() {
    const surfaces = [...document.querySelectorAll<HTMLDivElement>('.browser-surface')];
    const surface = surfaces.find(node => { const rect = node.getBoundingClientRect(); return rect.top < window.innerHeight - 100 && rect.bottom > 100; });
    if (!surface || overlay.current) { window.streamAPI?.hideBrowser(); return; }
    const rect = surface.getBoundingClientRect(), top = Math.max(rect.top, 56), bottom = Math.min(rect.bottom, window.innerHeight - (awayRef.current ? 155 : 24));
    if (bottom - top < 80) { window.streamAPI?.hideBrowser(); return; }
    window.streamAPI?.browserBounds({ id: Number(surface.dataset.browser), x: rect.left, y: top, width: rect.width, height: bottom - top });
  }
  function onScroll() {
    const cm = view.current; if (!cm) return;
    const scroller = cm.scrollDOM;
    const end = cm.coordsAtPos(cm.state.doc.length), bounds = scroller.getBoundingClientRect();
    const isAway = !end || end.bottom > bounds.bottom - 28 || end.bottom < bounds.top;
    awayRef.current = isAway; setAway(isAway);
    const selectedLine = cm.state.doc.line(Math.min(selected.current + 1, cm.state.doc.lines));
    const selectedRect = cm.coordsAtPos(selectedLine.from);
    if (isAway && !document.activeElement?.matches('.floating-input') && (!selectedRect || selectedRect.bottom < bounds.top || selectedRect.top > bounds.bottom)) {
      const block = cm.lineBlockAtHeight(Math.max(0, scroller.scrollTop - cm.documentPadding.top));
      const id = cm.state.doc.lineAt(block.from).number - 1; selected.current = id; setLookingAt(id); setActiveBeat(context.current!.beats[id]);
    }
    positionBrowser();
  }
  function floatingChange(text: string) {
    const cm = view.current; if (!cm) return;
    const line = cm.state.doc.line(cm.state.doc.lines);
    cm.dispatch({ changes: { from: line.from, to: line.to, insert: text.replace(/\r?\n/g, ' ') } });
  }
  async function attach(files?: File[]) {
    try { await flush(); const reply = files ? await window.streamAPI!.importFiles(files) : await window.streamAPI!.pickFiles(); const ids = await receive(reply); if (ids?.length) { ids.forEach((id: number) => context.current!.expanded.add(id)); syncWidgets(); goTo(ids[0], false); } }
    catch (e) { error(e); }
  }
  async function openURL() {
    try { await flush(); const value = /^https?:\/\//i.test(url) ? url : `https://${url}`; const id = await receive(await window.streamAPI!.openBrowser(value)); setURLInput(false); setURL(''); context.current!.expanded.add(id); syncWidgets(); goTo(id, false); }
    catch (e) { error(e); }
  }
  async function showPanel(next: 'model'|'beat'|'threads') {
    window.streamAPI?.hideBrowser(); setPanel(next);
    try { if (next === 'model') setModels(await call('models')); if (next === 'threads') setThreads(await call('threads')); } catch (e) { error(e); }
  }
  useEffect(() => {
    if (initialized.current) return; initialized.current = true;
    let disposed = false, unsubscribe: (() => void)|undefined, idle: ReturnType<typeof setInterval>;
    if (!window.streamAPI) { setNotice('Open stream in the desktop app to use your local files.'); return; }
    void (async () => {
      try {
        const { value } = await window.streamAPI!.call('load'); if (disposed) return;
        const snapshot: Snapshot = value.snapshot;
        const ctx: EditorContext = {
          beats: snapshot.beats, expanded: new Set(), chats: new Map(), drafts: new Map(Object.entries(value.ui.chatDrafts || {})),
          onChange: changed, onSelection: focus, onScroll, complete, toggle, leave, send, loadChat,
          open: id => { void window.streamAPI!.openAsset(id).then(message => { if (message) setNotice(message); }); },
          draft: (id, text) => { ctx.drafts.set(id, text); lastTyped.current = Date.now(); void call('ui', { chatDrafts: Object.fromEntries(ctx.drafts) }).catch(error); },
        };
        context.current = ctx; view.current = makeEditor(host.current!, ctx); setCount(snapshot.nextId); setModel(value.model); setReady(true);
        setTail(snapshot.beats.at(-1)?.text || '');
        requestAnimationFrame(() => goTo(ctx.beats.length - 1));
        unsubscribe = window.streamAPI!.onEvent(event => {
          if (event.snapshot) apply(event.snapshot);
          if (event.event === 'notice') setNotice(event.message || '');
          if (event.event === 'chat-changed') { const beat = ctx.beats.find(b => b.chatId === event.chatId); if (beat) void loadChat(beat.id); }
          if (event.event === 'open-browser' && event.id !== undefined) { ctx.expanded.add(event.id); syncWidgets(); goTo(event.id, false); }
          if (event.event === 'return-to-stream') leave(-1);
          if (event.event === 'before-close') void flush().then(() => call('focus', { id: null })).then(() => window.streamAPI!.closeReady()).catch(error);
        });
        let revealing = false;
        idle = setInterval(async () => {
          if (revealing || Date.now() - lastTyped.current < 2000 || document.activeElement?.matches('.chat-input, .floating-input') || [...ctx.expanded].some(id => ctx.beats[id]?.kind === 'browser')) return;
          revealing = true;
          try {
            const result = await call('reveal');
            if (result !== null && result !== undefined) { ctx.expanded.add(result); syncWidgets(); void loadChat(result); }
          } catch (e) { error(e); } finally { revealing = false; }
        }, 700);
      } catch (e) { error(e); }
    })();
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.current.size) { event.preventDefault(); void flush().catch(() => {}); } };
    window.addEventListener('beforeunload', beforeUnload); window.addEventListener('resize', positionBrowser);
    return () => { disposed = true; clearInterval(idle); unsubscribe?.(); view.current?.destroy(); window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('resize', positionBrowser); initialized.current = false; };
  }, []);
  useEffect(() => { if (panel) window.streamAPI?.hideBrowser(); else requestAnimationFrame(positionBrowser); }, [panel]);

  return <main onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragging(true); } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); if (event.dataTransfer.files.length) void attach([...event.dataTransfer.files]); }}>
    <header className="titlebar"><span className="app-name">stream</span><span className="status" aria-live="polite">{ready ? `${count} beats · ${saveState}` : 'opening…'}</span><nav><button onClick={() => void attach()} aria-label="Add files" title="add files">＋</button><button onClick={() => { window.streamAPI?.hideBrowser(); setURLInput(!urlInput); }} title="open a page" aria-label="Open a page">↗</button><button onClick={() => void showPanel('threads')} title="ongoing work" aria-label="Threads">◌</button><button onClick={() => void showPanel('model')} title="π and models" aria-label="Model settings">π</button></nav></header>
    <div ref={host} className="editor-host" onClick={event => { const element = (event.target as HTMLElement).closest<HTMLElement>('[data-beat]'); if (element?.dataset.beat) focus(Number(element.dataset.beat)); }} />
    {!ready && <div className="opening">{notice || 'opening your stream…'}</div>}
    {ready && count === 1 && !tail && <div className="welcome"><p>a place to think, browse, and work with π.</p><button className="quiet" onClick={async () => { try { await receive(await window.streamAPI!.importNotes()); goTo(context.current!.beats.length - 1); } catch (e) { error(e); } }}>bring in the Nov 12–19 notes ↗</button></div>}
    {ready && <button className="beat-inspector" onClick={() => void showPanel('beat')} title="beat details">#{lookingAt}</button>}
    {away && ready && <div className="floating-composer"><div className="composer-heading"><span>looking at <button onClick={() => void showPanel('beat')}>#{lookingAt}</button></span><button onClick={() => goTo(context.current!.beats.length - 1)}>back to now ↓</button></div><textarea className="floating-input" aria-label="Next beat while reading" placeholder="your next thought, from here…" rows={2} value={tail} onChange={event => floatingChange(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void complete(context.current!.beats.length - 1, true); } }} /><div className="composer-foot">enter to continue · π, redact this</div></div>}
    {!away && ready && <div className="writing-hint">enter for the next beat · write π to start a conversation</div>}
    {urlInput && <form className="url-form" onSubmit={event => { event.preventDefault(); void openURL(); }}><input autoFocus aria-label="Page address" placeholder="a page to wander into…" value={url} onChange={event => setURL(event.target.value)} /><button type="submit">open ↗</button><button type="button" onClick={() => setURLInput(false)}>×</button></form>}
    {notice && ready && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
    {dragging && <div className="drop-overlay">drop it into the stream</div>}
    {panel && <div className="panel-scrim" onClick={() => setPanel(null)}><aside className="panel" onClick={event => event.stopPropagation()}><button className="panel-close" onClick={() => setPanel(null)} aria-label="Close panel">×</button>
      {panel === 'beat' && activeBeat && <><h2>beat {activeBeat.id}</h2><dl><dt>started</dt><dd>{date(activeBeat.createdAt)}</dd><dt>completed</dt><dd>{date(activeBeat.completedAt)}</dd><dt>last edited</dt><dd>{date(activeBeat.updatedAt)}</dd><dt>visibility</dt><dd>{activeBeat.redacted ? 'redacted' : 'local'}</dd>{activeBeat.source && <><dt>source</dt><dd>{activeBeat.source.path.split('/').at(-1)} · line {activeBeat.source.line}</dd></>}<dt>focus visits</dt><dd>{activeBeat.visits?.length || 0}</dd></dl><button className="quiet danger" onClick={async () => { try { await flush(); await call('remove', { id: activeBeat.id }); setPanel(null); } catch (e) { error(e); } }}>clear this beat</button><p className="muted">The slot and ID stay. Its text is removed.</p></>}
      {panel === 'model' && <><h2>π</h2><p className="muted">{model?.ready ? 'An API key is available locally.' : 'Add a provider API key to enable model conversations.'}</p><label>model<select value={model ? `${model.provider}/${model.model}` : ''} onChange={async event => { const [provider, ...rest] = event.target.value.split('/'); try { setModel(await call('configure', { provider, model: rest.join('/') })); } catch (e) { error(e); } }}>{models.map(m => <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>{m.provider} · {m.name || m.id}{m.available ? '' : ' · key needed'}</option>)}</select></label><p className="muted">Calls use your selected provider. Token usage and cost estimates are recorded under π/logs. Subscription sign-in can be connected separately.</p></>}
      {panel === 'threads' && <><h2>ongoing work</h2>{threads.length ? threads.map(thread => <div className="thread-row" key={thread.id}><strong>{thread.title}</strong><span className="muted">{thread.status}</span><button className="quiet" onClick={async () => { try { await call('continueThread', { threadId: thread.id }); setPanel(null); } catch (e) { error(e); } }}>continue in the stream ↗</button></div>) : <p className="muted">Threads begin when you ask π to work on something.</p>}</>}
    </aside></div>}
  </main>;
}

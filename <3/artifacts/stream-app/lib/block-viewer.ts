import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import type { Beat } from './types';

function button(label: string, text: string, action: () => void) {
  const node = document.createElement('button');
  node.type = 'button'; node.textContent = text; node.setAttribute('aria-label', label);
  node.onclick = action;
  return node;
}

let active: { close(): Promise<void> } | undefined;
export async function closeBlock() { await active?.close(); }

export function blockViewer(label: string, restore: () => void) {
  const dialog = document.createElement('dialog');
  dialog.className = 'block-viewer';
  dialog.setAttribute('aria-label', label);
  const bar = document.createElement('header');
  const title = document.createElement('span');
  title.className = 'block-title'; title.textContent = label;
  const body = document.createElement('div'); body.className = 'block-body';
  const status = document.createElement('div'); status.className = 'block-status'; status.setAttribute('role', 'alert');
  function error(e: unknown) { status.textContent = e instanceof Error ? e.message : String(e); }
  const viewer = {
    dialog, bar, title, body, error, flush: async () => {}, dispose: () => {},
    async close() {
      if (!dialog.open) return;
      try { await viewer.flush(); } catch (e) { error(e); throw e; }
      if (dialog.open) dialog.close();
    },
  };
  const close = button('Close block', 'close', () => { void viewer.close().catch(() => {}); });
  close.className = 'viewer-close';
  bar.append(close, title);
  dialog.append(bar, body, status);
  dialog.oncancel = event => { event.preventDefault(); close.click(); };
  dialog.onclose = () => {
    viewer.dispose(); dialog.remove();
    if (active === viewer) { active = undefined; restore(); }
  };
  document.body.append(dialog); dialog.showModal(); active = viewer; close.focus();
  return viewer;
}

type Guest = HTMLElement & {
  canGoBack(): boolean; canGoForward(): boolean; goBack(): void; goForward(): void;
};

export async function openFileOrBrowser(beat: Beat, restore: () => void,
  navigate: (url: string) => Promise<void>) {
  await closeBlock();
  const viewer = blockViewer(beat.filepath || beat.url || '', restore);
  if (beat.kind === 'browser' && beat.url) {
    const guest = document.createElement('webview') as Guest;
    guest.setAttribute('partition', 'persist:stream-browser'); guest.setAttribute('allowpopups', '');
    const back = button('Back', '‹', () => guest.goBack());
    const forward = button('Forward', '›', () => guest.goForward());
    back.disabled = forward.disabled = true;
    viewer.bar.insertBefore(back, viewer.title); viewer.bar.insertBefore(forward, viewer.title);
    let first = true, trail = Promise.resolve();
    function navigated(event: Event) {
      const { url, isMainFrame } = event as Event & { url: string; isMainFrame?: boolean };
      if (isMainFrame === false || !/^https?:\/\//i.test(url)) return;
      viewer.title.textContent = url;
      back.disabled = !guest.canGoBack(); forward.disabled = !guest.canGoForward();
      const initial = first && new URL(beat.url!).href === url;
      first = false;
      if (!initial) trail = trail.then(() => navigate(url)).catch(viewer.error);
    }
    for (const type of ['did-navigate','did-navigate-in-page']) guest.addEventListener(type, navigated);
    viewer.flush = () => trail;
    guest.className = 'browser-surface'; guest.setAttribute('src', beat.url); viewer.body.append(guest);
    return;
  }
  try {
    const api = window.streamAPI!;
    const { value: record } = await api.call('readBlockDocument', { id: beat.id });
    if (!viewer.dialog.open) return;
    let hash = record.hash, saved = record.text as string;
    const newline = saved.includes('\r\n') ? '\r\n' : '\n';
    let queue = Promise.resolve(), timer: ReturnType<typeof setTimeout>;
    function save() {
      clearTimeout(timer);
      const run = queue.catch(() => {}).then(async () => {
        const text = editor.state.sliceDoc();
        if (text === saved) return;
        hash = (await api.call('saveBlockDocument', { id: beat.id, text, hash })).value;
        saved = text; viewer.error('');
      });
      queue = run; return run;
    }
    const editor: EditorView = new EditorView({ parent: viewer.body, state: EditorState.create({
      doc: saved, extensions: [EditorState.lineSeparator.of(newline), EditorView.lineWrapping, history(), keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorState.readOnly.of(record.readOnly), EditorView.editable.of(!record.readOnly),
        EditorView.updateListener.of(update => {
          if (!update.docChanged) return;
          clearTimeout(timer); timer = setTimeout(() => void save().catch(viewer.error), 300);
        })],
    }) });
    viewer.flush = async () => { do { await save(); } while (editor.state.sliceDoc() !== saved); };
    viewer.dispose = () => { clearTimeout(timer); editor.destroy(); };
    editor.focus();
  } catch (error) { viewer.error(error); }
}

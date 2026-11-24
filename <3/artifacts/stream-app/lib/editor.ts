import { Compartment, EditorState, StateEffect, StateField, Transaction } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, WidgetType, ViewPlugin, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { search, searchKeymap } from '@codemirror/search';
import { deletePassages, identity, movePassage, setIdentity, trackIdentity, undoIdentity, type Identity } from './identity';
import { openImage } from './media-viewer';
import { linkSpans, messageBody } from './chat-format';
import type { Beat } from './types';

export const editorHistory = new Compartment();
export const sync = StateEffect.define<void>();
export const remote = [Transaction.userEvent.of('stream.remote'), Transaction.addToHistory.of(false)];
export type EditorContext = {
  beats: Beat[]; byId: Map<number, Beat>; initial: Identity;
  onChange(view: EditorView): void; onSelection(id: number): void; onScroll(): void;
  entered(id: number, text: string): void; leave(id: number): void;
  openBlock(id: number): void; open(id: number): void; link(href: string): void;
};
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
}
class Block extends WidgetType {
  constructor(readonly beat: Beat, readonly version: string, readonly ctx: EditorContext) { super(); }
  eq(other: Block) { return this.beat.id === other.beat.id && this.version === other.version; }
  get estimatedHeight() { return ['browser','document'].includes(this.beat.kind) ? 48 : this.beat.kind === 'bubble' ? 60 : 240; }
  toDOM(view: EditorView) {
    const b = this.beat, outer = el('section', `beat-block ${b.kind}-block${b.redacted ? ' redacted' : ''}`);
    outer.dataset.beat = String(b.id);
    const box = el('div', 'block-frame'); outer.append(box);
    if (b.kind === 'asset' && b.asset) {
      const file = b.asset.preview || b.asset.path;
      const src = `stream://asset/${b.id}?v=${encodeURIComponent(b.asset.preview || 'original')}`;
      if (/\.(png|jpe?g|gif|webp|heic|heif)$/i.test(file)) {
        if (/\.(heic|heif)$/i.test(file)) {
          box.append(el('p', 'muted', 'preparing preview…')); void window.streamAPI?.call('preview', { id: b.id });
        } else { const image = el('img'); image.src = src; image.alt = b.asset.name; image.onload = () => view.requestMeasure(); image.onerror = () => { image.alt = `Preview unavailable · ${b.asset?.name}`; }; const expand = el('button', 'expand-image'); expand.type = 'button'; expand.setAttribute('aria-label', 'Expand ' + b.asset.name);
          expand.onclick = () => openImage(image, expand); expand.append(image); box.append(expand); }
      } else if (/\.(mov|mp4|webm|m4v)$/i.test(file)) { const video = el('video'); video.src = src; video.controls = true; video.preload = 'metadata'; video.onloadedmetadata = () => view.requestMeasure(); box.append(video); }
      else if (/\.(mp3|m4a|wav|ogg)$/i.test(file)) { const audio = el('audio'); audio.src = src; audio.controls = true; box.append(audio); }
      else box.append(el('p', 'asset-name', b.asset.name));
      const open = el('button', 'quiet', 'open original ↗'); open.onclick = () => this.ctx.open(b.id); if (!box.querySelector('img,video')) box.append(open);
    } else if (b.kind === 'browser' || b.kind === 'document') {
      const preview = el('button', 'block-preview');
      const icon = el('span', 'block-icon', b.kind === 'browser' ? '🌐︎' : '▤');
      icon.setAttribute('aria-hidden', 'true');
      preview.append(icon, el('span', 'block-path', b.filepath || b.url));
      preview.onclick = () => this.ctx.openBlock(b.id);
      box.append(preview);
    } else if (b.kind === 'bubble' && b.bubble) {
      const message = b.bubble;
      const user = message.role === 'user';
      outer.classList.add(user ? 'user' : 'assistant');
      outer.setAttribute('aria-label', user ? 'Your message' : 'π’s reply');
      const body = el('div', 'message-text');
      body.append(messageBody(message.text, !user && message.source !== 'system-status'));
      box.append(body);
      if (message.reaction) {
        const reaction = el('span', 'reaction');
        reaction.setAttribute('role', 'img');
        reaction.append(el('span', 'emoji', message.reaction));
        reaction.setAttribute('aria-label', 'π reacted ' + message.reaction); outer.append(reaction);
      }
    } else if (b.kind === 'chat') {
      box.append(el('span', 'muted', 'Conversation unavailable in this workspace.'));
    }
    outer.addEventListener('click', event => {
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
      if (link) { event.preventDefault(); this.ctx.link(link.href); }
    });
    queueMicrotask(() => view.requestMeasure()); return outer;
  }
  ignoreEvent() { return true; }
}
function normalizePastedText(text: string) {
  return text.replace(/\r\n?|[\u2028\u2029]/g, '\n').replace(/\n(?:[^\S\n]*\n)+/g, '\n');
}

function pasteLines(view: EditorView, text: string, from: number, to: number) {
  const insert = normalizePastedText(text);
  if (!insert.includes('\n')) return false;
  const cursor = from + insert.length;
  view.dispatch({
    changes: { from, to, insert }, selection: { anchor: cursor },
    scrollIntoView: true, userEvent: 'input.paste.beats',
  });
  return true;
}
export function makeEditor(parent: HTMLElement, ctx: EditorContext) {
  function blocks(state: EditorState): DecorationSet {
    const ranges = [];
    const ids = state.field(identity).ids;
    for (let i = 0; i < ids.length; i++) {
      const beat = ctx.byId.get(ids[i]);
      if (!beat || beat.kind === 'text') continue;
      const line = state.doc.line(i + 1);
      if (!line.length) continue;
      const version = JSON.stringify([beat.kind, beat.bubble, beat.chatId, beat.asset, beat.url, beat.filepath, beat.redacted]);
      ranges.push(Decoration.replace({ widget: new Block(beat, version, ctx), block: true, inclusive: true }).range(line.from, line.to));
    }
    return Decoration.set(ranges, true);
  }
  const widgets = StateField.define<DecorationSet>({
    create: blocks,
    update(value, tr) { if (tr.effects.some(e => e.is(sync) || e.is(setIdentity))) return blocks(tr.state); return value.map(tr.changes); },
    provide: field => [EditorView.decorations.from(field), EditorView.atomicRanges.of(view => view.state.field(field))],
  });
  const lines = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = this.build(view); }
    update(update: any) { if (update.docChanged || update.viewportChanged || update.transactions.some((tr: Transaction) => tr.effects.some(e => e.is(sync)))) this.decorations = this.build(update.view); }
    build(view: EditorView) {
      const result = [];
      for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to;) {
          const line = view.state.doc.lineAt(pos), id = view.state.field(identity).ids[line.number - 1], beat = ctx.byId.get(id);
          const composing = (!beat || beat.kind === 'text') && line.text.startsWith('/');
          if (composing) result.push(Decoration.replace({}).range(line.from, line.from + 1));
          result.push(Decoration.line({ attributes: { 'data-beat': String(id), class: `${composing ? 'bubble-draft' : ''} ${beat?.redacted ? 'is-redacted' : ''} ${!line.text ? 'empty-beat' : ''}`, 'data-empty': beat?.deletedAt ? 'cleared' : '' } }).range(line.from));
          if (!beat || beat.kind === 'text') {
            for (const span of linkSpans(line.text)) result.push(Decoration.mark({
              tagName: 'a', attributes: { href: span.href, class: 'beat-link' },
            }).range(line.from + span.start, line.from + span.end));
          }
          pos = line.to + 1;
        }
      }
      return Decoration.set(result, true);
    }
  }, { decorations: value => value.decorations });
  const protectBlocks = EditorState.transactionFilter.of(tr => {
    if (!tr.docChanged || tr.isUserEvent('stream.remote') || tr.effects.some(e => e.is(setIdentity))) return tr;
    const ids = tr.startState.field(identity).ids;
    let allowed = true;
    tr.changes.iterChangedRanges((from, to) => {
      for (let i = tr.startState.doc.lineAt(from).number - 1; i < tr.startState.doc.lineAt(to).number; i++) {
        const beat = ctx.byId.get(ids[i]);
        if (beat && beat.kind !== 'text') allowed = false;
      }
    });
    return allowed ? tr : [];
  });
  const view = new EditorView({ parent, state: EditorState.create({
    doc: ctx.beats.map(b => b.text).join('\n'),
    extensions: [identity.init(() => ctx.initial), trackIdentity, undoIdentity, widgets, lines, protectBlocks, EditorView.lineWrapping, editorHistory.of(history()), search({ top: true }),
      EditorView.clipboardOutputFilter.of(normalizePastedText),
      EditorView.domEventHandlers({ click(event) {
        const link = (event.target as Element).closest<HTMLAnchorElement>('a.beat-link');
        if (!link || !window.getSelection()?.isCollapsed) return false;
        event.preventDefault(); ctx.link(link.href); return true;
      }, paste(event, view) {
        const text = event.clipboardData?.getData('text/plain');
        if (!text) return false;
        const { from, to } = view.state.selection.main;
        if (view.state.doc.lineAt(from).text.startsWith('/') && /[\r\n]/.test(text)) {
          view.dispatch(view.state.replaceSelection(text.replace(/\r\n?|\n/g, '\u2028'))); return true;
        }
        return pasteLines(view, text, from, to);
      } }),
      keymap.of([
        { key: 'Shift-Enter', run(view) {
          if (!view.state.doc.lineAt(view.state.selection.main.head).text.startsWith('/')) return false;
          view.dispatch(view.state.replaceSelection('\u2028')); return true;
        } },
        { key: 'Enter', run(view) {
          const state = view.state, sel = state.selection.main, line = state.doc.lineAt(sel.from);
          const id = state.field(identity).ids[line.number - 1];
          if (view.composing) return false;
          const prompt = line.text.startsWith('/');
          if (prompt) view.dispatch({ changes: { from: line.to, insert: '\n' }, selection: { anchor: line.to + 1 }, scrollIntoView: true, userEvent: 'input.enter' });
          else view.dispatch({ ...state.replaceSelection('\n'), scrollIntoView: true, userEvent: 'input.enter' });
          if (prompt || (sel.empty && sel.from === line.to)) ctx.entered(id, line.text);
          return true;
        } },
        { key: 'Backspace', run: deletePassages }, { key: 'Delete', run: deletePassages },
        { key: 'Mod-Shift-c', run(view) {
          const state = view.state, id = state.field(identity).ids[state.doc.lineAt(state.selection.main.head).number - 1];
          void window.streamAPI?.copyBeatLink(id);
          return true;
        } },
        { key: 'Alt-ArrowUp', run: view => movePassage(view, -1) },
        { key: 'Alt-ArrowDown', run: view => movePassage(view, 1) },
        { key: 'Mod-Enter', run() { ctx.leave(-1); return true; } },
        ...defaultKeymap, ...historyKeymap, ...searchKeymap,
      ]),
      EditorView.updateListener.of(update => {
        if (update.geometryChanged || update.viewportChanged || update.docChanged) ctx.onScroll();
        if (update.docChanged && !update.transactions.every(tr => tr.isUserEvent('stream.remote'))) ctx.onChange(update.view);
        if (update.selectionSet) ctx.onSelection(update.state.field(identity).ids[update.state.doc.lineAt(update.state.selection.main.head).number - 1]);
      }),
      EditorView.domEventHandlers({ scroll: () => ctx.onScroll(), focus: () => { ctx.onSelection(view.state.field(identity).ids[view.state.doc.lineAt(view.state.selection.main.head).number - 1]); }, blur: () => { void window.streamAPI?.call('focus', { id: null }); } }),
      EditorView.contentAttributes.of({ 'aria-label': 'stream', spellcheck: 'true', autocapitalize: 'sentences' }),
    ],
  }) });
  return view;
}

import { EditorState, StateEffect, StateField, Transaction } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, WidgetType, ViewPlugin, keymap, lineNumbers, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { search, searchKeymap } from '@codemirror/search';
import type { Beat, Chat } from './types';

export const sync = StateEffect.define<void>();
export const remote = [Transaction.userEvent.of('stream.remote'), Transaction.addToHistory.of(false)];
export type EditorContext = {
  beats: Beat[]; expanded: Set<number>; chats: Map<string, Chat>; drafts: Map<string, string>;
  onChange(view: EditorView, ids: number[]): void; onSelection(id: number): void; onScroll(): void;
  complete(id: number): void; toggle(id: number): void; leave(id: number): void;
  send(id: number, text: string): Promise<void>; open(id: number): void; loadChat(id: number): void;
  draft(chatId: string, text: string): void;
};
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
}
class Block extends WidgetType {
  constructor(readonly beat: Beat, readonly expanded: boolean, readonly version: string, readonly ctx: EditorContext) { super(); }
  eq(other: Block) { return this.beat.id === other.beat.id && this.beat.text === other.beat.text && this.expanded === other.expanded && this.version === other.version; }
  get estimatedHeight() { return !this.expanded ? 34 : this.beat.kind === 'browser' ? 500 : this.beat.kind === 'chat' ? 280 : 360; }
  toDOM(view: EditorView) {
    const b = this.beat, box = el('section', `beat-block ${b.kind}-block${this.expanded ? ' expanded' : ''}${b.redacted ? ' redacted' : ''}`);
    box.dataset.beat = String(b.id);
    const header = el('button', 'block-heading'); header.type = 'button';
    const title = b.kind === 'chat' ? 'chat' : b.kind === 'browser' ? new URL(b.url || 'https://example.com').hostname : b.asset?.name || 'asset';
    header.append(el('span', 'block-rule'), el('span', 'block-label', title), el('span', 'block-rule'));
    header.setAttribute('aria-label', `${this.expanded ? 'Collapse' : 'Expand'} ${title}, beat ${b.id}`);
    header.onclick = () => this.ctx.toggle(b.id); box.append(header);
    if (!this.expanded) return box;
    if (b.kind === 'asset' && b.asset) {
      const file = b.asset.preview || b.asset.path;
      const src = `stream://asset/${b.id}?v=${encodeURIComponent(b.asset.preview || 'original')}`;
      if (/\.(png|jpe?g|gif|webp|heic|heif)$/i.test(file)) {
        if (/\.(heic|heif)$/i.test(file)) {
          box.append(el('p', 'muted', 'preparing preview…')); void window.streamAPI?.call('preview', { id: b.id });
        } else { const image = el('img'); image.src = src; image.alt = b.asset.name; image.onload = () => view.requestMeasure(); image.onerror = () => { image.alt = `Preview unavailable · ${b.asset?.name}`; }; box.append(image); }
      } else if (/\.(mov|mp4|webm|m4v)$/i.test(file)) { const video = el('video'); video.src = src; video.controls = true; video.preload = 'metadata'; video.onloadedmetadata = () => view.requestMeasure(); box.append(video); }
      else if (/\.(mp3|m4a|wav|ogg)$/i.test(file)) { const audio = el('audio'); audio.src = src; audio.controls = true; box.append(audio); }
      else box.append(el('p', 'asset-name', b.asset.name));
      const open = el('button', 'quiet', 'open original ↗'); open.onclick = () => this.ctx.open(b.id); box.append(open);
    } else if (b.kind === 'browser') {
      const address = el('div', 'browser-address', b.url); box.append(address);
      const surface = el('div', 'browser-surface'); surface.dataset.browser = String(b.id); surface.append(el('span', 'muted', 'loading page…')); box.append(surface);
      box.append(el('div', 'block-hint', '⌘ enter to return to writing'));
    } else if (b.kind === 'chat' && b.chatId) {
      const chat = this.ctx.chats.get(b.chatId);
      if (!chat) { box.append(el('p', 'muted', 'opening conversation…')); queueMicrotask(() => this.ctx.loadChat(b.id)); }
      else {
        const messages = el('div', 'chat-messages');
        for (const message of chat.messages) {
          const row = el('div', `chat-message ${message.role}`);
          row.append(el('span', 'speaker', message.role === 'assistant' ? 'π' : 'you'), el('div', 'message-text', message.text)); messages.append(row);
        }
        if (['running','queued'].includes(chat.status)) messages.append(el('div', 'thinking', 'π is thinking…'));
        box.append(messages);
      }
      const input = el('textarea', 'chat-input'); input.rows = 1; input.placeholder = 'reply to π…'; input.setAttribute('aria-label', `Reply in chat ${b.id}`);
      input.value = this.ctx.drafts.get(b.chatId) || '';
      input.oninput = () => { this.ctx.draft(b.chatId!, input.value); input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 180)}px`; view.requestMeasure(); };
      input.onfocus = () => this.ctx.onSelection(b.id);
      input.onkeydown = event => {
        if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
        event.preventDefault(); event.stopPropagation();
        if (!input.value.trim()) this.ctx.leave(b.id);
        else {
          const text = input.value; input.disabled = true;
          void this.ctx.send(b.id, text).then(() => {
            this.ctx.draft(b.chatId!, '');
            const current = view.dom.querySelector<HTMLTextAreaElement>(`section[data-beat="${b.id}"] textarea`);
            if (current) { current.value = ''; current.disabled = false; current.focus(); }
          }).catch(() => { input.disabled = false; });
        }
      };
      box.append(input, el('div', 'block-hint', 'enter to send · shift enter for a new line · empty enter to continue'));
    }
    queueMicrotask(() => view.requestMeasure()); return box;
  }
  ignoreEvent() { return true; }
}
export function makeEditor(parent: HTMLElement, ctx: EditorContext) {
  function blocks(state: EditorState): DecorationSet {
    const ranges = [];
    for (const beat of ctx.beats) {
      if (beat.kind === 'text' || beat.id >= state.doc.lines) continue;
      const line = state.doc.line(beat.id + 1); if (!line.length) continue;
      const chat = beat.chatId && ctx.chats.get(beat.chatId);
      const version = JSON.stringify([beat.asset?.preview, beat.redacted, chat && [chat.status, chat.messages.length, chat.messages.at(-1)?.text]]);
      ranges.push(Decoration.replace({ widget: new Block(beat, ctx.expanded.has(beat.id), version, ctx), block: true, inclusive: false }).range(line.from, line.to));
    }
    return Decoration.set(ranges, true);
  }
  const widgets = StateField.define<DecorationSet>({
    create: blocks,
    update(value, tr) { if (tr.effects.some(e => e.is(sync))) return blocks(tr.state); return value.map(tr.changes); },
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
          const line = view.state.doc.lineAt(pos), id = line.number - 1, beat = ctx.beats[id];
          result.push(Decoration.line({ attributes: { 'data-beat': String(id), class: `${beat?.redacted ? 'is-redacted' : ''} ${!line.text ? 'empty-beat' : ''}`, 'data-empty': beat?.deletedAt ? 'cleared' : '' } }).range(line.from));
          pos = line.to + 1;
        }
      }
      return Decoration.set(result, true);
    }
  }, { decorations: value => value.decorations });
  const preserveSlots = EditorState.transactionFilter.of(tr => {
    if (!tr.docChanged || tr.isUserEvent('stream.remote')) return tr;
    const changes: { from: number; to: number; insert: string }[] = []; let rewritten = false;
    tr.changes.iterChanges((from, to, _a, _b, inserted) => {
      const first = tr.startState.doc.lineAt(from), last = tr.startState.doc.lineAt(to);
      for (let n = first.number; n <= last.number; n++) if (ctx.beats[n - 1]?.kind !== 'text') return;
      const breaks = last.number - first.number;
      const incoming = inserted.toString();
      const text = incoming.replace(/\r?\n/g, ' ') + '\n'.repeat(breaks);
      if (text !== incoming) rewritten = true;
      changes.push({ from, to, insert: text });
    });
    if (!changes.length) return [];
    if (!rewritten && changes.length === (() => { let n = 0; tr.changes.iterChanges(() => n++); return n; })()) return tr;
    return { changes, annotations: tr.annotation(Transaction.userEvent) ? Transaction.userEvent.of(tr.annotation(Transaction.userEvent)!) : undefined };
  });
  const view = new EditorView({ parent, state: EditorState.create({
    doc: ctx.beats.map(b => b.text).join('\n'),
    extensions: [widgets, lines, preserveSlots, EditorView.lineWrapping, history(), search({ top: true }),
      lineNumbers({ formatNumber: n => String(n - 1) }),
      placeholder('begin anywhere…'),
      keymap.of([{ key: 'Enter', run(view) { const id = view.state.doc.lineAt(view.state.selection.main.head).number - 1; ctx.complete(id); return true; } }, { key: 'Mod-Enter', run() { ctx.leave(-1); return true; } }, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      EditorView.updateListener.of(update => {
        if (update.docChanged && !update.transactions.every(tr => tr.isUserEvent('stream.remote'))) {
          const ids = new Set<number>();
          update.changes.iterChangedRanges((_a, _b, from, to) => { for (let n = update.state.doc.lineAt(from).number; n <= update.state.doc.lineAt(to).number; n++) ids.add(n - 1); });
          ctx.onChange(update.view, [...ids]);
        }
        if (update.selectionSet) ctx.onSelection(update.state.doc.lineAt(update.state.selection.main.head).number - 1);
      }),
      EditorView.domEventHandlers({ scroll: () => ctx.onScroll(), focus: () => { const id = view.state.doc.lineAt(view.state.selection.main.head).number - 1; ctx.onSelection(id); }, blur: () => { void window.streamAPI?.call('focus', { id: null }); } }),
      EditorView.contentAttributes.of({ 'aria-label': 'stream', spellcheck: 'true', autocapitalize: 'sentences' }),
    ],
  }) });
  return view;
}

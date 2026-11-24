import { EditorState, Transaction } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, insertNewline } from '@codemirror/commands';

export function composer(parent: HTMLElement, options: {
  label: string; initial: string; hint: string; submit(view: EditorView): void;
  change(text: string): void; focus(): void;
}) {
  return new EditorView({ parent, state: EditorState.create({ doc: options.initial, extensions: [
    history(), EditorView.lineWrapping, placeholder(options.hint),
    EditorView.contentAttributes.of({ 'aria-label': options.label, 'aria-multiline': 'true', spellcheck: 'true' }),
    EditorView.domEventHandlers({
      focus: () => options.focus(),
    }),
    keymap.of([
      { key: 'Enter', run: view => { if (view.composing) return false; options.submit(view); return true; } },
      { key: 'Shift-Enter', run: insertNewline },
      ...defaultKeymap, ...historyKeymap,
    ]),
    EditorView.updateListener.of(update => {
      if (update.docChanged && !update.transactions.every(tr => tr.isUserEvent('stream.mirror'))) options.change(update.state.doc.toString());
    }),
  ] }) });
}

export function mirrorText(view: EditorView, text: string) {
  if (view.state.doc.toString() !== text) view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    annotations: [Transaction.userEvent.of('stream.mirror'), Transaction.addToHistory.of(false)],
  });
}

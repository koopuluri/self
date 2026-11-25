import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

function beatRange(state: EditorState) {
  const { from: anchor, to: head } = state.doc.lineAt(state.selection.main.head);
  return { anchor, head }; // The newline between beats belongs to neither one.
}

export function selectCurrentBeat(view: EditorView) {
  view.dispatch({ selection: beatRange(view.state), userEvent: 'select' });
  return true;
}

// Native editing services can change the DOM selection without a key event.
// Use the caret from *before* Select All, not the end of the incoming range.
export const guardStreamSelection = EditorState.transactionFilter.of(tr => {
  const { doc } = tr.startState, range = tr.selection?.main;
  if (!tr.docChanged && doc.lines > 1 && range?.from === 0 && range.to === doc.length) {
    return [tr, { selection: beatRange(tr.startState), sequential: true }];
  }
  return tr;
});

// Menu and keyboard share focus routing. Never fall back to selecting the page.
export function streamSelectAll(view: EditorView | null) {
  const active = document.activeElement;
  if (active?.matches('input, textarea') || (active?.closest('.cm-content, [contenteditable="true"]') && active !== view?.contentDOM)) return false;
  if (!view || document.querySelector('dialog[open]')) return true;
  const selection = document.getSelection(), node = selection?.focusNode;
  const block = active?.closest('.beat-block') || (node instanceof Element ? node : node?.parentElement)?.closest('.beat-block');
  if (block && view.contentDOM.contains(block) && selection) {
    const range = document.createRange(); range.selectNodeContents(block);
    selection.removeAllRanges(); selection.addRange(range);
  } else if (active === view.contentDOM) selectCurrentBeat(view);
  return true;
}

import { EditorState, StateEffect, StateField, Transaction } from '@codemirror/state';
import { invertedEffects, isolateHistory } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';

export type Identity = { ids: number[]; nextId: number; retired: Record<number, number|null>; origins?: Record<number, number> };
export const setIdentity = StateEffect.define<Identity>();
export const identity = StateField.define<Identity>({
  create() { throw new Error('Initial beat identities are required.'); },
  update(current, tr) {
    for (const effect of tr.effects) if (effect.is(setIdentity)) {
      const result = effect.value;
      // Undo can revive an identity but can never rewind the allocator.
      const live = new Set(result.ids), retired = { ...result.retired };
      for (const id of current.ids) if (!live.has(id) && !Object.hasOwn(retired, id)) retired[id] = null;
      return { ...result, retired, nextId: Math.max(current.nextId, result.nextId) };
    }
    return current;
  },
});

export const trackIdentity = EditorState.transactionExtender.of(tr => {
  if (!tr.docChanged || tr.effects.some(e => e.is(setIdentity)) || tr.isUserEvent('stream.remote')) return null;
  const old = tr.startState.field(identity), retired = { ...old.retired };
  let ids = old.ids;
  const origins = { ...old.origins };
  let nextId = old.nextId, shift = 0, structural = false;
  type Section = { from: number; to: number; inserted: number };
  const sections: Section[] = [];
  tr.changes.iterChanges((from, to, _a, _b, insert) => {
    sections.push({ from, to, inserted: insert.lines - 1 });
  });
  for (const { from, to, inserted } of sections) {
    const first = tr.startState.doc.lineAt(from), last = tr.startState.doc.lineAt(to);
    const removed = last.number - first.number;
    if (!removed && !inserted) continue;
    structural = true;
    const pos = first.number - 1 + shift;
    const replaced = ids.slice(pos, pos + removed + 1);
    const deletesWholeLines = !inserted && removed > 0 && from === first.from && to === last.from &&
      !tr.isUserEvent('delete.join') && first.length > 0;
    const keep = deletesWholeLines ? replaced[removed] : replaced[0];
    const fresh = Array.from({ length: inserted }, () => nextId++);
    for (const id of fresh) origins[id] = origins[keep] ?? keep;
    for (let i = 0; i < replaced.length; i++) {
      const id = replaced[i];
      if (id !== keep) {
        // A surviving suffix joins its old link to the combined passage.
        const survives = !deletesWholeLines && i === removed && (to < last.to || to === last.from);
        retired[id] = survives ? fresh.at(-1) ?? keep : null;
      }
    }
    // Inserting whole paragraphs before existing prose moves that prose intact.
    if (!removed && inserted && from === first.from && from === to && first.length) {
      ids = ids.slice(0, pos).concat(fresh, keep, ids.slice(pos + 1));
    } else {
      ids = ids.slice(0, pos).concat(keep, fresh, ids.slice(pos + replaced.length));
    }
    shift += inserted - removed;
  }
  return structural ? { effects: setIdentity.of({ ids, nextId, retired, origins }), annotations: isolateHistory.of('full') } : null;
});

export const undoIdentity = invertedEffects.of(tr =>
  tr.effects.some(e => e.is(setIdentity)) ? [setIdentity.of(tr.startState.field(identity))] : []);

export function deletePassages(view: EditorView) {
  const state = view.state, doc = state.doc, selection = state.selection.main;
  if (selection.empty) return false;
  const first = doc.lineAt(selection.from), last = doc.lineAt(selection.to);
  if (first.from !== selection.from || last.to !== selection.to) return false;
  const old = state.field(identity), ids = old.ids.slice(), retired = { ...old.retired };
  for (const id of ids.splice(first.number - 1, last.number - first.number + 1)) retired[id] = null;
  let nextId = old.nextId;
  if (!ids.length) ids.push(nextId++);
  const from = last.number === doc.lines && first.number > 1 ? first.from - 1 : first.from;
  const to = last.number < doc.lines ? last.to + 1 : last.to;
  view.dispatch({ changes: { from, to }, selection: { anchor: from }, effects: setIdentity.of({ ...old, ids, nextId, retired }),
    annotations: isolateHistory.of('full'), userEvent: 'delete.beats', scrollIntoView: true });
  return true;
}

export function movePassage(view: EditorView, direction: -1|1) {
  const { state } = view, doc = state.doc, sel = state.selection.main;
  const first = doc.lineAt(sel.from).number - 1;
  const end = doc.lineAt(sel.to);
  const last = end.number - 1 - (sel.to > sel.from && sel.to === end.from ? 1 : 0);
  if ((direction < 0 && first === 0) || (direction > 0 && last === doc.lines - 1)) return true;
  const start = direction < 0 ? first - 1 : first, stop = direction < 0 ? last : last + 1;
  const old = state.field(identity), ids = old.ids.slice();
  const neighbor = direction < 0 ? start : stop;
  const neighborId = ids.splice(neighbor, 1)[0];
  ids.splice(direction < 0 ? stop : start, 0, neighborId);
  const texts = Array.from({ length: stop - start + 1 }, (_, i) => doc.line(start + i + 1).text);
  if (direction < 0) texts.push(texts.shift()!); else texts.unshift(texts.pop()!);
  const offset = direction * (doc.line(neighbor + 1).length + 1);
  const bound = (n: number) => Math.min(n + offset, doc.length);
  view.dispatch({
    changes: { from: doc.line(start + 1).from, to: doc.line(stop + 1).to, insert: texts.join('\n') },
    selection: { anchor: bound(sel.anchor), head: bound(sel.head) }, scrollIntoView: true,
    effects: setIdentity.of({ ...old, ids }), annotations: isolateHistory.of('full'), userEvent: 'move.beats',
  });
  return true;
}

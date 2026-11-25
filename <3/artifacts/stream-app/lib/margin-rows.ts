import type { ThreadCard } from './types';

type Row = { card: ThreadCard; exit?: 'sliding' | 'hidden'; removed?: boolean };
type Action = { type: 'sync'; cards: ThreadCard[] } | { type: 'archive' | 'finish' | 'restore'; id: string };

// Service updates and exit animations can finish in either order. Keep the row
// until its exit finishes, then suppress stale copies until the margin catches up.
export function marginRows(rows: Row[], action: Action): Row[] {
  if (action.type === 'sync') {
    const previous = new Map(rows.map(row => [row.card.id, row]));
    const next: Row[] = action.cards.map(card => ({ card, exit: previous.get(card.id)?.removed ? undefined : previous.get(card.id)?.exit }));
    const present = new Set(action.cards.map(card => card.id));
    rows.forEach((row, i) => {
      if (row.exit === 'sliding' && !present.has(row.card.id)) next.splice(i, 0, { ...row, removed: true });
    });
    return next;
  }
  return rows.flatMap((row): Row[] => {
    if (row.card.id !== action.id) return [row];
    if (action.type === 'archive') return [{ ...row, exit: 'sliding' }];
    if (row.removed) return [];
    return [{ card: row.card, exit: action.type === 'finish' ? 'hidden' : undefined }];
  });
}

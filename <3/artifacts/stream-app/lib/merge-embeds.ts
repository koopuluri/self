import type { Identity } from './identity';
import type { Snapshot } from './types';

// The editor and service share an ID allocator. A browser or delivered reply
// can reserve IDs while new prose is still in the editor's debounce window.
export function mergeEmbeds(base: Snapshot, remote: Snapshot, local: Identity, text: string[]) {
  const known = new Set(base.beats.map(b => b.id));
  const existing = remote.beats.filter(b => known.has(b.id));
  if (existing.length !== base.beats.length || existing.some((b, i) => b.id !== base.beats[i].id || b.text !== base.beats[i].text)) return null;
  const isEmbed = (kind: string) => kind === 'bubble' || kind === 'browser' || kind === 'document';
  if (remote.beats.length === existing.length) return null;
  for (const [i, beat] of remote.beats.entries()) {
    if (known.has(beat.id) || isEmbed(beat.kind)) continue;
    // Appending a reply after the last paragraph also allocates an empty writing beat.
    const previous = remote.beats[i - 1];
    if (beat.kind !== 'text' || beat.text !== '' || !previous || known.has(previous.id) || !isEmbed(previous.kind)) return null;
  }
  const shift = remote.nextId - base.nextId;
  const remap = (id: number) => id >= base.nextId ? id + shift : id;
  const rows = local.ids.map((id, i) => ({ id: remap(id), text: text[i] }));
  let previous: number | undefined;
  for (const beat of remote.beats) {
    if (!known.has(beat.id)) {
      const index = previous === undefined ? -1 : rows.findIndex(b => b.id === previous);
      if (previous !== undefined && index < 0) return null;
      rows.splice(index + 1, 0, { id: beat.id, text: beat.text });
    }
    previous = beat.id;
  }
  const retired = Object.fromEntries(Object.entries(local.retired).map(([id, target]) => [remap(Number(id)), target === null ? null : remap(target)]));
  const origins = Object.fromEntries(Object.entries(local.origins ?? {}).map(([id, origin]) => [remap(Number(id)), remap(origin)]));
  return { rows, remap, identity: { ids: rows.map(b => b.id), nextId: local.nextId + shift, retired, origins } };
}

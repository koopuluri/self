import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { EventEmitter } from 'node:events';

export const stamp = () => new Date().toISOString();
export const digest = text => createHash('sha256').update(text).digest('hex');
export async function readJSON(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
}
export async function atomicWrite(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  const handle = await fs.open(temp, 'wx', 0o600);
  try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
  await fs.rename(temp, file);
}
export function serialize(beats) {
  return beats.map(b => `${b.text}${b.text ? ' ' : ''}<!-- beat:${b.id} -->`).join('\n\n') + '\n';
}
export function parse(source) {
  const found = new Map();
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^([^\r\n]*?)(?: )?<!-- beat:(\d+) -->\s*$/.exec(line);
    if (!match) throw new Error('The stream contains a line without a beat marker. Add a unique <!-- beat:N --> marker, or import the text through the app. The file has not been overwritten.');
    const id = Number(match[2]);
    if (!Number.isSafeInteger(id) || id < 0 || id >= Number.MAX_SAFE_INTEGER || found.has(id)) throw new Error('Beat IDs must be unique nonnegative integers. The file has not been overwritten.');
    found.set(id, match[1]);
  }
  return Array.from(found, ([id, text]) => ({ id, text }));
}
function oneLine(text) {
  if (typeof text !== 'string' || /[\r\n\0]/.test(text)) throw new Error('A beat must be one logical line.');
  return text;
}
function infer(text) {
  if (/^!\[.*?\]\(/.test(text)) return 'asset';
  if (/^\[chat with π\]\(/.test(text)) return 'chat';
  if (/^\[.*?\]\(https?:\/\//.test(text)) return 'browser';
  return 'text';
}
export class StreamStore extends EventEmitter {
  constructor(root) {
    super(); this.root = root;
    this.directory = path.join(root, '<3/stream');
    this.file = path.join(this.directory, 'index.md');
    this.metadataFile = path.join(this.directory, 'metadata.json');
    this.pi = path.join(root, 'π');
    this.beats = []; this.metadata = { version: 1, nextId: 0, beats: {} };
    this.journal = path.join(this.pi, '.runtime/stream-save.json');
    this.hash = ''; this.queue = Promise.resolve(); this.activeVisit = null;
  }
  async init() {
    await fs.mkdir(this.directory, { recursive: true });
    for (const dir of ['chats', 'threads', 'memory', 'logs', '.runtime']) await fs.mkdir(path.join(this.pi, dir), { recursive: true });
    // Read the active predecessor before the older nested snapshot. Recover
    // its pending journal against its original bytes before rebasing any links.
    const current = this.file;
    const previous = path.join(this.directory, '../stream.md');
    const nested = path.join(this.directory, 'stream.md');
    const exists = file => fs.stat(file).then(() => true, error => {
      if (error.code !== 'ENOENT') throw error;
      return false;
    });
    const index = await fs.lstat(current).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (index?.isSymbolicLink() && await fs.readlink(current) !== '../stream.md')
      throw new Error('Unexpected stream index link.');
    if (!index || index.isSymbolicLink()) {
      if (await exists(previous)) {
        const stat = await fs.lstat(previous);
        if (stat.isSymbolicLink() && await fs.readlink(previous) !== 'stream/stream.md')
          throw new Error('Unexpected legacy stream link.');
        this.file = stat.isSymbolicLink() ? nested : previous;
      }
      else if (await exists(nested)) this.file = nested;
    }
    this.receiptsFile = path.join(this.pi, '.runtime/delivery.json');
    this.metadata = await readJSON(this.metadataFile, this.metadata);
    Object.assign(this.metadata, await readJSON(this.receiptsFile, {}));
    const journal = await readJSON(this.journal, null);
    if (journal) {
      const source = await fs.readFile(this.file, 'utf8').catch(e => { if (e.code !== 'ENOENT') throw e; return ''; });
      if (digest(source) === journal.hash) {
        this.metadata = journal.metadata;
        await this.persistMetadata();
      }
      await fs.unlink(this.journal);
    }
    if (![1, 2].includes(this.metadata.version)) throw new Error('Unsupported stream format.');
    // Workspace-relative media paths survive moving the checkout to another laptop.
    for (const beat of Object.values(this.metadata.beats)) {
      if (beat.asset?.path) beat.asset.path = this.relativePath(beat.asset.path).replace(/^<3\/assets\//, '<3/stream/assets/');
      if (beat.source?.path) beat.source.path = beat.source.path.replace(/^<3\/notes\//, '<3/stream/notes/');
      if (beat.asset?.preview) beat.asset.preview = this.relativePath(beat.asset.preview);
    }
    let source;
    try { source = await fs.readFile(this.file, 'utf8'); }
    catch (e) { if (e.code !== 'ENOENT' || this.metadata.nextId) throw e; source = ''; }
    this.beats = parse(source);
    const legacy = this.metadata.version === 1;
    if (legacy) {
      this.beats = this.beats.filter((b, index, rows) => {
        const m = this.metadata.beats[b.id];
        if (index === rows.length - 1 || b.text.trim() || !m) return true;
        const pasteGap = !m.source && m.completedAt && [rows[index - 1], rows[index + 1]]
          .some(neighbor => neighbor && this.metadata.beats[neighbor.id]?.completedAt === m.completedAt);
        return !m.deletedAt && !pasteGap;
      });
      this.metadata.version = 2;
    }
    const predecessor = this.file;
    if (predecessor !== current) {
      for (const beat of this.beats) {
        const meta = this.metadata.beats[beat.id];
        if (meta?.kind === 'asset') beat.text = beat.text.replace('](../assets/', '](assets/');
        if (meta?.kind === 'chat' || meta?.kind === 'bubble')
          beat.text = beat.text.replace('](../π/chats/', '](../../π/chats/');
      }
      this.file = current;

    }
    this.reconcile(); this.hash = digest(source);
    if (!this.beats.length) this.add('', 'text');
    if (predecessor !== current || serialize(this.beats) !== source && (legacy || !source.trim())) await this.persist();
    else await this.persistMetadata();
    return this;
  }
  relativePath(file) {
    const relative = path.relative(this.root, path.resolve(this.root, file));
    return relative === '..' || relative.startsWith('..' + path.sep) ? file : relative;
  }
  reconcile() {
    for (const beat of this.beats) {
      const previous = this.metadata.beats[beat.id];
      this.metadata.beats[beat.id] = previous ?? { kind: infer(beat.text), author: 'user', createdAt: null, completedAt: null, visits: [] };
      if (previous && !beat.text && previous.kind !== 'text') { previous.kind = 'text'; delete previous.asset; delete previous.chatId; delete previous.url; }
    }
    const live = new Set(this.beats.map(b => b.id));
    for (const [key, meta] of Object.entries(this.metadata.beats)) {
      const id = Number(key);
      this.metadata.nextId = Math.max(this.metadata.nextId, id + 1);
      if (!live.has(id) && !Object.hasOwn(meta, 'redirect')) meta.redirect = null;
      if (live.has(id)) delete meta.redirect;
    }
  }
  add(text, kind = 'text', extra = {}) {
    const id = this.metadata.nextId++;
    const beat = { id, text: oneLine(text) };
    this.beats.push(beat);
    this.metadata.beats[id] = { kind, author: 'user', createdAt: text ? stamp() : null, completedAt: kind !== 'text' ? stamp() : null, visits: [], ...extra };
    return id;
  }
  beat(id) { return this.beats.find(b => b.id === id); }
  precedingTextBeats(before, count, includeMedia = false) {
    if (!Number.isSafeInteger(count) || count < 1 || count > 50) throw new Error('Choose a count from 1 to 50.');
    let end = this.beats.length;
    if (before != null) {
      const anchor = this.resolve(before);
      if (anchor.status !== 'live') throw new Error('The starting beat is missing or deleted. Choose a live beat.');
      end = this.beats.findIndex(beat => beat.id === anchor.beat.id);
    }
    const found = [];
    for (let index = end - 1; index >= 0 && found.length < count; index--) {
      const beat = this.beats[index];
      if (includeMedia && this.metadata.beats[beat.id].kind === 'asset') found.push({ ...beat, kind: 'asset' });
      else if (this.metadata.beats[beat.id].kind === 'text' && beat.text.trim()) found.push({ id: beat.id, text: beat.text });
    }
    return found.reverse();
  }
  resolve(id) {
    const seen = new Set();
    while (Number.isSafeInteger(id) && !seen.has(id)) {
      seen.add(id);
      const m = this.metadata.beats[id];
      if (!m) return { status: 'missing' };
      if (m.redirect === null) return { status: 'deleted' };
      if (m.redirect === undefined) return { status: 'live', beat: { ...this.beat(id), ...m } };
      id = m.redirect;
    }
    return { status: 'missing' };
  }
  snapshot() {
    return { beats: this.beats.map(b => ({ ...b, ...this.metadata.beats[b.id] })), nextId: this.metadata.nextId, hash: this.hash,
      retired: Object.fromEntries(Object.entries(this.metadata.beats).filter(([,m]) => 'redirect' in m).map(([id,m]) => [id,m.redirect])), file: this.file };
  }
  async reloadExternal() {
    const source = await fs.readFile(this.file, 'utf8');
    if (digest(source) === this.hash) return false;
    const rows = parse(source);
    for (const { id } of rows) {
      if (Object.hasOwn(this.metadata.beats[id] || {}, 'redirect')) throw new Error(`Retired beat ID ${id} cannot be reused.`);
    }
    this.beats = rows; this.reconcile();
    if (!rows.length) { this.add('', 'text'); await this.persist(); }
    else { this.hash = digest(source); await this.persistMetadata(); }
    return true;
  }
  async checkExternal() {
    const work = this.queue.then(() => this.reloadExternal());
    this.queue = work.catch(() => {}); return work;
  }
  async persistMetadata() {
    const { statusHistory, reportedClosures, readResults, ...document } = this.metadata;
    const receipts = JSON.stringify({ statusHistory, reportedClosures, readResults });
    if (receipts !== this.lastReceipts) {
      await atomicWrite(this.receiptsFile, receipts);
      this.lastReceipts = receipts;
    }
    await atomicWrite(this.metadataFile, JSON.stringify(document, null, 2) + '\n');
  }
  async persist() {
    const source = serialize(this.beats);
    const hash = digest(source);
    await atomicWrite(this.journal, JSON.stringify({ hash, metadata: this.metadata }));
    await atomicWrite(this.file, source); this.hash = hash;
    await this.persistMetadata();
    await fs.unlink(this.journal);
  }
  transact(fn) {
    const work = this.queue.then(async () => {
      await this.reloadExternal();
      const result = await fn(); await this.persist();
      this.emit('changed', this.snapshot()); return result;
    });
    this.queue = work.catch(() => {}); return work;
  }
  async saveDocument({ baseHash, baseNextId, rows, nextId, retired, origins = {} }) {
    return this.transact(() => {
      if (this.hash !== baseHash || this.metadata.nextId !== baseNextId) throw new Error('The stream changed outside this editor. Your writing is still here. Copy unsaved text before reloading.');
      if (!Array.isArray(rows) || !rows.length || !Number.isSafeInteger(nextId) || nextId < baseNextId) throw new Error('Invalid document.');
      const ids = new Set(), previous = new Map(this.beats.map(b => [b.id, b]));
      const valid = id => Number.isSafeInteger(id) && id >= 0 && id < nextId;
      for (const { id, text } of rows) {
        oneLine(text);
        if (!valid(id) || ids.has(id) || (id < baseNextId && !this.metadata.beats[id])) throw new Error('Invalid beat identity.');
        const old = previous.get(id);
        if (old && this.metadata.beats[id].kind !== 'text' && text !== old.text) throw new Error('Embedded blocks must remain intact.');
        ids.add(id);
      }
      for (const [key, target] of Object.entries(retired)) {
        const id = Number(key);
        if (!valid(id) || ids.has(id) || (target !== null && !valid(target))) throw new Error('Invalid retired beat.');
        const seen = new Set([id]);
        let next = target;
        while (next !== null && !ids.has(next)) {
          if (!valid(next) || seen.has(next) || !Object.hasOwn(retired, next)) throw new Error('Invalid beat redirect.');
          seen.add(next); next = retired[next];
        }
      }
      const at = stamp();
      for (const [key, target] of Object.entries(retired)) {
        const m = this.metadata.beats[key] ??= { kind: 'text', author: 'user', createdAt: null, visits: [] };
        m.redirect = target;
      }
      for (const b of this.beats) if (!ids.has(b.id) && !Object.hasOwn(retired, b.id)) this.metadata.beats[b.id].redirect = null;
      const redacted = new Set(Object.entries(this.metadata.beats).filter(([, m]) => m.redacted).map(([id]) => Number(id)));
      for (const [child, parent] of Object.entries(origins)) if (redacted.has(parent)) redacted.add(Number(child));
      for (const id of redacted) {
        let target = id;
        while (Number.isSafeInteger(retired[target])) target = retired[target];
        redacted.add(target);
      }
      for (const { id, text } of rows) {
        const m = this.metadata.beats[id] ??= { kind: 'text', author: 'user', createdAt: null, completedAt: null, visits: [] };
        delete m.redirect;
        if (redacted.has(id)) m.redacted = true;
        if (id !== rows.at(-1).id && (!previous.has(id) || id === this.beats.at(-1)?.id)) m.completedAt ??= at;
        if (previous.get(id)?.text !== text) {
          m.updatedAt = at;
          if (!m.source && text) m.createdAt ??= at;
          if (text) delete m.deletedAt;
        }
      }
      this.metadata.nextId = nextId;
      this.beats = rows.map(({ id, text }) => ({ id, text }));
      return true;
    });
  }
  async edit(edits) {
    return this.transact(() => {
      let nextId = this.metadata.nextId;
      // Validate every edit before changing anything (including conflict checks).
      for (const e of edits) {
        oneLine(e.text);
        if (e.before === null && e.id === nextId) { nextId++; continue; }
        const b = this.beat(e.id);
        if (!b || b.text !== e.before) throw new Error(`Beat ${e.id} changed outside this editor. Your unsaved text is still here; reload after copying it.`);
        if (this.metadata.beats[e.id].kind !== 'text') throw new Error('Use Delete beat to clear an embedded block.');
      }
      for (const e of edits) {
        if (e.before === null) this.add('', 'text');
        const b = this.beat(e.id), m = this.metadata.beats[e.id];
        if (e.complete) m.completedAt ??= e.startedAt || stamp();
        if (b.text === e.text) continue;
        b.text = e.text;
        if (!m.createdAt && !m.source && e.text) m.createdAt = e.startedAt || stamp();
        m.updatedAt = stamp();
        if (!e.text) m.deletedAt = stamp(); else delete m.deletedAt;
      }
      return true;
    });
  }
  async append(text, extra = {}) {
    return this.transact(() => {
      const tail = this.beats.at(-1), tailMeta = tail && this.metadata.beats[tail.id];
      let id;
      if (tail && !tail.text && tailMeta.kind === 'text' && !tailMeta.completedAt && !tailMeta.deletedAt) {
        id = tail.id; tail.text = oneLine(text); Object.assign(tailMeta, { createdAt: extra.startedAt ?? stamp(), completedAt: stamp(), ...extra });
      } else id = this.add(text, 'text', { completedAt: stamp(), ...extra });
      this.add('', 'text'); return id;
    });
  }
  async complete(id) {
    return this.transact(() => {
      if (!this.beat(id)) throw new Error('Unknown beat');
      const m = this.metadata.beats[id];
      m.completedAt ??= stamp();
      const index = this.beats.findIndex(b => b.id === id);
      return this.beats[index + 1]?.id ?? this.add('', 'text');
    });
  }
  async remove(id) {
    return this.transact(() => this.deleteBeat(id));
  }
  deleteBeat(id) {
      const b = this.beat(id); if (!b) throw new Error('Unknown beat');
      this.beats.splice(this.beats.indexOf(b), 1);
      if (!this.beats.length) this.add('', 'text');
      const m = this.metadata.beats[id]; m.redirect = null;
      Object.assign(m, { deletedAt: stamp(), updatedAt: stamp(), completedAt: m.completedAt ?? stamp() });
      return true;
  }
  async redact(id, value = true) {
    return this.transact(() => {
      const target = this.resolve(id);
      if (target.status !== 'live') throw new Error('Unknown or deleted beat');
      Object.assign(this.metadata.beats[target.beat.id], { redacted: value, redactedAt: value ? stamp() : null }); return true;
    });
  }
  async focus(id) {
    // Focus updates never rewrite prose, and do not claim to measure attention.
    const work = this.queue.then(async () => {
      if (this.activeVisit?.id === id) return;
      if (this.activeVisit) this.activeVisit.visit.exitedAt = stamp();
      this.activeVisit = null;
      if (Number.isInteger(id) && this.metadata.beats[id]) {
        const visit = { enteredAt: stamp(), exitedAt: null };
        (this.metadata.beats[id].visits ??= []).push(visit); this.activeVisit = { id, visit };
      }
      await this.persistMetadata();
    }); this.queue = work.catch(() => {}); return work;
  }
  async importNotes(files) {
    return this.transact(async () => {
      if (this.metadata.nextId > 1 || this.beats.some(b => b.text)) throw new Error('Import is only available into an empty stream.');
      this.beats = []; this.metadata = { version: 2, nextId: 0, beats: {} };
      for (const file of files) {
        const source = await fs.readFile(file, 'utf8');
        source.split(/\r?\n/).forEach((line, index) => {
          if (!line.trim()) return;
          const id = this.add(line, infer(line), { createdAt: null, completedAt: null, importedAt: stamp(), source: { path: path.relative(this.root, file), line: index + 1 } });
          this.metadata.beats[id].imported = true;
          // Resolve Obsidian/media references against the original note location.
          const match = /^(?:!\[.*?\]\((.*?)\)|!\[\[(.*?)\]\])$/.exec(line.trim());
          if (match) {
            const ref = (match[1] || match[2]).split('|')[0];
            this.metadata.beats[id].kind = 'asset';
            this.metadata.beats[id].asset = { name: path.basename(ref), path: this.relativePath(path.resolve(path.dirname(file), ref)), importedReference: true };
          }
        });
        for (const meta of Object.values(this.metadata.beats)) {
          if (!meta.asset?.importedReference) continue;
          try { await fs.access(path.resolve(this.root, meta.asset.path)); } catch {
            const candidates = [path.join(this.root, '<3/stream/assets', meta.asset.name), path.join(this.root, meta.asset.name)];
            for (const candidate of candidates) { try { await fs.access(candidate); meta.asset.path = this.relativePath(candidate); break; } catch {} }
          }
        }
      }
      this.add('', 'text'); return this.beats.length - 1;
    });
  }
  insertBlockAfter(after, text, kind, details) {
    const position = this.beats.findIndex(b => b.id === after);
    if (position === -1) throw new Error('The insertion point was removed.');
    const id = this.add(text, kind, details);
    const row = this.beats.pop();
    this.beats.splice(position + 1, 0, row);
    if (this.beats.at(-1) === row) this.add('', 'text');
    return id;
  }
  insertBlock(text, kind, details) {
    const tail = this.beats.at(-1);
    const meta = tail && this.metadata.beats[tail.id];
    const writingSlot = tail && !tail.text && meta.kind === 'text' && !meta.completedAt && !meta.deletedAt;
    if (writingSlot) this.beats.pop();
    else if (meta) meta.completedAt ??= stamp();
    const id = this.add(text, kind, details);
    if (writingSlot) this.beats.push(tail);
    else this.add('', 'text');
    return id;
  }
  async importAsset(file) {
    const stat = await fs.stat(file); if (!stat.isFile()) throw new Error('Only files can be dropped into the stream.');
    const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk);
    const name = path.basename(file), filename = `${hash.digest('hex').slice(0, 12)}-${name.replace(/[^\p{L}\p{N}._-]/gu, '_')}`;
    const target = path.join(this.root, '<3/stream/assets', filename); await fs.mkdir(path.dirname(target), { recursive: true });
    if (path.resolve(file) !== path.resolve(target)) { try { await fs.copyFile(file, target, 1); } catch (e) { if (e.code !== 'EEXIST') throw e; } }
    return this.transact(() => {
      const ref = encodeURI(path.relative(this.directory, target)).replaceAll('(', '%28').replaceAll(')', '%29');
      return this.insertBlock(`![${name.replaceAll(']', '')}](${ref})`, 'asset', { asset: { name, path: this.relativePath(target), bytes: stat.size } });
    });
  }
  async browser(url, after) {
    const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Use an http or https address.');
    return this.transact(() => {
      const ref = `[${parsed.hostname}](${parsed.href})`;
      return after != null && this.beat(after)
        ? this.insertBlockAfter(after, ref, 'browser', { url: parsed.href })
        : this.insertBlock(ref, 'browser', { url: parsed.href });
    });
  }
}

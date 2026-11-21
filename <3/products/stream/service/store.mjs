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
export function parse(source, nextId = 0) {
  const found = new Map(); let last = -1;
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^(.*?)(?: )?<!-- beat:(\d+) -->\s*$/.exec(line);
    if (!match) throw new Error('stream.md contains a line without a beat marker. Add a unique <!-- beat:N --> marker, or import the text through the app. The file has not been overwritten.');
    const id = Number(match[2]);
    if (!Number.isSafeInteger(id) || id < 0 || id <= last || id > 1_000_000) throw new Error('Beat IDs must be unique, increasing integers. The file has not been overwritten.');
    found.set(id, match[1]); last = id;
  }
  return Array.from({ length: Math.max(nextId, last + 1) }, (_, id) => ({ id, text: found.get(id) ?? '' }));
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
    this.file = path.join(this.directory, 'stream.md');
    this.metadataFile = path.join(this.directory, 'metadata.json');
    this.pi = path.join(root, 'π');
    this.beats = []; this.metadata = { version: 1, nextId: 0, beats: {} };
    this.hash = ''; this.queue = Promise.resolve(); this.activeVisit = null;
  }
  async init() {
    await fs.mkdir(this.directory, { recursive: true });
    for (const dir of ['chats', 'threads', 'memory', 'logs', '.runtime']) await fs.mkdir(path.join(this.pi, dir), { recursive: true });
    this.metadata = await readJSON(this.metadataFile, this.metadata);
    // Workspace-relative media paths survive moving the checkout to another laptop.
    for (const beat of Object.values(this.metadata.beats)) {
      if (beat.asset?.path) beat.asset.path = this.relativePath(beat.asset.path);
      if (beat.asset?.preview) beat.asset.preview = this.relativePath(beat.asset.preview);
    }
    let source;
    try { source = await fs.readFile(this.file, 'utf8'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; source = ''; }
    this.beats = parse(source, this.metadata.nextId);
    this.reconcile(); this.hash = digest(source);
    if (!this.beats.length) { this.add('', 'text'); await this.persist(); }
    // An interrupted focus visit has an unknown exit; never invent its time.
    await this.persistMetadata();
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
    this.metadata.nextId = this.beats.length;
  }
  add(text, kind = 'text', extra = {}) {
    const id = this.metadata.nextId++;
    const beat = { id, text: oneLine(text) };
    this.beats.push(beat);
    this.metadata.beats[id] = { kind, author: 'user', createdAt: text ? stamp() : null, completedAt: kind !== 'text' ? stamp() : null, visits: [], ...extra };
    return id;
  }
  snapshot() {
    return { beats: this.beats.map(b => ({ ...b, ...this.metadata.beats[b.id] })), nextId: this.metadata.nextId, file: this.file };
  }
  async reloadExternal() {
    const source = await fs.readFile(this.file, 'utf8');
    if (digest(source) === this.hash) return false;
    this.beats = parse(source, this.metadata.nextId); this.reconcile(); this.hash = digest(source);
    return true;
  }
  async checkExternal() {
    const work = this.queue.then(() => this.reloadExternal());
    this.queue = work.catch(() => {}); return work;
  }
  async persistMetadata() { await atomicWrite(this.metadataFile, JSON.stringify(this.metadata, null, 2) + '\n'); }
  async persist() {
    const source = serialize(this.beats);
    await atomicWrite(this.file, source); this.hash = digest(source);
    await this.persistMetadata();
  }
  transact(fn) {
    const work = this.queue.then(async () => {
      await this.reloadExternal();
      const result = await fn(); await this.persist();
      this.emit('changed', this.snapshot()); return result;
    });
    this.queue = work.catch(() => {}); return work;
  }
  async edit(edits) {
    return this.transact(() => {
      // Validate every edit before changing anything (including conflict checks).
      for (const e of edits) {
        oneLine(e.text);
        const b = this.beats[e.id];
        if (!b || b.text !== e.before) throw new Error(`Beat ${e.id} changed outside this editor. Your unsaved text is still here; reload after copying it.`);
        if (this.metadata.beats[e.id].kind !== 'text') throw new Error('Use Delete beat to clear an embedded block.');
      }
      for (const e of edits) {
        const b = this.beats[e.id], m = this.metadata.beats[e.id];
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
      if (!this.beats[id]) throw new Error('Unknown beat');
      const m = this.metadata.beats[id];
      m.completedAt ??= stamp();
      if (id === this.beats.length - 1) this.add('', 'text');
      return id + 1;
    });
  }
  async remove(id) {
    return this.transact(() => {
      const b = this.beats[id]; if (!b) throw new Error('Unknown beat');
      b.text = ''; const m = this.metadata.beats[id];
      Object.assign(m, { kind: 'text', deletedAt: stamp(), updatedAt: stamp(), completedAt: m.completedAt ?? stamp() });
      delete m.asset; delete m.chatId; delete m.url; return true;
    });
  }
  async redact(id, value = true) {
    return this.transact(() => {
      if (!this.beats[id]) throw new Error('Unknown beat');
      Object.assign(this.metadata.beats[id], { redacted: value, redactedAt: value ? stamp() : null }); return true;
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
      if (this.beats.some(b => b.text)) throw new Error('Import is only available into an empty stream.');
      this.beats = []; this.metadata = { version: 1, nextId: 0, beats: {} };
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
            const candidates = [path.join(this.root, '<3/assets', meta.asset.name), path.join(this.root, meta.asset.name)];
            for (const candidate of candidates) { try { await fs.access(candidate); meta.asset.path = this.relativePath(candidate); break; } catch {} }
          }
        }
      }
      this.add('', 'text'); return this.beats.length - 1;
    });
  }
  async importAsset(file) {
    const stat = await fs.stat(file); if (!stat.isFile()) throw new Error('Only files can be dropped into the stream.');
    const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk);
    const name = path.basename(file), filename = `${hash.digest('hex').slice(0, 12)}-${name.replace(/[^\p{L}\p{N}._-]/gu, '_')}`;
    const target = path.join(this.root, '<3/assets', filename); await fs.mkdir(path.dirname(target), { recursive: true });
    if (path.resolve(file) !== path.resolve(target)) { try { await fs.copyFile(file, target, 1); } catch (e) { if (e.code !== 'EEXIST') throw e; } }
    return this.transact(() => {
      const tail = this.beats.at(-1); if (tail && !this.metadata.beats[tail.id].completedAt) this.metadata.beats[tail.id].completedAt = stamp();
      const ref = encodeURI(path.relative(this.directory, target)).replaceAll('(', '%28').replaceAll(')', '%29');
      const id = this.add(`![${name.replaceAll(']', '')}](${ref})`, 'asset', { asset: { name, path: this.relativePath(target), bytes: stat.size } });
      this.add('', 'text'); return id;
    });
  }
  async browser(url) {
    const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Use an http or https address.');
    return this.transact(() => {
      const tail = this.beats.at(-1); if (tail && !this.metadata.beats[tail.id].completedAt) this.metadata.beats[tail.id].completedAt = stamp();
      const id = this.add(`[${parsed.hostname}](${parsed.href})`, 'browser', { url: parsed.href });
      this.add('', 'text'); return id;
    });
  }
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { StreamStore, atomicWrite, readJSON, stamp } from './store.mjs';

const exec = promisify(execFile);
const root = process.env.PI_SELF_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const send = message => process.parentPort ? process.parentPort.postMessage(message) : process.send?.(message);
const store = await new StreamStore(root).init();
const uiFile = path.join(store.pi, '.runtime/ui.json');
let agent;
let uiQueue = Promise.resolve();
store.on('changed', snapshot => send({ event: 'changed', snapshot }));
store.on('chat-changed', chatId => send({ event: 'chat-changed', chatId }));

async function preview(id) {
  const asset = store.metadata.beats[id]?.asset; if (!asset) return;
  const original = path.resolve(root, asset.path);
  const ext = path.extname(asset.path).toLowerCase();
  if (!['.heic', '.heif', '.mov'].includes(ext)) return;
  const dir = path.join(store.pi, '.runtime/previews'); await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, path.basename(asset.path) + (ext === '.mov' ? '.mp4' : '.jpg'));
  try {
    try { await fs.access(target); }
    catch {
      if (ext === '.mov') await exec(process.env.PI_FFMPEG_BINARY || '/opt/homebrew/bin/ffmpeg', ['-nostdin', '-y', '-i', original, '-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart', target], { timeout: 180000, maxBuffer: 1024 * 1024 });
      else await exec('/usr/bin/sips', ['-s', 'format', 'jpeg', original, '--out', target], { timeout: 30000 });
    }
    await store.transact(() => { if (store.metadata.beats[id]?.asset) store.metadata.beats[id].asset.preview = store.relativePath(target); });
  } catch { send({ event: 'notice', message: `Preview unavailable for ${asset.name}; the original file is retained.` }); }
}
async function loadAgent() {
  if (!agent) { const { Coordinator } = await import('./agent.mjs'); agent = new Coordinator(store); }
  return agent;
}
const handlers = {
  async load() { return { snapshot: store.snapshot(), ui: await readJSON(uiFile, {}), model: await (await loadAgent()).status() }; },
  async edit({ edits }) { return store.edit(edits); },
  async append({ text, contextBeatId, startedAt }) { return store.append(text, { contextBeatId, startedAt }); },
  async complete({ id }) { return store.complete(id); },
  async remove({ id }) { return store.remove(id); },
  async focus({ id }) { return store.focus(id); },
  async importNotes() {
    const files = Array.from({ length: 8 }, (_, i) => path.join(root, `<3/notes/_nov-${i + 12}-2026.md`));
    return store.importNotes(files);
  },
  async assets({ paths }) { const ids = []; for (const file of paths) { const id = await store.importAsset(file); ids.push(id); void preview(id); } return ids; },
  async preview({ id }) { void preview(id); return true; },
  async browser({ url }) { return store.browser(url); },
  async ui(value) { const work = uiQueue.then(() => atomicWrite(uiFile, JSON.stringify(value))); uiQueue = work.catch(() => {}); await work; return true; },
  async chat({ chatId }) { return (await loadAgent()).chat(chatId); },
  async prompt(args) { return (await loadAgent()).prompt(args); },
  async models() { return (await loadAgent()).models(); },
  async configure(args) { return (await loadAgent()).configure(args); },
  async threads() { return (await loadAgent()).threads(); },
  async reveal() { return (await loadAgent()).reveal(); },
  async continueThread(args) { return (await loadAgent()).continueThread(args); },
};
async function receive(message) {
  const { requestId, method, args = {} } = message;
  try {
    if (!handlers[method]) throw new Error('Unknown operation');
    const value = await handlers[method](args);
    send({ requestId, value, snapshot: ['load', 'chat', 'models', 'focus', 'ui', 'threads'].includes(method) || (method === 'reveal' && value === null) ? undefined : store.snapshot() });
  } catch (error) { send({ requestId, error: error.message }); }
}
if (process.parentPort) process.parentPort.on('message', e => void receive(e.data));
else process.on('message', receive);
send({ event: 'ready' });

// External editors are supported; malformed/conflicting input is never overwritten.
setInterval(async () => {
  if (store.polling) return;
  store.polling = true;
  try {
    if (await store.checkExternal()) send({ event: 'changed', snapshot: store.snapshot() });
  } catch (e) { send({ event: 'notice', message: e.message }); }
  finally { store.polling = false; }
}, 1500).unref();

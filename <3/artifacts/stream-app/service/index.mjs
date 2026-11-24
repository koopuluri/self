import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { StreamStore, atomicWrite, readJSON } from './store.mjs';

import { expandHistoricalChats } from './bubbles.mjs';
import { documentActions } from './documents.mjs';
import { piClient } from './pi-client.mjs';


const exec = promisify(execFile);
export async function createService(root, send) {
  const store = await new StreamStore(root).init();
  const uiFile = path.join(store.pi, '.runtime/ui.json');
  const client = await piClient(store,send);
  let uiQueue = Promise.resolve();
  store.on('changed', snapshot => send({ event: 'changed', snapshot }));
  store.on('open-beat', id => send({ event: 'open-beat', id }));
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
  const handlers = {
    ...documentActions(store),
    async load() { await client.sync(); await expandHistoricalChats(store); return { snapshot:store.snapshot(),ui:await readJSON(uiFile,{}) }; },
    async snapshot() { return store.snapshot(); },
    async document(args) { return store.saveDocument(args); },
    async resolve({ id }) { return store.resolve(id); },
    async edit({ edits }) { return store.edit(edits); },
    async append({ text, contextBeatId, startedAt }) { return store.append(text, { contextBeatId, startedAt }); },
    async complete({ id }) { return store.complete(id); },
    async remove({ id }) { return store.remove(id); },
    async focus({ id }) { return store.focus(id); },
    async assets({ paths }) { const ids = []; for (const file of paths) { const id = await store.importAsset(file); ids.push(id); void preview(id); } return ids; },
    async preview({ id }) { void preview(id); return true; },
    async browser({ url }) { return store.browser(url); },
    async ui(value) { const work = uiQueue.then(() => atomicWrite(uiFile, JSON.stringify(value))); uiQueue = work.catch(() => {}); await work; return true; },
    ...Object.fromEntries(['stop','models','configure','threads','continueThread','reveal'].map(method=>[method,args=>client.control(method,args)])),
    async chat({chatId}) { return client.chat(chatId); },
    async replyState({source}) { return client.state(source); },
    async prompt(args) { return client.prompt(args); },
    async deliver(args) { return client.deliver(args); },
  };
  async function receive(message) {
    const { requestId, method, args = {} } = message;
    try {
      if (!handlers[method]) throw new Error('Unknown operation');
      const value = await handlers[method](args);
      send({ requestId, value, snapshot: ['load', 'snapshot', 'readBlockDocument','saveBlockDocument', 'replyState', 'resolve', 'chat', 'models', 'focus', 'ui', 'threads', 'stop'].includes(method) || (method === 'reveal' && value === null) ? undefined : store.snapshot() });
    } catch (error) { send({ requestId, error: error.message }); }
  }
  // External editors are supported; malformed/conflicting input is never overwritten.
  setInterval(async () => {
    if (store.polling) return;
    store.polling = true;
    try {
      await client.sync();
      if (await store.checkExternal()) send({ event: 'changed', snapshot: store.snapshot() });
    } catch (e) { send({ event: 'notice', message: e.message }); }
    finally { store.polling = false; }
  }, 400).unref();

  return { receive };
}

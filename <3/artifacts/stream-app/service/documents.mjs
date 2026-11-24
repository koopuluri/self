import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite, digest } from './store.mjs';

export async function readWorkspaceDocument(root, name) {
  if (typeof name !== 'string' || !/\.(md|txt)$/i.test(name) || path.isAbsolute(name) ||
      name.split('/').some(part => !part || part.startsWith('.') || ['node_modules','build','out'].includes(part)))
    throw new Error('Choose a workspace-relative Markdown or text file.');
  const base = await fs.realpath(root);
  const file = path.join(base, name);
  if (await fs.realpath(file) !== file) throw new Error('Choose the document at its original workspace path.');
  const stat = await fs.stat(file);
  if (!stat.isFile()) throw new Error('Choose a text file.');
  const text = await fs.readFile(file, 'utf8');
  const readOnly = /^<3\/stream\/(?:index\.md|stream\.md|chats\/|history\/)|^<3\/stream\.md$|^π\/(?:chats|threads|logs)\//.test(name);
  return { text, hash: digest(text), readOnly };
}

export function documentActions(store) {
  let pending = Promise.resolve();
  function nameFor(id) {
    const beat = store.resolve(id).beat;
    if (beat?.kind !== 'document') throw new Error('Document beat is unavailable.');
    return beat.filepath;
  }
  return {
    readBlockDocument: ({ id }) => readWorkspaceDocument(store.root, nameFor(id)),
    saveBlockDocument({ id, text, hash }) {
      const save = pending.then(async () => {
        const name = nameFor(id);
        const current = await readWorkspaceDocument(store.root, name);
        if (current.readOnly) throw new Error('This is a managed source record.');
        if (current.hash !== hash) throw new Error('The file changed on disk. Your edits are still open.');
        await atomicWrite(path.join(store.root, name), text);
        return digest(text);
      });
      pending = save.catch(() => {});
      return save;
    },
  };
}

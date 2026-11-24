import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const copy = promisify(execFile);

// Stage a complete release before atomically changing the selection.
export async function stagePi(source, runtime) {
  const folder = path.join(runtime,'releases',randomUUID());
  await fs.mkdir(folder,{recursive:true});
  for (const name of await fs.readdir(source)) {
    if (/\.(?:mjs|cjs)$/.test(name) && name !== 'install.mjs' || name === 'package.json') {
      await fs.copyFile(path.join(source,name),path.join(folder,name));
    }
  }
  await copy('/bin/cp',['-cR',path.join(source,'node_modules'),path.join(folder,'node_modules')]);
  const node = process.env.PI_NODE_BINARY || process.execPath;
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
  await copy(node,['--check','host.cjs'],{cwd:folder,env});
  await copy(node,['--input-type=module','-e',"await Promise.all([import('./worker.mjs'),import('./plan.mjs')])"],{cwd:folder,env});
  const next = folder+'.link';
  await fs.symlink(folder,next);
  await fs.rename(next,path.join(runtime,'selected-service'));
  return folder;
}

import './seed-preview.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const product = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = path.join(product, 'build/Stream Preview.app');
await fs.access(bundle);
const lock = path.join(product, '.runtime/preview-self/π/.runtime/electron/SingletonLock');
async function owner() {
  try { return await fs.readlink(lock); }
  catch (err) { if (err.code === 'ENOENT') return null; throw err; }
}
const old = await owner();
if (old) {
  const pid = old.match(/-(\d+)$/)?.[1];
  if (!pid) throw new Error('Cannot identify the Preview process.');
  // Quit via Cocoa so Preview can flush its pending edits. A denied quit
  // or a dev instance with another bundle ID is never force-terminated.
  const quit = `ObjC.import('AppKit'); function run(args) {
    const app = $.NSRunningApplication.runningApplicationWithProcessIdentifier(Number(args[0]));
    if (ObjC.unwrap(app.bundleIdentifier) !== 'local.self.stream.preview') throw Error('Close the dev Preview first.');
    if (!app.terminate) throw Error('Preview declined to quit.');
  }`;
  execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', quit, pid]);
  for (let i = 0; i < 100 && await owner() === old; i++) await delay(100);
  if (await owner() === old) throw new Error('Preview is still saving or needs attention.');
}
execFileSync('/usr/bin/open', ['-g', bundle, ...(process.argv.includes('--connect-chatgpt') ? ['--args', '--connect-chatgpt'] : [])]);

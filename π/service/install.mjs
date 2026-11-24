// Stage a self-contained release. launchd starts this selection at login.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { atomicWrite } from './io.mjs';
const src = path.dirname(fileURLToPath(import.meta.url)), workspace = path.resolve(src,'../..');
if (process.argv.length > 2) throw new Error('Use node install.mjs without arguments.');
const stream = path.join(workspace,'<3/artifacts/stream-app');
const root = workspace;
const runtime = path.join(root,'π/.runtime');
const { stagePi } = await import('./release.mjs');
const folder = await stagePi(src,runtime);
const selected = path.join(runtime,'selected-service');
const label = 'local.self.pi.' + createHash('sha256').update(root).digest('hex').slice(0,16);
const esc = value => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const arg = value => '<string>' + esc(value) + '</string>';
const env = { PI_SELF_ROOT:root, PI_WORKSPACE_SOURCE:workspace, PI_STREAM_SOURCE:stream, PI_NODE_BINARY:process.execPath };
const binary = path.join(selected,'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const file = path.join(os.homedir(),'Library/LaunchAgents',label+'.plist');
const plist = '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>Label</key>'+arg(label)+
  '<key>ProgramArguments</key><array>'+arg(binary)+arg(path.join(selected,'host.cjs'))+'</array><key>EnvironmentVariables</key><dict>'+
  Object.entries(env).map(([k,v])=>'<key>'+k+'</key>'+arg(v)).join('')+'</dict><key>RunAtLoad</key><true/><key>KeepAlive</key><true/>'+
  '<key>StandardErrorPath</key>'+arg(path.join(runtime,'worker.stderr.log'))+'</dict></plist>';
const domain = 'gui/'+process.getuid();
let running = false;
try { execFileSync('/bin/launchctl',['print',domain+'/'+label],{stdio:'ignore'}); running=true; } catch {}
if (!running) {
  await atomicWrite(file,plist);
  execFileSync('/bin/launchctl',['bootstrap',domain,file]);
}
console.log(label,folder);

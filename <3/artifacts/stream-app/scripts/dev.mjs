import './seed-preview.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const production = process.argv.includes('--production');
const electron = path.join(directory, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
let next, app;
if (!production) {
  next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3456'], { cwd: directory, stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
  for (let i = 0; i < 120; i++) { try { const response = await fetch('http://127.0.0.1:3456'); if (response.ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 500)); }
}
app = spawn(electron, [path.join(directory, 'electron/runtime.cjs')], { cwd: directory, stdio: 'inherit', env: { ...process.env, PI_STREAM_CHANNEL: 'preview', PI_STREAM_SOURCE: directory, PI_SELF_ROOT: path.join(directory, '.runtime/preview-self'), ...(production ? { PI_STREAM_OUT: path.join(directory, 'build/preview-export') } : { PI_STREAM_URL: 'http://127.0.0.1:3456' }) } });
function stop() { app?.kill(); next?.kill(); }
app.on('exit', code => { next?.kill(); process.exitCode = code ?? 0; });
process.on('SIGINT', stop); process.on('SIGTERM', stop);

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const electron = path.join(directory, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3456'], { cwd: directory, stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
for (let i = 0; i < 120; i++) { try { const response = await fetch('http://127.0.0.1:3456'); if (response.ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 500)); }
const app = spawn(electron, [path.join(directory, 'electron/runtime.cjs')], { cwd: directory, stdio: 'inherit',
  env: { ...process.env, PI_STREAM_SOURCE: directory, PI_SELF_ROOT: path.resolve(directory, '../../..'), PI_STREAM_URL: 'http://127.0.0.1:3456' } });
function stop() { app?.kill(); next?.kill(); }
app.on('exit', code => { next?.kill(); process.exitCode = code ?? 0; });
process.on('SIGINT', stop); process.on('SIGTERM', stop);

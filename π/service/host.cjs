const { app, safeStorage, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const root = process.env.PI_SELF_ROOT;
if (!root) throw new Error('Set PI_SELF_ROOT to the workspace.');
const appName = 'stream';
// Retain the Keychain encryption identity across the service extraction.
app.setName(appName);
app.setPath('userData', path.join(root, 'π/.runtime/pi-host-v1'));
app.dock?.hide();
if (!app.requestSingleInstanceLock()) { app.quit(); return; }
app.whenReady().then(async () => {
  const { setTimeout: delay } = require('node:timers/promises');
  const legacy = path.join(root,'π/.runtime/pi-service.json');
  while (true) {
    try {
      const {pid} = JSON.parse(await fs.readFile(legacy,'utf8'));
      process.kill(pid,0);
    } catch (e) { if (['ENOENT','ESRCH'].includes(e.code)) break; throw e; }
    await delay(500);
  }
  // A pre-v1 writing session owns these threads until its ordinary close.
  // Its first v1 successor creates the mailbox when opening the document.
  const inbox = path.join(root,'π/.runtime/mailbox-v1/in');
  const legacyDocument = await fs.stat(path.join(root,'<3/stream/stream.md')).catch(()=>null);
  while (legacyDocument && !await fs.stat(inbox).catch(()=>null)) await delay(500);
  const { PlanConnection } = await import('./plan.mjs');
  const canonical = await fs.realpath(root);
  const plan = new PlanConnection({ safeStorage, appName, openBrowser: url => shell.openExternal(url),
    directory: path.join(app.getPath('appData'),'local.self.stream',createHash('sha256').update(canonical).digest('hex')) });
  const { startWorker } = await import('./worker.mjs');
  await startWorker(root, action => plan.handle(action),
    async () => (await fs.realpath(path.join(root,'π/.runtime/selected-service'))) !== __dirname, () => app.quit());
  const { atomicWrite } = await import('./io.mjs');
  await atomicWrite(path.join(root,'π/.runtime/worker.json'), JSON.stringify({ pid: process.pid, version: 1, release:__dirname }));
}).catch(e => { console.error(e); app.exit(1); });

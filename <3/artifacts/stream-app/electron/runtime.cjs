const { app, BrowserWindow, session, ipcMain, protocol, net, dialog, shell, Menu, clipboard, webContents } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const root = process.env.PI_SELF_ROOT || path.resolve(__dirname, '../../../..');
const product = path.resolve(__dirname, '..');
const out = process.env.PI_STREAM_OUT || path.join(product, 'out');
const appName = 'stream';
app.setName(appName);
app.setPath('userData', path.join(root, 'π/.runtime/electron'));
if (!app.requestSingleInstanceLock()) { app.quit(); return; }
app.on('second-instance', (_event, argv) => {
  if (window && !window.isDestroyed()) { window.show(); window.focus(); }
  if (ready && argv.includes('--connect-chatgpt')) startChatGPTSignIn();
});
protocol.registerSchemesAsPrivileged([{ scheme: 'stream', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
let window, service, snapshot, ready;
let rendererReady = false, closingConfirmed = false;
const notify = message => { if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('stream:event', message); };
const requests = new Map();
function call(method, args = {}) {
  return ready.then(() => new Promise((resolve, reject) => {
    const requestId = require('node:crypto').randomUUID();
    const timer = setTimeout(() => { requests.delete(requestId); reject(new Error('The local service did not respond. Your unsaved text remains in the editor.')); }, 120000);
    requests.set(requestId, { resolve, reject, timer }); void service.receive({ requestId, method, args });
  }));
}
function startChatGPTSignIn() {
  void call('prompt', { text: 'connect my ChatGPT' }).catch(() => notify({ event: 'notice', message: 'Could not start ChatGPT sign-in. Ask π to connect your ChatGPT.' }));
}
function trusted(event) { if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted sender'); }
function validURL(value) { const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an http or https URL'); return url.href; }
const browserPartition = 'persist:stream-browser';
function configureBrowserSession() {
  const browsing = session.fromPartition(browserPartition);
  browsing.webRequest.onBeforeRequest({
    urls: ['https://koopuluri.com/stream/*', 'https://www.koopuluri.com/stream/*'],
  }, (details, callback) => {
    const match = /^\/stream\/(\d+)\/?$/.exec(new URL(details.url).pathname);
    if (details.resourceType !== 'mainFrame' || !match) return callback({});
    callback({ cancel: true });
    void call('resolve', { id: Number(match[1]) }).then(({ value }) => {
      if (value.status === 'live') notify({ event: 'open-beat', id: value.beat.id });
      else notify({ event: 'notice', message: value.status === 'deleted' ? 'That beat was deleted.' : 'Unknown beat.' });
    }).catch(e => notify({ event: 'notice', message: e.message }));
  });
  browsing.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  browsing.setPermissionCheckHandler(() => false);
}
function configureGuest(guest) {
  guest.on('will-navigate', (event, url) => { try { validURL(url); } catch { event.preventDefault(); } });
  guest.on('will-redirect', (event, url) => { try { validURL(url); } catch { event.preventDefault(); } });
  guest.setWindowOpenHandler(({ url }) => {
    try { void guest.loadURL(validURL(url)).catch(error => notify({event:'notice', message:error.message})); } catch {}
    return { action: 'deny' };
  });
  guest.on('did-fail-load', (_, code, message) => { if (code !== -3) window.webContents.send('stream:event', { event: 'notice', message: `Page couldn’t load: ${message}` }); });
  guest.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.key === 'Escape' || (input.meta || input.control) && input.key === 'Enter')) {
      event.preventDefault(); window.webContents.focus(); window.webContents.send('stream:event', { event: 'return-to-stream' });
    }
  });
}
app.whenReady().then(async () => {
  app.setAccessibilitySupportEnabled(true);
  const canonicalRoot = await fs.realpath(root);
  protocol.handle('stream', async request => {
    const url = new URL(request.url);
    if (url.host === 'asset') {
      const id = Number(url.pathname.slice(1)), asset = snapshot?.beats.find(b => b.id === id)?.asset;
      if (!asset) return new Response('Not found', { status: 404 });
      let file = url.searchParams.has('original') ? asset.path : asset.preview || asset.path;
      file = path.resolve(root, file);
      try {
        file = await fs.realpath(file);
        const allowedRoots = [path.join(canonicalRoot, '<3/stream/assets'), path.join(canonicalRoot, 'π/.runtime/previews')];
        // Existing note references may point to media elsewhere in self, but never hidden directories or arbitrary files.
        const relative = path.relative(canonicalRoot, file);
        const media = /\.(png|jpe?g|gif|webp|heic|heif|mov|mp4|webm|mp3|m4a|wav|ogg|pdf)$/i.test(file);
        if (!allowedRoots.some(p => file.startsWith(p + path.sep)) && !(media && !relative.startsWith('..') && !relative.split(path.sep).some(p => p.startsWith('.')))) return new Response('Forbidden', { status: 403 });
        return net.fetch(pathToFileURL(file).href, { headers: request.headers });
      } catch { return new Response('Not found', { status: 404 }); }
    }
    if (url.host !== 'app') return new Response('Not found', { status: 404 });
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.resolve(out, '.' + pathname);
    if (!file.startsWith(out + path.sep)) return new Response('Forbidden', { status: 403 });
    try { return await net.fetch(pathToFileURL(file).href); } catch { return new Response('Not found', { status: 404 }); }
  });
  const {createService} = await import('../service/index.mjs');
  ready = createService(root, message => {
    if (message.snapshot) snapshot = message.snapshot;
    if (message.value?.snapshot) snapshot = message.value.snapshot;
    if (message.requestId) {
      const item = requests.get(message.requestId); if (!item) return;
      clearTimeout(item.timer); requests.delete(message.requestId);
      message.error ? item.reject(new Error(message.error)) : item.resolve(message);
    } else notify(message);
  }).then(local => { service = local; });
  await ready;
  window = new BrowserWindow({ width: 1100, height: 850, minWidth: 650, minHeight: 480, title: appName, backgroundColor: '#fdfdfc', titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 19 }, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), webviewTag: true, nodeIntegration: false, contextIsolation: true, sandbox: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('render-process-gone', () => { rendererReady = false; });
  window.webContents.session.setPermissionRequestHandler((contents, permission, cb) => cb(contents === window.webContents && permission === 'fullscreen'));
  configureBrowserSession();
  window.webContents.on('will-attach-webview', (event, prefs, params) => {
    if (params.partition !== browserPartition || params.preload || params.webpreferences ||
        !snapshot?.beats.some(beat => beat.kind === 'browser' && beat.url === params.src) || !/^https?:\/\//i.test(params.src)) {
      event.preventDefault(); return;
    }
    delete prefs.preload;
    Object.assign(prefs, { nodeIntegration: false, nodeIntegrationInSubFrames: false, nodeIntegrationInWorker: false,
      contextIsolation: true, sandbox: true, webviewTag: false, webSecurity: true, allowRunningInsecureContent: false });
  });
  window.webContents.on('did-attach-webview', (_event, guest) => configureGuest(guest));
  window.on('close', event => {
    if (rendererReady && !closingConfirmed) { event.preventDefault(); notify({ event: 'before-close' }); }
  });
  window.on('blur', () => void call('focus', { id: null }).catch(() => {}));
  ipcMain.handle('stream:call', (event, method, args) => { trusted(event); const allowed = ['load','snapshot','readBlockDocument','saveBlockDocument','document','resolve','edit','append','complete','remove','focus','preview','ui','chat','prompt','replyState','deliver','models','configure','threads','stop', 'reveal','continueThread','archiveThread','showThread']; if (!allowed.includes(method)) throw new Error('Unknown operation'); if (method === 'load') rendererReady = true; return call(method, args); });
  ipcMain.on('stream:close-ready', event => { trusted(event); closingConfirmed = true; window.close(); });
  ipcMain.handle('stream:assets', (event, paths) => { trusted(event); return call('assets', { paths }); });
  ipcMain.handle('stream:pick', async event => { trusted(event); const result = await dialog.showOpenDialog(window, { properties: ['openFile', 'multiSelections'] }); return result.canceled ? null : call('assets', { paths: result.filePaths }); });
  ipcMain.handle('stream:browser', (event, url) => { trusted(event); return call('browser', { url: validURL(url) }); });
  ipcMain.handle('stream:copy-beat-link', (event, id) => {
    trusted(event);
    if (Number.isSafeInteger(id) && id >= 0) clipboard.writeText(`https://koopuluri.com/stream/${id}`);
  });
  ipcMain.handle('stream:open-asset', async (event, id) => { trusted(event); const asset = snapshot?.beats.find(b => b.id === id)?.asset; if (!asset) throw new Error('Unknown asset'); return shell.openPath(path.resolve(root, asset.path)); });
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'stream', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'quit' }] }, { label: 'Edit', submenu: [
    { role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
    { role: 'pasteAndMatchStyle' }, { role: 'delete' },
    { label: 'Select All', accelerator: 'CommandOrControl+A', click() {
      const focused = webContents.getFocusedWebContents();
      if (focused === window.webContents) notify({ event: 'select-all' });
      else focused?.selectAll(); // Browser guest or DevTools, not the stream.
    } },
    ...(process.platform === 'darwin' ? [{ type: 'separator' }, { label: 'Substitutions', submenu: [
      { role: 'showSubstitutions' }, { type: 'separator' }, { role: 'toggleSmartQuotes' }, { role: 'toggleSmartDashes' }, { role: 'toggleTextReplacement' },
    ] }, { label: 'Speech', submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }] }] : []),
  ] }, { label: 'view', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { role: 'togglefullscreen' }] }]));
  await window.loadURL(process.env.PI_STREAM_URL || 'stream://app/');
  if (process.argv.includes('--connect-chatgpt')) startChatGPTSignIn();
}).catch(error => { dialog.showErrorBox(appName, error.message); app.quit(); });
app.on('window-all-closed', () => app.quit());


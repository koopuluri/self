const { app, BrowserWindow, WebContentsView, ipcMain, utilityProcess, protocol, net, dialog, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const root = process.env.PI_SELF_ROOT || path.resolve(__dirname, '../../../..');
const product = path.resolve(__dirname, '..');
app.setName('stream');
app.setPath('userData', path.join(root, 'π/.runtime/electron'));
if (!app.requestSingleInstanceLock()) { app.quit(); return; }
app.on('second-instance', () => { if (window && !window.isDestroyed()) { window.show(); window.focus(); } });
protocol.registerSchemesAsPrivileged([{ scheme: 'stream', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
let window, service, snapshot, browser, browserId = null, ready;
let rendererReady = false, closingConfirmed = false;
const notify = message => { if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('stream:event', message); };
const requests = new Map(); let counter = 0;
function call(method, args = {}) {
  return ready.then(() => new Promise((resolve, reject) => {
    const requestId = ++counter;
    const timer = setTimeout(() => { requests.delete(requestId); reject(new Error('The local service did not respond. Your unsaved text remains in the editor.')); }, 120000);
    requests.set(requestId, { resolve, reject, timer }); service.postMessage({ requestId, method, args });
  }));
}
function trusted(event) { if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted sender'); }
function hideBrowser() { if (browser) browser.setVisible(false); }
function validURL(value) { const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an http or https URL'); return url.href; }
function setupBrowser() {
  browser = new WebContentsView({ webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition: 'persist:stream-browser' } });
  window.contentView.addChildView(browser); browser.setVisible(false);
  browser.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  browser.webContents.session.setPermissionCheckHandler(() => false);
  const navigate = url => { try { validURL(url); void call('browser', { url }).then(result => window.webContents.send('stream:event', { event: 'open-browser', id: result.value })); } catch {} };
  browser.webContents.on('will-navigate', (event, url) => { event.preventDefault(); navigate(url); });
  browser.webContents.setWindowOpenHandler(({ url }) => { navigate(url); return { action: 'deny' }; });
  browser.webContents.on('did-fail-load', (_, code, message) => { if (code !== -3) window.webContents.send('stream:event', { event: 'notice', message: `Page couldn’t load: ${message}` }); });
  browser.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.meta || input.control) && input.key === 'Enter') {
      event.preventDefault(); hideBrowser(); window.webContents.focus(); window.webContents.send('stream:event', { event: 'return-to-stream' });
    }
  });
}
app.whenReady().then(async () => {
  app.setAccessibilitySupportEnabled(true);
  const canonicalRoot = await fs.realpath(root);
  protocol.handle('stream', async request => {
    const url = new URL(request.url);
    if (url.host === 'asset') {
      const id = Number(url.pathname.slice(1)), asset = snapshot?.beats[id]?.asset;
      if (!asset) return new Response('Not found', { status: 404 });
      let file = url.searchParams.has('original') ? asset.path : asset.preview || asset.path;
      file = path.resolve(root, file);
      try {
        file = await fs.realpath(file);
        const allowedRoots = [path.join(canonicalRoot, '<3/assets'), path.join(canonicalRoot, 'π/.runtime/previews')];
        // Existing note references may point to media elsewhere in self, but never hidden directories or arbitrary files.
        const relative = path.relative(canonicalRoot, file);
        const media = /\.(png|jpe?g|gif|webp|heic|heif|mov|mp4|webm|mp3|m4a|wav|ogg|pdf)$/i.test(file);
        if (!allowedRoots.some(p => file.startsWith(p + path.sep)) && !(media && !relative.startsWith('..') && !relative.split(path.sep).some(p => p.startsWith('.')))) return new Response('Forbidden', { status: 403 });
        return net.fetch(pathToFileURL(file).href, { headers: request.headers });
      } catch { return new Response('Not found', { status: 404 }); }
    }
    if (url.host !== 'app') return new Response('Not found', { status: 404 });
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.resolve(product, 'out', '.' + pathname);
    if (!file.startsWith(path.join(product, 'out') + path.sep)) return new Response('Forbidden', { status: 403 });
    try { return await net.fetch(pathToFileURL(file).href); } catch { return new Response('Not found', { status: 404 }); }
  });
  let markReady;
  ready = new Promise(resolve => { markReady = resolve; });
  service = utilityProcess.fork(path.join(product, 'service/index.mjs'), [], { env: { ...process.env, PI_SELF_ROOT: root, PI_NODE_BINARY: process.env.PI_NODE_BINARY || process.execPath, PI_NODE_ELECTRON: process.env.PI_NODE_BINARY ? process.env.PI_NODE_ELECTRON || '0' : '1' }, serviceName: 'π' });
  service.on('message', message => {
    if (message.event === 'ready') { markReady(); return; }
    if (message.snapshot) snapshot = message.snapshot;
    if (message.value?.snapshot) snapshot = message.value.snapshot;
    if (message.requestId) {
      const item = requests.get(message.requestId); if (!item) return;
      clearTimeout(item.timer); requests.delete(message.requestId);
      message.error ? item.reject(new Error(message.error)) : item.resolve(message);
    } else notify(message);
  });
  service.on('exit', code => {
    for (const item of requests.values()) { clearTimeout(item.timer); item.reject(new Error('π service stopped. Restart the app; your saved stream is on disk.')); }
    requests.clear(); notify({ event: 'notice', message: `The local service stopped (${code}). Restart the app to reconnect.` });
  });
  window = new BrowserWindow({ width: 1100, height: 850, minWidth: 650, minHeight: 480, title: 'stream', backgroundColor: '#fdfdfc', titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 19 }, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('render-process-gone', () => { rendererReady = false; });
  window.webContents.session.setPermissionRequestHandler((_w, _p, cb) => cb(false));
  window.on('resize', hideBrowser);
  window.on('close', event => {
    if (rendererReady && !closingConfirmed) { event.preventDefault(); notify({ event: 'before-close' }); }
  });
  window.on('blur', () => void call('focus', { id: null }).catch(() => {}));
  setupBrowser();
  ipcMain.handle('stream:call', (event, method, args) => { trusted(event); const allowed = ['load','edit','append','complete','remove','focus','preview','ui','chat','prompt','models','configure','threads','reveal','continueThread']; if (!allowed.includes(method)) throw new Error('Unknown operation'); if (method === 'load') rendererReady = true; return call(method, args); });
  ipcMain.on('stream:close-ready', event => { trusted(event); closingConfirmed = true; window.close(); });
  ipcMain.handle('stream:assets', (event, paths) => { trusted(event); return call('assets', { paths }); });
  ipcMain.handle('stream:pick', async event => { trusted(event); const result = await dialog.showOpenDialog(window, { properties: ['openFile', 'multiSelections'] }); return result.canceled ? null : call('assets', { paths: result.filePaths }); });
  ipcMain.handle('stream:browser', (event, url) => { trusted(event); return call('browser', { url: validURL(url) }); });
  ipcMain.handle('stream:import-notes', event => { trusted(event); return call('importNotes'); });
  ipcMain.handle('stream:open-asset', async (event, id) => { trusted(event); const asset = snapshot?.beats[id]?.asset; if (!asset) throw new Error('Unknown asset'); return shell.openPath(path.resolve(root, asset.path)); });
  ipcMain.on('stream:hide-browser', event => { trusted(event); hideBrowser(); });
  ipcMain.on('stream:browser-bounds', async (event, data) => {
    trusted(event); if (!data) return hideBrowser();
    const beat = snapshot?.beats[data.id]; if (beat?.kind !== 'browser') return hideBrowser();
    const { x, y, width, height } = data;
    if (![x,y,width,height].every(Number.isFinite) || width < 40 || height < 80) return hideBrowser();
    const [w,h] = window.getContentSize();
    browser.setBounds({ x: Math.max(0, Math.round(x)), y: Math.max(52, Math.round(y)), width: Math.min(w, Math.round(width)), height: Math.min(Math.round(height), h - Math.max(52, Math.round(y))) });
    browser.setVisible(true);
    if (browserId !== data.id) { browserId = data.id; try { await browser.webContents.loadURL(validURL(beat.url)); } catch {} }
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'stream', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'quit' }] }, { role: 'editMenu' }, { label: 'view', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { role: 'togglefullscreen' }] }]));
  await window.loadURL(process.env.PI_STREAM_URL || 'stream://app/');
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { service?.kill(); if (browser && !browser.webContents.isDestroyed()) browser.webContents.close(); });

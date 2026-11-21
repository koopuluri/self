const { contextBridge, ipcRenderer, webUtils } = require('electron');
const allowed = new Set(['load', 'edit', 'append', 'complete', 'remove', 'focus', 'preview', 'ui', 'chat', 'prompt', 'models', 'configure', 'threads', 'reveal', 'continueThread']);
contextBridge.exposeInMainWorld('streamAPI', {
  call(method, args) { if (!allowed.has(method)) return Promise.reject(new Error('Unknown operation')); return ipcRenderer.invoke('stream:call', method, args); },
  onEvent(callback) { const handler = (_, event) => callback(event); ipcRenderer.on('stream:event', handler); return () => ipcRenderer.removeListener('stream:event', handler); },
  importFiles(files) { return ipcRenderer.invoke('stream:assets', files.map(file => webUtils.getPathForFile(file)).filter(Boolean)); },
  pickFiles() { return ipcRenderer.invoke('stream:pick'); },
  openBrowser(url) { return ipcRenderer.invoke('stream:browser', url); },
  browserBounds(value) { ipcRenderer.send('stream:browser-bounds', value); },
  hideBrowser() { ipcRenderer.send('stream:hide-browser'); },
  closeReady() { ipcRenderer.send('stream:close-ready'); },
  openAsset(id) { return ipcRenderer.invoke('stream:open-asset', id); },
  importNotes() { return ipcRenderer.invoke('stream:import-notes'); },
  modelAvailable: true,
});

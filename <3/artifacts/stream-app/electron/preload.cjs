const { contextBridge, ipcRenderer, webUtils } = require('electron');
const allowed = new Set(['load','snapshot','readBlockDocument','saveBlockDocument', 'document', 'resolve', 'edit', 'append', 'complete', 'remove', 'focus', 'preview', 'ui', 'chat', 'prompt','replyState','deliver', 'models', 'configure', 'threads', 'stop', 'reveal', 'continueThread','archiveThread','showThread']);
contextBridge.exposeInMainWorld('streamAPI', {
  call(method, args) { if (!allowed.has(method)) return Promise.reject(new Error('Unknown operation')); return ipcRenderer.invoke('stream:call', method, args); },
  onEvent(callback) { const handler = (_, event) => callback(event); ipcRenderer.on('stream:event', handler); return () => ipcRenderer.removeListener('stream:event', handler); },
  importFiles(files) { return ipcRenderer.invoke('stream:assets', files.map(file => webUtils.getPathForFile(file)).filter(Boolean)); },
  pickFiles() { return ipcRenderer.invoke('stream:pick'); },
  openBrowser(url) { return ipcRenderer.invoke('stream:browser', url); },
  closeReady() { ipcRenderer.send('stream:close-ready'); },
  copyBeatLink(id) { return ipcRenderer.invoke('stream:copy-beat-link', id); },
  openAsset(id) { return ipcRenderer.invoke('stream:open-asset', id); },
  modelAvailable: true,
});

// Ponte mínima entre o site e o app: só "salvar cópia" e "abrir pasta". Nada mais do PC fica exposto ao site.
const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED = ['https://scriptgenn.lovable.app', 'http://localhost:8080'];
if (ALLOWED.includes(window.location.origin)) {
  contextBridge.exposeInMainWorld('scriptgenDesktop', {
    isDesktop: true,
    saveMedia: req => ipcRenderer.invoke('media:save', req),
    openFolder: kind => ipcRenderer.invoke('media:open-folder', kind),
  });
}

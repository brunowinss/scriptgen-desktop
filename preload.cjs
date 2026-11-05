// Ponte mínima entre o site e o app: só "salvar cópia", "abrir pasta" e "ver/trocar a pasta". Nada mais do PC fica exposto ao site.
const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED = ['https://scriptgenn.lovable.app', 'http://localhost:8080'];
if (ALLOWED.includes(window.location.origin)) {
  contextBridge.exposeInMainWorld('scriptgenDesktop', {
    isDesktop: true,
    saveMedia: req => ipcRenderer.invoke('media:save', req),
    openFolder: kind => ipcRenderer.invoke('media:open-folder', kind),
    getFolder: () => ipcRenderer.invoke('media:get-folder'),
    chooseFolder: () => ipcRenderer.invoke('media:choose-folder'),
    getSettings: () => ipcRenderer.invoke('app:settings'),
    resetFolder: () => ipcRenderer.invoke('app:reset-folder'),
    setNotify: on => ipcRenderer.invoke('app:set-notify', !!on),
    testNotification: () => ipcRenderer.invoke('app:test-notification'),
    checkUpdate: () => ipcRenderer.invoke('app:check-update'),
  });
}

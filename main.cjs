/**
 * ScriptGen para Windows. Abre o mesmo site publicado (login, créditos e geração continuam na nuvem) e grava uma cópia
 * de cada vídeo e imagem prontos em Documentos\ScriptGen. Para testar com o site local: SCRIPTGEN_URL=http://localhost:8080/app.
 */
const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('node:path');
const { saveMedia, folderFor } = require('./media-store.cjs');

const SITE = process.env.SCRIPTGEN_URL || 'https://scriptgenn.lovable.app/app';
const SITE_ORIGIN = new URL(SITE).origin;
const root = () => path.join(app.getPath('documents'), 'ScriptGen');

// Downloads em fila (no máximo 2 ao mesmo tempo) para não travar a conexão.
let running = 0;
const queue = [];
const pump = () => {
  while (running < 2 && queue.length) {
    const { req, resolve } = queue.shift();
    running++;
    saveMedia(root(), req)
      .then(resolve, err => resolve({ ok: false, error: err.message }))
      .finally(() => { running--; pump(); });
  }
};

if (!app.requestSingleInstanceLock()) app.quit();

let mainWindow = null;
function createWindow() {
  const win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: '#0a0a0a', title: 'ScriptGen', autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  // Links de fora do ScriptGen abrem no navegador normal.
  win.webContents.setWindowOpenHandler(({ url }) => {
    try { if (new URL(url).origin === SITE_ORIGIN) return { action: 'allow' }; } catch { /* endereço inválido */ }
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadURL(SITE);
  return win;
}

const fromSite = event => { try { return new URL(event.senderFrame.url).origin === SITE_ORIGIN; } catch { return false; } };

ipcMain.handle('media:save', (event, req) => {
  if (!fromSite(event)) return { ok: false, error: 'Origem não permitida.' };
  return new Promise(resolve => { queue.push({ req, resolve }); pump(); });
});
ipcMain.handle('media:open-folder', (event, kind) => {
  if (!fromSite(event)) return false;
  return shell.openPath(kind === 'video' || kind === 'image' ? folderFor(root(), kind) : root()).then(err => !err);
});

app.whenReady().then(() => {
  folderFor(root(), 'video');
  folderFor(root(), 'image');
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'ScriptGen', submenu: [
      { label: 'Abrir pasta de vídeos', click: () => shell.openPath(folderFor(root(), 'video')) },
      { label: 'Abrir pasta de imagens', click: () => shell.openPath(folderFor(root(), 'image')) },
      { type: 'separator' },
      { role: 'reload', label: 'Recarregar' },
      { role: 'toggleDevTools', label: 'Ferramentas de desenvolvedor' },
      { type: 'separator' },
      { role: 'quit', label: 'Sair' },
    ] },
  ]));
  mainWindow = createWindow();
});
app.on('second-instance', () => { if (!mainWindow) return; if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); });
app.on('window-all-closed', () => app.quit());

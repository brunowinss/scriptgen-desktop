/**
 * ScriptGen para Windows. Abre o mesmo site publicado (login, créditos e geração continuam na nuvem) e grava uma cópia
 * de cada vídeo e imagem prontos na pasta escolhida em Configurações (padrão: Documentos\ScriptGen).
 * Para testar com o site local: SCRIPTGEN_URL=http://localhost:8080/app.
 */
const { app, BrowserWindow, ipcMain, shell, Menu, dialog, Notification } = require('electron');
const path = require('node:path');
const { saveMedia, folderFor } = require('./media-store.cjs');
const { createSettings } = require('./settings.cjs');
const { startUpdates, checkNow } = require('./updater.cjs');

const SITE = process.env.SCRIPTGEN_URL || 'https://scriptgenn.lovable.app/app';
const SITE_ORIGIN = new URL(SITE).origin;
let settings = null;
const root = () => settings.root();

// Downloads em fila (no máximo 2 ao mesmo tempo) para não travar a conexão.
let running = 0;
const queue = [];
const pump = () => {
  while (running < 2 && queue.length) {
    const { req, resolve } = queue.shift();
    running++;
    saveMedia(root(), req)
      .then(result => { notifyReady(req, result); resolve(result); }, err => resolve({ ok: false, error: err.message }))
      .finally(() => { running--; pump(); });
  }
};

if (!app.requestSingleInstanceLock()) app.quit();
// Nome e ícone certos nas notificações do Windows (o mesmo id do instalador).
app.setAppUserModelId('com.scriptgen.desktop');

// Só avisa do que acabou de ficar pronto: ao abrir o app, os itens antigos do histórico são copiados sem notificação.
const NOTIFY_WINDOW_MS = 30 * 60 * 1000;
function notifyReady(req, result) {
  if (!settings.notify() || !result || !result.ok || result.skipped || !Notification.isSupported()) return;
  const when = Number(req.createdAt) || Date.parse(req.createdAt) || 0;
  if (!when || Date.now() - when > NOTIFY_WINDOW_MS) return;
  const isVideo = req.kind === 'video';
  const n = new Notification({
    title: isVideo ? 'Vídeo pronto' : 'Imagem pronta',
    body: `${String(req.name || 'ScriptGen').slice(0, 80)}\nSalvo na pasta do ScriptGen. Clique para abrir.`,
    // A imagem aparece na própria notificação; o vídeo usa o ícone do app.
    icon: isVideo ? path.join(__dirname, 'icon.png') : result.path,
  });
  n.on('click', () => {
    shell.showItemInFolder(result.path);
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });
  n.show();
}

let mainWindow = null;
function createWindow() {
  const win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: '#0a0a0a', title: 'ScriptGen',
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

async function chooseFolder() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Escolha a pasta onde ficam os vídeos e imagens',
    defaultPath: root(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const dir = settings.setRoot(result.filePaths[0]);
  folderFor(dir, 'video');
  folderFor(dir, 'image');
  buildMenu();
  await dialog.showMessageBox(mainWindow, {
    type: 'info', title: 'Pasta alterada', message: 'Pasta alterada',
    detail: `Os próximos vídeos e imagens serão salvos em:\n${dir}\n\nOs arquivos que já estavam na pasta antiga continuam lá.`,
  });
  return dir;
}

function resetFolder() {
  const dir = settings.resetRoot();
  folderFor(dir, 'video');
  folderFor(dir, 'image');
  buildMenu();
  return dir;
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'ScriptGen', submenu: [
      { label: 'Abrir pasta de vídeos', click: () => shell.openPath(folderFor(root(), 'video')) },
      { label: 'Abrir pasta de imagens', click: () => shell.openPath(folderFor(root(), 'image')) },
      { type: 'separator' },
      { role: 'reload', label: 'Recarregar' },
      { role: 'quit', label: 'Sair' },
    ] },
    { label: 'Configurações', submenu: [
      { label: `Pasta dos arquivos: ${root()}`, enabled: false },
      { label: 'Trocar pasta…', click: () => { void chooseFolder(); } },
      { label: 'Abrir pasta atual', click: () => shell.openPath(root()) },
      { label: 'Voltar para Documentos\\ScriptGen', enabled: !settings.isDefault(), click: resetFolder },
      { type: 'separator' },
      { label: 'Notificar quando um vídeo ou imagem ficar pronto', type: 'checkbox', checked: settings.notify(), click: item => { settings.setNotify(item.checked); } },
      { label: 'Testar notificação', click: () => { if (Notification.isSupported()) new Notification({ title: 'ScriptGen', body: 'As notificações estão funcionando.', icon: path.join(__dirname, 'icon.png') }).show(); } },
      { type: 'separator' },
      { label: `Versão ${app.getVersion()}`, enabled: false },
      { label: 'Procurar atualização', click: checkNow },
      { role: 'toggleDevTools', label: 'Ferramentas de desenvolvedor' },
    ] },
  ]));
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
ipcMain.handle('media:get-folder', event => (fromSite(event) ? root() : null));
ipcMain.handle('media:choose-folder', event => (fromSite(event) ? chooseFolder() : null));

app.whenReady().then(() => {
  settings = createSettings(path.join(app.getPath('userData'), 'config.json'), path.join(app.getPath('documents'), 'ScriptGen'));
  folderFor(root(), 'video');
  folderFor(root(), 'image');
  buildMenu();
  mainWindow = createWindow();
  startUpdates(() => mainWindow);
});
app.on('second-instance', () => { if (!mainWindow) return; if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); });
app.on('window-all-closed', () => app.quit());

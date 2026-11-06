/**
 * ScriptGen para Windows. Abre o mesmo site publicado (login, créditos e geração continuam na nuvem) e grava uma cópia
 * de cada vídeo e imagem prontos na pasta escolhida em Configurações (padrão: Documentos\ScriptGen).
 * Para testar com o site local: SCRIPTGEN_URL=http://localhost:8080/app.
 */
const { app, BrowserWindow, ipcMain, shell, Menu, dialog, Notification } = require('electron');
const path = require('node:path');
const { saveMedia, folderFor, findLocal } = require('./media-store.cjs');
const { createSettings } = require('./settings.cjs');
const { startUpdates, checkNow } = require('./updater.cjs');

const SITE = process.env.SCRIPTGEN_URL || 'https://scriptgenn.lovable.app/app';
// Cada publicação do site também solta uma versão do app (o Bruno quer os dois sempre juntos): site-version.json diz de quando é o site.
let SITE_VERSION = null;
try { SITE_VERSION = require('./site-version.json'); } catch { /* versão antiga sem o arquivo */ }
const siteLabel = () => {
  if (!SITE_VERSION || !SITE_VERSION.publishedAt) return null;
  try { return `Site de ${new Date(SITE_VERSION.publishedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`; } catch { return null; }
};
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

function testNotification() {
  if (!Notification.isSupported()) return false;
  new Notification({ title: 'ScriptGen', body: 'As notificações estão funcionando.', icon: path.join(__dirname, 'icon.png') }).show();
  return true;
}

/** O que a tela "App do PC" do site mostra. */
const appSettings = () => ({ folder: root(), isDefault: settings.isDefault(), notify: settings.notify(), version: app.getVersion(), site: SITE_VERSION });

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
      { label: 'Testar notificação', click: testNotification },
      { type: 'separator' },
      { label: `Versão ${app.getVersion()}`, enabled: false },
      ...(siteLabel() ? [{ label: siteLabel(), enabled: false }] : []),
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
// "Abrir no PC": abre o arquivo do item com o programa do Windows (ou mostra na pasta). Sem arquivo: false.
ipcMain.handle('media:open-local', async (event, req) => {
  if (!fromSite(event) || !req) return false;
  const file = findLocal(root(), req.kind, req.id);
  if (!file) return false;
  if (req.reveal) { shell.showItemInFolder(file); return true; }
  return !(await shell.openPath(file));
});
ipcMain.handle('media:has-local', (event, req) => (fromSite(event) && req ? !!findLocal(root(), req.kind, req.id) : false));
ipcMain.handle('media:choose-folder', event => (fromSite(event) ? chooseFolder() : null));
// Tela "App do PC" dentro do site: ver e mudar as configurações sem precisar do menu de cima.
ipcMain.handle('app:settings', event => (fromSite(event) ? appSettings() : null));
ipcMain.handle('app:reset-folder', event => { if (!fromSite(event)) return null; resetFolder(); return appSettings(); });
ipcMain.handle('app:set-notify', (event, on) => { if (!fromSite(event)) return null; settings.setNotify(on); buildMenu(); return appSettings(); });
ipcMain.handle('app:test-notification', event => (fromSite(event) ? testNotification() : false));
ipcMain.handle('app:check-update', event => { if (!fromSite(event)) return false; checkNow(); return true; });

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

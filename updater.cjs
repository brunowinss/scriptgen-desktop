/**
 * Atualização automática: procura versão nova no GitHub (brunowinss/scriptgen-desktop, público, só com o app),
 * baixa em segundo plano e pergunta se pode reiniciar. Ao abrir o app e a cada 4 horas.
 * Mudanças no SITE não passam por aqui: elas já valem quando você publica no Lovable.
 */
const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

const EVERY_MS = 4 * 60 * 60 * 1000;
let getWindow = () => null;
let manual = false;
let asked = false;

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('update-not-available', () => {
  if (!manual) return;
  manual = false;
  dialog.showMessageBox(getWindow(), { type: 'info', title: 'ScriptGen', message: 'Você já está na versão mais nova.', detail: `Versão ${app.getVersion()}` });
});

autoUpdater.on('error', err => {
  console.warn('[atualização]', err && err.message);
  if (!manual) return;
  manual = false;
  dialog.showMessageBox(getWindow(), { type: 'warning', title: 'ScriptGen', message: 'Não foi possível procurar atualização agora.', detail: 'Confira a internet e tente de novo mais tarde.' });
});

autoUpdater.on('update-downloaded', async info => {
  manual = false;
  if (asked) return;
  asked = true;
  const { response } = await dialog.showMessageBox(getWindow(), {
    type: 'info',
    title: 'Atualização pronta',
    message: `A versão ${info.version} do ScriptGen está pronta.`,
    detail: 'Reiniciar agora para atualizar? Se preferir, ela é instalada quando você fechar o app.',
    buttons: ['Reiniciar agora', 'Depois'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) setImmediate(() => autoUpdater.quitAndInstall());
});

function startUpdates(windowGetter) {
  getWindow = windowGetter;
  if (!app.isPackaged) return; // rodando pelo código-fonte: não há instalador para atualizar
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 10 * 1000);
  setInterval(check, EVERY_MS);
}

function checkNow() {
  if (!app.isPackaged) {
    dialog.showMessageBox(getWindow(), { type: 'info', title: 'ScriptGen', message: 'Atualização só funciona no app instalado.' });
    return;
  }
  manual = true;
  autoUpdater.checkForUpdates().catch(() => {});
}

module.exports = { startUpdates, checkNow };

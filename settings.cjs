/**
 * Configurações do app (arquivo config.json na pasta de dados do app). Hoje: a pasta onde ficam os vídeos e imagens.
 * Sem dependências do Electron: dá para testar com Node.
 */
const fs = require('node:fs');
const path = require('node:path');

function createSettings(configFile, defaultRoot) {
  const read = () => { try { return JSON.parse(fs.readFileSync(configFile, 'utf8')) || {}; } catch { return {}; } };
  const write = data => { fs.mkdirSync(path.dirname(configFile), { recursive: true }); fs.writeFileSync(configFile, JSON.stringify(data, null, 2)); };
  return {
    /** Pasta atual dos arquivos (a escolhida, ou Documentos\ScriptGen). Se a escolhida sumiu, volta para a padrão. */
    root() {
      const chosen = read().root;
      return chosen && fs.existsSync(chosen) ? chosen : defaultRoot;
    },
    isDefault() { return this.root() === defaultRoot; },
    setRoot(dir) {
      if (!dir || !path.isAbsolute(dir)) throw new Error('Pasta inválida.');
      fs.mkdirSync(dir, { recursive: true });
      write({ ...read(), root: dir });
      return dir;
    },
    resetRoot() { const data = read(); delete data.root; write(data); return defaultRoot; },
    /** Notificações do Windows quando um vídeo ou imagem fica pronto (ligadas por padrão). */
    notify() { return read().notify !== false; },
    setNotify(on) { write({ ...read(), notify: !!on }); return !!on; },
  };
}

module.exports = { createSettings };

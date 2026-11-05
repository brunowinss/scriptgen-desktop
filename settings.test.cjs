const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSettings } = require('./settings.cjs');

test('pasta padrão, troca, volta ao padrão e ignora pasta que sumiu', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-set-'));
  const def = path.join(base, 'Documentos', 'ScriptGen');
  const s = createSettings(path.join(base, 'dados', 'config.json'), def);
  assert.equal(s.root(), def);
  assert.equal(s.isDefault(), true);
  const outra = path.join(base, 'HD', 'Videos ScriptGen');
  s.setRoot(outra);
  assert.equal(s.root(), outra);
  assert.equal(createSettings(path.join(base, 'dados', 'config.json'), def).root(), outra);
  fs.rmSync(outra, { recursive: true });
  assert.equal(s.root(), def);
  s.setRoot(outra);
  s.resetRoot();
  assert.equal(s.root(), def);
  assert.throws(() => s.setRoot('relativa'), /inválida/);
});

test('notificações: ligadas por padrão, e a escolha fica salva', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-not-'));
  const file = path.join(base, 'config.json');
  const s = createSettings(file, path.join(base, 'ScriptGen'));
  assert.equal(s.notify(), true);
  s.setNotify(false);
  assert.equal(createSettings(file, path.join(base, 'ScriptGen')).notify(), false);
  s.setNotify(true);
  assert.equal(s.notify(), true);
});

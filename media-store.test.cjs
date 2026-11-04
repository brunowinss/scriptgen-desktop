const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { saveMedia } = require('./media-store.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'scriptgen-'));
const fakeFetch = (bytes, type) => async () => ({ ok: true, status: 200, headers: new Map([['content-type', type], ['content-length', String(bytes.length)]]), arrayBuffer: async () => bytes });

test('grava o vídeo em Vídeos com data, nome e id, e não baixa de novo o mesmo id', async () => {
  const root = tmp();
  let calls = 0;
  const bytes = Buffer.alloc(2048, 1);
  const fetcher = async (...a) => { calls++; return fakeFetch(bytes, 'video/mp4')(...a); };
  const r = await saveMedia(root, { kind: 'video', id: 'abc-123', url: 'https://x.test/v.mp4?token=1', name: 'Kling 4.0 · 1080p', createdAt: '2026-11-04T10:00:00Z' }, fetcher);
  assert.equal(r.ok, true);
  assert.equal(path.basename(r.path), '2026-11-04_Kling-4-0-1080p_abc-123.mp4');
  assert.equal(path.dirname(r.path), path.join(root, 'Vídeos'));
  assert.equal(fs.statSync(r.path).size, 2048);
  const again = await saveMedia(root, { kind: 'video', id: 'abc-123', url: 'https://x.test/v.mp4', name: 'x' }, fetcher);
  assert.equal(again.skipped, true);
  assert.equal(calls, 1);
});

test('imagem em data URL vai para Imagens com a extensão certa', async () => {
  const root = tmp();
  const data = 'data:image/png;base64,' + Buffer.alloc(500, 7).toString('base64');
  const r = await saveMedia(root, { kind: 'image', id: 'img_1', url: data, name: 'Seedream 5.0 Pro' });
  assert.equal(r.ok, true);
  assert.match(path.basename(r.path), /_Seedream-5-0-Pro_img_1\.png$/);
  assert.equal(path.dirname(r.path), path.join(root, 'Imagens'));
});

test('recusa endereço que não é https nem data, e tipo desconhecido', async () => {
  const root = tmp();
  await assert.rejects(saveMedia(root, { kind: 'video', id: 'a1', url: 'file:///C:/Windows/win.ini', name: 'x' }), /não permitido/);
  assert.throws(() => require('./media-store.cjs').folderFor(root, 'exe'), /inválido/);
  const vazio = await saveMedia(root, { kind: 'video', id: '', url: 'https://x' });
  assert.equal(vazio.ok, false);
});

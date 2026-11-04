/**
 * Cópia local dos vídeos e imagens prontos: Documentos\ScriptGen\Vídeos e Documentos\ScriptGen\Imagens.
 * A nuvem (Supabase) continua igual; aqui só se guarda uma cópia no PC. Sem dependências do Electron: dá para testar com Node.
 */
const fs = require('node:fs');
const path = require('node:path');

const FOLDERS = { video: 'Vídeos', image: 'Imagens' };
const MAX_BYTES = 500 * 1024 * 1024;
const EXT = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

const safeId = id => String(id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
const slug = text => String(text || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'arquivo';

function folderFor(root, kind) {
  const name = FOLDERS[kind];
  if (!name) throw new Error('Tipo inválido.');
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Já existe um arquivo deste id? (o nome termina em _<id>.<ext>) */
function existing(dir, id) {
  const tail = `_${id}.`;
  return fs.readdirSync(dir).find(f => f.includes(tail) && !f.endsWith('.part')) || null;
}

function extFrom(mime, url, kind) {
  const clean = String(mime || '').split(';')[0].trim().toLowerCase();
  if (EXT[clean]) return EXT[clean];
  const m = /\.(mp4|mov|webm|jpe?g|png|webp|gif)(?:$|[?#])/i.exec(String(url || ''));
  if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
  return kind === 'video' ? 'mp4' : 'jpg';
}

async function readSource(url, fetcher) {
  if (/^data:/.test(url)) {
    const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(url);
    if (!m) throw new Error('Arquivo inválido.');
    const bytes = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]));
    return { bytes, mime: m[1] };
  }
  if (!/^https:\/\//i.test(url)) throw new Error('Endereço não permitido.');
  const res = await fetcher(url, { signal: AbortSignal.timeout(10 * 60 * 1000) });
  if (!res.ok) throw new Error(`Download falhou (${res.status}).`);
  const size = Number(res.headers.get('content-length') || 0);
  if (size > MAX_BYTES) throw new Error('Arquivo grande demais.');
  const bytes = Buffer.from(await res.arrayBuffer());
  return { bytes, mime: res.headers.get('content-type') };
}

/** Grava uma cópia; se o mesmo id já estiver na pasta, não baixa de novo. */
async function saveMedia(root, req, fetcher = fetch) {
  const kind = req && req.kind;
  const id = safeId(req && req.id);
  const url = String((req && req.url) || '');
  if (!id || !url) return { ok: false, error: 'Pedido incompleto.' };
  const dir = folderFor(root, kind);
  const found = existing(dir, id);
  if (found) return { ok: true, skipped: true, path: path.join(dir, found) };
  const { bytes, mime } = await readSource(url, fetcher);
  if (bytes.length > MAX_BYTES) throw new Error('Arquivo grande demais.');
  if (bytes.length < 100) throw new Error('Arquivo vazio.');
  const when = Number(req.createdAt) || Date.parse(req.createdAt) || Date.now();
  const file = `${new Date(when).toISOString().slice(0, 10)}_${slug(req.name)}_${id}.${extFrom(mime, url, kind)}`;
  const target = path.join(dir, file);
  const temp = `${target}.part`;
  fs.writeFileSync(temp, bytes);
  fs.renameSync(temp, target);
  return { ok: true, path: target };
}

module.exports = { saveMedia, folderFor, FOLDERS, slug, safeId };

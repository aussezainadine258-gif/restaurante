// Processamento e armazenamento das fotografias dos pratos.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const config = require('../config');
const { slugify } = require('../lib/utils');
const { ErroAplicacao } = require('../lib/erros');

const FORMATOS = new Set(['jpeg', 'jpg', 'png', 'webp', 'gif', 'avif']);

// Redimensiona para 1000x700, corrige a rotação EXIF e comprime em JPEG.
async function processarFoto(ficheiro, nomePrato) {
  if (!ficheiro || !ficheiro.buffer || !ficheiro.buffer.length) return null;
  try {
    const meta = await sharp(ficheiro.buffer).metadata();
    if (!meta.format || !FORMATOS.has(meta.format)) throw new Error('formato inválido');
    const base = slugify(nomePrato).slice(0, 50) || 'prato';
    const nome = `${base}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.jpg`;
    const destino = path.join(config.paths.uploads, nome);
    fs.mkdirSync(config.paths.uploads, { recursive: true });
    await sharp(ficheiro.buffer)
      .rotate()
      .resize(1000, 700, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 78, mozjpeg: true, progressive: true })
      .toFile(destino);
    return `/uploads/pratos/${nome}`;
  } catch {
    throw new ErroAplicacao('A fotografia enviada não é válida. Tente outro ficheiro.', 400, 'foto');
  }
}

// Apaga uma fotografia antiga, garantindo que o caminho fica dentro da pasta
// de uploads (evita path traversal).
function apagarFoto(caminhoPublico) {
  if (!caminhoPublico || !caminhoPublico.startsWith('/uploads/pratos/')) return;
  const nome = path.basename(caminhoPublico);
  const destino = path.resolve(config.paths.uploads, nome);
  const raiz = path.resolve(config.paths.uploads);
  if (!destino.startsWith(raiz + path.sep)) return;
  try {
    if (fs.existsSync(destino)) fs.rmSync(destino, { force: true });
  } catch {
    /* não impede a operação principal */
  }
}

module.exports = { processarFoto, apagarFoto };

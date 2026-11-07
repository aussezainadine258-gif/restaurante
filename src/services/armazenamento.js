// Armazenamento das fotografias e vídeos dos pratos.
//
// Com SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY configurados, os ficheiros são
// enviados para os buckets 'pratos' e 'videos-pratos' através da API REST do
// Supabase Storage. A chave service_role fica apenas no servidor Express —
// nunca é enviada para o browser.
//
// Sem credenciais Supabase, a aplicação usa uma pasta local em public/uploads,
// para o projeto continuar a funcionar em demonstração/desenvolvimento.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const config = require('../config');
const { ErroAplicacao } = require('../lib/erros');

const MIMES_FOTO = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const MIMES_VIDEO = new Map([
  ['video/mp4', 'mp4'],
  ['video/webm', 'webm'],
  ['video/quicktime', 'mov'],
  ['video/ogg', 'ogv']
]);

const MENSAGEM_VIDEO_GRANDE = 'Vídeo demasiado grande, comprime-o ou usa um mais curto';

function modo() {
  return config.supabase.ativo ? 'supabase' : 'local';
}

/* --------------------------------------------------------------- fotografias */

// Valida e normaliza a fotografia: largura máxima de 800px, JPEG qualidade 80.
// A compressão principal já é feita no browser; esta é uma segunda barreira.
async function processarFoto(ficheiro) {
  if (!ficheiro || !ficheiro.buffer || !ficheiro.buffer.length) return null;
  const mimetype = String(ficheiro.mimetype || '').toLowerCase();
  if (!MIMES_FOTO.has(mimetype)) {
    throw new ErroAplicacao('Envie uma imagem JPG, PNG, WEBP ou GIF.', 400, 'foto');
  }

  try {
    const meta = await sharp(ficheiro.buffer).metadata();
    if (!meta.format || !['jpeg', 'jpg', 'png', 'webp', 'gif', 'avif'].includes(meta.format)) {
      throw new Error('formato inválido');
    }
    const buffer = await sharp(ficheiro.buffer)
      .rotate()
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true, progressive: true })
      .toBuffer();
    return { buffer, contentType: 'image/jpeg', extensao: 'jpg' };
  } catch (erro) {
    if (erro instanceof ErroAplicacao) throw erro;
    throw new ErroAplicacao('A fotografia enviada não é válida. Tente outro ficheiro.', 400, 'foto');
  }
}

/* -------------------------------------------------------------------- vídeos */

// Confere a assinatura binária do ficheiro para não confiar apenas no MIME
// declarado pelo browser.
function assinaturaVideoValida(buffer, mimetype) {
  if (!buffer || buffer.length < 12) return false;
  if (mimetype === 'video/mp4' || mimetype === 'video/quicktime') {
    return buffer.toString('ascii', 4, 8) === 'ftyp';
  }
  if (mimetype === 'video/webm') {
    return buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
  }
  if (mimetype === 'video/ogg') {
    return buffer.toString('ascii', 0, 4) === 'OggS';
  }
  return false;
}

// Lê a duração de um MP4/MOV através da caixa mvhd (best effort).
function duracaoMp4(buffer) {
  const indice = buffer.indexOf('mvhd');
  if (indice < 0) return null;
  const inicio = indice - 4;
  if (inicio < 0 || inicio + 32 > buffer.length) return null;
  const versao = buffer[inicio + 8];
  let timescale;
  let duracao;
  if (versao === 1) {
    if (inicio + 44 > buffer.length) return null;
    timescale = buffer.readUInt32BE(inicio + 28);
    duracao = Number(buffer.readBigUInt64BE(inicio + 32));
  } else {
    timescale = buffer.readUInt32BE(inicio + 20);
    duracao = buffer.readUInt32BE(inicio + 24);
  }
  if (!timescale || !Number.isFinite(duracao)) return null;
  return duracao / timescale;
}

function lerVint(buffer, posicao) {
  if (posicao >= buffer.length) return null;
  const primeiro = buffer[posicao];
  let tamanho = 0;
  let mascara = 0x80;
  while (tamanho < 8 && !(primeiro & mascara)) {
    tamanho += 1;
    mascara >>= 1;
  }
  if (tamanho >= 8 || posicao + tamanho >= buffer.length) return null;
  let valor = primeiro & (mascara - 1);
  for (let i = 1; i <= tamanho; i += 1) {
    valor = valor * 256 + buffer[posicao + i];
  }
  return { valor, bytes: tamanho + 1 };
}

// Lê a duração de um WebM (elemento Duration do Matroska), best effort.
function duracaoWebm(buffer) {
  const alvo = Buffer.from([0x44, 0x89]);
  const indice = buffer.indexOf(alvo);
  if (indice < 0) return null;
  const tamanho = lerVint(buffer, indice + 2);
  if (!tamanho || tamanho.valor !== 4 && tamanho.valor !== 8) return null;
  const inicio = indice + 2 + tamanho.bytes;
  if (inicio + tamanho.valor > buffer.length) return null;
  const valor = tamanho.valor === 4 ? buffer.readFloatBE(inicio) : buffer.readDoubleBE(inicio);
  if (!Number.isFinite(valor) || valor <= 0) return null;

  let escala = 1000000; // TimecodeScale por omissão: 1 ms em nanossegundos.
  const escalaId = Buffer.from([0x2a, 0xd7, 0xb1]);
  const posEscala = buffer.indexOf(escalaId);
  if (posEscala >= 0) {
    const tamEscala = lerVint(buffer, posEscala + 3);
    if (tamEscala && tamEscala.valor > 0 && tamEscala.valor <= 8) {
      const inicioEscala = posEscala + 3 + tamEscala.bytes;
      if (inicioEscala + tamEscala.valor <= buffer.length) {
        let lido = 0;
        for (let i = 0; i < tamEscala.valor; i += 1) lido = lido * 256 + buffer[inicioEscala + i];
        if (lido > 0) escala = lido;
      }
    }
  }
  return (valor * escala) / 1e9;
}

function validarVideo(ficheiro) {
  if (!ficheiro || !ficheiro.buffer || !ficheiro.buffer.length) return null;
  const mimetype = String(ficheiro.mimetype || '').toLowerCase();
  const extensao = MIMES_VIDEO.get(mimetype);
  if (!extensao) {
    throw new ErroAplicacao('Envie um vídeo MP4, WEBM ou MOV.', 400, 'video');
  }
  if (ficheiro.size > config.videoMaxMb * 1024 * 1024) {
    throw new ErroAplicacao(MENSAGEM_VIDEO_GRANDE, 413, 'video');
  }
  if (!assinaturaVideoValida(ficheiro.buffer, mimetype)) {
    throw new ErroAplicacao('O vídeo enviado não é válido. Tente outro ficheiro.', 400, 'video');
  }

  let duracao = null;
  if (mimetype === 'video/mp4' || mimetype === 'video/quicktime') {
    duracao = duracaoMp4(ficheiro.buffer);
  } else if (mimetype === 'video/webm') {
    duracao = duracaoWebm(ficheiro.buffer);
  }
  if (duracao && duracao > config.videoMaxSegundos + 0.5) {
    throw new ErroAplicacao(MENSAGEM_VIDEO_GRANDE, 400, 'video');
  }

  return { buffer: ficheiro.buffer, contentType: mimetype, extensao };
}

/* ------------------------------------------------------------ Supabase/local */

async function enviarParaSupabase(bucket, nome, buffer, contentType) {
  const url = `${config.supabase.url}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeURIComponent(nome)}`;
  let resposta;
  try {
    resposta = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: config.supabase.serviceRoleKey,
        Authorization: `Bearer ${config.supabase.serviceRoleKey}`,
        'Content-Type': contentType,
        'Cache-Control': '31536000',
        'x-upsert': 'false'
      },
      body: buffer,
      signal: AbortSignal.timeout(25000)
    });
  } catch {
    throw new ErroAplicacao('Não foi possível ligar ao Supabase Storage. Tente novamente.', 502);
  }

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '');
    console.error('[STORAGE] Supabase recusou o envio:', resposta.status, detalhe.slice(0, 300));
    throw new ErroAplicacao('Não foi possível guardar o ficheiro no Supabase Storage.', 502);
  }

  return `${config.supabase.url}/storage/v1/object/public/${bucket}/${nome}`;
}

async function apagarDoSupabase(url) {
  if (!config.supabase.ativo || !url || !url.startsWith(config.supabase.url)) return;
  const buckets = [config.supabase.bucketFotos, config.supabase.bucketVideos];
  for (const bucket of buckets) {
    const marcador = `/storage/v1/object/public/${bucket}/`;
    const indice = url.indexOf(marcador);
    if (indice < 0) continue;
    const nome = decodeURIComponent(url.slice(indice + marcador.length).split('?')[0]);
    if (!nome || nome.includes('..')) return;
    try {
      await fetch(
        `${config.supabase.url}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeURIComponent(nome)}`,
        {
          method: 'DELETE',
          headers: {
            apikey: config.supabase.serviceRoleKey,
            Authorization: `Bearer ${config.supabase.serviceRoleKey}`
          },
          signal: AbortSignal.timeout(15000)
        }
      );
    } catch (erro) {
      console.error('[STORAGE] Não foi possível apagar no Supabase:', erro.message);
    }
    return;
  }
}

function guardarLocal(pasta, nome, buffer) {
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, nome), buffer);
}

function apagarLocal(url) {
  const pastas = [
    { prefixo: '/uploads/pratos/', pasta: config.paths.uploads },
    { prefixo: '/uploads/videos/', pasta: config.paths.videos }
  ];
  for (const { prefixo, pasta } of pastas) {
    if (!url.startsWith(prefixo)) continue;
    const nome = path.basename(url);
    const destino = path.resolve(pasta, nome);
    const raiz = path.resolve(pasta);
    if (!destino.startsWith(raiz + path.sep)) return;
    try {
      if (fs.existsSync(destino)) fs.rmSync(destino, { force: true });
    } catch {
      /* não impede a operação principal */
    }
    return;
  }
}

async function guardar(tipo, ficheiro) {
  if (!ficheiro || !ficheiro.buffer || !ficheiro.buffer.length) return null;

  const processado = tipo === 'foto' ? await processarFoto(ficheiro) : validarVideo(ficheiro);
  if (!processado) return null;

  const nome = `${crypto.randomUUID()}.${processado.extensao}`;

  if (config.supabase.ativo) {
    const bucket = tipo === 'foto' ? config.supabase.bucketFotos : config.supabase.bucketVideos;
    return enviarParaSupabase(bucket, nome, processado.buffer, processado.contentType);
  }

  if (tipo === 'foto') {
    guardarLocal(config.paths.uploads, nome, processado.buffer);
    return `/uploads/pratos/${nome}`;
  }
  guardarLocal(config.paths.videos, nome, processado.buffer);
  return `/uploads/videos/${nome}`;
}

function guardarFoto(ficheiro) {
  return guardar('foto', ficheiro);
}

function guardarVideo(ficheiro) {
  return guardar('video', ficheiro);
}

// Apaga um ficheiro antigo, quer esteja no Supabase quer esteja em /uploads.
async function apagarMedia(url) {
  if (!url) return;
  if (config.supabase.ativo && url.startsWith(config.supabase.url)) {
    await apagarDoSupabase(url);
    return;
  }
  apagarLocal(url);
}

module.exports = {
  modo,
  guardarFoto,
  guardarVideo,
  apagarMedia,
  processarFoto,
  validarVideo,
  MENSAGEM_VIDEO_GRANDE
};

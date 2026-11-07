// Upload de fotografias e vídeos em memória.
// A fotografia é normalizada com o sharp e o vídeo é validado antes de ser
// guardado no Supabase Storage (ou localmente, quando não há credenciais).
const multer = require('multer');
const config = require('../config');

const limiteMb = Math.max(config.uploadMaxMb, config.videoMaxMb);

const uploadMedia = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: limiteMb * 1024 * 1024,
    files: 2
  },
  fileFilter(req, file, callback) {
    if (file.fieldname === 'foto') {
      if (!/^image\/(jpeg|png|webp|gif|avif)$/i.test(file.mimetype)) {
        const erro = new Error('Envie uma imagem JPG, PNG, WEBP ou GIF.');
        erro.status = 400;
        erro.campo = 'foto';
        return callback(erro);
      }
      return callback(null, true);
    }

    if (file.fieldname === 'video') {
      if (!/^video\/(mp4|webm|quicktime|ogg)$/i.test(file.mimetype)) {
        const erro = new Error('Envie um vídeo MP4, WEBM ou MOV.');
        erro.status = 400;
        erro.campo = 'video';
        return callback(erro);
      }
      return callback(null, true);
    }

    const erro = new Error('Campo de ficheiro inválido.');
    erro.status = 400;
    return callback(erro);
  }
});

// Mantido para compatibilidade com integrações antigas que só enviavam foto.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.uploadMaxMb * 1024 * 1024,
    files: 1
  },
  fileFilter(req, file, callback) {
    if (!/^image\/(jpeg|png|webp|gif|avif)$/i.test(file.mimetype)) {
      const erro = new Error('Envie uma imagem JPG, PNG, WEBP ou GIF.');
      erro.status = 400;
      return callback(erro);
    }
    return callback(null, true);
  }
});

module.exports = { upload, uploadMedia };

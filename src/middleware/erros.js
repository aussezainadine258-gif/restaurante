// Tratamento central de erros. Responde em JSON nas APIs e com uma página
// amigável nas restantes rotas, sem expor detalhes internos em produção.
const config = require('../config');
const { ErroValidacao } = require('../lib/validacao');

function querJSON(req) {
  return (
    req.originalUrl.startsWith('/api') ||
    req.originalUrl.startsWith('/admin/api') ||
    req.originalUrl.startsWith('/cozinha/api') ||
    req.xhr
  );
}

function naoEncontrado(req, res) {
  if (querJSON(req)) return res.status(404).json({ erro: 'Recurso não encontrado.' });
  return res.status(404).render('erro', {
    titulo: 'Página não encontrada',
    mensagem: 'O endereço que tentou abrir não existe. Verifique o link ou o QR code da mesa.',
    status: 404
  });
}

// eslint-disable-next-line no-unused-vars
function tratarErro(erro, req, res, next) {
  let status = erro.status || 500;
  let mensagem = erro.message || 'Ocorreu um erro inesperado.';

  if (erro instanceof ErroValidacao) {
    status = 400;
  } else if (erro && erro.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    status = 409;
    mensagem = 'Já existe um registo com esses dados.';
  } else if (erro && erro.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    mensagem =
      erro.field === 'video'
        ? 'Vídeo demasiado grande, comprime-o ou usa um mais curto'
        : `A fotografia é demasiado grande. O limite é ${config.uploadMaxMb} MB.`;
  } else if (erro && erro.name === 'MulterError') {
    status = 400;
    mensagem = 'Não foi possível enviar o ficheiro. Verifique a fotografia ou o vídeo.';
  }

  if (status >= 500) {
    console.error('[ERRO]', req.method, req.originalUrl, erro);
    mensagem = 'Ocorreu um erro no servidor. Tente novamente.';
  }

  if (querJSON(req)) {
    return res.status(status).json({
      erro: mensagem,
      campo: erro.campo || null
    });
  }

  if (res.headersSent) return next(erro);
  return res.status(status).render('erro', {
    titulo: status === 403 ? 'Acesso negado' : status === 404 ? 'Não encontrado' : 'Algo correu mal',
    mensagem,
    status
  });
}

module.exports = { tratarErro, naoEncontrado };

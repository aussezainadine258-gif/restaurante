// Middleware de autenticação e autorização do painel e da cozinha.
const db = require('../db');
const { ErroAplicacao } = require('../lib/erros');

// Mantém a sessão sincronizada com a base de dados (utilizador desativado, etc.).
function carregarUtilizador(req, res, next) {
  const guardado = req.session && req.session.utilizador;
  if (!guardado) {
    req.utilizador = null;
    res.locals.utilizador = null;
    return next();
  }
  const user = db
    .prepare('SELECT id, nome, username, papel, deve_alterar_password, ativo FROM utilizadores WHERE id = ?')
    .get(guardado.id);
  if (!user || !user.ativo) {
    delete req.session.utilizador;
    req.utilizador = null;
    res.locals.utilizador = null;
    return next();
  }
  req.utilizador = user;
  res.locals.utilizador = user;
  return next();
}

function querJSON(req) {
  return req.originalUrl.startsWith('/admin/api') || req.originalUrl.startsWith('/cozinha/api') || req.originalUrl.startsWith('/api');
}

function exigirLogin(req, res, next) {
  if (!req.utilizador) {
    if (querJSON(req)) return res.status(401).json({ erro: 'Sessão expirada. Volte a iniciar sessão.' });
    return res.redirect('/admin/login');
  }
  return next();
}

function exigirAdmin(req, res, next) {
  if (!req.utilizador) {
    if (querJSON(req)) return res.status(401).json({ erro: 'Sessão expirada.' });
    return res.redirect('/admin/login');
  }
  if (req.utilizador.papel !== 'admin') {
    if (querJSON(req)) return res.status(403).json({ erro: 'Acesso reservado à gerência.' });
    return res.status(403).render('erro', {
      titulo: 'Acesso negado',
      mensagem: 'Esta área é reservada à gerência do restaurante.',
      status: 403
    });
  }
  return next();
}

function exigirCozinha(req, res, next) {
  if (!req.utilizador) {
    if (querJSON(req)) return res.status(401).json({ erro: 'Sessão expirada.' });
    return res.redirect('/admin/login');
  }
  if (!['admin', 'cozinha'].includes(req.utilizador.papel)) {
    if (querJSON(req)) return res.status(403).json({ erro: 'Acesso reservado à equipa.' });
    return res.status(403).render('erro', {
      titulo: 'Acesso negado',
      mensagem: 'Esta área é reservada à equipa do restaurante.',
      status: 403
    });
  }
  if (req.utilizador.deve_alterar_password) {
    if (querJSON(req)) {
      return res.status(403).json({ erro: 'É necessário alterar a password no painel antes de continuar.', codigo: 'TROCAR_PASSWORD' });
    }
    return res.redirect('/admin/password');
  }
  return next();
}

// Bloqueia o painel até o utilizador trocar a password inicial.
function exigirPasswordAlterada(req, res, next) {
  if (req.utilizador && req.utilizador.deve_alterar_password) {
    if (querJSON(req)) {
      return res.status(403).json({ erro: 'Altere a password inicial antes de continuar.', codigo: 'TROCAR_PASSWORD' });
    }
    return res.redirect('/admin/password');
  }
  return next();
}

module.exports = {
  carregarUtilizador,
  exigirLogin,
  exigirAdmin,
  exigirCozinha,
  exigirPasswordAlterada
};

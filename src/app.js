// Configuração do Express. Este módulo exporta também o middleware de sessão
// para ser reaproveitado pelo Socket.IO (autenticação em tempo real).
const path = require('path');
const express = require('express');
const session = require('express-session');
const config = require('./config');
const StorePostgres = require('./lib/session-store');
const { carregarUtilizador } = require('./middleware/auth');
const { cabecalhosSeguranca } = require('./middleware/seguranca');
const { tratarErro, naoEncontrado } = require('./middleware/erros');
const configuracoes = require('./services/configuracoes');
const { slugify, horaLocal, dataHoraLocal, formatarMZN } = require('./lib/utils');
const { consumirFlash } = require('./lib/flash');
const rotasPublicas = require('./routes/publico');

const app = express();

app.disable('x-powered-by');
if (config.isProduction) app.set('trust proxy', 1);

app.set('views', config.paths.views);
app.set('view engine', 'ejs');

app.use(cabecalhosSeguranca);

// Ficheiros estáticos primeiro (sem passar pela sessão, mais rápido).
app.use(
  express.static(config.paths.public, {
    maxAge: config.isProduction ? '7d' : 0,
    etag: true
  })
);

app.use(express.urlencoded({ extended: false, limit: '150kb' }));
app.use(express.json({ limit: '150kb' }));

const sessionMiddleware = session({
  name: 'sley.sid',
  store: new StorePostgres(),
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: 8 * 60 * 60 * 1000
  }
});

app.use(sessionMiddleware);
app.use(carregarUtilizador);

// Variáveis disponíveis em todas as views.
app.use(async (req, res, next) => {
  try {
    res.locals.restaurante = await configuracoes.nomeRestaurante();
    res.locals.ano = new Date().getFullYear();
    res.locals.caminho = req.path;
    res.locals.utilizador = req.utilizador || null;
    res.locals.titulo = 'Restaurante';
    res.locals.slugify = slugify;
    res.locals.horaLocal = horaLocal;
    res.locals.dataHoraLocal = dataHoraLocal;
    res.locals.formatarMZN = formatarMZN;
    res.locals.flash = req.session ? consumirFlash(req) : null;
    next();
  } catch (erro) {
    next(erro);
  }
});

app.use('/', rotasPublicas);

const rotasAdmin = require('./routes/admin');
const rotasCozinha = require('./routes/cozinha');
app.use('/admin', rotasAdmin);
app.use('/cozinha', rotasCozinha);

app.use(naoEncontrado);
app.use(tratarErro);

if (config.sessionSecret === 'troque-este-segredo-por-uma-frase-longa-e-aleatoria') {
  console.warn('[AVISO] Altere SESSION_SECRET no ficheiro .env antes de publicar o sistema.');
}

module.exports = { app, sessionMiddleware };

// Autenticação do painel, gestão da password, páginas e QR codes.
const bcrypt = require('bcrypt');
const qrcode = require('qrcode');
const { query } = require('../db');
const config = require('../config');
const mesas = require('../services/mesas');
const configuracoes = require('../services/configuracoes');
const Tentativas = require('../lib/tentativas');
const { ErroAplicacao } = require('../lib/erros');
const { definirFlash } = require('../lib/flash');
const validacao = require('../lib/validacao');

const tentativasLogin = new Tentativas({ max: 10, janelaMs: 15 * 60 * 1000 });
const HASH_FALSO = bcrypt.hashSync('hash-falso-apenas-para-tempo-de-resposta', 12);

function destinoPorPapel(utilizador) {
  if (utilizador.deve_alterar_password) return '/admin/password';
  return utilizador.papel === 'admin' ? '/admin' : '/cozinha';
}

function paginaLogin(req, res) {
  if (req.utilizador) return res.redirect(destinoPorPapel(req.utilizador));
  return res.render('admin/login', {
    titulo: 'Entrar',
    erro: null,
    username: '',
    saiu: req.query.saiu === '1'
  });
}

async function login(req, res, next) {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const chave = `${req.ip}:${username || 'vazio'}`;
    const estado = tentativasLogin.estado(chave);

    if (estado.bloqueado) {
      return res.status(429).render('admin/login', {
        titulo: 'Entrar',
        erro: `Demasiadas tentativas. Aguarde ${Math.ceil(estado.esperarSegundos / 60)} minuto(s).`,
        username,
        saiu: false
      });
    }

    if (!username || !password) {
      return res.status(400).render('admin/login', {
        titulo: 'Entrar',
        erro: 'Preencha o utilizador e a password.',
        username,
        saiu: false
      });
    }

    const { rows } = await query('SELECT * FROM utilizadores WHERE username = $1', [username]);
    const utilizador = rows[0];
    const valida = await bcrypt.compare(password, utilizador ? utilizador.password_hash : HASH_FALSO);

    if (!utilizador || !utilizador.ativo || !valida) {
      const depois = tentativasLogin.falhou(chave);
      return res.status(401).render('admin/login', {
        titulo: 'Entrar',
        erro: depois.bloqueado
          ? `Demasiadas tentativas. Aguarde ${Math.ceil(depois.esperarSegundos / 60)} minuto(s).`
          : 'Utilizador ou password incorretos.',
        username,
        saiu: false
      });
    }

    tentativasLogin.sucesso(chave);

    // Renova o ID de sessão para prevenir fixação de sessão.
    return req.session.regenerate((erroSessao) => {
      if (erroSessao) return next(erroSessao);
      req.session.utilizador = { id: utilizador.id };
      return req.session.save((erroGuardar) => {
        if (erroGuardar) return next(erroGuardar);
        return res.redirect(destinoPorPapel(utilizador));
      });
    });
  } catch (erro) {
    return next(erro);
  }
}

function logout(req, res) {
  const terminar = () => {
    res.clearCookie('sley.sid');
    res.redirect('/admin/login?saiu=1');
  };
  if (!req.session) return terminar();
  return req.session.destroy(() => terminar());
}

function paginaPassword(req, res) {
  if (!req.utilizador) return res.redirect('/admin/login');
  return res.render('admin/password', {
    titulo: 'Alterar password',
    erro: null
  });
}

async function alterarPassword(req, res, next) {
  try {
    if (!req.utilizador) return res.redirect('/admin/login');
    const atual = String(req.body.password_atual || '');
    const nova = String(req.body.password_nova || '');
    const confirmar = String(req.body.password_confirmar || '');
    const { rows } = await query('SELECT * FROM utilizadores WHERE id = $1', [req.utilizador.id]);
    const utilizador = rows[0];

    const renderErro = (mensagem) =>
      res.status(400).render('admin/password', { titulo: 'Alterar password', erro: mensagem });

    if (!utilizador) return res.redirect('/admin/login');
    if (!atual || !nova || !confirmar) return renderErro('Preencha todos os campos.');
    if (nova.length < 8) return renderErro('A nova password deve ter pelo menos 8 caracteres.');
    if (nova.length > 72) return renderErro('A nova password é demasiado longa (máximo 72 caracteres).');
    if (nova !== confirmar) return renderErro('A confirmação não coincide com a nova password.');
    if (nova === utilizador.username) return renderErro('A password não pode ser igual ao nome de utilizador.');
    if (nova === atual) return renderErro('A nova password tem de ser diferente da atual.');

    const confere = await bcrypt.compare(atual, utilizador.password_hash);
    if (!confere) return renderErro('A password atual está incorreta.');

    const hash = await bcrypt.hash(nova, 12);
    await query('UPDATE utilizadores SET password_hash = $1, deve_alterar_password = FALSE WHERE id = $2', [
      hash,
      utilizador.id
    ]);
    definirFlash(req, 'sucesso', 'Password atualizada com sucesso.');
    return res.redirect(utilizador.papel === 'admin' ? '/admin' : '/cozinha');
  } catch (erro) {
    return next(erro);
  }
}

async function painel(req, res, next) {
  try {
    const [configs, codigoMesaAtivo] = await Promise.all([
      configuracoes.listar(),
      configuracoes.codigoMesaAtivo()
    ]);
    return res.render('admin/painel', {
      titulo: 'Painel',
      configs,
      baseUrl: config.baseUrl,
      codigoMesaAtivo,
      uploadMaxMb: config.uploadMaxMb,
      videoMaxMb: config.videoMaxMb,
      videoMaxSegundos: config.videoMaxSegundos,
      supabaseAtivo: config.supabase.ativo
    });
  } catch (erro) {
    return next(erro);
  }
}

function urlDoMenu(numeroMesa) {
  return `${config.baseUrl}/menu?mesa=${numeroMesa}`;
}

const OPCOES_QR = {
  width: 900,
  margin: 2,
  errorCorrectionLevel: 'M',
  color: { dark: '#111111', light: '#FFFFFF' }
};

async function qrcodeMesa(req, res, next) {
  try {
    const id = validacao.id(req.params.id, 'mesa');
    const mesa = await mesas.obterMesaPorId(id);
    if (!mesa) throw new ErroAplicacao('Mesa não encontrada.', 404);
    const imagem = await qrcode.toBuffer(urlDoMenu(mesa.numero), { ...OPCOES_QR, type: 'png' });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="mesa-${mesa.numero}-qrcode.png"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(imagem);
  } catch (erro) {
    return next(erro);
  }
}

async function qrcodesParaImprimir(req, res, next) {
  try {
    const lista = await mesas.listarMesas();
    const cartoes = await Promise.all(
      lista.map(async (mesa) => ({
        ...mesa,
        url: urlDoMenu(mesa.numero),
        imagem: await qrcode.toDataURL(urlDoMenu(mesa.numero), OPCOES_QR)
      }))
    );
    return res.render('admin/qrcodes', {
      titulo: 'Imprimir QR codes',
      mesas: cartoes,
      baseUrl: config.baseUrl
    });
  } catch (erro) {
    return next(erro);
  }
}

module.exports = {
  paginaLogin,
  login,
  logout,
  paginaPassword,
  alterarPassword,
  painel,
  qrcodeMesa,
  qrcodesParaImprimir
};

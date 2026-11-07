// Controllers do lado do cliente: menu, carrinho/pedidos e acompanhamento.
const db = require('../db');
const configuracoes = require('../services/configuracoes');
const mesas = require('../services/mesas');
const pedidos = require('../services/pedidos');
const chamadas = require('../services/chamadas');
const gostos = require('../services/gostos');
const realtime = require('../lib/realtime');
const validacao = require('../lib/validacao');
const Tentativas = require('../lib/tentativas');
const { ErroAplicacao } = require('../lib/erros');
const { parseEtiquetas, formatarMZN, dataHoraLocal } = require('../lib/utils');

const tentativasCodigo = new Tentativas({ max: 8, janelaMs: 10 * 60 * 1000 });

const ROTULOS_ETIQUETA = {
  vegetariano: 'Vegetariano',
  picante: 'Picante',
  novo: 'Novo',
  'mais pedido': 'Mais pedido'
};

function carregarMenu() {
  const categorias = db
    .prepare('SELECT id, nome FROM categorias WHERE ativo = 1 ORDER BY ordem ASC, nome ASC')
    .all();
  const pratos = db
    .prepare(`
      SELECT p.*, c.nome AS categoria_nome
      FROM pratos p
      JOIN categorias c ON c.id = p.categoria_id
      WHERE c.ativo = 1
      ORDER BY p.nome ASC
    `)
    .all();

  const porCategoria = new Map(categorias.map((c) => [c.id, { ...c, pratos: [] }]));
  for (const prato of pratos) {
    const categoria = porCategoria.get(prato.categoria_id);
    if (!categoria) continue;
    const etiquetas = parseEtiquetas(prato.etiquetas);
    categoria.pratos.push({
      id: prato.id,
      nome: prato.nome,
      descricao: prato.descricao,
      preco_centavos: prato.preco_centavos,
      preco_formatado: formatarMZN(prato.preco_centavos),
      foto: prato.foto_url || prato.foto || '/img/prato-placeholder.svg',
      foto_url: prato.foto_url || prato.foto || '/img/prato-placeholder.svg',
      video_url: prato.video_url || null,
      tempo_preparo: prato.tempo_preparo,
      disponivel: Boolean(prato.disponivel),
      gostos: Number(prato.gostos) || 0,
      criado_em: prato.criado_em,
      etiquetas: etiquetas.map((chave) => ({ chave, rotulo: ROTULOS_ETIQUETA[chave] || chave }))
    });
  }

  return [...porCategoria.values()].filter((c) => c.pratos.length > 0);
}

// Ordem do feed: mais gostados e mais recentes primeiro, com uma pequena
// componente aleatória para o feed não parecer sempre igual.
function ordenarFeed(pratos) {
  const agora = Date.now();
  return pratos
    .map((prato) => {
      const criado = new Date(prato.criado_em || 0).getTime();
      const idadeDias = Number.isFinite(criado) ? Math.max(0, (agora - criado) / 86400000) : 9999;
      const recencia = 1 / (1 + idadeDias);
      const aleatorio = Math.random() * 8;
      return { prato, pontuacao: (Number(prato.gostos) || 0) * 100 + recencia * 40 + aleatorio };
    })
    .sort((a, b) => b.pontuacao - a.pontuacao)
    .map((entrada) => entrada.prato);
}

function paginaInicial(req, res) {
  return res.redirect('/menu');
}

function paginaMenu(req, res, next) {
  try {
    const bruto = req.query.mesa;
    if (bruto === undefined || bruto === '') {
      return res.render('sem-mesa', { titulo: 'Escolha a sua mesa' });
    }
    const numero = validacao.inteiro(bruto, { min: 1, max: 999, campo: 'mesa' });
    const mesa = mesas.obterMesaPorNumero(numero);
    if (!mesa) {
      return res.status(404).render('erro', {
        titulo: 'Mesa não encontrada',
        mensagem: `Não encontrámos a Mesa ${numero}. Confirme o número da mesa ou chame um empregado.`,
        status: 404
      });
    }

    if (!mesa.ativa) {
      return res.status(403).render('mesa-inativa', {
        titulo: 'Mesa por ativar',
        mesa
      });
    }

    const exigeCodigo = configuracoes.codigoMesaAtivo();
    const categorias = carregarMenu();
    const feed = ordenarFeed(categorias.flatMap((categoria) => categoria.pratos));
    return res.render('menu', {
      titulo: `Mesa ${mesa.numero}`,
      mesa,
      exigeCodigo,
      categorias,
      feed,
      nomeRestaurante: configuracoes.nomeRestaurante()
    });
  } catch (erro) {
    return next(erro);
  }
}

function paginaAcompanhar(req, res, next) {
  try {
    const token = String(req.query.token || '');
    if (!token) {
      return res.status(400).render('erro', {
        titulo: 'Link inválido',
        mensagem: 'Falta o identificador da sessão. Volte a abrir o menu da mesa.',
        status: 400
      });
    }
    const resumo = mesas.resumoPorToken(token);
    return res.render('acompanhar', {
      titulo: `Mesa ${resumo.mesa.numero} · Acompanhar`,
      token,
      resumo,
      nomeRestaurante: configuracoes.nomeRestaurante()
    });
  } catch (erro) {
    return next(erro);
  }
}

// Confirma o código de 4 dígitos e devolve o token da sessão da mesa.
function apiVerificarMesa(req, res, next) {
  try {
    const numero = validacao.inteiro(req.body.mesa, { min: 1, max: 999, campo: 'mesa' });
    const codigo = String(req.body.codigo || '').trim();
    const exigeCodigo = configuracoes.codigoMesaAtivo();
    const chave = `${req.ip}:${numero}`;

    if (exigeCodigo) {
      const estado = tentativasCodigo.estado(chave);
      if (estado.bloqueado) {
        throw new ErroAplicacao(
          `Demasiadas tentativas. Aguarde ${Math.ceil(estado.esperarSegundos / 60)} minuto(s) e tente novamente.`,
          429
        );
      }
    }

    try {
      const acesso = mesas.verificarAcessoMesa(numero, codigo);
      if (exigeCodigo) tentativasCodigo.sucesso(chave);
      return res.json({
        ok: true,
        mesa: { id: acesso.mesa.id, numero: acesso.mesa.numero },
        sessao: {
          id: acesso.sessao.id,
          token: acesso.sessao.token,
          aberta_em: acesso.sessao.aberta_em
        },
        exigeCodigo: acesso.exigeCodigo
      });
    } catch (erro) {
      if (exigeCodigo && erro.status === 403) {
        const estado = tentativasCodigo.falhou(chave);
        if (estado.bloqueado) {
          throw new ErroAplicacao(
            `Demasiadas tentativas. Aguarde ${Math.ceil(estado.esperarSegundos / 60)} minuto(s) e tente novamente.`,
            429
          );
        }
        throw new ErroAplicacao(
          `Código incorreto. Restam ${estado.restantes} tentativa(s).`,
          403,
          'codigo'
        );
      }
      throw erro;
    }
  } catch (erro) {
    return next(erro);
  }
}

// Estado público mínimo da mesa, usado pela página de espera.
function apiEstadoMesa(req, res, next) {
  try {
    const numero = validacao.inteiro(req.params.numero, { min: 1, max: 999, campo: 'mesa' });
    const mesa = mesas.obterMesaPorNumero(numero);
    if (!mesa) throw new ErroAplicacao('Mesa não encontrada.', 404);
    return res.json({
      numero: mesa.numero,
      ativa: Boolean(mesa.ativa),
      exigeCodigo: configuracoes.codigoMesaAtivo()
    });
  } catch (erro) {
    return next(erro);
  }
}

function apiResumoSessao(req, res, next) {
  try {
    const resumo = mesas.resumoPorToken(req.params.token);
    return res.json(resumo);
  } catch (erro) {
    return next(erro);
  }
}

function apiCriarPedido(req, res, next) {
  try {
    const pedido = pedidos.criarPedido({
      token: req.body.token,
      itens: req.body.itens,
      observacoes: req.body.observacoes
    });
    realtime.novoPedido(pedido);
    return res.status(201).json({ ok: true, pedido });
  } catch (erro) {
    return next(erro);
  }
}

function apiCriarChamada(req, res, next) {
  try {
    const chamada = chamadas.criarChamada(req.body.token, req.body.tipo);
    realtime.novaChamada(chamada);
    return res.status(201).json({
      ok: true,
      chamada,
      mensagem:
        chamada.tipo === 'conta'
          ? 'Pedido de conta enviado. Um empregado vem ter consigo.'
          : 'Empregado chamado. Aguarde um momento.'
    });
  } catch (erro) {
    return next(erro);
  }
}

// Gosto/desgosto de um prato pela sessão da mesa (um por sessão).
function apiAlternarGosto(req, res, next) {
  try {
    const pratoId = validacao.inteiro(req.params.id, { min: 1, campo: 'prato' });
    const resultado = gostos.alternarGosto(req.body.token, pratoId);
    return res.json({ ok: true, ...resultado });
  } catch (erro) {
    return next(erro);
  }
}

// Pequena página de diagnóstico (não expõe dados sensíveis).
function saude(req, res) {
  try {
    db.prepare('SELECT 1').get();
    return res.json({ ok: true, hora: dataHoraLocal(new Date().toISOString()) });
  } catch {
    return res.status(500).json({ ok: false });
  }
}

module.exports = {
  paginaInicial,
  paginaMenu,
  paginaAcompanhar,
  apiVerificarMesa,
  apiEstadoMesa,
  apiResumoSessao,
  apiCriarPedido,
  apiCriarChamada,
  apiAlternarGosto,
  saude
};

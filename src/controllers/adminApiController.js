// APIs JSON do painel da gerência.
const bcrypt = require('bcrypt');
const db = require('../db');
const config = require('../config');
const mesas = require('../services/mesas');
const pedidos = require('../services/pedidos');
const chamadas = require('../services/chamadas');
const configuracoes = require('../services/configuracoes');
const { guardarFoto, guardarVideo, apagarMedia } = require('../services/armazenamento');
const realtime = require('../lib/realtime');
const validacao = require('../lib/validacao');
const { ErroAplicacao } = require('../lib/erros');
const { parseEtiquetas, formatarMZN, ESTADOS_PEDIDO } = require('../lib/utils');

const FOTO_PADRAO = '/img/prato-placeholder.svg';

function serializarPrato(linha) {
  if (!linha) return null;
  const fotoUrl = linha.foto_url || linha.foto || FOTO_PADRAO;
  return {
    id: linha.id,
    nome: linha.nome,
    descricao: linha.descricao,
    preco_centavos: linha.preco_centavos,
    preco_formatado: formatarMZN(linha.preco_centavos),
    foto: fotoUrl,
    foto_url: fotoUrl,
    video_url: linha.video_url || null,
    tempo_preparo: linha.tempo_preparo,
    categoria_id: linha.categoria_id,
    categoria_nome: linha.categoria_nome || null,
    disponivel: Boolean(linha.disponivel),
    etiquetas: parseEtiquetas(linha.etiquetas),
    criado_em: linha.criado_em,
    atualizado_em: linha.atualizado_em
  };
}

function ficheiroEnviado(req, campo) {
  const ficheiros = req.files && req.files[campo];
  return Array.isArray(ficheiros) && ficheiros.length ? ficheiros[0] : null;
}

function obterPratoCompleto(id) {
  const linha = db
    .prepare(`
      SELECT p.*, c.nome AS categoria_nome
      FROM pratos p JOIN categorias c ON c.id = p.categoria_id
      WHERE p.id = ?
    `)
    .get(id);
  return serializarPrato(linha);
}

/* ------------------------------------------------------------------ pedidos */

function painelPedidos(req, res) {
  const estado = String(req.query.estado || 'ativos');
  const lista = pedidos.listarPedidos({ estado, limite: 200 });
  return res.json({
    pedidos: lista,
    resumo: pedidos.resumoPainel(),
    chamadas: chamadas.listarChamadas('pendente')
  });
}

function mudarEstadoPedido(req, res) {
  const id = validacao.id(req.params.id, 'pedido');
  const novo = String(req.body.estado || '');
  if (!ESTADOS_PEDIDO.includes(novo)) throw new ErroAplicacao('Estado inválido.', 400, 'estado');
  const pedido = pedidos.atualizarEstado(id, novo);
  realtime.pedidoAtualizado(pedido);
  return res.json({ ok: true, pedido, resumo: pedidos.resumoPainel() });
}

function resolverChamada(req, res) {
  const id = validacao.id(req.params.id, 'chamada');
  const chamada = chamadas.resolverChamada(id);
  realtime.chamadaResolvida(chamada);
  return res.json({ ok: true, chamada, resumo: pedidos.resumoPainel() });
}

/* --------------------------------------------------------------------- menu */

function listarMenu(req, res) {
  const categorias = db
    .prepare(`
      SELECT c.*, (SELECT COUNT(*) FROM pratos p WHERE p.categoria_id = c.id) AS total_pratos
      FROM categorias c ORDER BY c.ordem ASC, c.nome ASC
    `)
    .all()
    .map((c) => ({ ...c, ativo: Boolean(c.ativo), total_pratos: c.total_pratos }));
  const pratos = db
    .prepare(`
      SELECT p.*, c.nome AS categoria_nome
      FROM pratos p JOIN categorias c ON c.id = p.categoria_id
      ORDER BY c.ordem ASC, p.nome ASC
    `)
    .all()
    .map(serializarPrato);
  return res.json({ categorias, pratos });
}

function criarCategoria(req, res) {
  const nome = validacao.texto(req.body.nome, { min: 2, max: 40, obrigatorio: true, campo: 'nome' });
  const ordem = validacao.inteiro(req.body.ordem, { min: 0, max: 999, obrigatorio: false, campo: 'ordem' }) || 0;
  const existente = db.prepare('SELECT id FROM categorias WHERE lower(nome) = lower(?)').get(nome);
  if (existente) throw new ErroAplicacao('Já existe uma categoria com esse nome.', 409);
  const info = db
    .prepare('INSERT INTO categorias (nome, ordem, ativo, criado_em) VALUES (?, ?, 1, ?)')
    .run(nome, ordem, new Date().toISOString());
  realtime.menuAtualizado();
  return res.status(201).json({
    ok: true,
    categoria: { id: info.lastInsertRowid, nome, ordem, ativo: true, total_pratos: 0 }
  });
}

function atualizarCategoria(req, res) {
  const id = validacao.id(req.params.id, 'categoria');
  const categoria = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
  if (!categoria) throw new ErroAplicacao('Categoria não encontrada.', 404);
  const nome = validacao.texto(req.body.nome, { min: 2, max: 40, obrigatorio: true, campo: 'nome' });
  const ordem = validacao.inteiro(req.body.ordem, { min: 0, max: 999, obrigatorio: false, campo: 'ordem' }) || 0;
  const duplicada = db
    .prepare('SELECT id FROM categorias WHERE lower(nome) = lower(?) AND id != ?')
    .get(nome, id);
  if (duplicada) throw new ErroAplicacao('Já existe uma categoria com esse nome.', 409);
  db.prepare('UPDATE categorias SET nome = ?, ordem = ? WHERE id = ?').run(nome, ordem, id);
  realtime.menuAtualizado();
  return res.json({ ok: true, categoria: { ...categoria, nome, ordem, ativo: Boolean(categoria.ativo) } });
}

function eliminarCategoria(req, res) {
  const id = validacao.id(req.params.id, 'categoria');
  const categoria = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
  if (!categoria) throw new ErroAplicacao('Categoria não encontrada.', 404);
  const total = db.prepare('SELECT COUNT(*) AS total FROM pratos WHERE categoria_id = ?').get(id).total;
  if (total > 0) {
    throw new ErroAplicacao('Mova ou elimine os pratos desta categoria antes de a apagar.', 409);
  }
  db.prepare('DELETE FROM categorias WHERE id = ?').run(id);
  realtime.menuAtualizado();
  return res.json({ ok: true });
}

function camposDoPrato(req) {
  const nome = validacao.texto(req.body.nome, { min: 2, max: 80, obrigatorio: true, campo: 'nome' });
  const descricao = validacao.textoLongo(req.body.descricao, { max: 300, campo: 'descrição' });
  const precoCentavos = validacao.precoParaCentavos(req.body.preco, 'preço');
  const tempo = validacao.inteiro(req.body.tempo_preparo, {
    min: 1,
    max: 180,
    obrigatorio: true,
    campo: 'tempo de preparo'
  });
  const categoriaId = validacao.id(req.body.categoria_id, 'categoria');
  const categoria = db.prepare('SELECT id FROM categorias WHERE id = ?').get(categoriaId);
  if (!categoria) throw new ErroAplicacao('A categoria escolhida não existe.', 400, 'categoria');
  const etiquetas = validacao.etiquetas(req.body.etiquetas);
  const disponivel = validacao.booleano(req.body.disponivel);
  return { nome, descricao, precoCentavos, tempo, categoriaId, etiquetas, disponivel };
}

async function criarPrato(req, res) {
  const campos = camposDoPrato(req);
  const fotoUrl = await guardarFoto(ficheiroEnviado(req, 'foto'));
  let videoUrl = null;
  try {
    videoUrl = await guardarVideo(ficheiroEnviado(req, 'video'));
    const agora = new Date().toISOString();
    const info = db
      .prepare(`
        INSERT INTO pratos
          (nome, descricao, preco_centavos, foto, foto_url, video_url, tempo_preparo, categoria_id, disponivel, etiquetas, criado_em, atualizado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        campos.nome,
        campos.descricao,
        campos.precoCentavos,
        fotoUrl,
        fotoUrl,
        videoUrl,
        campos.tempo,
        campos.categoriaId,
        campos.disponivel ? 1 : 0,
        JSON.stringify(campos.etiquetas),
        agora,
        agora
      );
    realtime.menuAtualizado();
    return res.status(201).json({ ok: true, prato: obterPratoCompleto(info.lastInsertRowid) });
  } catch (erro) {
    if (fotoUrl) await apagarMedia(fotoUrl);
    if (videoUrl) await apagarMedia(videoUrl);
    throw erro;
  }
}

async function atualizarPrato(req, res) {
  const id = validacao.id(req.params.id, 'prato');
  const atual = db.prepare('SELECT * FROM pratos WHERE id = ?').get(id);
  if (!atual) throw new ErroAplicacao('Prato não encontrado.', 404);
  const campos = camposDoPrato(req);

  const fotoAtual = atual.foto_url || atual.foto || null;
  const videoAtual = atual.video_url || null;
  const removerFoto = validacao.booleano(req.body.remover_foto);
  const removerVideo = validacao.booleano(req.body.remover_video);

  const novaFotoUrl = await guardarFoto(ficheiroEnviado(req, 'foto'));
  let novoVideoUrl = null;
  try {
    novoVideoUrl = await guardarVideo(ficheiroEnviado(req, 'video'));
    const fotoFinal = novaFotoUrl || (removerFoto ? null : fotoAtual);
    const videoFinal = novoVideoUrl || (removerVideo ? null : videoAtual);

    db.prepare(`
      UPDATE pratos SET
        nome = ?, descricao = ?, preco_centavos = ?, foto = ?, foto_url = ?, video_url = ?,
        tempo_preparo = ?, categoria_id = ?, disponivel = ?, etiquetas = ?, atualizado_em = ?
      WHERE id = ?
    `).run(
      campos.nome,
      campos.descricao,
      campos.precoCentavos,
      fotoFinal,
      fotoFinal,
      videoFinal,
      campos.tempo,
      campos.categoriaId,
      campos.disponivel ? 1 : 0,
      JSON.stringify(campos.etiquetas),
      new Date().toISOString(),
      id
    );

    // Só apaga o ficheiro antigo depois de a base de dados confirmar a mudança.
    if (fotoAtual && fotoAtual !== fotoFinal) await apagarMedia(fotoAtual);
    if (videoAtual && videoAtual !== videoFinal) await apagarMedia(videoAtual);

    realtime.menuAtualizado();
    return res.json({ ok: true, prato: obterPratoCompleto(id) });
  } catch (erro) {
    if (novaFotoUrl) await apagarMedia(novaFotoUrl);
    if (novoVideoUrl) await apagarMedia(novoVideoUrl);
    throw erro;
  }
}

function alternarDisponibilidade(req, res) {
  const id = validacao.id(req.params.id, 'prato');
  const prato = db.prepare('SELECT * FROM pratos WHERE id = ?').get(id);
  if (!prato) throw new ErroAplicacao('Prato não encontrado.', 404);
  const disponivel = validacao.booleano(req.body.disponivel);
  db.prepare('UPDATE pratos SET disponivel = ?, atualizado_em = ? WHERE id = ?').run(
    disponivel ? 1 : 0,
    new Date().toISOString(),
    id
  );
  realtime.menuAtualizado();
  return res.json({ ok: true, prato: obterPratoCompleto(id) });
}

async function eliminarPrato(req, res) {
  const id = validacao.id(req.params.id, 'prato');
  const prato = db.prepare('SELECT * FROM pratos WHERE id = ?').get(id);
  if (!prato) throw new ErroAplicacao('Prato não encontrado.', 404);
  db.prepare('DELETE FROM pratos WHERE id = ?').run(id);
  await apagarMedia(prato.foto_url || prato.foto);
  await apagarMedia(prato.video_url);
  realtime.menuAtualizado();
  return res.json({ ok: true });
}

/* -------------------------------------------------------------------- mesas */

function listarMesas(req, res) {
  return res.json({
    mesas: mesas.listarMesas(),
    codigo_ativo: configuracoes.codigoMesaAtivo()
  });
}

function ativarMesa(req, res) {
  const id = validacao.id(req.params.id, 'mesa');
  const resultado = mesas.ativarMesa(id);
  realtime.mesaAtualizada({ id: resultado.mesa.id, numero: resultado.mesa.numero, ativa: true });
  return res.json({
    ok: true,
    nova: resultado.nova,
    mesa: {
      id: resultado.mesa.id,
      numero: resultado.mesa.numero,
      codigo: resultado.mesa.codigo,
      ativa: true
    },
    sessao: { token: resultado.sessao.token, aberta_em: resultado.sessao.aberta_em },
    codigo_ativo: configuracoes.codigoMesaAtivo()
  });
}

function contaDaMesa(req, res) {
  const id = validacao.id(req.params.id, 'mesa');
  const mesa = mesas.obterMesaPorId(id);
  if (!mesa) throw new ErroAplicacao('Mesa não encontrada.', 404);
  const sessao = mesas.obterSessaoAberta(id);
  if (!sessao) {
    return res.json({
      aberta: false,
      mesa: { id: mesa.id, numero: mesa.numero, ativa: Boolean(mesa.ativa) }
    });
  }
  const resumo = mesas.resumoPorToken(sessao.token);
  return res.json({
    aberta: true,
    mesa: { id: mesa.id, numero: mesa.numero, ativa: Boolean(mesa.ativa) },
    resumo,
    chamadas: chamadas.listarChamadas('pendente').filter((c) => c.mesa_id === id)
  });
}

function fecharMesa(req, res) {
  const id = validacao.id(req.params.id, 'mesa');
  const forcar = validacao.booleano(req.body.forcar);
  const resultado = mesas.fecharMesa(id, forcar);
  if (!resultado.jaFechada) {
    realtime.sessaoFechada(resultado.sessao.token, {
      mesa_numero: resultado.mesa.numero,
      total_formatado: resultado.resumo ? resultado.resumo.total_formatado : '0,00 MT'
    });
    realtime.mesaAtualizada({ id: resultado.mesa.id, numero: resultado.mesa.numero, ativa: false });
  }
  return res.json({
    ok: true,
    ja_fechada: resultado.jaFechada,
    total_formatado: resultado.resumo ? resultado.resumo.total_formatado : '0,00 MT',
    resumo: resultado.resumo
  });
}

/* --------------------------------------------------------------- definições */

function obterConfiguracoes(req, res) {
  return res.json({
    ...configuracoes.listar(),
    base_url: config.baseUrl
  });
}

function guardarConfiguracoes(req, res) {
  const nome = validacao.texto(req.body.nome_restaurante, {
    min: 2,
    max: 60,
    obrigatorio: true,
    campo: 'nome do restaurante'
  });
  const codigoAtivo = validacao.booleano(req.body.codigo_mesa_ativo);
  configuracoes.definir('nome_restaurante', nome);
  configuracoes.definir('codigo_mesa_ativo', codigoAtivo ? '1' : '0');
  realtime.configuracoesAtualizadas();
  return res.json({
    ok: true,
    configuracoes: { ...configuracoes.listar(), base_url: config.baseUrl }
  });
}

function listarUtilizadores(req, res) {
  const lista = db
    .prepare(`
      SELECT id, nome, username, papel, deve_alterar_password, ativo, criado_em
      FROM utilizadores ORDER BY papel ASC, nome ASC
    `)
    .all()
    .map((u) => ({ ...u, ativo: Boolean(u.ativo), deve_alterar_password: Boolean(u.deve_alterar_password) }));
  return res.json({ utilizadores: lista });
}

async function criarUtilizador(req, res) {
  const nome = validacao.texto(req.body.nome, { min: 2, max: 60, obrigatorio: true, campo: 'nome' });
  const username = validacao
    .texto(req.body.username, { min: 3, max: 30, obrigatorio: true, campo: 'utilizador' })
    .toLowerCase();
  const password = String(req.body.password || '');
  const papel = String(req.body.papel || '');

  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    throw new ErroAplicacao('O utilizador só pode ter letras, números, ponto, hífen e underscore.', 400, 'username');
  }
  if (password.length < 8) throw new ErroAplicacao('A password deve ter pelo menos 8 caracteres.', 400, 'password');
  if (password.length > 72) throw new ErroAplicacao('A password é demasiado longa.', 400, 'password');
  if (!['admin', 'cozinha'].includes(papel)) throw new ErroAplicacao('Papel inválido.', 400, 'papel');

  const existente = db.prepare('SELECT id FROM utilizadores WHERE lower(username) = lower(?)').get(username);
  if (existente) throw new ErroAplicacao('Já existe um utilizador com esse nome.', 409, 'username');

  const hash = await bcrypt.hash(password, 12);
  const info = db
    .prepare(`
      INSERT INTO utilizadores (nome, username, password_hash, papel, deve_alterar_password, ativo, criado_em)
      VALUES (?, ?, ?, ?, 1, 1, ?)
    `)
    .run(nome, username, hash, papel, new Date().toISOString());

  realtime.utilizadoresAtualizados();
  return res.status(201).json({
    ok: true,
    utilizador: {
      id: info.lastInsertRowid,
      nome,
      username,
      papel,
      ativo: true,
      deve_alterar_password: true
    }
  });
}

function alternarUtilizador(req, res) {
  const id = validacao.id(req.params.id, 'utilizador');
  const utilizador = db.prepare('SELECT * FROM utilizadores WHERE id = ?').get(id);
  if (!utilizador) throw new ErroAplicacao('Utilizador não encontrado.', 404);
  const ativo = validacao.booleano(req.body.ativo);

  if (!ativo && id === req.utilizador.id) {
    throw new ErroAplicacao('Não pode desativar a sua própria conta.', 400);
  }
  if (!ativo && utilizador.papel === 'admin') {
    const admins = db.prepare("SELECT COUNT(*) AS total FROM utilizadores WHERE papel = 'admin' AND ativo = 1").get().total;
    if (admins <= 1) throw new ErroAplicacao('Tem de existir pelo menos um administrador ativo.', 409);
  }

  db.prepare('UPDATE utilizadores SET ativo = ? WHERE id = ?').run(ativo ? 1 : 0, id);
  realtime.utilizadoresAtualizados();
  return res.json({
    ok: true,
    utilizador: { ...utilizador, password_hash: undefined, ativo, deve_alterar_password: Boolean(utilizador.deve_alterar_password) }
  });
}

async function reporPassword(req, res) {
  const id = validacao.id(req.params.id, 'utilizador');
  const utilizador = db.prepare('SELECT * FROM utilizadores WHERE id = ?').get(id);
  if (!utilizador) throw new ErroAplicacao('Utilizador não encontrado.', 404);
  const password = String(req.body.password || '');
  if (password.length < 8) throw new ErroAplicacao('A password deve ter pelo menos 8 caracteres.', 400, 'password');
  if (password.length > 72) throw new ErroAplicacao('A password é demasiado longa.', 400, 'password');
  const hash = await bcrypt.hash(password, 12);
  db.prepare('UPDATE utilizadores SET password_hash = ?, deve_alterar_password = 1 WHERE id = ?').run(hash, id);
  realtime.utilizadoresAtualizados();
  return res.json({ ok: true, mensagem: 'Password reposta. O utilizador terá de a alterar no próximo login.' });
}

module.exports = {
  painelPedidos,
  mudarEstadoPedido,
  resolverChamada,
  listarMenu,
  criarCategoria,
  atualizarCategoria,
  eliminarCategoria,
  criarPrato,
  atualizarPrato,
  alternarDisponibilidade,
  eliminarPrato,
  listarMesas,
  ativarMesa,
  contaDaMesa,
  fecharMesa,
  obterConfiguracoes,
  guardarConfiguracoes,
  listarUtilizadores,
  criarUtilizador,
  alternarUtilizador,
  reporPassword
};

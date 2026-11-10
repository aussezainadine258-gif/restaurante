// APIs JSON do painel da gerência.
const bcrypt = require('bcrypt');
const { query } = require('../db');
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

async function obterPratoCompleto(id) {
  const { rows } = await query(
    `
      SELECT p.*, c.nome AS categoria_nome
      FROM pratos p JOIN categorias c ON c.id = p.categoria_id
      WHERE p.id = $1
    `,
    [id]
  );
  return serializarPrato(rows[0]);
}

/* ------------------------------------------------------------------ pedidos */

async function painelPedidos(req, res) {
  const estado = String(req.query.estado || 'ativos');
  const [lista, resumo, pendentes] = await Promise.all([
    pedidos.listarPedidos({ estado, limite: 200 }),
    pedidos.resumoPainel(),
    chamadas.listarChamadas('pendente')
  ]);
  return res.json({
    pedidos: lista,
    resumo,
    chamadas: pendentes
  });
}

async function mudarEstadoPedido(req, res) {
  const id = validacao.id(req.params.id, 'pedido');
  const novo = String(req.body.estado || '');
  if (!ESTADOS_PEDIDO.includes(novo)) throw new ErroAplicacao('Estado inválido.', 400, 'estado');
  const pedido = await pedidos.atualizarEstado(id, novo);
  realtime.pedidoAtualizado(pedido);
  return res.json({ ok: true, pedido, resumo: await pedidos.resumoPainel() });
}

async function resolverChamada(req, res) {
  const id = validacao.id(req.params.id, 'chamada');
  const chamada = await chamadas.resolverChamada(id);
  realtime.chamadaResolvida(chamada);
  return res.json({ ok: true, chamada, resumo: await pedidos.resumoPainel() });
}

/* --------------------------------------------------------------------- menu */

async function listarMenu(req, res) {
  const [categoriasRes, pratosRes] = await Promise.all([
    query(`
      SELECT c.*, (SELECT COUNT(*)::int FROM pratos p WHERE p.categoria_id = c.id) AS total_pratos
      FROM categorias c ORDER BY c.ordem ASC, c.nome ASC
    `),
    query(`
      SELECT p.*, c.nome AS categoria_nome
      FROM pratos p JOIN categorias c ON c.id = p.categoria_id
      ORDER BY c.ordem ASC, p.nome ASC
    `)
  ]);

  const categorias = categoriasRes.rows.map((c) => ({
    ...c,
    ativo: Boolean(c.ativo),
    total_pratos: Number(c.total_pratos) || 0
  }));
  const pratos = pratosRes.rows.map(serializarPrato);
  return res.json({ categorias, pratos });
}

async function criarCategoria(req, res) {
  const nome = validacao.texto(req.body.nome, { min: 2, max: 40, obrigatorio: true, campo: 'nome' });
  const ordem = validacao.inteiro(req.body.ordem, { min: 0, max: 999, obrigatorio: false, campo: 'ordem' }) || 0;
  const { rows: existentes } = await query('SELECT id FROM categorias WHERE lower(nome) = lower($1)', [nome]);
  if (existentes[0]) throw new ErroAplicacao('Já existe uma categoria com esse nome.', 409);
  const { rows } = await query(
    'INSERT INTO categorias (nome, ordem, ativo, criado_em) VALUES ($1, $2, TRUE, $3) RETURNING id',
    [nome, ordem, new Date().toISOString()]
  );
  realtime.menuAtualizado();
  return res.status(201).json({
    ok: true,
    categoria: { id: rows[0].id, nome, ordem, ativo: true, total_pratos: 0 }
  });
}

async function atualizarCategoria(req, res) {
  const id = validacao.id(req.params.id, 'categoria');
  const { rows: categorias } = await query('SELECT * FROM categorias WHERE id = $1', [id]);
  const categoria = categorias[0];
  if (!categoria) throw new ErroAplicacao('Categoria não encontrada.', 404);
  const nome = validacao.texto(req.body.nome, { min: 2, max: 40, obrigatorio: true, campo: 'nome' });
  const ordem = validacao.inteiro(req.body.ordem, { min: 0, max: 999, obrigatorio: false, campo: 'ordem' }) || 0;
  const { rows: duplicadas } = await query(
    'SELECT id FROM categorias WHERE lower(nome) = lower($1) AND id <> $2',
    [nome, id]
  );
  if (duplicadas[0]) throw new ErroAplicacao('Já existe uma categoria com esse nome.', 409);
  await query('UPDATE categorias SET nome = $1, ordem = $2 WHERE id = $3', [nome, ordem, id]);
  realtime.menuAtualizado();
  return res.json({ ok: true, categoria: { ...categoria, nome, ordem, ativo: Boolean(categoria.ativo) } });
}

async function eliminarCategoria(req, res) {
  const id = validacao.id(req.params.id, 'categoria');
  const { rows: categorias } = await query('SELECT * FROM categorias WHERE id = $1', [id]);
  if (!categorias[0]) throw new ErroAplicacao('Categoria não encontrada.', 404);
  const { rows } = await query('SELECT COUNT(*)::int AS total FROM pratos WHERE categoria_id = $1', [id]);
  if (rows[0].total > 0) {
    throw new ErroAplicacao('Mova ou elimine os pratos desta categoria antes de a apagar.', 409);
  }
  await query('DELETE FROM categorias WHERE id = $1', [id]);
  realtime.menuAtualizado();
  return res.json({ ok: true });
}

async function camposDoPrato(req) {
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
  const { rows } = await query('SELECT id FROM categorias WHERE id = $1', [categoriaId]);
  if (!rows[0]) throw new ErroAplicacao('A categoria escolhida não existe.', 400, 'categoria');
  const etiquetas = validacao.etiquetas(req.body.etiquetas);
  const disponivel = validacao.booleano(req.body.disponivel);
  return { nome, descricao, precoCentavos, tempo, categoriaId, etiquetas, disponivel };
}

async function criarPrato(req, res) {
  const campos = await camposDoPrato(req);
  const fotoUrl = await guardarFoto(ficheiroEnviado(req, 'foto'));
  let videoUrl = null;
  try {
    videoUrl = await guardarVideo(ficheiroEnviado(req, 'video'));
    const agora = new Date().toISOString();
    const { rows } = await query(
      `
        INSERT INTO pratos
          (nome, descricao, preco_centavos, foto, foto_url, video_url, tempo_preparo, categoria_id, disponivel, etiquetas, criado_em, atualizado_em)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
        RETURNING id
      `,
      [
        campos.nome,
        campos.descricao,
        campos.precoCentavos,
        fotoUrl,
        fotoUrl,
        videoUrl,
        campos.tempo,
        campos.categoriaId,
        campos.disponivel,
        JSON.stringify(campos.etiquetas),
        agora
      ]
    );
    realtime.menuAtualizado();
    return res.status(201).json({ ok: true, prato: await obterPratoCompleto(rows[0].id) });
  } catch (erro) {
    if (fotoUrl) await apagarMedia(fotoUrl);
    if (videoUrl) await apagarMedia(videoUrl);
    throw erro;
  }
}

async function atualizarPrato(req, res) {
  const id = validacao.id(req.params.id, 'prato');
  const { rows: pratos } = await query('SELECT * FROM pratos WHERE id = $1', [id]);
  const atual = pratos[0];
  if (!atual) throw new ErroAplicacao('Prato não encontrado.', 404);
  const campos = await camposDoPrato(req);

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

    await query(
      `
        UPDATE pratos SET
          nome = $1, descricao = $2, preco_centavos = $3, foto = $4, foto_url = $5, video_url = $6,
          tempo_preparo = $7, categoria_id = $8, disponivel = $9, etiquetas = $10, atualizado_em = $11
        WHERE id = $12
      `,
      [
        campos.nome,
        campos.descricao,
        campos.precoCentavos,
        fotoFinal,
        fotoFinal,
        videoFinal,
        campos.tempo,
        campos.categoriaId,
        campos.disponivel,
        JSON.stringify(campos.etiquetas),
        new Date().toISOString(),
        id
      ]
    );

    // Só apaga o ficheiro antigo depois de a base de dados confirmar a mudança.
    if (fotoAtual && fotoAtual !== fotoFinal) await apagarMedia(fotoAtual);
    if (videoAtual && videoAtual !== videoFinal) await apagarMedia(videoAtual);

    realtime.menuAtualizado();
    return res.json({ ok: true, prato: await obterPratoCompleto(id) });
  } catch (erro) {
    if (novaFotoUrl) await apagarMedia(novaFotoUrl);
    if (novoVideoUrl) await apagarMedia(novoVideoUrl);
    throw erro;
  }
}

async function alternarDisponibilidade(req, res) {
  const id = validacao.id(req.params.id, 'prato');
  const { rows: pratos } = await query('SELECT * FROM pratos WHERE id = $1', [id]);
  if (!pratos[0]) throw new ErroAplicacao('Prato não encontrado.', 404);
  const disponivel = validacao.booleano(req.body.disponivel);
  await query('UPDATE pratos SET disponivel = $1, atualizado_em = $2 WHERE id = $3', [
    disponivel,
    new Date().toISOString(),
    id
  ]);
  realtime.menuAtualizado();
  return res.json({ ok: true, prato: await obterPratoCompleto(id) });
}

async function eliminarPrato(req, res) {
  const id = validacao.id(req.params.id, 'prato');
  const { rows: pratos } = await query('SELECT * FROM pratos WHERE id = $1', [id]);
  const prato = pratos[0];
  if (!prato) throw new ErroAplicacao('Prato não encontrado.', 404);
  await query('DELETE FROM pratos WHERE id = $1', [id]);
  await apagarMedia(prato.foto_url || prato.foto);
  await apagarMedia(prato.video_url);
  realtime.menuAtualizado();
  return res.json({ ok: true });
}

/* -------------------------------------------------------------------- mesas */

async function listarMesas(req, res) {
  const [lista, codigoAtivo] = await Promise.all([
    mesas.listarMesas(),
    configuracoes.codigoMesaAtivo()
  ]);
  return res.json({
    mesas: lista,
    codigo_ativo: codigoAtivo
  });
}

async function ativarMesa(req, res) {
  const id = validacao.id(req.params.id, 'mesa');
  const [resultado, codigoAtivo] = await Promise.all([
    mesas.ativarMesa(id),
    configuracoes.codigoMesaAtivo()
  ]);
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
    codigo_ativo: codigoAtivo
  });
}

async function contaDaMesa(req, res) {
  const id = validacao.id(req.params.id, 'mesa');
  const [mesa, sessao] = await Promise.all([mesas.obterMesaPorId(id), mesas.obterSessaoAberta(id)]);
  if (!mesa) throw new ErroAplicacao('Mesa não encontrada.', 404);
  if (!sessao) {
    return res.json({
      aberta: false,
      mesa: { id: mesa.id, numero: mesa.numero, ativa: Boolean(mesa.ativa) }
    });
  }
  const [resumo, pendentes] = await Promise.all([
    mesas.resumoPorToken(sessao.token),
    chamadas.listarChamadas('pendente')
  ]);
  return res.json({
    aberta: true,
    mesa: { id: mesa.id, numero: mesa.numero, ativa: Boolean(mesa.ativa) },
    resumo,
    chamadas: pendentes.filter((c) => c.mesa_id === id)
  });
}

async function fecharMesa(req, res) {
  const id = validacao.id(req.params.id, 'mesa');
  const forcar = validacao.booleano(req.body.forcar);
  const resultado = await mesas.fecharMesa(id, forcar);
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

async function obterConfiguracoes(req, res) {
  return res.json({
    ...(await configuracoes.listar()),
    base_url: config.baseUrl
  });
}

async function guardarConfiguracoes(req, res) {
  const nome = validacao.texto(req.body.nome_restaurante, {
    min: 2,
    max: 60,
    obrigatorio: true,
    campo: 'nome do restaurante'
  });
  const codigoAtivo = validacao.booleano(req.body.codigo_mesa_ativo);
  await configuracoes.definirVarios({
    nome_restaurante: nome,
    codigo_mesa_ativo: codigoAtivo ? '1' : '0'
  });
  realtime.configuracoesAtualizadas();
  return res.json({
    ok: true,
    configuracoes: { ...(await configuracoes.listar()), base_url: config.baseUrl }
  });
}

async function listarUtilizadores(req, res) {
  const { rows } = await query(`
    SELECT id, nome, username, papel, deve_alterar_password, ativo, criado_em
    FROM utilizadores ORDER BY papel ASC, nome ASC
  `);
  const lista = rows.map((u) => ({
    ...u,
    ativo: Boolean(u.ativo),
    deve_alterar_password: Boolean(u.deve_alterar_password)
  }));
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

  const { rows: existentes } = await query(
    'SELECT id FROM utilizadores WHERE lower(username) = lower($1)',
    [username]
  );
  if (existentes[0]) throw new ErroAplicacao('Já existe um utilizador com esse nome.', 409, 'username');

  const hash = await bcrypt.hash(password, 12);
  const { rows } = await query(
    `
      INSERT INTO utilizadores (nome, username, password_hash, papel, deve_alterar_password, ativo, criado_em)
      VALUES ($1, $2, $3, $4, TRUE, TRUE, $5)
      RETURNING id
    `,
    [nome, username, hash, papel, new Date().toISOString()]
  );

  realtime.utilizadoresAtualizados();
  return res.status(201).json({
    ok: true,
    utilizador: {
      id: rows[0].id,
      nome,
      username,
      papel,
      ativo: true,
      deve_alterar_password: true
    }
  });
}

async function alternarUtilizador(req, res) {
  const id = validacao.id(req.params.id, 'utilizador');
  const { rows: utilizadores } = await query('SELECT * FROM utilizadores WHERE id = $1', [id]);
  const utilizador = utilizadores[0];
  if (!utilizador) throw new ErroAplicacao('Utilizador não encontrado.', 404);
  const ativo = validacao.booleano(req.body.ativo);

  if (!ativo && id === req.utilizador.id) {
    throw new ErroAplicacao('Não pode desativar a sua própria conta.', 400);
  }
  if (!ativo && utilizador.papel === 'admin') {
    const { rows } = await query(
      "SELECT COUNT(*)::int AS total FROM utilizadores WHERE papel = 'admin' AND ativo = TRUE"
    );
    if (rows[0].total <= 1) throw new ErroAplicacao('Tem de existir pelo menos um administrador ativo.', 409);
  }

  await query('UPDATE utilizadores SET ativo = $1 WHERE id = $2', [ativo, id]);
  realtime.utilizadoresAtualizados();
  return res.json({
    ok: true,
    utilizador: {
      ...utilizador,
      password_hash: undefined,
      ativo,
      deve_alterar_password: Boolean(utilizador.deve_alterar_password)
    }
  });
}

async function reporPassword(req, res) {
  const id = validacao.id(req.params.id, 'utilizador');
  const { rows: utilizadores } = await query('SELECT * FROM utilizadores WHERE id = $1', [id]);
  if (!utilizadores[0]) throw new ErroAplicacao('Utilizador não encontrado.', 404);
  const password = String(req.body.password || '');
  if (password.length < 8) throw new ErroAplicacao('A password deve ter pelo menos 8 caracteres.', 400, 'password');
  if (password.length > 72) throw new ErroAplicacao('A password é demasiado longa.', 400, 'password');
  const hash = await bcrypt.hash(password, 12);
  await query('UPDATE utilizadores SET password_hash = $1, deve_alterar_password = TRUE WHERE id = $2', [hash, id]);
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

// Regras de negócio dos pedidos.
const { query, transacao, pool } = require('../db');
const mesas = require('./mesas');
const configuracoes = require('./configuracoes');
const { serializarPedido } = require('./serializadores');
const { ErroAplicacao } = require('../lib/erros');
const validacao = require('../lib/validacao');
const { agoraISO, ESTADOS_PEDIDO } = require('../lib/utils');

const TRANSICOES = {
  Recebido: ['Em preparo', 'Pronto', 'Cancelado'],
  'Em preparo': ['Pronto', 'Recebido', 'Cancelado'],
  Pronto: ['Entregue', 'Em preparo', 'Cancelado'],
  Entregue: [],
  Cancelado: []
};

const SQL_PEDIDO_COMPLETO = `
  SELECT p.*, m.numero AS mesa_numero, s.token AS sessao_token
  FROM pedidos p
  JOIN mesas m ON m.id = p.mesa_id
  JOIN sessoes_mesa s ON s.id = p.sessao_id
  WHERE p.id = $1
`;

async function obterLinhaPedido(id, executor = pool) {
  const { rows } = await executor.query(SQL_PEDIDO_COMPLETO, [id]);
  return rows[0] || null;
}

async function listarPedidos({ estado = 'ativos', limite = 100 } = {}) {
  const limiteSeguro = Math.min(Math.max(Number(limite) || 100, 1), 300);
  let sql = `
    SELECT p.*, m.numero AS mesa_numero, s.token AS sessao_token
    FROM pedidos p
    JOIN mesas m ON m.id = p.mesa_id
    JOIN sessoes_mesa s ON s.id = p.sessao_id
  `;
  const parametros = [];

  if (estado === 'ativos') {
    sql += " WHERE p.estado IN ('Recebido','Em preparo','Pronto')";
  } else if (estado !== 'todos') {
    if (!ESTADOS_PEDIDO.includes(estado)) {
      throw new ErroAplicacao('Filtro de estado inválido.', 400);
    }
    parametros.push(estado);
    sql += ` WHERE p.estado = $${parametros.length}`;
  }

  parametros.push(limiteSeguro);
  sql += ` ORDER BY p.criado_em DESC, p.id DESC LIMIT $${parametros.length}`;

  const { rows } = await query(sql, parametros);
  return Promise.all(rows.map((linha) => serializarPedido(linha)));
}

async function listarPedidosCozinha() {
  const { rows } = await query(`
    SELECT p.*, m.numero AS mesa_numero, s.token AS sessao_token
    FROM pedidos p
    JOIN mesas m ON m.id = p.mesa_id
    JOIN sessoes_mesa s ON s.id = p.sessao_id
    WHERE p.estado IN ('Recebido','Em preparo')
    ORDER BY p.criado_em ASC, p.id ASC
  `);
  return Promise.all(rows.map((linha) => serializarPedido(linha)));
}

async function obterPedido(id) {
  const linha = await obterLinhaPedido(id);
  return linha ? serializarPedido(linha) : null;
}

async function contarPorEstado() {
  const { rows } = await query('SELECT estado, COUNT(*)::int AS total FROM pedidos GROUP BY estado');
  const contagem = { Recebido: 0, 'Em preparo': 0, Pronto: 0, Entregue: 0, Cancelado: 0 };
  for (const linha of rows) contagem[linha.estado] = linha.total;
  return contagem;
}

// Cria um pedido validando tudo no servidor: sessão aberta, mesa ativa,
// pratos existentes/disponíveis, quantidades e preços vindos da base de dados.
async function criarPedido({ token, itens, observacoes = '' }) {
  const sessao = await mesas.obterSessaoPorToken(token);
  if (!sessao || sessao.estado !== 'aberta') {
    throw new ErroAplicacao('A sessão desta mesa já foi fechada. Peça ao empregado para reabrir.', 403);
  }
  const mesa = await mesas.obterMesaPorId(sessao.mesa_id);
  if (!mesa || !mesa.ativa) {
    throw new ErroAplicacao('A mesa já não está ativa. Chame um empregado.', 403);
  }
  if (!Array.isArray(itens) || itens.length === 0) {
    throw new ErroAplicacao('O carrinho está vazio.', 400, 'itens');
  }
  if (itens.length > 40) {
    throw new ErroAplicacao('Demasiados itens num só pedido.', 400, 'itens');
  }

  const observacaoGeral = validacao.textoLongo(observacoes, { max: 500, campo: 'observação geral' });
  const normalizados = [];
  let totalCentavos = 0;
  let tempoPrevisto = 0;

  for (const item of itens) {
    const pratoId = validacao.id(item && item.prato_id, 'prato');
    const quantidade = validacao.inteiro(item && item.quantidade, {
      min: 1,
      max: 20,
      campo: 'quantidade'
    });
    const observacao = validacao.textoLongo(item && item.observacao, {
      max: 200,
      campo: 'observação do item'
    });
    const { rows } = await query('SELECT * FROM pratos WHERE id = $1', [pratoId]);
    const prato = rows[0];
    if (!prato) throw new ErroAplicacao('Um dos pratos já não existe no menu.', 409);
    if (!prato.disponivel) {
      throw new ErroAplicacao(`O prato "${prato.nome}" está esgotado. Remova-o do carrinho.`, 409);
    }
    const precoCentavos = Number(prato.preco_centavos);
    totalCentavos += precoCentavos * quantidade;
    tempoPrevisto = Math.max(tempoPrevisto, Number(prato.tempo_preparo) || 0);
    normalizados.push({ prato: { ...prato, preco_centavos: precoCentavos }, quantidade, observacao });
  }

  if (totalCentavos <= 0) throw new ErroAplicacao('O total do pedido é inválido.', 400);
  const agora = agoraISO();

  return transacao(async (cliente) => {
    const { rows } = await cliente.query(
      `
        INSERT INTO pedidos
          (mesa_id, sessao_id, estado, observacoes, total_centavos, tempo_previsto_min, criado_em, atualizado_em)
        VALUES ($1, $2, 'Recebido', $3, $4, $5, $6, $6)
        RETURNING id
      `,
      [mesa.id, sessao.id, observacaoGeral, totalCentavos, tempoPrevisto || 15, agora]
    );
    const pedidoId = rows[0].id;

    for (const item of normalizados) {
      await cliente.query(
        `
          INSERT INTO itens_pedido (pedido_id, prato_id, nome_prato, quantidade, preco_centavos, observacao)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          pedidoId,
          item.prato.id,
          item.prato.nome,
          item.quantidade,
          item.prato.preco_centavos,
          item.observacao
        ]
      );
    }

    const linha = await obterLinhaPedido(pedidoId, cliente);
    return serializarPedido(linha, cliente);
  });
}

// Atualiza o estado com transições controladas.
async function atualizarEstado(id, novoEstado) {
  if (!ESTADOS_PEDIDO.includes(novoEstado)) {
    throw new ErroAplicacao('Estado de pedido inválido.', 400, 'estado');
  }
  const atual = await obterLinhaPedido(id);
  if (!atual) throw new ErroAplicacao('Pedido não encontrado.', 404);
  if (atual.estado === novoEstado) return serializarPedido(atual);

  const permitidos = TRANSICOES[atual.estado] || [];
  if (!permitidos.includes(novoEstado)) {
    throw new ErroAplicacao(
      `Não é possível passar de "${atual.estado}" para "${novoEstado}".`,
      409,
      'estado'
    );
  }

  await query('UPDATE pedidos SET estado = $1, atualizado_em = $2 WHERE id = $3', [
    novoEstado,
    agoraISO(),
    id
  ]);
  return obterPedido(id);
}

// Resumo do painel: contagens, pedidos atrasados e chamadas pendentes.
async function resumoPainel() {
  const [contagem, pedidosAtivos, chamadasRes, codigoMesaAtivo] = await Promise.all([
    contarPorEstado(),
    listarPedidos({ estado: 'ativos', limite: 300 }),
    query("SELECT COUNT(*)::int AS total FROM chamadas WHERE estado = 'pendente'"),
    configuracoes.codigoMesaAtivo()
  ]);

  return {
    contagem,
    ativos: pedidosAtivos.length,
    atrasados: pedidosAtivos.filter((p) => p.atrasado).length,
    chamadas_pendentes: chamadasRes.rows[0].total,
    codigo_mesa_ativo: codigoMesaAtivo
  };
}

module.exports = {
  listarPedidos,
  listarPedidosCozinha,
  obterPedido,
  contarPorEstado,
  criarPedido,
  atualizarEstado,
  resumoPainel,
  TRANSICOES
};

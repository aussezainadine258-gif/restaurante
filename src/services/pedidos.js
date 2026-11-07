// Regras de negócio dos pedidos.
const db = require('../db');
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

const stmtPedidoCompleto = db.prepare(`
  SELECT p.*, m.numero AS mesa_numero, s.token AS sessao_token
  FROM pedidos p
  JOIN mesas m ON m.id = p.mesa_id
  JOIN sessoes_mesa s ON s.id = p.sessao_id
  WHERE p.id = ?
`);

const stmtInserirPedido = db.prepare(`
  INSERT INTO pedidos (mesa_id, sessao_id, estado, observacoes, total_centavos, tempo_previsto_min, criado_em, atualizado_em)
  VALUES (?, ?, 'Recebido', ?, ?, ?, ?, ?)
`);

const stmtInserirItem = db.prepare(`
  INSERT INTO itens_pedido (pedido_id, prato_id, nome_prato, quantidade, preco_centavos, observacao)
  VALUES (?, ?, ?, ?, ?, ?)
`);

function listarPedidos({ estado = 'ativos', limite = 100 } = {}) {
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
    sql += ' WHERE p.estado = ?';
    parametros.push(estado);
  }

  sql += ' ORDER BY p.criado_em DESC, p.id DESC LIMIT ?';
  parametros.push(limiteSeguro);
  return db.prepare(sql).all(...parametros).map(serializarPedido);
}

function listarPedidosCozinha() {
  return db
    .prepare(`
      SELECT p.*, m.numero AS mesa_numero, s.token AS sessao_token
      FROM pedidos p
      JOIN mesas m ON m.id = p.mesa_id
      JOIN sessoes_mesa s ON s.id = p.sessao_id
      WHERE p.estado IN ('Recebido','Em preparo')
      ORDER BY p.criado_em ASC, p.id ASC
    `)
    .all()
    .map(serializarPedido);
}

function obterPedido(id) {
  const linha = stmtPedidoCompleto.get(id);
  return linha ? serializarPedido(linha) : null;
}

function contarPorEstado() {
  const linhas = db.prepare('SELECT estado, COUNT(*) AS total FROM pedidos GROUP BY estado').all();
  const contagem = { Recebido: 0, 'Em preparo': 0, Pronto: 0, Entregue: 0, Cancelado: 0 };
  for (const linha of linhas) contagem[linha.estado] = linha.total;
  return contagem;
}

// Cria um pedido validando tudo no servidor: sessão aberta, mesa ativa,
// pratos existentes/disponíveis, quantidades e preços vindos da base de dados.
function criarPedido({ token, itens, observacoes = '' }) {
  const sessao = mesas.obterSessaoPorToken(token);
  if (!sessao || sessao.estado !== 'aberta') {
    throw new ErroAplicacao('A sessão desta mesa já foi fechada. Peça ao empregado para reabrir.', 403);
  }
  const mesa = mesas.obterMesaPorId(sessao.mesa_id);
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
  const stmtPrato = db.prepare('SELECT * FROM pratos WHERE id = ?');
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
    const prato = stmtPrato.get(pratoId);
    if (!prato) throw new ErroAplicacao('Um dos pratos já não existe no menu.', 409);
    if (!prato.disponivel) {
      throw new ErroAplicacao(`O prato "${prato.nome}" está esgotado. Remova-o do carrinho.`, 409);
    }
    totalCentavos += prato.preco_centavos * quantidade;
    tempoPrevisto = Math.max(tempoPrevisto, prato.tempo_preparo || 0);
    normalizados.push({ prato, quantidade, observacao });
  }

  if (totalCentavos <= 0) throw new ErroAplicacao('O total do pedido é inválido.', 400);
  const agora = agoraISO();

  const criar = db.transaction(() => {
    const info = stmtInserirPedido.run(
      mesa.id,
      sessao.id,
      observacaoGeral,
      totalCentavos,
      tempoPrevisto || 15,
      agora,
      agora
    );
    for (const item of normalizados) {
      stmtInserirItem.run(
        info.lastInsertRowid,
        item.prato.id,
        item.prato.nome,
        item.quantidade,
        item.prato.preco_centavos,
        item.observacao
      );
    }
    return obterPedido(info.lastInsertRowid);
  });

  return criar();
}

// Atualiza o estado com transições controladas.
function atualizarEstado(id, novoEstado) {
  if (!ESTADOS_PEDIDO.includes(novoEstado)) {
    throw new ErroAplicacao('Estado de pedido inválido.', 400, 'estado');
  }
  const atual = stmtPedidoCompleto.get(id);
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

  db.prepare('UPDATE pedidos SET estado = ?, atualizado_em = ? WHERE id = ?').run(
    novoEstado,
    agoraISO(),
    id
  );
  return obterPedido(id);
}

// Resumo do painel: contagens, pedidos atrasados e chamadas pendentes.
function resumoPainel() {
  const contagem = contarPorEstado();
  const pedidosAtivos = listarPedidos({ estado: 'ativos', limite: 300 });
  return {
    contagem,
    ativos: pedidosAtivos.length,
    atrasados: pedidosAtivos.filter((p) => p.atrasado).length,
    chamadas_pendentes: db
      .prepare("SELECT COUNT(*) AS total FROM chamadas WHERE estado = 'pendente'")
      .get().total,
    codigo_mesa_ativo: configuracoes.codigoMesaAtivo()
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

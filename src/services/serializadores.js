// Serialização de pedidos e sessões para as APIs e eventos Socket.IO.
const { pool } = require('../db');
const { formatarMZN, minutosDecorridos } = require('../lib/utils');

const SQL_ITENS = `
  SELECT ip.*, pr.tempo_preparo, COALESCE(pr.foto_url, pr.foto) AS foto
  FROM itens_pedido ip
  LEFT JOIN pratos pr ON pr.id = ip.prato_id
  WHERE ip.pedido_id = $1
  ORDER BY ip.id ASC
`;

const SQL_PEDIDOS_SESSAO = `
  SELECT p.*, m.numero AS mesa_numero, s.token AS sessao_token
  FROM pedidos p
  JOIN mesas m ON m.id = p.mesa_id
  JOIN sessoes_mesa s ON s.id = p.sessao_id
  WHERE p.sessao_id = $1
  ORDER BY p.criado_em ASC, p.id ASC
`;

const SQL_GOSTOS_SESSAO = 'SELECT prato_id FROM gostos_prato WHERE sessao_id = $1 ORDER BY id ASC';

const SQL_CHAMADA_PENDENTE = `
  SELECT tipo, criada_em
  FROM chamadas
  WHERE sessao_id = $1 AND estado = 'pendente'
  ORDER BY id DESC
  LIMIT 1
`;

function serializarItem(item) {
  const precoCentavos = Number(item.preco_centavos) || 0;
  const quantidade = Number(item.quantidade) || 0;
  return {
    id: Number(item.id),
    prato_id: item.prato_id == null ? null : Number(item.prato_id),
    nome: item.nome_prato,
    quantidade,
    preco_centavos: precoCentavos,
    preco_formatado: formatarMZN(precoCentavos),
    subtotal_centavos: precoCentavos * quantidade,
    subtotal_formatado: formatarMZN(precoCentavos * quantidade),
    observacao: item.observacao,
    tempo_preparo: item.tempo_preparo == null ? null : Number(item.tempo_preparo),
    foto: item.foto || null
  };
}

// `executor` é o Pool (leituras normais) ou o cliente de uma transação.
async function serializarPedido(linha, executor = pool) {
  const { rows } = await executor.query(SQL_ITENS, [linha.id]);
  const itens = rows.map(serializarItem);
  const minutos = minutosDecorridos(linha.criado_em);
  const tempoPrevisto = Number(linha.tempo_previsto_min) || 0;
  const ativo = ['Recebido', 'Em preparo', 'Pronto'].includes(linha.estado);
  const totalCentavos = Number(linha.total_centavos) || 0;

  return {
    id: Number(linha.id),
    mesa_id: Number(linha.mesa_id),
    mesa_numero: linha.mesa_numero,
    sessao_id: Number(linha.sessao_id),
    sessao_token: linha.sessao_token || null,
    estado: linha.estado,
    observacoes: linha.observacoes,
    total_centavos: totalCentavos,
    total_formatado: formatarMZN(totalCentavos),
    tempo_previsto_min: tempoPrevisto,
    criado_em: linha.criado_em,
    atualizado_em: linha.atualizado_em,
    minutos_decorridos: minutos,
    tempo_restante_min: Math.max(0, tempoPrevisto - minutos),
    atrasado: ativo && minutos > tempoPrevisto,
    ativo,
    itens
  };
}

async function pedidosDaSessao(sessaoId, executor = pool) {
  const { rows } = await executor.query(SQL_PEDIDOS_SESSAO, [sessaoId]);
  // Sequencial: dentro de uma transação o executor é um único cliente e o
  // `pg` não permite várias queries em curso ao mesmo tempo no mesmo cliente.
  const pedidos = [];
  for (const linha of rows) {
    pedidos.push(await serializarPedido(linha, executor));
  }
  return pedidos;
}

// Junta os pedidos de uma sessão e calcula o total acumulado (cancelados não contam).
async function resumoSessao(sessao, mesa, executor = pool) {
  const pedidos = await pedidosDaSessao(sessao.id, executor);
  const chamadaRes = await executor.query(SQL_CHAMADA_PENDENTE, [sessao.id]);
  const gostosRes = await executor.query(SQL_GOSTOS_SESSAO, [sessao.id]);

  const validos = pedidos.filter((p) => p.estado !== 'Cancelado');
  const totalCentavos = validos.reduce((soma, p) => soma + (Number(p.total_centavos) || 0), 0);
  const ultimo = validos.length ? validos[validos.length - 1] : null;
  const estadoAtual = ultimo ? ultimo.estado : 'Sem pedidos';
  const chamada = chamadaRes.rows[0];

  return {
    sessao: {
      id: Number(sessao.id),
      token: sessao.token,
      aberta_em: sessao.aberta_em,
      fechada_em: sessao.fechada_em,
      estado: sessao.estado
    },
    mesa: {
      id: Number(mesa.id),
      numero: mesa.numero,
      ativa: Boolean(mesa.ativa)
    },
    pedidos,
    total_centavos: totalCentavos,
    total_formatado: formatarMZN(totalCentavos),
    total_pedidos: validos.length,
    estado_atual: estadoAtual,
    ultima_atualizacao: ultimo ? ultimo.atualizado_em : sessao.aberta_em,
    pode_pedir: sessao.estado === 'aberta' && Boolean(mesa.ativa),
    aberta: sessao.estado === 'aberta',
    pratos_gostados: gostosRes.rows.map((linha) => Number(linha.prato_id)),
    chamada_pendente: chamada
      ? {
          tipo: chamada.tipo,
          criada_em: chamada.criada_em,
          minutos_decorridos: minutosDecorridos(chamada.criada_em)
        }
      : null
  };
}

module.exports = { serializarItem, serializarPedido, pedidosDaSessao, resumoSessao };

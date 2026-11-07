// Serialização de pedidos e sessões para as APIs e eventos Socket.IO.
const db = require('../db');
const { formatarMZN, minutosDecorridos } = require('../lib/utils');

const stmtItens = db.prepare(`
  SELECT ip.*, pr.tempo_preparo, COALESCE(pr.foto_url, pr.foto) AS foto
  FROM itens_pedido ip
  LEFT JOIN pratos pr ON pr.id = ip.prato_id
  WHERE ip.pedido_id = ?
  ORDER BY ip.id ASC
`);

const stmtPedidosSessao = db.prepare(`
  SELECT p.*, m.numero AS mesa_numero, s.token AS sessao_token
  FROM pedidos p
  JOIN mesas m ON m.id = p.mesa_id
  JOIN sessoes_mesa s ON s.id = p.sessao_id
  WHERE p.sessao_id = ?
  ORDER BY p.criado_em ASC, p.id ASC
`);

const stmtGostosSessao = db.prepare(
  'SELECT prato_id FROM gostos_prato WHERE sessao_id = ? ORDER BY id ASC'
);

function serializarItem(item) {
  return {
    id: item.id,
    prato_id: item.prato_id,
    nome: item.nome_prato,
    quantidade: item.quantidade,
    preco_centavos: item.preco_centavos,
    preco_formatado: formatarMZN(item.preco_centavos),
    subtotal_centavos: item.preco_centavos * item.quantidade,
    subtotal_formatado: formatarMZN(item.preco_centavos * item.quantidade),
    observacao: item.observacao,
    tempo_preparo: item.tempo_preparo,
    foto: item.foto || null
  };
}

function serializarPedido(linha) {
  const itens = stmtItens.all(linha.id).map(serializarItem);
  const minutos = minutosDecorridos(linha.criado_em);
  const ativo = ['Recebido', 'Em preparo', 'Pronto'].includes(linha.estado);
  return {
    id: linha.id,
    mesa_id: linha.mesa_id,
    mesa_numero: linha.mesa_numero,
    sessao_id: linha.sessao_id,
    sessao_token: linha.sessao_token || null,
    estado: linha.estado,
    observacoes: linha.observacoes,
    total_centavos: linha.total_centavos,
    total_formatado: formatarMZN(linha.total_centavos),
    tempo_previsto_min: linha.tempo_previsto_min,
    criado_em: linha.criado_em,
    atualizado_em: linha.atualizado_em,
    minutos_decorridos: minutos,
    tempo_restante_min: Math.max(0, linha.tempo_previsto_min - minutos),
    atrasado: ativo && minutos > linha.tempo_previsto_min,
    ativo,
    itens
  };
}

function pedidosDaSessao(sessaoId) {
  return stmtPedidosSessao.all(sessaoId).map(serializarPedido);
}

// Junta os pedidos de uma sessão e calcula o total acumulado (cancelados não contam).
function resumoSessao(sessao, mesa) {
  const pedidos = pedidosDaSessao(sessao.id);
  const validos = pedidos.filter((p) => p.estado !== 'Cancelado');
  const totalCentavos = validos.reduce((soma, p) => soma + p.total_centavos, 0);
  const ultimo = validos.length ? validos[validos.length - 1] : null;
  const estadoAtual = ultimo ? ultimo.estado : 'Sem pedidos';
  const chamada = db
    .prepare("SELECT tipo, criada_em FROM chamadas WHERE sessao_id = ? AND estado = 'pendente' ORDER BY id DESC LIMIT 1")
    .get(sessao.id);
  return {
    sessao: {
      id: sessao.id,
      token: sessao.token,
      aberta_em: sessao.aberta_em,
      fechada_em: sessao.fechada_em,
      estado: sessao.estado
    },
    mesa: {
      id: mesa.id,
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
    pratos_gostados: stmtGostosSessao.all(sessao.id).map((linha) => linha.prato_id),
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

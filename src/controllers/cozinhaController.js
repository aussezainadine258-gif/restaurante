// Ecrã da cozinha: pedidos ativos em tempo real e mudança de estado.
const pedidos = require('../services/pedidos');
const realtime = require('../lib/realtime');
const validacao = require('../lib/validacao');
const { ErroAplicacao } = require('../lib/erros');
const { ESTADOS_PEDIDO } = require('../lib/utils');

function paginaCozinha(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.render('cozinha', {
    titulo: 'Cozinha'
  });
}

function apiPedidos(req, res) {
  const lista = pedidos.listarPedidosCozinha();
  return res.json({
    pedidos: lista,
    resumo: pedidos.resumoPainel(),
    atualizado_em: new Date().toISOString()
  });
}

function apiMudarEstado(req, res) {
  const id = validacao.id(req.params.id, 'pedido');
  const novo = String(req.body.estado || '');
  if (!ESTADOS_PEDIDO.includes(novo)) {
    throw new ErroAplicacao('Estado inválido.', 400, 'estado');
  }
  const pedido = pedidos.atualizarEstado(id, novo);
  realtime.pedidoAtualizado(pedido);
  return res.json({ ok: true, pedido, resumo: pedidos.resumoPainel() });
}

module.exports = { paginaCozinha, apiPedidos, apiMudarEstado };

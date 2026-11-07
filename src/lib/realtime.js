// Camada de tempo real. O Socket.IO é inicializado no server.js e esta
// camada permite que qualquer controller/serviço emita eventos sem acoplamento.
let io = null;

function inicializar(servidorIo) {
  io = servidorIo;
}

function emitirSala(sala, evento, dados) {
  if (io) io.to(sala).emit(evento, dados);
}

function novoPedido(pedido) {
  emitirSala('admin', 'novo_pedido', pedido);
  emitirSala('cozinha', 'novo_pedido', pedido);
  if (pedido.sessao_token) emitirSala(`sessao:${pedido.sessao_token}`, 'pedido_atualizado', pedido);
}

function pedidoAtualizado(pedido) {
  emitirSala('admin', 'pedido_atualizado', pedido);
  emitirSala('cozinha', 'pedido_atualizado', pedido);
  if (pedido.sessao_token) emitirSala(`sessao:${pedido.sessao_token}`, 'pedido_atualizado', pedido);
}

function novaChamada(chamada) {
  emitirSala('admin', 'nova_chamada', chamada);
  if (chamada.sessao_token) emitirSala(`sessao:${chamada.sessao_token}`, 'nova_chamada', chamada);
}

function chamadaResolvida(chamada) {
  emitirSala('admin', 'chamada_resolvida', chamada);
  if (chamada.sessao_token) emitirSala(`sessao:${chamada.sessao_token}`, 'chamada_resolvida', chamada);
}

function mesaAtualizada(mesa) {
  emitirSala('admin', 'mesa_atualizada', mesa);
}

function sessaoFechada(token, dados) {
  emitirSala('sessao:' + token, 'sessao_fechada', dados);
  emitirSala('admin', 'sessao_fechada', dados);
  emitirSala('cozinha', 'sessao_fechada', dados);
}

function menuAtualizado() {
  emitirSala('admin', 'menu_atualizado', {});
}

function configuracoesAtualizadas() {
  emitirSala('admin', 'configuracoes_atualizadas', {});
}

function utilizadoresAtualizados() {
  emitirSala('admin', 'utilizadores_atualizados', {});
}

module.exports = {
  inicializar,
  emitirSala,
  novoPedido,
  pedidoAtualizado,
  novaChamada,
  chamadaResolvida,
  mesaAtualizada,
  sessaoFechada,
  menuAtualizado,
  configuracoesAtualizadas,
  utilizadoresAtualizados
};

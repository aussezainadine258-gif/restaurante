// Configuração do Socket.IO: autentica o painel pela sessão Express e
// coloca cada cliente na sala da sua sessão de mesa.
const db = require('./db');

function configurarSocket(io) {
  io.on('connection', (socket) => {
    const sessaoWeb = socket.request.session || {};
    const guardado = sessaoWeb.utilizador;

    if (guardado) {
      const utilizador = db
        .prepare('SELECT id, papel, ativo FROM utilizadores WHERE id = ?')
        .get(guardado.id);
      if (utilizador && utilizador.ativo) {
        if (utilizador.papel === 'admin') socket.join('admin');
        if (['admin', 'cozinha'].includes(utilizador.papel)) socket.join('cozinha');
      }
    }

    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (token) {
      const sessaoMesa = db.prepare('SELECT id FROM sessoes_mesa WHERE token = ?').get(String(token));
      if (sessaoMesa) socket.join(`sessao:${token}`);
    }

    socket.emit('ligado', { ok: true });
  });
}

module.exports = { configurarSocket };

// Configuração do Socket.IO: autentica o painel pela sessão Express e
// coloca cada cliente na sala da sua sessão de mesa.
const { query } = require('./db');

function configurarSocket(io) {
  io.on('connection', async (socket) => {
    try {
      const sessaoWeb = socket.request.session || {};
      const guardado = sessaoWeb.utilizador;

      if (guardado) {
        const { rows } = await query('SELECT id, papel, ativo FROM utilizadores WHERE id = $1', [
          guardado.id
        ]);
        const utilizador = rows[0];
        if (utilizador && utilizador.ativo) {
          if (utilizador.papel === 'admin') socket.join('admin');
          if (['admin', 'cozinha'].includes(utilizador.papel)) socket.join('cozinha');
        }
      }

      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (token) {
        const { rows } = await query('SELECT id FROM sessoes_mesa WHERE token = $1', [String(token)]);
        if (rows[0]) socket.join(`sessao:${token}`);
      }
    } catch (erro) {
      console.error('[SOCKET] Falha ao autenticar ligação:', erro);
    }

    socket.emit('ligado', { ok: true });
  });
}

module.exports = { configurarSocket };

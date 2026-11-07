// Mensagens temporárias entre pedidos (padrão POST-redirect-GET).
function definirFlash(req, tipo, mensagem) {
  if (req.session) req.session.flash = { tipo, mensagem };
}

function consumirFlash(req) {
  if (!req.session || !req.session.flash) return null;
  const flash = req.session.flash;
  delete req.session.flash;
  return flash;
}

module.exports = { definirFlash, consumirFlash };

// Página e API dos relatórios de vendas.
const relatorios = require('../services/relatorios');

function paginaRelatorios(req, res) {
  return res.render('admin/relatorios', {
    titulo: 'Relatórios',
    dataHoje: relatorios.hojeLocal()
  });
}

async function apiRelatorios(req, res, next) {
  try {
    return res.json(await relatorios.gerarRelatorio(req.query.data));
  } catch (erro) {
    return next(erro);
  }
}

module.exports = { paginaRelatorios, apiRelatorios };

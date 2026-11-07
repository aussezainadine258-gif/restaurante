// Página e API dos relatórios de vendas.
const relatorios = require('../services/relatorios');

function paginaRelatorios(req, res) {
  return res.render('admin/relatorios', {
    titulo: 'Relatórios',
    dataHoje: relatorios.hojeLocal()
  });
}

function apiRelatorios(req, res) {
  return res.json(relatorios.gerarRelatorio(req.query.data));
}

module.exports = { paginaRelatorios, apiRelatorios };

// Gostos dos pratos: um gosto por prato e por sessão de mesa.
const db = require('../db');
const mesas = require('./mesas');
const { ErroAplicacao } = require('../lib/erros');
const { agoraISO } = require('../lib/utils');

const stmtPrato = db.prepare('SELECT id, nome FROM pratos WHERE id = ?');
const stmtGosto = db.prepare('SELECT id FROM gostos_prato WHERE prato_id = ? AND sessao_id = ?');
const stmtInserir = db.prepare(
  'INSERT INTO gostos_prato (prato_id, sessao_id, criado_em) VALUES (?, ?, ?)'
);
const stmtRemover = db.prepare('DELETE FROM gostos_prato WHERE prato_id = ? AND sessao_id = ?');
const stmtContar = db.prepare('SELECT COUNT(*) AS total FROM gostos_prato WHERE prato_id = ?');
const stmtAtualizarContador = db.prepare('UPDATE pratos SET gostos = ? WHERE id = ?');

// Alterna o gosto e devolve { gostou, gostos } com o contador atualizado.
const alternarTransacao = db.transaction((sessaoId, pratoId) => {
  const prato = stmtPrato.get(pratoId);
  if (!prato) throw new ErroAplicacao('Prato não encontrado.', 404);

  const existente = stmtGosto.get(pratoId, sessaoId);
  if (existente) {
    stmtRemover.run(pratoId, sessaoId);
  } else {
    stmtInserir.run(pratoId, sessaoId, agoraISO());
  }

  const total = stmtContar.get(pratoId).total;
  stmtAtualizarContador.run(total, pratoId);

  return { gostou: !existente, gostos: total };
});

function alternarGosto(token, pratoId) {
  const sessao = mesas.obterSessaoPorToken(token);
  if (!sessao) throw new ErroAplicacao('Sessão não encontrada ou expirada.', 404);
  if (sessao.estado !== 'aberta') {
    throw new ErroAplicacao('A sessão desta mesa já terminou.', 403);
  }
  return alternarTransacao(sessao.id, pratoId);
}

module.exports = { alternarGosto };

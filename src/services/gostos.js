// Gostos dos pratos: um gosto por prato e por sessão de mesa.
const { transacao } = require('../db');
const mesas = require('./mesas');
const { ErroAplicacao } = require('../lib/erros');
const { agoraISO } = require('../lib/utils');

// Alterna o gosto e devolve { gostou, gostos } com o contador atualizado.
async function alternarGosto(token, pratoId) {
  const sessao = await mesas.obterSessaoPorToken(token);
  if (!sessao) throw new ErroAplicacao('Sessão não encontrada ou expirada.', 404);
  if (sessao.estado !== 'aberta') {
    throw new ErroAplicacao('A sessão desta mesa já terminou.', 403);
  }

  return transacao(async (cliente) => {
    const { rows: pratos } = await cliente.query('SELECT id, nome FROM pratos WHERE id = $1', [pratoId]);
    if (!pratos[0]) throw new ErroAplicacao('Prato não encontrado.', 404);

    const { rows: existentes } = await cliente.query(
      'SELECT id FROM gostos_prato WHERE prato_id = $1 AND sessao_id = $2',
      [pratoId, sessao.id]
    );

    if (existentes[0]) {
      await cliente.query('DELETE FROM gostos_prato WHERE prato_id = $1 AND sessao_id = $2', [
        pratoId,
        sessao.id
      ]);
    } else {
      await cliente.query(
        'INSERT INTO gostos_prato (prato_id, sessao_id, criado_em) VALUES ($1, $2, $3)',
        [pratoId, sessao.id, agoraISO()]
      );
    }

    const { rows } = await cliente.query(
      'SELECT COUNT(*)::int AS total FROM gostos_prato WHERE prato_id = $1',
      [pratoId]
    );
    const total = rows[0].total;
    await cliente.query('UPDATE pratos SET gostos = $1 WHERE id = $2', [total, pratoId]);

    return { gostou: !existentes[0], gostos: total };
  });
}

module.exports = { alternarGosto };

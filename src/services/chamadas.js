// Regras de negócio das chamadas "Chamar empregado" e "Pedir a conta".
const { query } = require('../db');
const mesas = require('./mesas');
const { ErroAplicacao } = require('../lib/erros');
const { agoraISO, minutosDecorridos } = require('../lib/utils');

const SQL_CHAMADA = `
  SELECT c.*, m.numero AS mesa_numero, s.token AS sessao_token
  FROM chamadas c
  JOIN mesas m ON m.id = c.mesa_id
  LEFT JOIN sessoes_mesa s ON s.id = c.sessao_id
  WHERE c.id = $1
`;

function serializar(linha) {
  return {
    id: Number(linha.id),
    mesa_id: Number(linha.mesa_id),
    mesa_numero: linha.mesa_numero,
    sessao_id: linha.sessao_id == null ? null : Number(linha.sessao_id),
    sessao_token: linha.sessao_token,
    tipo: linha.tipo,
    estado: linha.estado,
    criada_em: linha.criada_em,
    resolvida_em: linha.resolvida_em,
    minutos_decorridos: minutosDecorridos(linha.criada_em)
  };
}

async function obterChamada(id) {
  const { rows } = await query(SQL_CHAMADA, [id]);
  return rows[0] || null;
}

async function criarChamada(token, tipo) {
  if (!['empregado', 'conta'].includes(tipo)) {
    throw new ErroAplicacao('Tipo de chamada inválido.', 400, 'tipo');
  }
  const sessao = await mesas.obterSessaoPorToken(token);
  if (!sessao || sessao.estado !== 'aberta') {
    throw new ErroAplicacao('A sessão desta mesa já foi fechada.', 403);
  }
  const mesa = await mesas.obterMesaPorId(sessao.mesa_id);
  if (!mesa || !mesa.ativa) throw new ErroAplicacao('A mesa já não está ativa.', 403);

  const { rows: pendentes } = await query(
    "SELECT * FROM chamadas WHERE mesa_id = $1 AND estado = 'pendente' ORDER BY id DESC LIMIT 1",
    [mesa.id]
  );
  const pendente = pendentes[0];
  if (pendente) {
    throw new ErroAplicacao(
      pendente.tipo === 'conta'
        ? 'O pedido de conta já foi enviado. Um empregado está a caminho.'
        : 'Já chamou um empregado. Aguarde, por favor.',
      429
    );
  }

  const { rows } = await query(
    `
      WITH nova AS (
        INSERT INTO chamadas (mesa_id, sessao_id, tipo, estado, criada_em)
        VALUES ($1, $2, $3, 'pendente', $4)
        RETURNING *
      )
      SELECT n.*, m.numero AS mesa_numero, s.token AS sessao_token
      FROM nova n
      JOIN mesas m ON m.id = n.mesa_id
      LEFT JOIN sessoes_mesa s ON s.id = n.sessao_id
    `,
    [mesa.id, sessao.id, tipo, agoraISO()]
  );
  return serializar(rows[0]);
}

async function listarChamadas(estado = 'pendente') {
  let sql = `
    SELECT c.*, m.numero AS mesa_numero, s.token AS sessao_token
    FROM chamadas c
    JOIN mesas m ON m.id = c.mesa_id
    LEFT JOIN sessoes_mesa s ON s.id = c.sessao_id
  `;
  const parametros = [];
  if (estado !== 'todas') {
    parametros.push(estado);
    sql += ` WHERE c.estado = $${parametros.length}`;
  }
  sql += ' ORDER BY c.criada_em ASC, c.id ASC LIMIT 100';
  const { rows } = await query(sql, parametros);
  return rows.map(serializar);
}

async function resolverChamada(id) {
  const chamada = await obterChamada(id);
  if (!chamada) throw new ErroAplicacao('Chamada não encontrada.', 404);
  if (chamada.estado === 'pendente') {
    await query("UPDATE chamadas SET estado = 'resolvida', resolvida_em = $1 WHERE id = $2", [agoraISO(), id]);
    return serializar(await obterChamada(id));
  }
  return serializar(chamada);
}

async function contarPendentes() {
  const { rows } = await query("SELECT COUNT(*)::int AS total FROM chamadas WHERE estado = 'pendente'");
  return rows[0].total;
}

module.exports = { criarChamada, listarChamadas, resolverChamada, contarPendentes };

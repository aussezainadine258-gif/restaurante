// Regras de negócio das chamadas "Chamar empregado" e "Pedir a conta".
const db = require('../db');
const mesas = require('./mesas');
const { ErroAplicacao } = require('../lib/erros');
const { agoraISO, minutosDecorridos } = require('../lib/utils');

const stmtChamada = db.prepare(`
  SELECT c.*, m.numero AS mesa_numero, s.token AS sessao_token
  FROM chamadas c
  JOIN mesas m ON m.id = c.mesa_id
  LEFT JOIN sessoes_mesa s ON s.id = c.sessao_id
  WHERE c.id = ?
`);

function serializar(linha) {
  return {
    id: linha.id,
    mesa_id: linha.mesa_id,
    mesa_numero: linha.mesa_numero,
    sessao_id: linha.sessao_id,
    sessao_token: linha.sessao_token,
    tipo: linha.tipo,
    estado: linha.estado,
    criada_em: linha.criada_em,
    resolvida_em: linha.resolvida_em,
    minutos_decorridos: minutosDecorridos(linha.criada_em)
  };
}

function criarChamada(token, tipo) {
  if (!['empregado', 'conta'].includes(tipo)) {
    throw new ErroAplicacao('Tipo de chamada inválido.', 400, 'tipo');
  }
  const sessao = mesas.obterSessaoPorToken(token);
  if (!sessao || sessao.estado !== 'aberta') {
    throw new ErroAplicacao('A sessão desta mesa já foi fechada.', 403);
  }
  const mesa = mesas.obterMesaPorId(sessao.mesa_id);
  if (!mesa || !mesa.ativa) throw new ErroAplicacao('A mesa já não está ativa.', 403);

  const pendente = db
    .prepare("SELECT * FROM chamadas WHERE mesa_id = ? AND estado = 'pendente' ORDER BY id DESC LIMIT 1")
    .get(mesa.id);
  if (pendente) {
    throw new ErroAplicacao(
      pendente.tipo === 'conta'
        ? 'O pedido de conta já foi enviado. Um empregado está a caminho.'
        : 'Já chamou um empregado. Aguarde, por favor.',
      429
    );
  }

  const info = db
    .prepare("INSERT INTO chamadas (mesa_id, sessao_id, tipo, estado, criada_em) VALUES (?, ?, ?, 'pendente', ?)")
    .run(mesa.id, sessao.id, tipo, agoraISO());
  return serializar(stmtChamada.get(info.lastInsertRowid));
}

function listarChamadas(estado = 'pendente') {
  let sql = `
    SELECT c.*, m.numero AS mesa_numero, s.token AS sessao_token
    FROM chamadas c
    JOIN mesas m ON m.id = c.mesa_id
    LEFT JOIN sessoes_mesa s ON s.id = c.sessao_id
  `;
  const parametros = [];
  if (estado !== 'todas') {
    sql += ' WHERE c.estado = ?';
    parametros.push(estado);
  }
  sql += ' ORDER BY c.criada_em ASC, c.id ASC LIMIT 100';
  return db.prepare(sql).all(...parametros).map(serializar);
}

function resolverChamada(id) {
  const chamada = stmtChamada.get(id);
  if (!chamada) throw new ErroAplicacao('Chamada não encontrada.', 404);
  if (chamada.estado === 'pendente') {
    db.prepare("UPDATE chamadas SET estado = 'resolvida', resolvida_em = ? WHERE id = ?").run(agoraISO(), id);
  }
  return serializar(stmtChamada.get(id));
}

function contarPendentes() {
  return db.prepare("SELECT COUNT(*) AS total FROM chamadas WHERE estado = 'pendente'").get().total;
}

module.exports = { criarChamada, listarChamadas, resolverChamada, contarPendentes };

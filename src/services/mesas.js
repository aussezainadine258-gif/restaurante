// Regras de negócio das mesas e sessões de mesa.
// Uma mesa ativa tem sempre uma sessão aberta (onde ficam os pedidos e o total).
const crypto = require('crypto');
const { pool, transacao } = require('../db');
const configuracoes = require('./configuracoes');
const { resumoSessao } = require('./serializadores');
const { ErroAplicacao } = require('../lib/erros');
const { agoraISO, tokenAleatorio, gerarCodigoMesa } = require('../lib/utils');

const SQL_MESA_POR_NUMERO = 'SELECT * FROM mesas WHERE numero = $1';
const SQL_MESA_POR_ID = 'SELECT * FROM mesas WHERE id = $1';
const SQL_SESSAO_ABERTA = `
  SELECT * FROM sessoes_mesa
  WHERE mesa_id = $1 AND estado = 'aberta'
  ORDER BY id DESC
  LIMIT 1
`;
const SQL_SESSAO_TOKEN = 'SELECT * FROM sessoes_mesa WHERE token = $1';
const SQL_CRIAR_SESSAO = `
  INSERT INTO sessoes_mesa (mesa_id, token, aberta_em, estado)
  VALUES ($1, $2, $3, 'aberta')
  RETURNING *
`;

async function obterMesaPorNumero(numero, executor = pool) {
  const { rows } = await executor.query(SQL_MESA_POR_NUMERO, [numero]);
  return rows[0] || null;
}

async function obterMesaPorId(id, executor = pool) {
  const { rows } = await executor.query(SQL_MESA_POR_ID, [id]);
  return rows[0] || null;
}

async function obterSessaoAberta(mesaId, executor = pool) {
  const { rows } = await executor.query(SQL_SESSAO_ABERTA, [mesaId]);
  return rows[0] || null;
}

async function obterSessaoPorToken(token, executor = pool) {
  const { rows } = await executor.query(SQL_SESSAO_TOKEN, [String(token || '')]);
  return rows[0] || null;
}

async function gerarCodigoUnico(executor = pool) {
  const { rows } = await executor.query('SELECT codigo FROM mesas WHERE ativa = TRUE AND codigo IS NOT NULL');
  const usados = new Set(rows.map((linha) => linha.codigo));
  for (let tentativa = 0; tentativa < 50; tentativa += 1) {
    const codigo = gerarCodigoMesa();
    if (!usados.has(codigo)) return codigo;
  }
  throw new ErroAplicacao('Não foi possível gerar um código de mesa. Tente novamente.', 500);
}

async function criarSessao(mesaId, executor = pool) {
  const token = tokenAleatorio();
  const { rows } = await executor.query(SQL_CRIAR_SESSAO, [mesaId, token, agoraISO()]);
  return rows[0];
}

// Ativa a mesa e gera um código de 4 dígitos. Se já estiver ativa, mantém
// a sessão e o código atuais (para não invalidar pedidos em curso).
async function ativarMesa(mesaId) {
  return transacao(async (cliente) => {
    const mesa = await obterMesaPorId(mesaId, cliente);
    if (!mesa) throw new ErroAplicacao('Mesa não encontrada.', 404);

    let sessao = await obterSessaoAberta(mesaId, cliente);
    if (mesa.ativa && sessao && mesa.codigo) {
      return { mesa, sessao, nova: false };
    }

    if (!sessao) sessao = await criarSessao(mesaId, cliente);
    const codigo = mesa.codigo || (await gerarCodigoUnico(cliente));
    await cliente.query('UPDATE mesas SET ativa = TRUE, codigo = $1 WHERE id = $2', [codigo, mesaId]);
    return {
      mesa: { ...mesa, ativa: true, codigo },
      sessao,
      nova: true
    };
  });
}

// Fecha a conta da mesa. Se existirem pedidos ainda em preparação, exige
// confirmação explícita (forcar) para evitar fechar contas por engano.
async function fecharMesa(mesaId, forcar = false) {
  return transacao(async (cliente) => {
    const mesa = await obterMesaPorId(mesaId, cliente);
    if (!mesa) throw new ErroAplicacao('Mesa não encontrada.', 404);
    const sessao = await obterSessaoAberta(mesaId, cliente);

    if (!sessao) {
      await cliente.query('UPDATE mesas SET ativa = FALSE, codigo = NULL WHERE id = $1', [mesaId]);
      return {
        jaFechada: true,
        mesa: { ...mesa, ativa: false, codigo: null },
        sessao: null,
        resumo: null
      };
    }

    const { rows } = await cliente.query(
      "SELECT COUNT(*)::int AS total FROM pedidos WHERE sessao_id = $1 AND estado IN ('Recebido','Em preparo','Pronto')",
      [sessao.id]
    );
    const ativos = rows[0].total;
    if (ativos > 0 && !forcar) {
      throw new ErroAplicacao(
        `Esta mesa tem ${ativos} pedido(s) por entregar. Confirme para fechar mesmo assim.`,
        409,
        'pedidos_ativos'
      );
    }

    const resumo = await resumoSessao(sessao, mesa, cliente);
    const agora = agoraISO();

    if (forcar && ativos > 0) {
      await cliente.query(
        "UPDATE pedidos SET estado = 'Entregue', atualizado_em = $1 WHERE sessao_id = $2 AND estado IN ('Recebido','Em preparo','Pronto')",
        [agora, sessao.id]
      );
    }

    await cliente.query("UPDATE sessoes_mesa SET estado = 'fechada', fechada_em = $1 WHERE id = $2", [
      agora,
      sessao.id
    ]);
    await cliente.query('UPDATE mesas SET ativa = FALSE, codigo = NULL WHERE id = $1', [mesaId]);
    await cliente.query(
      "UPDATE chamadas SET estado = 'resolvida', resolvida_em = $1 WHERE mesa_id = $2 AND estado = 'pendente'",
      [agora, mesaId]
    );

    return {
      jaFechada: false,
      mesa: { ...mesa, ativa: false, codigo: null },
      sessao,
      resumo: { ...resumo, aberta: false, pode_pedir: false }
    };
  });
}

function compararCodigo(a, b) {
  const bufferA = Buffer.from(String(a || '').padEnd(4, ' '));
  const bufferB = Buffer.from(String(b || '').padEnd(4, ' '));
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

// Valida o acesso do cliente à mesa. Devolve a mesa e a sessão aberta.
async function verificarAcessoMesa(numeroMesa, codigoInformado) {
  const mesa = await obterMesaPorNumero(numeroMesa);
  if (!mesa) throw new ErroAplicacao('Mesa não encontrada. Confirme o número da mesa.', 404);
  if (!mesa.ativa) {
    throw new ErroAplicacao('Esta mesa ainda não está ativa. Chame um empregado para a ativar.', 403);
  }

  const exigeCodigo = await configuracoes.codigoMesaAtivo();
  if (exigeCodigo) {
    if (!codigoInformado) {
      throw new ErroAplicacao('Introduza o código de 4 dígitos da mesa.', 400, 'codigo');
    }
    if (!mesa.codigo || !compararCodigo(codigoInformado, mesa.codigo)) {
      throw new ErroAplicacao('Código da mesa incorreto. Peça o código ao empregado.', 403, 'codigo');
    }
  }

  let sessao = await obterSessaoAberta(mesa.id);
  if (!sessao) sessao = await criarSessao(mesa.id);

  return { mesa, sessao, exigeCodigo };
}

// Obtém a sessão e o resumo para a página de acompanhamento do cliente.
async function resumoPorToken(token) {
  const sessao = await obterSessaoPorToken(token);
  if (!sessao) throw new ErroAplicacao('Sessão não encontrada ou expirada.', 404);
  const mesa = await obterMesaPorId(sessao.mesa_id);
  if (!mesa) throw new ErroAplicacao('Mesa não encontrada.', 404);
  return resumoSessao(sessao, mesa);
}

// Lista as mesas com o estado atual da sessão (usado pelo painel).
async function listarMesas() {
  const { rows } = await pool.query(`
    SELECT
      m.*,
      s.id AS sessao_id,
      s.token AS sessao_token,
      s.aberta_em AS sessao_aberta_em,
      COALESCE(
        (SELECT SUM(p.total_centavos) FROM pedidos p
         WHERE p.sessao_id = s.id AND p.estado <> 'Cancelado'),
        0
      )::bigint AS total_centavos,
      COALESCE(
        (SELECT COUNT(*) FROM pedidos p
         WHERE p.sessao_id = s.id AND p.estado <> 'Cancelado'),
        0
      )::int AS total_pedidos,
      (SELECT MAX(p.atualizado_em) FROM pedidos p WHERE p.sessao_id = s.id) AS ultima_atualizacao
    FROM mesas m
    LEFT JOIN LATERAL (
      SELECT * FROM sessoes_mesa
      WHERE mesa_id = m.id AND estado = 'aberta'
      ORDER BY id DESC
      LIMIT 1
    ) s ON TRUE
    ORDER BY m.numero ASC
  `);

  return rows.map((linha) => ({
    id: Number(linha.id),
    numero: linha.numero,
    ativa: Boolean(linha.ativa),
    codigo: linha.codigo,
    sessao: linha.sessao_id
      ? {
          id: Number(linha.sessao_id),
          token: linha.sessao_token,
          aberta_em: linha.sessao_aberta_em,
          ultima_atualizacao: linha.ultima_atualizacao || linha.sessao_aberta_em
        }
      : null,
    total_centavos: Number(linha.total_centavos) || 0,
    total_pedidos: Number(linha.total_pedidos) || 0
  }));
}

module.exports = {
  obterMesaPorNumero,
  obterMesaPorId,
  obterSessaoAberta,
  obterSessaoPorToken,
  ativarMesa,
  fecharMesa,
  verificarAcessoMesa,
  resumoPorToken,
  listarMesas,
  gerarCodigoUnico
};

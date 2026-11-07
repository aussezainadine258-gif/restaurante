// Regras de negócio das mesas e sessões de mesa.
// Uma mesa ativa tem sempre uma sessão aberta (onde ficam os pedidos e o total).
const crypto = require('crypto');
const db = require('../db');
const configuracoes = require('./configuracoes');
const { resumoSessao } = require('./serializadores');
const { ErroAplicacao } = require('../lib/erros');
const { agoraISO, tokenAleatorio, gerarCodigoMesa } = require('../lib/utils');

const stmtMesaNumero = db.prepare('SELECT * FROM mesas WHERE numero = ?');
const stmtMesaId = db.prepare('SELECT * FROM mesas WHERE id = ?');
const stmtSessaoAberta = db.prepare(
  "SELECT * FROM sessoes_mesa WHERE mesa_id = ? AND estado = 'aberta' ORDER BY id DESC LIMIT 1"
);
const stmtSessaoToken = db.prepare('SELECT * FROM sessoes_mesa WHERE token = ?');
const stmtCriarSessao = db.prepare(
  "INSERT INTO sessoes_mesa (mesa_id, token, aberta_em, estado) VALUES (?, ?, ?, 'aberta')"
);

function obterMesaPorNumero(numero) {
  return stmtMesaNumero.get(numero) || null;
}

function obterMesaPorId(id) {
  return stmtMesaId.get(id) || null;
}

function obterSessaoAberta(mesaId) {
  return stmtSessaoAberta.get(mesaId) || null;
}

function obterSessaoPorToken(token) {
  return stmtSessaoToken.get(String(token || '')) || null;
}

function gerarCodigoUnico() {
  const usados = new Set(
    db
      .prepare('SELECT codigo FROM mesas WHERE ativa = 1 AND codigo IS NOT NULL')
      .all()
      .map((linha) => linha.codigo)
  );
  for (let tentativa = 0; tentativa < 50; tentativa += 1) {
    const codigo = gerarCodigoMesa();
    if (!usados.has(codigo)) return codigo;
  }
  throw new ErroAplicacao('Não foi possível gerar um código de mesa. Tente novamente.', 500);
}

function criarSessao(mesaId) {
  const token = tokenAleatorio();
  const info = stmtCriarSessao.run(mesaId, token, agoraISO());
  return stmtSessaoToken.get(token) || db.prepare('SELECT * FROM sessoes_mesa WHERE id = ?').get(info.lastInsertRowid);
}

// Ativa a mesa e gera um código de 4 dígitos. Se já estiver ativa, mantém
// a sessão e o código atuais (para não invalidar pedidos em curso).
const ativarMesaTransacao = db.transaction((mesaId) => {
  const mesa = obterMesaPorId(mesaId);
  if (!mesa) throw new ErroAplicacao('Mesa não encontrada.', 404);

  let sessao = obterSessaoAberta(mesaId);
  if (mesa.ativa && sessao && mesa.codigo) {
    return { mesa, sessao, nova: false };
  }

  if (!sessao) sessao = criarSessao(mesaId);
  const codigo = mesa.codigo || gerarCodigoUnico();
  db.prepare('UPDATE mesas SET ativa = 1, codigo = ? WHERE id = ?').run(codigo, mesaId);
  return {
    mesa: { ...mesa, ativa: 1, codigo },
    sessao,
    nova: true
  };
});

function ativarMesa(mesaId) {
  return ativarMesaTransacao(mesaId);
}

// Fecha a conta da mesa. Se existirem pedidos ainda em preparação, exige
// confirmação explícita (forcar) para evitar fechar contas por engano.
const fecharMesaTransacao = db.transaction((mesaId, forcar) => {
  const mesa = obterMesaPorId(mesaId);
  if (!mesa) throw new ErroAplicacao('Mesa não encontrada.', 404);
  const sessao = obterSessaoAberta(mesaId);
  if (!sessao) {
    db.prepare('UPDATE mesas SET ativa = 0, codigo = NULL WHERE id = ?').run(mesaId);
    return { jaFechada: true, mesa, sessao: null, resumo: null };
  }

  const ativos = db
    .prepare("SELECT COUNT(*) AS total FROM pedidos WHERE sessao_id = ? AND estado IN ('Recebido','Em preparo','Pronto')")
    .get(sessao.id).total;
  if (ativos > 0 && !forcar) {
    throw new ErroAplicacao(
      `Esta mesa tem ${ativos} pedido(s) por entregar. Confirme para fechar mesmo assim.`,
      409,
      'pedidos_ativos'
    );
  }

  const resumo = resumoSessao(sessao, mesa);
  if (forcar && ativos > 0) {
    db.prepare(
      "UPDATE pedidos SET estado = 'Entregue', atualizado_em = ? WHERE sessao_id = ? AND estado IN ('Recebido','Em preparo','Pronto')"
    ).run(agoraISO(), sessao.id);
  }

  db.prepare("UPDATE sessoes_mesa SET estado = 'fechada', fechada_em = ? WHERE id = ?").run(agoraISO(), sessao.id);
  db.prepare('UPDATE mesas SET ativa = 0, codigo = NULL WHERE id = ?').run(mesaId);
  db.prepare(
    "UPDATE chamadas SET estado = 'resolvida', resolvida_em = ? WHERE mesa_id = ? AND estado = 'pendente'"
  ).run(agoraISO(), mesaId);

  return {
    jaFechada: false,
    mesa,
    sessao,
    resumo: { ...resumo, aberta: false, pode_pedir: false }
  };
});

function fecharMesa(mesaId, forcar = false) {
  return fecharMesaTransacao(mesaId, Boolean(forcar));
}

function compararCodigo(a, b) {
  const bufferA = Buffer.from(String(a || '').padEnd(4, ' '));
  const bufferB = Buffer.from(String(b || '').padEnd(4, ' '));
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

// Valida o acesso do cliente à mesa. Devolve a mesa e a sessão aberta.
function verificarAcessoMesa(numeroMesa, codigoInformado) {
  const mesa = obterMesaPorNumero(numeroMesa);
  if (!mesa) throw new ErroAplicacao('Mesa não encontrada. Confirme o número da mesa.', 404);
  if (!mesa.ativa) {
    throw new ErroAplicacao('Esta mesa ainda não está ativa. Chame um empregado para a ativar.', 403);
  }

  const exigeCodigo = configuracoes.codigoMesaAtivo();
  if (exigeCodigo) {
    if (!codigoInformado) {
      throw new ErroAplicacao('Introduza o código de 4 dígitos da mesa.', 400, 'codigo');
    }
    if (!mesa.codigo || !compararCodigo(codigoInformado, mesa.codigo)) {
      throw new ErroAplicacao('Código da mesa incorreto. Peça o código ao empregado.', 403, 'codigo');
    }
  }

  let sessao = obterSessaoAberta(mesa.id);
  if (!sessao) sessao = criarSessao(mesa.id);

  return { mesa, sessao, exigeCodigo };
}

// Obtém a sessão e o resumo para a página de acompanhamento do cliente.
function resumoPorToken(token) {
  const sessao = obterSessaoPorToken(token);
  if (!sessao) throw new ErroAplicacao('Sessão não encontrada ou expirada.', 404);
  const mesa = obterMesaPorId(sessao.mesa_id);
  if (!mesa) throw new ErroAplicacao('Mesa não encontrada.', 404);
  return resumoSessao(sessao, mesa);
}

// Lista as mesas com o estado atual da sessão (usado pelo painel).
function listarMesas() {
  const mesas = db.prepare('SELECT * FROM mesas ORDER BY numero ASC').all();
  const stmtTotal = db.prepare(`
    SELECT COALESCE(SUM(total_centavos), 0) AS total, COUNT(*) AS pedidos
    FROM pedidos WHERE sessao_id = ? AND estado != 'Cancelado'
  `);
  const stmtUltimo = db.prepare(
    'SELECT MAX(atualizado_em) AS ultima FROM pedidos WHERE sessao_id = ?'
  );
  return mesas.map((mesa) => {
    const sessao = obterSessaoAberta(mesa.id);
    const conta = sessao ? stmtTotal.get(sessao.id) : { total: 0, pedidos: 0 };
    return {
      id: mesa.id,
      numero: mesa.numero,
      ativa: Boolean(mesa.ativa),
      codigo: mesa.codigo,
      sessao: sessao
        ? {
            id: sessao.id,
            token: sessao.token,
            aberta_em: sessao.aberta_em,
            ultima_atualizacao: stmtUltimo.get(sessao.id).ultima || sessao.aberta_em
          }
        : null,
      total_centavos: conta.total,
      total_pedidos: conta.pedidos
    };
  });
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

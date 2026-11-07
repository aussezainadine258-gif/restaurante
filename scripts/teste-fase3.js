// Teste de integração da Fase 3 (ecrã da cozinha).
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const db = require('../src/db');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
let cookie = '';

async function pedir(caminho, { method = 'GET', body, headers = {} } = {}) {
  const opcoes = { method, redirect: 'manual', headers: { ...headers } };
  if (cookie) opcoes.headers.cookie = cookie;
  if (body instanceof URLSearchParams) {
    opcoes.body = body;
  } else if (body && typeof body === 'object') {
    opcoes.headers['content-type'] = 'application/json';
    opcoes.body = JSON.stringify(body);
  } else if (body !== undefined) {
    opcoes.body = body;
  }
  const resposta = await fetch(BASE + caminho, opcoes);
  const cookies = resposta.headers.getSetCookie
    ? resposta.headers.getSetCookie()
    : resposta.headers.get('set-cookie')
      ? [resposta.headers.get('set-cookie')]
      : [];
  if (cookies.length) cookie = cookies.map((valor) => valor.split(';')[0]).join('; ');
  return resposta;
}

async function json(resposta) {
  return { status: resposta.status, dados: await resposta.json() };
}

(async () => {
  console.log('FASE 3 — teste do ecrã da cozinha');

  // Garante uma mesa ativa com sessão aberta para testar o fluxo público.
  const mesa = db.prepare('SELECT * FROM mesas WHERE numero = 5').get();
  const codigo = mesa.codigo || '5000';
  db.prepare('UPDATE mesas SET ativa = 1, codigo = ? WHERE id = ?').run(codigo, mesa.id);
  let sessao = db
    .prepare("SELECT * FROM sessoes_mesa WHERE mesa_id = ? AND estado = 'aberta' ORDER BY id DESC LIMIT 1")
    .get(mesa.id);
  if (!sessao) {
    const token = crypto.randomBytes(24).toString('hex');
    db.prepare("INSERT INTO sessoes_mesa (mesa_id, token, aberta_em, estado) VALUES (?, ?, ?, 'aberta')").run(
      mesa.id,
      token,
      new Date().toISOString()
    );
    sessao = db.prepare('SELECT * FROM sessoes_mesa WHERE token = ?').get(token);
  }

  const verificar = await json(
    await pedir('/api/mesa/verificar', { method: 'POST', body: { mesa: 5, codigo } })
  );
  assert.strictEqual(verificar.status, 200);
  const token = verificar.dados.sessao.token;

  const pratos = db.prepare('SELECT id FROM pratos WHERE disponivel = 1 ORDER BY id LIMIT 2').all();
  const criar = await json(
    await pedir('/api/pedidos', {
      method: 'POST',
      body: {
        token,
        observacoes: 'Pedido do teste da cozinha',
        itens: pratos.map((prato) => ({ prato_id: prato.id, quantidade: 1, observacao: 'Sem cebola' }))
      }
    })
  );
  assert.strictEqual(criar.status, 201);
  const pedidoId = criar.dados.pedido.id;
  console.log(`  ok  pedido #${pedidoId} criado pelo cliente`);

  const semSessao = await pedir('/cozinha/api/pedidos');
  assert.strictEqual(semSessao.status, 401);
  console.log('  ok  API da cozinha protegida sem sessão');

  const login = await pedir('/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: 'cozinha', password: 'cozinha123' })
  });
  assert.strictEqual(login.status, 302);
  assert.ok(login.headers.get('location').endsWith('/cozinha'), 'Cozinha deve entrar direto no ecrã');
  console.log('  ok  login da cozinha redireciona para /cozinha');

  const pagina = await pedir('/cozinha');
  assert.strictEqual(pagina.status, 200);
  const html = await pagina.text();
  assert.ok(html.includes('Cozinha · ecrã de preparo'));
  assert.ok(html.includes('/css/cozinha.css'));
  assert.ok(html.includes('/js/cozinha.js'));
  assert.ok(html.includes('id="lista-cozinha"'));
  console.log('  ok  página da cozinha renderizada');

  const lista = await json(await pedir('/cozinha/api/pedidos'));
  assert.strictEqual(lista.status, 200);
  assert.ok(Array.isArray(lista.dados.pedidos));
  assert.ok(lista.dados.pedidos.some((p) => p.id === pedidoId));
  assert.ok(lista.dados.resumo && typeof lista.dados.resumo.contagem.Recebido === 'number');
  console.log('  ok  pedido visível na lista da cozinha');

  const invalida = await json(
    await pedir(`/cozinha/api/pedidos/${pedidoId}/estado`, {
      method: 'PATCH',
      body: { estado: 'Entregue' }
    })
  );
  assert.strictEqual(invalida.status, 409, 'Transição inválida deve ser recusada');
  console.log('  ok  transição inválida recusada');

  const preparo = await json(
    await pedir(`/cozinha/api/pedidos/${pedidoId}/estado`, {
      method: 'PATCH',
      body: { estado: 'Em preparo' }
    })
  );
  assert.strictEqual(preparo.status, 200);
  assert.strictEqual(preparo.dados.pedido.estado, 'Em preparo');

  const pronto = await json(
    await pedir(`/cozinha/api/pedidos/${pedidoId}/estado`, {
      method: 'PATCH',
      body: { estado: 'Pronto' }
    })
  );
  assert.strictEqual(pronto.status, 200);
  assert.strictEqual(pronto.dados.pedido.estado, 'Pronto');
  console.log('  ok  pedido passou a Em preparo e Pronto');

  const listaDepois = await json(await pedir('/cozinha/api/pedidos'));
  assert.ok(!listaDepois.dados.pedidos.some((p) => p.id === pedidoId), 'Pronto deve sair do ecrã');
  console.log('  ok  pedido pronto saiu do ecrã da cozinha');

  const adminProibido = await pedir('/admin/api/pedidos');
  assert.strictEqual(adminProibido.status, 403, 'Cozinha não deve aceder às APIs de gerência');
  console.log('  ok  cozinha não acede ao painel da gerência');

  const terminar = await pedir('/admin/logout', { method: 'POST' });
  assert.strictEqual(terminar.status, 302);

  console.log('FASE 3 OK');
})().catch((erro) => {
  console.error('FASE 3 FALHOU:', erro.message);
  console.error(erro);
  process.exit(1);
});

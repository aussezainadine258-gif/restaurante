// Teste de integração da Fase 4 (relatórios).
'use strict';

const assert = require('assert');
const bcrypt = require('bcrypt');
const db = require('../src/db');
const { hojeLocal } = require('../src/services/relatorios');

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
  console.log('FASE 4 — teste dos relatórios');

  const hoje = hojeLocal();

  const semSessao = await pedir('/admin/api/relatorios');
  assert.strictEqual(semSessao.status, 401);
  console.log('  ok  API de relatórios protegida');

  // Admin sem troca de password pendente para este teste.
  db.prepare('UPDATE utilizadores SET password_hash = ?, deve_alterar_password = 0 WHERE username = ?').run(
    bcrypt.hashSync('admin123', 12),
    'admin'
  );

  const login = await pedir('/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: 'admin', password: 'admin123' })
  });
  assert.strictEqual(login.status, 302);
  assert.ok(login.headers.get('location').endsWith('/admin'));
  console.log('  ok  login de administrador');

  const pagina = await pedir('/admin/relatorios');
  assert.strictEqual(pagina.status, 200);
  const html = await pagina.text();
  assert.ok(html.includes('Relatórios'));
  assert.ok(html.includes('/vendor/chart.umd.js'));
  assert.ok(html.includes('/js/relatorios.js'));
  assert.ok(html.includes('id="grafico-receita"'));
  assert.ok(html.includes('id="grafico-horas"'));
  assert.ok(html.includes('id="grafico-pratos"'));
  assert.ok(html.includes('id="tabela-pratos"'));
  console.log('  ok  página de relatórios renderizada');

  const chart = await pedir('/vendor/chart.umd.js');
  assert.strictEqual(chart.status, 200);
  assert.ok((await chart.text()).includes('Chart'));
  console.log('  ok  Chart.js servido localmente');

  const resposta = await json(await pedir(`/admin/api/relatorios?data=${hoje}`));
  assert.strictEqual(resposta.status, 200);
  const dados = resposta.dados;
  assert.strictEqual(dados.data, hoje);
  assert.strictEqual(dados.dias.length, 7);
  assert.strictEqual(dados.horas.length, 24);
  assert.ok(Array.isArray(dados.pratos));
  assert.ok(typeof dados.resumo.total_centavos === 'number');
  assert.ok(typeof dados.resumo.ticket_medio_centavos === 'number');
  assert.ok(dados.resumo.artigos_vendidos >= 0);
  console.log(
    `  ok  relatório de hoje (${dados.resumo.total_formatado}, ${dados.resumo.pedidos} pedido(s), ${dados.resumo.artigos_vendidos} artigo(s))`
  );

  const ultimoDia = dados.dias[dados.dias.length - 1];
  assert.strictEqual(ultimoDia.data, hoje);
  assert.strictEqual(ultimoDia.total_centavos, dados.resumo.total_centavos);

  const potenciaisPedidos = dados.horas.reduce((soma, hora) => soma + hora.pedidos, 0);
  assert.strictEqual(potenciaisPedidos, dados.resumo.pedidos);
  console.log('  ok  totais dos gráficos coincidem com o resumo');

  const invalida = await json(await pedir('/admin/api/relatorios?data=invalida'));
  assert.strictEqual(invalida.status, 200);
  assert.strictEqual(invalida.dados.data, hoje);
  console.log('  ok  data inválida recai no dia atual');

  const vazio = await json(await pedir('/admin/api/relatorios?data=2020-01-01'));
  assert.strictEqual(vazio.status, 200);
  assert.strictEqual(vazio.dados.resumo.total_centavos, 0);
  assert.strictEqual(vazio.dados.resumo.pedidos, 0);
  assert.strictEqual(vazio.dados.pratos.length, 0);
  console.log('  ok  dia sem vendas devolve totais a zero');

  const terminar = await pedir('/admin/logout', { method: 'POST' });
  assert.strictEqual(terminar.status, 302);

  console.log('FASE 4 OK');
})().catch((erro) => {
  console.error('FASE 4 FALHOU:', erro.message);
  console.error(erro);
  process.exit(1);
});

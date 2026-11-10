// Teste de integração da Fase 2 (painel da gerência).
// Requer o servidor a correr e a password inicial admin123.
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const bcrypt = require('bcrypt');
const { query, pool } = require('../src/db');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const armazenamentoLocal = !process.env.SUPABASE_URL;
let cookie = '';

// Constrói um MP4 mínimo com uma caixa mvhd válida para testar a duração.
function mp4ComDuracao(segundos) {
  const buffer = Buffer.alloc(120);
  buffer.writeUInt32BE(108, 0);
  buffer.write('ftyp', 4, 'ascii');
  buffer.write('isom', 8, 'ascii');
  buffer.writeUInt32BE(32, 40);
  buffer.write('mvhd', 44, 'ascii');
  buffer[48] = 0; // versão 0
  buffer.writeUInt32BE(1000, 60); // timescale
  buffer.writeUInt32BE(Math.round(segundos * 1000), 64); // duração
  return buffer;
}

async function pedir(caminho, { method = 'GET', body, headers = {} } = {}) {
  const opcoes = { method, redirect: 'manual', headers: { ...headers } };
  if (cookie) opcoes.headers.cookie = cookie;
  if (body instanceof FormData) {
    opcoes.body = body;
  } else if (body instanceof URLSearchParams) {
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
  const dados = await resposta.json();
  return { status: resposta.status, dados };
}

(async () => {
  console.log('FASE 2 — teste do painel');

  // Estado inicial conhecido: admin volta à password inicial e mesa 1 fica livre.
  await query('UPDATE utilizadores SET password_hash = $1, deve_alterar_password = TRUE WHERE username = $2', [
    bcrypt.hashSync('admin123', 12),
    'admin'
  ]);
  await query(
    "UPDATE sessoes_mesa SET estado = 'fechada', fechada_em = $1 WHERE mesa_id = 1 AND estado = 'aberta'",
    [new Date()]
  );
  await query('UPDATE mesas SET ativa = FALSE, codigo = NULL WHERE id = 1');

  const semSessao = await pedir('/admin/api/pedidos');
  assert.strictEqual(semSessao.status, 401, 'API deve exigir sessão');
  console.log('  ok  API protegida sem sessão');

  const login = await pedir('/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: 'admin', password: 'admin123' })
  });
  assert.strictEqual(login.status, 302, 'Login deve redirecionar');
  assert.ok(login.headers.get('location').includes('/admin/password'), 'Primeiro login deve pedir troca de password');
  console.log('  ok  login inicial força alteração de password');

  const painelBloqueado = await pedir('/admin');
  assert.strictEqual(painelBloqueado.status, 302, 'Painel deve estar bloqueado');
  assert.ok(painelBloqueado.headers.get('location').includes('/admin/password'));

  const alterar = await pedir('/admin/password', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      password_atual: 'admin123',
      password_nova: 'admin1234',
      password_confirmar: 'admin1234'
    })
  });
  assert.strictEqual(alterar.status, 302, 'Alteração de password deve redirecionar');
  assert.ok(alterar.headers.get('location').endsWith('/admin'));
  console.log('  ok  password alterada e painel desbloqueado');

  const painel = await pedir('/admin');
  assert.strictEqual(painel.status, 200);
  const htmlPainel = await painel.text();
  assert.ok(htmlPainel.includes('Painel da gerência'));
  assert.ok(htmlPainel.includes('/js/admin.js'));
  assert.ok(htmlPainel.includes('modal-password'));
  assert.ok(htmlPainel.includes('data-utilizador-atual'));
  console.log('  ok  página do painel renderizada');

  const pedidos = await json(await pedir('/admin/api/pedidos?estado=todos'));
  assert.strictEqual(pedidos.status, 200);
  assert.ok(Array.isArray(pedidos.dados.pedidos));
  assert.ok(pedidos.dados.resumo && typeof pedidos.dados.resumo.contagem.Recebido === 'number');
  assert.ok(Array.isArray(pedidos.dados.chamadas));
  console.log(`  ok  API de pedidos (${pedidos.dados.pedidos.length} pedido(s))`);

  const menu = await json(await pedir('/admin/api/menu'));
  assert.strictEqual(menu.status, 200);
  assert.ok(menu.dados.categorias.length >= 4);
  assert.ok(menu.dados.pratos.length >= 12);
  console.log(`  ok  API do menu (${menu.dados.categorias.length} categorias, ${menu.dados.pratos.length} pratos)`);

  const categoria = await json(
    await pedir('/admin/api/categorias', {
      method: 'POST',
      body: { nome: 'Categoria Teste Fase 2', ordem: 99 }
    })
  );
  assert.strictEqual(categoria.status, 201);
  const categoriaId = categoria.dados.categoria.id;

  const categoriaEditada = await json(
    await pedir(`/admin/api/categorias/${categoriaId}`, {
      method: 'PUT',
      body: { nome: 'Categoria Teste Fase 2', ordem: 98 }
    })
  );
  assert.strictEqual(categoriaEditada.status, 200);
  console.log('  ok  categoria criada e editada');

  // Vídeo com 20 segundos deve ser recusado pela validação do servidor.
  const formularioVideoLongo = new FormData();
  formularioVideoLongo.append('nome', 'Prato com vídeo longo');
  formularioVideoLongo.append('descricao', 'Não deve ser criado.');
  formularioVideoLongo.append('preco', '100');
  formularioVideoLongo.append('tempo_preparo', '10');
  formularioVideoLongo.append('categoria_id', String(categoriaId));
  formularioVideoLongo.append('disponivel', '1');
  formularioVideoLongo.append('etiquetas', JSON.stringify([]));
  formularioVideoLongo.append(
    'video',
    new Blob([mp4ComDuracao(20)], { type: 'video/mp4' }),
    'longo.mp4'
  );
  const videoLongo = await json(
    await pedir('/admin/api/pratos', { method: 'POST', body: formularioVideoLongo })
  );
  assert.strictEqual(videoLongo.status, 400);
  assert.ok(videoLongo.dados.erro.includes('Vídeo demasiado grande'));
  console.log('  ok  vídeo com mais de 15 segundos recusado');

  const imagem = await sharp({
    create: { width: 1200, height: 900, channels: 3, background: { r: 255, g: 107, b: 0 } }
  })
    .jpeg()
    .toBuffer();
  const videoValido = mp4ComDuracao(8);

  const formulario = new FormData();
  formulario.append('nome', 'Prato Teste Fase 2');
  formulario.append('descricao', 'Prato criado pelo teste automático.');
  formulario.append('preco', '450.50');
  formulario.append('tempo_preparo', '12');
  formulario.append('categoria_id', String(categoriaId));
  formulario.append('disponivel', '1');
  formulario.append('etiquetas', JSON.stringify(['novo', 'vegetariano']));
  formulario.append('foto', new Blob([imagem], { type: 'image/jpeg' }), 'teste-fase2.jpg');
  formulario.append('video', new Blob([videoValido], { type: 'video/mp4' }), 'teste-fase2.mp4');

  const prato = await json(await pedir('/admin/api/pratos', { method: 'POST', body: formulario }));
  assert.strictEqual(prato.status, 201);
  assert.strictEqual(prato.dados.prato.preco_centavos, 45050);
  assert.strictEqual(prato.dados.prato.foto_url, prato.dados.prato.foto);
  assert.ok(prato.dados.prato.foto.includes('prato-placeholder') === false);
  assert.ok(prato.dados.prato.video_url);
  if (armazenamentoLocal) {
    assert.ok(prato.dados.prato.foto_url.includes('/uploads/pratos/'));
    assert.ok(prato.dados.prato.video_url.includes('/uploads/videos/'));
  }
  assert.deepStrictEqual(prato.dados.prato.etiquetas.sort(), ['novo', 'vegetariano'].sort());
  const pratoId = prato.dados.prato.id;
  const fotoAntiga = prato.dados.prato.foto_url;
  const videoAntigo = prato.dados.prato.video_url;

  const indisponivel = await json(
    await pedir(`/admin/api/pratos/${pratoId}/disponibilidade`, {
      method: 'PATCH',
      body: { disponivel: false }
    })
  );
  assert.strictEqual(indisponivel.status, 200);
  assert.strictEqual(indisponivel.dados.prato.disponivel, false);

  const formularioEdicao = new FormData();
  formularioEdicao.append('nome', 'Prato Teste Fase 2 editado');
  formularioEdicao.append('descricao', 'Atualizado pelo teste.');
  formularioEdicao.append('preco', '500');
  formularioEdicao.append('tempo_preparo', '15');
  formularioEdicao.append('categoria_id', String(categoriaId));
  formularioEdicao.append('disponivel', '1');
  formularioEdicao.append('etiquetas', JSON.stringify(['picante']));

  const pratoEditado = await json(
    await pedir(`/admin/api/pratos/${pratoId}`, { method: 'PUT', body: formularioEdicao })
  );
  assert.strictEqual(pratoEditado.status, 200);
  assert.strictEqual(pratoEditado.dados.prato.nome, 'Prato Teste Fase 2 editado');
  assert.strictEqual(pratoEditado.dados.prato.preco_centavos, 50000);
  assert.strictEqual(pratoEditado.dados.prato.foto_url, fotoAntiga, 'edição sem ficheiro mantém a foto');
  assert.strictEqual(pratoEditado.dados.prato.video_url, videoAntigo, 'edição sem ficheiro mantém o vídeo');

  // Substituir foto e vídeo deve apagar os ficheiros antigos.
  const imagemNova = await sharp({
    create: { width: 900, height: 700, channels: 3, background: { r: 20, g: 120, b: 220 } }
  })
    .jpeg()
    .toBuffer();
  const formularioSubstituir = new FormData();
  formularioSubstituir.append('nome', 'Prato Teste Fase 2 editado');
  formularioSubstituir.append('descricao', 'Com novos ficheiros.');
  formularioSubstituir.append('preco', '500');
  formularioSubstituir.append('tempo_preparo', '15');
  formularioSubstituir.append('categoria_id', String(categoriaId));
  formularioSubstituir.append('disponivel', '1');
  formularioSubstituir.append('etiquetas', JSON.stringify(['picante']));
  formularioSubstituir.append('foto', new Blob([imagemNova], { type: 'image/jpeg' }), 'nova.jpg');
  formularioSubstituir.append(
    'video',
    new Blob([mp4ComDuracao(10)], { type: 'video/mp4' }),
    'novo.mp4'
  );
  const substituido = await json(
    await pedir(`/admin/api/pratos/${pratoId}`, { method: 'PUT', body: formularioSubstituir })
  );
  assert.strictEqual(substituido.status, 200);
  assert.notStrictEqual(substituido.dados.prato.foto_url, fotoAntiga);
  assert.notStrictEqual(substituido.dados.prato.video_url, videoAntigo);
  if (armazenamentoLocal) {
    const caminhoFotoAntiga = path.join(process.cwd(), 'public', fotoAntiga.replace(/^\//, ''));
    const caminhoVideoAntigo = path.join(process.cwd(), 'public', videoAntigo.replace(/^\//, ''));
    assert.ok(!fs.existsSync(caminhoFotoAntiga), 'foto antiga deve ser apagada');
    assert.ok(!fs.existsSync(caminhoVideoAntigo), 'vídeo antigo deve ser apagado');
  }

  // Remover os dois ficheiros.
  const formularioRemover = new FormData();
  formularioRemover.append('nome', 'Prato Teste Fase 2 editado');
  formularioRemover.append('descricao', 'Sem ficheiros.');
  formularioRemover.append('preco', '500');
  formularioRemover.append('tempo_preparo', '15');
  formularioRemover.append('categoria_id', String(categoriaId));
  formularioRemover.append('disponivel', '1');
  formularioRemover.append('etiquetas', JSON.stringify([]));
  formularioRemover.append('remover_foto', '1');
  formularioRemover.append('remover_video', '1');
  const removido = await json(
    await pedir(`/admin/api/pratos/${pratoId}`, { method: 'PUT', body: formularioRemover })
  );
  assert.strictEqual(removido.status, 200);
  assert.strictEqual(removido.dados.prato.video_url, null);
  assert.ok(removido.dados.prato.foto_url.includes('prato-placeholder'));
  console.log('  ok  prato criado, foto/vídeo processados, substituídos, removidos e editados');

  const eliminarPrato = await pedir(`/admin/api/pratos/${pratoId}`, { method: 'DELETE' });
  assert.strictEqual(eliminarPrato.status, 200);
  const eliminarCategoria = await pedir(`/admin/api/categorias/${categoriaId}`, { method: 'DELETE' });
  assert.strictEqual(eliminarCategoria.status, 200);
  console.log('  ok  prato e categoria de teste eliminados');

  const mesas = await json(await pedir('/admin/api/mesas'));
  assert.strictEqual(mesas.status, 200);
  assert.strictEqual(mesas.dados.mesas.length, 10);

  const ativar = await json(await pedir('/admin/api/mesas/1/ativar', { method: 'POST' }));
  assert.strictEqual(ativar.status, 200);
  assert.match(String(ativar.dados.mesa.codigo), /^\d{4}$/);
  assert.strictEqual(ativar.dados.mesa.ativa, true);
  const codigoMesa1 = ativar.dados.mesa.codigo;

  const qr = await pedir('/admin/mesas/1/qrcode.png');
  assert.strictEqual(qr.status, 200);
  assert.ok((qr.headers.get('content-type') || '').includes('image/png'));
  const qrBuffer = Buffer.from(await qr.arrayBuffer());
  assert.ok(qrBuffer.length > 1000);
  console.log(`  ok  mesa 1 ativada (código ${codigoMesa1}) e QR PNG gerado`);

  const conta = await json(await pedir('/admin/api/mesas/1/conta'));
  assert.strictEqual(conta.status, 200);
  assert.strictEqual(conta.dados.aberta, true);
  assert.ok(conta.dados.resumo);

  const fechar = await json(await pedir('/admin/api/mesas/1/fechar', { method: 'POST', body: { forcar: false } }));
  assert.strictEqual(fechar.status, 200);
  assert.strictEqual(fechar.dados.ja_fechada, false);

  const fecharNovamente = await json(
    await pedir('/admin/api/mesas/1/fechar', { method: 'POST', body: { forcar: false } })
  );
  assert.strictEqual(fecharNovamente.dados.ja_fechada, true);
  console.log('  ok  conta da mesa consultada e fechada');

  const configuracoes = await json(await pedir('/admin/api/configuracoes'));
  assert.strictEqual(configuracoes.status, 200);
  const guardarConfig = await json(
    await pedir('/admin/api/configuracoes', {
      method: 'PUT',
      body: {
        nome_restaurante: configuracoes.dados.nome_restaurante,
        codigo_mesa_ativo: String(configuracoes.dados.codigo_mesa_ativo) === '1'
      }
    })
  );
  assert.strictEqual(guardarConfig.status, 200);
  console.log('  ok  definições lidas e guardadas');

  const utilizadores = await json(await pedir('/admin/api/utilizadores'));
  assert.strictEqual(utilizadores.status, 200);
  assert.ok(utilizadores.dados.utilizadores.some((u) => u.username === 'admin'));
  assert.ok(utilizadores.dados.utilizadores.some((u) => u.username === 'cozinha'));
  console.log('  ok  lista de utilizadores');

  const terminar = await pedir('/admin/logout', { method: 'POST' });
  assert.strictEqual(terminar.status, 302);
  const depoisLogout = await pedir('/admin/api/pedidos');
  assert.strictEqual(depoisLogout.status, 401);
  console.log('  ok  logout termina a sessão');

  console.log('FASE 2 OK');
})().catch((erro) => {
  console.error('FASE 2 FALHOU:', erro.message);
  console.error(erro);
  process.exit(1);
}).finally(() => pool.end());

// Teste de integração da Fase 1: menu, código da mesa, pedidos e chamadas.
// Requer o servidor a correr e a mesa 5 ativa (node scripts/ativar-mesa.js 5).
// Uso: node scripts/teste-fase1.js
const io = require('socket.io-client');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const MESA = 5;
let codigo = process.env.CODIGO_MESA;

function falhar(mensagem) {
  console.error('FALHOU:', mensagem);
  process.exit(1);
}

async function pedir(caminho, opcoes = {}) {
  const resposta = await fetch(`${BASE}${caminho}`, {
    ...opcoes,
    headers: { 'Content-Type': 'application/json', ...(opcoes.headers || {}) }
  });
  let dados = null;
  const tipo = resposta.headers.get('content-type') || '';
  if (tipo.includes('application/json')) dados = await resposta.json();
  else dados = await resposta.text();
  return { status: resposta.status, dados, headers: resposta.headers };
}

(async () => {
  console.log('1. Página do menu...');
  const menu = await pedir(`/menu?mesa=${MESA}`);
  if (menu.status !== 200) falhar(`menu devolveu ${menu.status}`);
  for (const texto of [
    'Mesa 5',
    'Chamuças de Carne',
    'Esgotado',
    'Cerveja 2M',
    'loading="lazy"',
    'Pedir a conta',
    'feed-slide',
    'nav-social',
    'menu-card',
    'dados-pratos'
  ]) {
    if (!menu.dados.includes(texto)) falhar(`menu não contém "${texto}"`);
  }
  const videosFeed = menu.dados.match(/<video[^>]*class="feed-slide__video"[^>]*>/gi) || [];
  for (const tag of videosFeed) {
    if (!/src="[^"]+"/.test(tag) || !/poster="[^"]+"/.test(tag)) {
      falhar('cada vídeo do feed deve ter src e poster');
    }
  }

  console.log('2. Mesa inativa bloqueia o menu...');
  const inativa = await pedir('/menu?mesa=6');
  if (inativa.status !== 403) falhar(`mesa inativa devolveu ${inativa.status}`);
  if (!inativa.dados.includes('ainda não está ativa')) falhar('mensagem de mesa inativa ausente');

  console.log('3. Código errado é rejeitado...');
  const errado = await pedir('/api/mesa/verificar', {
    method: 'POST',
    body: JSON.stringify({ mesa: MESA, codigo: '0001' })
  });
  if (errado.status !== 403) falhar(`código errado devolveu ${errado.status}`);

  console.log('4. Código correto devolve sessão...');
  const verificacao = await pedir('/api/mesa/verificar', {
    method: 'POST',
    body: JSON.stringify({ mesa: MESA, codigo })
  });
  if (verificacao.status !== 200) falhar(`código correto devolveu ${verificacao.status}: ${JSON.stringify(verificacao.dados)}`);
  const token = verificacao.dados.sessao.token;
  if (!token) falhar('token da sessão ausente');

  const resumoInicial = await pedir(`/api/sessoes/${token}`);
  if (resumoInicial.status !== 200) falhar(`resumo inicial devolveu ${resumoInicial.status}`);
  const pedidosIniciais = resumoInicial.dados.pedidos.length;
  const totalInicial = resumoInicial.dados.total_centavos;

  console.log('5. Gosto de um prato (um por sessão)...');
  const gosto1 = await pedir('/api/pratos/1/gosto', {
    method: 'POST',
    body: JSON.stringify({ token })
  });
  if (gosto1.status !== 200 || typeof gosto1.dados.gostou !== 'boolean') {
    falhar(`gosto devolveu ${gosto1.status}: ${JSON.stringify(gosto1.dados)}`);
  }
  if (gosto1.dados.gostou) {
    const resumoGosto = await pedir(`/api/sessoes/${token}`);
    if (!resumoGosto.dados.pratos_gostados.includes(1)) falhar('prato gostado ausente do resumo');
  }
  const gosto2 = await pedir('/api/pratos/1/gosto', {
    method: 'POST',
    body: JSON.stringify({ token })
  });
  if (gosto2.dados.gostou === gosto1.dados.gostou) falhar('alternar gosto devia inverter o estado');
  if (gosto1.dados.gostou) {
    // Repõe o estado inicial (sem gosto) para o teste ser repetível.
    await pedir('/api/pratos/1/gosto', { method: 'POST', body: JSON.stringify({ token }) });
  }

  console.log('6. Ligação Socket.IO à sessão da mesa...');
  const socket = io(BASE, { auth: { token }, transports: ['websocket'] });
  await new Promise((resolve, reject) => {
    const tempo = setTimeout(() => reject(new Error('timeout no socket')), 5000);
    socket.on('connect', () => {
      clearTimeout(tempo);
      resolve();
    });
    socket.on('connect_error', (erro) => {
      clearTimeout(tempo);
      reject(erro);
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 200));
  const eventoPedido = new Promise((resolve, reject) => {
    const tempo = setTimeout(() => reject(new Error('sem evento pedido_atualizado')), 6000);
    socket.once('pedido_atualizado', (dados) => {
      clearTimeout(tempo);
      resolve(dados);
    });
  });

  console.log('7. Criar pedido...');
  const pedido = await pedir('/api/pedidos', {
    method: 'POST',
    body: JSON.stringify({
      token,
      itens: [
        { prato_id: 1, quantidade: 1, observacao: 'sem cebola' },
        { prato_id: 3, quantidade: 1, observacao: '' }
      ],
      observacoes: 'Trazer as bebidas primeiro'
    })
  });
  if (pedido.status !== 201) falhar(`criar pedido devolveu ${pedido.status}: ${JSON.stringify(pedido.dados)}`);
  if (pedido.dados.pedido.total_centavos !== 100000) {
    falhar(`total esperado 100000, recebido ${pedido.dados.pedido.total_centavos}`);
  }
  const evento = await eventoPedido;
  if (evento.id !== pedido.dados.pedido.id) falhar('evento em tempo real não corresponde ao pedido');

  console.log('8. Pedido adicional acumula na sessão...');
  const adicional = await pedir('/api/pedidos', {
    method: 'POST',
    body: JSON.stringify({
      token,
      itens: [{ prato_id: 9, quantidade: 1 }],
      observacoes: ''
    })
  });
  if (adicional.status !== 201) falhar(`pedido adicional devolveu ${adicional.status}`);

  const resumo = await pedir(`/api/sessoes/${token}`);
  if (resumo.status !== 200) falhar(`resumo devolveu ${resumo.status}`);
  if (resumo.dados.pedidos.length !== pedidosIniciais + 2) {
    falhar(`esperados ${pedidosIniciais + 2} pedidos na sessão, recebidos ${resumo.dados.pedidos.length}`);
  }
  if (resumo.dados.total_centavos !== totalInicial + 118000) {
    falhar(`total acumulado esperado ${totalInicial + 118000}, recebido ${resumo.dados.total_centavos}`);
  }
  if (resumo.dados.estado_atual !== 'Recebido') falhar('estado atual deveria ser Recebido');

  console.log('9. Chamar empregado e evitar duplicados...');
  const chamada = await pedir('/api/chamadas', {
    method: 'POST',
    body: JSON.stringify({ token, tipo: 'empregado' })
  });
  if (chamada.status !== 201) falhar(`chamada devolveu ${chamada.status}`);
  const duplicada = await pedir('/api/chamadas', {
    method: 'POST',
    body: JSON.stringify({ token, tipo: 'conta' })
  });
  if (duplicada.status !== 429) falhar(`chamada duplicada devolveu ${duplicada.status}`);

  console.log('10. Página de acompanhamento...');
  const acompanhar = await pedir(`/acompanhar?token=${encodeURIComponent(token)}&mesa=${MESA}`);
  if (acompanhar.status !== 200) falhar(`acompanhar devolveu ${acompanhar.status}`);
  for (const texto of ['A sua conta', 'Pedido #', 'Total acumulado', 'Recebido']) {
    if (!acompanhar.dados.includes(texto)) falhar(`acompanhamento não contém "${texto}"`);
  }

  socket.close();
  console.log('');
  console.log('FASE 1 OK: menu, código, pedido, acumulação, chamadas e tempo real funcionam.');
  console.log(`Sessão de teste: ${token}`);
  console.log(`Pedido criado: #${pedido.dados.pedido.id} (${pedido.dados.pedido.total_formatado})`);
  console.log(`Total acumulado: ${resumo.dados.total_formatado}`);
  process.exit(0);
})().catch((erro) => {
  console.error('Erro no teste:', erro);
  process.exit(1);
});

// Página de acompanhamento: progresso dos pedidos em tempo real.
'use strict';

(() => {
  const corpo = document.body;
  const token = corpo.dataset.token;
  const mesa = Number(corpo.dataset.mesa);
  const passos = ['Recebido', 'Em preparo', 'Pronto', 'Entregue'];

  const totalConta = document.getElementById('total-conta');
  const contagemPedidos = document.getElementById('contagem-pedidos');
  const estadoAtual = document.getElementById('estado-atual');
  const barraProgresso = document.getElementById('progresso-preenchimento');
  const passosElementos = [...document.querySelectorAll('.progresso__passo')];
  const listaPedidos = document.getElementById('lista-pedidos');
  const bannerFechado = document.getElementById('banner-fechado');
  const bannerCancelado = document.getElementById('banner-cancelado');
  const chamadaPendente = document.getElementById('chamada-pendente');
  const chamadaPendenteTexto = document.getElementById('chamada-pendente-texto');
  const linkPedirMais = document.getElementById('link-pedir-mais');
  const btnEmpregado = document.getElementById('btn-empregado');
  const btnConta = document.getElementById('btn-conta');

  let resumoAtual = null;
  let carregando = false;
  let temporizador = null;
  let socket = null;
  let estavaAberta = bannerFechado.classList.contains('oculto');

  function htmlPedido(pedido) {
    const classe = SLEY.slugify(pedido.estado);
    const itens = pedido.itens
      .map(
        (item) => `
          <li>
            <span class="item-qtd">${Number(item.quantidade)}×</span>
            <span class="item-nome">
              ${SLEY.escaparHtml(item.nome)}
              ${item.observacao ? `<small class="item-obs">${SLEY.escaparHtml(item.observacao)}</small>` : ''}
            </span>
            <span class="item-subtotal">${SLEY.escaparHtml(item.subtotal_formatado)}</span>
          </li>`
      )
      .join('');

    return `
      <article class="pedido-card pedido-card--${classe}" data-pedido="${Number(pedido.id)}">
        <header class="pedido-card__topo">
          <div class="pedido-card__ident">
            <strong>Pedido #${Number(pedido.id)}</strong>
            <span>${SLEY.escaparHtml(SLEY.formatarHora(pedido.criado_em))}</span>
          </div>
          <span class="estado estado--${classe}">${SLEY.escaparHtml(pedido.estado)}</span>
        </header>
        <ul class="pedido-card__itens">${itens}</ul>
        ${
          pedido.observacoes
            ? `<p class="pedido-card__obs"><strong>Observação:</strong> ${SLEY.escaparHtml(pedido.observacoes)}</p>`
            : ''
        }
        <footer class="pedido-card__rodape">
          <span class="pedido-card__previsao">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            ${Number(pedido.tempo_previsto_min)} min previstos
          </span>
          <strong>${SLEY.escaparHtml(pedido.total_formatado)}</strong>
        </footer>
      </article>`;
  }

  function htmlVazio() {
    return `
      <div class="estado-vazio">
        <div class="estado-vazio__icone" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>
        </div>
        <p>Ainda não fez nenhum pedido.</p>
        <a href="/menu?mesa=${Number(mesa)}" class="btn btn-laranja">Ver o menu</a>
      </div>`;
  }

  function render(resumo) {
    resumoAtual = resumo;
    const estado = resumo.estado_atual;
    const indice = passos.indexOf(estado);

    totalConta.textContent = resumo.total_formatado;
    contagemPedidos.textContent = String(resumo.total_pedidos);
    estadoAtual.textContent = estado;
    estadoAtual.className = `estado estado--${SLEY.slugify(estado)}`;

    passosElementos.forEach((elemento, i) => {
      elemento.classList.toggle('concluido', i < indice);
      elemento.classList.toggle('atual', i === indice);
      if (i === indice) elemento.setAttribute('aria-current', 'step');
      else elemento.removeAttribute('aria-current');
      const circulo = elemento.querySelector('.progresso__circulo');
      if (circulo) circulo.textContent = i < indice ? '✓' : String(i + 1);
    });

    if (barraProgresso) {
      const percentagem = estado === 'Entregue' ? 100 : indice < 0 ? 0 : Math.round((indice / 3) * 100);
      barraProgresso.style.width = `${percentagem}%`;
    }

    bannerFechado.classList.toggle('oculto', resumo.aberta);
    bannerCancelado.classList.toggle('oculto', estado !== 'Cancelado');
    linkPedirMais.classList.toggle('oculto', !resumo.aberta);

    if (!resumo.aberta && estavaAberta) {
      SLEY.toast('A conta foi fechada. Obrigado pela sua visita!');
      estavaAberta = false;
    }
    if (!resumo.aberta) estavaAberta = false;

    if (resumo.chamada_pendente) {
      chamadaPendente.classList.remove('oculto');
      chamadaPendenteTexto.textContent =
        resumo.chamada_pendente.tipo === 'conta'
          ? 'Pedido de conta enviado. Um empregado está a caminho.'
          : 'Empregado chamado. Aguarde um momento.';
    } else {
      chamadaPendente.classList.add('oculto');
    }

    const bloqueado = !resumo.pode_pedir || Boolean(resumo.chamada_pendente);
    btnEmpregado.disabled = bloqueado;
    btnConta.disabled = bloqueado;

    listaPedidos.innerHTML = resumo.pedidos.length
      ? resumo.pedidos.map(htmlPedido).join('')
      : htmlVazio();
  }

  async function carregar(mostrarErro = false) {
    if (carregando) return;
    carregando = true;
    try {
      const resumo = await SLEY.fetchJSON(`/api/sessoes/${encodeURIComponent(token)}`);
      render(resumo);
    } catch (erro) {
      if (mostrarErro) SLEY.toast(erro.message, 'erro');
      if (erro.status === 404) {
        clearInterval(temporizador);
        if (socket) socket.disconnect();
        SLEY.toast('Este link já não é válido. Volte a abrir o menu da mesa.', 'erro');
      }
    } finally {
      carregando = false;
    }
  }

  async function chamarServico(tipo, botao) {
    if (!resumoAtual || !resumoAtual.pode_pedir) return;
    botao.disabled = true;
    try {
      const dados = await SLEY.fetchJSON('/api/chamadas', {
        method: 'POST',
        body: { token, tipo }
      });
      SLEY.toast(dados.mensagem);
      await carregar();
    } catch (erro) {
      SLEY.toast(erro.message, 'erro');
      if (resumoAtual) render(resumoAtual);
    }
  }

  btnEmpregado.addEventListener('click', () => chamarServico('empregado', btnEmpregado));
  btnConta.addEventListener('click', () => chamarServico('conta', btnConta));

  if (window.io) {
    socket = io({ auth: { token }, transports: ['websocket', 'polling'] });
    socket.on('pedido_atualizado', () => carregar());
    socket.on('nova_chamada', () => carregar());
    socket.on('chamada_resolvida', () => carregar());
    socket.on('sessao_fechada', () => carregar());
    socket.on('connect', () => carregar());
  }

  temporizador = setInterval(() => carregar(), 15000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') carregar();
  });

  carregar();
})();

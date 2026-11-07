// Ecrã da cozinha: lista de pedidos ativos, cronómetros e mudança de estado.
'use strict';

(() => {
  const { fetchJSON, escaparHtml: esc, formatarHora, toast } = window.SLEY;

  const lista = document.getElementById('lista-cozinha');
  const recebidos = document.getElementById('cozinha-recebidos');
  const preparo = document.getElementById('cozinha-preparo');
  const atrasados = document.getElementById('cozinha-atrasados');
  const total = document.getElementById('cozinha-total');
  const cartaoAtrasados = document.getElementById('cozinha-cartao-atrasados');
  const ligacao = document.getElementById('cozinha-ligacao');
  const relogio = document.getElementById('cozinha-relogio');

  let pedidosAtuais = [];
  let sequencia = 0;
  let socket = null;

  const ROTULOS = {
    Recebido: 'Recebido',
    'Em preparo': 'Em preparo'
  };

  function slugify(texto) {
    return String(texto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function debounce(funcao, espera = 300) {
    let temporizador = null;
    return (...args) => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => funcao(...args), espera);
    };
  }

  function segundosDesde(iso) {
    const inicio = new Date(iso).getTime();
    if (Number.isNaN(inicio)) return 0;
    return Math.max(0, Math.floor((Date.now() - inicio) / 1000));
  }

  function formatarDuracao(segundos) {
    const seguro = Math.max(0, Math.floor(segundos));
    const horas = Math.floor(seguro / 3600);
    const minutos = Math.floor((seguro % 3600) / 60);
    const restantes = seguro % 60;
    const dois = (valor) => String(valor).padStart(2, '0');
    if (horas > 0) return `${horas}:${dois(minutos)}:${dois(restantes)}`;
    return `${dois(minutos)}:${dois(restantes)}`;
  }

  function atualizarRelogio() {
    relogio.textContent = new Intl.DateTimeFormat('pt-MZ', {
      timeZone: 'Africa/Maputo',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(new Date());
  }

  function marcarLigacao(ligado) {
    ligacao.classList.toggle('offline', !ligado);
    ligacao.innerHTML = ligado
      ? '<span class="ponto-vivo"></span> Em tempo real'
      : 'Sem ligação — a tentar…';
  }

  function tratarErro(erro) {
    if (erro.status === 401) {
      toast('Sessão expirada. A redirecionar para o login…', 'erro');
      setTimeout(() => {
        window.location.href = '/admin/login';
      }, 900);
      return;
    }
    if (erro.status === 403 && erro.dados && erro.dados.codigo === 'TROCAR_PASSWORD') {
      window.location.href = '/admin/password';
      return;
    }
    toast(erro.message || 'Não foi possível concluir a operação.', 'erro');
  }

  function htmlPedido(pedido) {
    const itens = pedido.itens
      .map(
        (item) => `
          <li>
            <span class="item-qtd">${Number(item.quantidade)}×</span>
            <span class="item-nome">
              ${esc(item.nome)}
              ${item.observacao ? `<small class="item-obs">${esc(item.observacao)}</small>` : ''}
            </span>
          </li>`
      )
      .join('');

    const estado = slugify(pedido.estado);
    const emPreparo = pedido.estado === 'Em preparo';

    return `
      <article class="pedido-cozinha" data-pedido-id="${Number(pedido.id)}"
        data-criado="${esc(pedido.criado_em)}" data-previsao="${Number(pedido.tempo_previsto_min)}">
        <header class="pedido-cozinha__topo">
          <div class="cozinha-mesa">
            <span>Mesa</span>
            <strong>${Number(pedido.mesa_numero)}</strong>
          </div>
          <div class="pedido-cozinha__ident">
            <strong>Pedido #${Number(pedido.id)}</strong>
            <span>Recebido às ${esc(formatarHora(pedido.criado_em))} · há <b data-decorrido>00:00</b></span>
          </div>
          <div class="pedido-cozinha__estado">
            <span class="estado-cozinha estado-cozinha--${estado}">${esc(ROTULOS[pedido.estado] || pedido.estado)}</span>
            <span class="cozinha-selo-atraso" data-selo-atraso hidden>Atrasado</span>
          </div>
        </header>

        <ul class="pedido-cozinha__itens">${itens}</ul>

        ${
          pedido.observacoes
            ? `<p class="pedido-cozinha__obs"><strong>Observação:</strong> ${esc(pedido.observacoes)}</p>`
            : ''
        }

        <footer class="pedido-cozinha__rodape">
          <div class="pedido-cozinha__tempos">
            <span>Previsão <strong>${Number(pedido.tempo_previsto_min)} min</strong></span>
            <span><span data-restante-label>Restam</span> <strong data-restante>--:--</strong></span>
          </div>
          <div class="pedido-cozinha__acoes">
            ${
              emPreparo
                ? `<button type="button" class="btn-cozinha btn-cozinha--principal" data-novo-estado="Pronto">
                     Marcar pronto
                   </button>
                   <button type="button" class="btn-cozinha btn-cozinha--secundario" data-novo-estado="Recebido">
                     Voltar
                   </button>`
                : `<button type="button" class="btn-cozinha btn-cozinha--principal" data-novo-estado="Em preparo">
                     Iniciar preparo
                   </button>`
            }
          </div>
        </footer>
      </article>`;
  }

  function atualizarTempos() {
    let contagemAtrasados = 0;
    lista.querySelectorAll('[data-pedido-id]').forEach((cartao) => {
      const criado = new Date(cartao.dataset.criado).getTime();
      if (Number.isNaN(criado)) return;
      const decorridos = Math.max(0, Math.floor((Date.now() - criado) / 1000));
      const limite = (Number(cartao.dataset.previsao) || 0) * 60;
      const restante = limite - decorridos;
      const atrasado = restante < 0;

      const decorridoEl = cartao.querySelector('[data-decorrido]');
      if (decorridoEl) decorridoEl.textContent = formatarDuracao(decorridos);

      const restanteEl = cartao.querySelector('[data-restante]');
      if (restanteEl) {
        restanteEl.textContent = formatarDuracao(Math.abs(restante));
        restanteEl.classList.toggle('em-atraso', atrasado);
      }
      const rotuloEl = cartao.querySelector('[data-restante-label]');
      if (rotuloEl) rotuloEl.textContent = atrasado ? 'Atraso' : 'Restam';

      const selo = cartao.querySelector('[data-selo-atraso]');
      if (selo) selo.hidden = !atrasado;
      cartao.classList.toggle('atrasado', atrasado);
      if (atrasado) contagemAtrasados += 1;
    });

    atrasados.textContent = String(contagemAtrasados);
    cartaoAtrasados.classList.toggle('is-alerta', contagemAtrasados > 0);
  }

  function atualizarResumo() {
    recebidos.textContent = String(pedidosAtuais.filter((pedido) => pedido.estado === 'Recebido').length);
    preparo.textContent = String(pedidosAtuais.filter((pedido) => pedido.estado === 'Em preparo').length);
    total.textContent = String(pedidosAtuais.length);
    atualizarTempos();
  }

  function renderizar() {
    if (!pedidosAtuais.length) {
      lista.innerHTML = `
        <div class="cozinha-vazio">
          <span aria-hidden="true">✓</span>
          <strong>Sem pedidos pendentes</strong>
          <p>Os novos pedidos aparecem aqui automaticamente.</p>
        </div>`;
      atualizarResumo();
      return;
    }

    lista.innerHTML = pedidosAtuais.map((pedido) => htmlPedido(pedido)).join('');
    atualizarResumo();
  }

  async function carregar(silencioso = false) {
    const atual = ++sequencia;
    if (!silencioso && !pedidosAtuais.length) {
      lista.innerHTML = '<div class="cozinha-carregando"><span class="spinner"></span> A carregar pedidos…</div>';
    }
    lista.setAttribute('aria-busy', 'true');
    try {
      const dados = await fetchJSON('/cozinha/api/pedidos');
      if (atual !== sequencia) return;
      pedidosAtuais = Array.isArray(dados.pedidos) ? dados.pedidos : [];
      renderizar();
    } catch (erro) {
      if (atual !== sequencia) return;
      if (!pedidosAtuais.length) {
        lista.innerHTML =
          '<div class="cozinha-vazio"><strong>Não foi possível carregar os pedidos.</strong><p>Tente novamente ou verifique a ligação.</p></div>';
      }
      tratarErro(erro);
    } finally {
      lista.setAttribute('aria-busy', 'false');
    }
  }

  async function mudarEstado(cartao, botao) {
    const pedidoId = Number(cartao.dataset.pedidoId);
    const novoEstado = botao.dataset.novoEstado;
    const botoes = [...cartao.querySelectorAll('button')];
    botoes.forEach((elemento) => {
      elemento.disabled = true;
    });
    const textoOriginal = botao.textContent;
    botao.textContent = 'A atualizar…';

    try {
      await fetchJSON(`/cozinha/api/pedidos/${pedidoId}/estado`, {
        method: 'PATCH',
        body: { estado: novoEstado }
      });
      toast(
        novoEstado === 'Pronto'
          ? `Pedido #${pedidoId} pronto para servir.`
          : novoEstado === 'Em preparo'
            ? `Pedido #${pedidoId} em preparo.`
            : `Pedido #${pedidoId} voltou a recebido.`
      );
      await carregar(true);
    } catch (erro) {
      tratarErro(erro);
      botoes.forEach((elemento) => {
        elemento.disabled = false;
      });
      botao.textContent = textoOriginal;
    }
  }

  lista.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-novo-estado]');
    if (!botao) return;
    const cartao = botao.closest('[data-pedido-id]');
    if (cartao) mudarEstado(cartao, botao);
  });

  const recarregar = debounce(() => carregar(true), 250);

  function iniciarTempoReal() {
    if (!window.io) {
      marcarLigacao(false);
      return;
    }
    socket = window.io({ transports: ['websocket', 'polling'] });
    socket.on('connect', () => {
      marcarLigacao(true);
      carregar(true);
    });
    socket.on('disconnect', () => marcarLigacao(false));
    socket.on('connect_error', () => marcarLigacao(false));
    socket.on('novo_pedido', () => recarregar());
    socket.on('pedido_atualizado', () => recarregar());
    socket.on('sessao_fechada', () => recarregar());
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') carregar(true);
  });

  atualizarRelogio();
  setInterval(atualizarRelogio, 1000);
  setInterval(atualizarTempos, 1000);
  setInterval(() => {
    if (!socket || !socket.connected) carregar(true);
  }, 20000);

  carregar();
  iniciarTempoReal();
})();

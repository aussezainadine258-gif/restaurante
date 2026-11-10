// Interface social do cliente: Feed, Menu e Minha mesa.
// O Feed mostra fotografias ou vídeos (mudo, em ciclo) de cada prato.
'use strict';

(() => {
  const app = document.getElementById('app-cliente');
  const corpo = document.body;
  const mesa = Number(corpo.dataset.mesa);
  const exigeCodigo = corpo.dataset.exigeCodigo === '1';

  /* ------------------------------------------------------------- elementos */
  const overlay = document.getElementById('bloqueio-mesa');
  const formCodigo = document.getElementById('form-codigo');
  const inputCodigo = document.getElementById('codigo-mesa');
  const erroCodigo = document.getElementById('erro-codigo');
  const btnVerificar = document.getElementById('btn-verificar');
  const carregandoCodigo = document.getElementById('carregando-codigo');
  const tituloCodigo = document.getElementById('titulo-codigo');
  const textoCodigo = document.getElementById('texto-codigo');

  const feedScroll = document.getElementById('feed-scroll');
  const slides = [...document.querySelectorAll('.feed-slide')];
  const videosFeed = [...document.querySelectorAll('[data-video-feed]')];
  const videosCards = [...document.querySelectorAll('[data-video-card]')];
  const botaoSom = document.querySelector('[data-acao="som"]');
  const botoesNav = [...document.querySelectorAll('[data-vista]')];
  const vistas = [...document.querySelectorAll('.vista')];

  const menuGrelha = document.getElementById('menu-grelha');
  const cardsMenu = [...document.querySelectorAll('.menu-card')];
  const botoesCategoria = [...document.querySelectorAll('.menu-categoria')];

  const dialogo = document.getElementById('detalhe-prato');
  const fecharDetalhe = document.getElementById('fechar-detalhe');
  const detalheFoto = document.getElementById('detalhe-foto');
  const detalheVideo = document.getElementById('detalhe-video');
  const detalheSelo = document.getElementById('detalhe-selo');
  const detalheNome = document.getElementById('detalhe-nome');
  const detalhePreco = document.getElementById('detalhe-preco');
  const detalheDescricao = document.getElementById('detalhe-descricao');
  const detalheTempo = document.getElementById('detalhe-tempo');
  const detalheEtiquetas = document.getElementById('detalhe-etiquetas');
  const detalheObs = document.getElementById('detalhe-obs');
  const detalheQuantidade = document.getElementById('detalhe-quantidade');
  const btnDetalheAdicionar = document.getElementById('detalhe-adicionar');

  const carrinhoLista = document.getElementById('mesa-carrinho-lista');
  const carrinhoContagem = document.getElementById('mesa-carrinho-contagem');
  const totalCarrinho = document.getElementById('total-carrinho');
  const observacaoGeral = document.getElementById('observacao-geral');
  const btnConfirmar = document.getElementById('confirmar-pedido');
  const navBadge = document.getElementById('nav-badge');

  const mesaEstado = document.getElementById('mesa-estado');
  const mesaTotal = document.getElementById('mesa-total');
  const mesaContagemPedidos = document.getElementById('mesa-contagem-pedidos');
  const listaPedidos = document.getElementById('mesa-pedidos');
  const avisoFechada = document.getElementById('aviso-fechada');
  const avisoChamada = document.getElementById('aviso-chamada');
  const btnEmpregado = document.getElementById('btn-empregado');
  const btnConta = document.getElementById('btn-conta');

  /* ---------------------------------------------------------------- estado */
  let sessao = SLEY.lerSessao(mesa);
  let carrinho = SLEY.lerCarrinho(mesa);
  let bloqueado = true;
  let resumoAtual = null;
  let carregandoResumo = false;
  let temporizador = null;
  let socket = null;
  let gostados = new Set();
  let pratoDetalhe = null;

  const ligacao = navigator.connection;
  const economizarDados = Boolean(ligacao && (ligacao.saveData || ligacao.effectiveType === '2g'));
  const movimentoReduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reproduzirAutomaticamente = !economizarDados && !movimentoReduzido;
  let feedMudo = true;

  const pratos = new Map();
  try {
    const dados = JSON.parse(document.getElementById('dados-pratos').textContent || '[]');
    dados.forEach((prato) => pratos.set(Number(prato.id), prato));
  } catch {
    /* O feed funciona mesmo sem os dados extra. */
  }

  /* ----------------------------------------------------------------- acesso */

  function guardarSessao(dados) {
    sessao = dados;
    SLEY.guardarSessao(mesa, dados);
  }

  function mostrarErroCodigo(mensagem) {
    erroCodigo.textContent = mensagem;
    erroCodigo.hidden = false;
  }

  function limparErroCodigo() {
    erroCodigo.hidden = true;
    erroCodigo.textContent = '';
  }

  function mostrarCarregando(ativo) {
    carregandoCodigo.classList.toggle('oculto', !ativo);
    formCodigo.classList.toggle('oculto', ativo);
    if (ativo) {
      btnVerificar.disabled = true;
      limparErroCodigo();
    }
  }

  function mostrarFormulario(mensagem) {
    mostrarCarregando(false);
    btnVerificar.disabled = false;
    tituloCodigo.textContent = 'Confirme a sua mesa';
    textoCodigo.textContent = 'Peça ao empregado o código de 4 dígitos para começar a pedir.';
    if (mensagem) mostrarErroCodigo(mensagem);
    if (window.matchMedia('(min-width: 820px)').matches) {
      setTimeout(() => inputCodigo.focus(), 50);
    }
  }

  function bloquearMenu() {
    bloqueado = true;
    if (app) app.inert = true;
    overlay.classList.remove('oculto');
    corpo.classList.add('sem-scroll');
  }

  function desbloquearMenu() {
    bloqueado = false;
    if (app) app.inert = false;
    overlay.classList.add('oculto');
    corpo.classList.remove('sem-scroll');
    atualizarCarrinho();
    iniciarTempoReal();
  }

  function falharAcesso(erro, silencioso) {
    bloquearMenu();
    if (!exigeCodigo) {
      tituloCodigo.textContent = 'Mesa indisponível';
      textoCodigo.textContent = erro.message || 'Não foi possível abrir o menu desta mesa.';
      formCodigo.classList.add('oculto');
      carregandoCodigo.classList.add('oculto');
      btnVerificar.disabled = false;
      setTimeout(() => window.location.reload(), 4500);
      return;
    }
    if (!silencioso) mostrarFormulario(erro.message);
    else mostrarFormulario('A sessão anterior terminou. Introduza o código atual da mesa.');
  }

  async function verificarMesa(codigo, silencioso = false) {
    mostrarCarregando(true);
    try {
      const dados = await SLEY.fetchJSON('/api/mesa/verificar', {
        method: 'POST',
        body: { mesa, codigo }
      });
      guardarSessao({ token: dados.sessao.token, codigo });
      limparErroCodigo();
      inputCodigo.value = '';
      desbloquearMenu();
      await carregarResumo();
      return true;
    } catch (erro) {
      if ([401, 403, 404, 429].includes(erro.status)) {
        SLEY.limparSessao(mesa);
        sessao = null;
      }
      falharAcesso(erro, silencioso);
      return false;
    } finally {
      btnVerificar.disabled = false;
    }
  }

  async function iniciarAcesso() {
    bloquearMenu();
    if (!exigeCodigo) {
      mostrarCarregando(true);
      await verificarMesa('', true);
      return;
    }

    if (sessao && sessao.token && sessao.codigo) {
      mostrarCarregando(true);
      const ok = await verificarMesa(sessao.codigo, true);
      if (ok) return;
    }
    mostrarFormulario();
  }

  inputCodigo.addEventListener('input', () => {
    inputCodigo.value = inputCodigo.value.replace(/\D/g, '').slice(0, 4);
    if (!erroCodigo.hidden) limparErroCodigo();
  });

  formCodigo.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const codigo = inputCodigo.value.trim();
    if (!/^\d{4}$/.test(codigo)) {
      mostrarErroCodigo('Introduza os 4 dígitos do código da mesa.');
      inputCodigo.focus();
      return;
    }
    await verificarMesa(codigo);
  });

  function garantirSessao() {
    if (sessao && sessao.token) return true;
    bloquearMenu();
    mostrarFormulario();
    SLEY.toast('Introduza o código da mesa para continuar.', 'erro');
    return false;
  }

  /* -------------------------------------------------------------- navegação */

  function pausarVideo(video) {
    if (!video) return;
    try {
      video.pause();
    } catch {
      /* ignora */
    }
  }

  function tocarVideo(video) {
    if (!video || !video.isConnected) return;
    const promessa = video.play();
    if (promessa && typeof promessa.catch === 'function') promessa.catch(() => {});
  }

  function atualizarBotaoSom() {
    if (!botaoSom) return;
    botaoSom.setAttribute('aria-pressed', String(!feedMudo));
    botaoSom.classList.toggle('is-com-som', !feedMudo);
    botaoSom.setAttribute(
      'aria-label',
      feedMudo ? 'Ativar som dos vídeos do feed' : 'Desativar som dos vídeos do feed'
    );
  }

  if (botaoSom) {
    atualizarBotaoSom();
    botaoSom.addEventListener('click', () => {
      feedMudo = !feedMudo;
      videosFeed.forEach((video) => {
        video.muted = feedMudo;
      });
      const visivel = slides.find((slide) => slide.classList.contains('is-visivel'));
      const videoVisivel = visivel && visivel.querySelector('[data-video-feed]');
      if (!feedMudo && videoVisivel) tocarVideo(videoVisivel);
      atualizarBotaoSom();
    });
  }

  function tocarCartoesVisiveis() {
    if (!reproduzirAutomaticamente) return;
    videosCards.forEach((video) => {
      const card = video.closest('.menu-card');
      if (!card || card.hidden) {
        pausarVideo(video);
        return;
      }
      const rect = video.getBoundingClientRect();
      const visivel =
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        rect.right > 0 &&
        rect.left < window.innerWidth;
      if (visivel) tocarVideo(video);
      else pausarVideo(video);
    });
  }

  function mostrarVista(nome) {
    vistas.forEach((vista) => {
      vista.classList.toggle('is-ativa', vista.id === `vista-${nome}`);
    });
    botoesNav.forEach((botao) => {
      const ativo = botao.dataset.vista === nome;
      botao.classList.toggle('is-ativo', ativo);
      if (ativo) botao.setAttribute('aria-current', 'page');
      else botao.removeAttribute('aria-current');
    });
    corpo.dataset.vista = nome;

    if (nome !== 'feed') videosFeed.forEach(pausarVideo);
    if (nome !== 'menu') videosCards.forEach(pausarVideo);
    if (nome === 'feed' && reproduzirAutomaticamente) {
      const visivel = slides.find((slide) => slide.classList.contains('is-visivel')) || slides[0];
      if (visivel) tocarVideo(visivel.querySelector('[data-video-feed]'));
    }
    if (nome === 'menu') tocarCartoesVisiveis();
    if (nome === 'mesa') renderizarCarrinho();
  }

  botoesNav.forEach((botao) => {
    botao.addEventListener('click', () => mostrarVista(botao.dataset.vista));
  });

  /* ------------------------------------------------------- feed (fotografias) */

  function preCarregarSeguinte(indice) {
    const ligacaoAtual = navigator.connection;
    if (ligacaoAtual && (ligacaoAtual.saveData || ligacaoAtual.effectiveType === '2g')) return;
    const seguinte = slides[indice + 1];
    if (!seguinte) return;
    if (seguinte.querySelector('[data-video-feed]')) return;
    const img = seguinte.querySelector('img');
    if (!img || !img.getAttribute('src')) return;
    const preload = new Image();
    preload.src = img.getAttribute('src');
  }

  if (!reproduzirAutomaticamente) {
    videosFeed.forEach((video) => {
      video.controls = true;
    });
  }

  if ('IntersectionObserver' in window && slides.length) {
    const observador = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((entrada) => {
          const video = entrada.target.querySelector('[data-video-feed]');
          if (!entrada.isIntersecting) {
            pausarVideo(video);
            return;
          }
          const indice = slides.indexOf(entrada.target);
          slides.forEach((slide, i) => slide.classList.toggle('is-visivel', i === indice));
          videosFeed.forEach((outro) => {
            if (outro !== video) pausarVideo(outro);
          });
          if (video && reproduzirAutomaticamente) tocarVideo(video);
          else if (video) pausarVideo(video);
          preCarregarSeguinte(indice);
        });
      },
      { root: feedScroll, threshold: 0.6 }
    );
    slides.forEach((slide) => observador.observe(slide));
  }

  // Os vídeos do menu só reproduzem quando o cartão está visível.
  if ('IntersectionObserver' in window && videosCards.length && reproduzirAutomaticamente) {
    const observadorCartoes = new IntersectionObserver(
      (entradas) => {
        const menuAtivo = document.getElementById('vista-menu').classList.contains('is-ativa');
        entradas.forEach((entrada) => {
          if (entrada.isIntersecting && menuAtivo) tocarVideo(entrada.target);
          else pausarVideo(entrada.target);
        });
      },
      { root: menuGrelha, threshold: 0.5 }
    );
    videosCards.forEach((video) => observadorCartoes.observe(video));
  }

  /* ----------------------------------------------------------------- gostos */

  function atualizarBotaoGosto(pratoId) {
    const gostou = gostados.has(pratoId);
    const prato = pratos.get(pratoId);
    document.querySelectorAll(`[data-acao="gosto"][data-prato-id="${pratoId}"]`).forEach((botao) => {
      botao.classList.toggle('is-gostado', gostou);
      botao.setAttribute('aria-pressed', String(gostou));
      const contagem = botao.querySelector('.feed-gosto__contagem');
      if (contagem && prato) contagem.textContent = String(prato.gostos || 0);
    });
  }

  function aplicarGostosDaSessao(ids) {
    gostados = new Set((ids || []).map(Number));
    document.querySelectorAll('[data-acao="gosto"]').forEach((botao) => {
      const id = Number(botao.dataset.pratoId);
      const gostou = gostados.has(id);
      botao.classList.toggle('is-gostado', gostou);
      botao.setAttribute('aria-pressed', String(gostou));
    });
  }

  async function alternarGosto(pratoId, botao) {
    if (!garantirSessao()) return;
    botao.disabled = true;
    try {
      const dados = await SLEY.fetchJSON(`/api/pratos/${pratoId}/gosto`, {
        method: 'POST',
        body: { token: sessao.token }
      });
      const prato = pratos.get(pratoId);
      if (prato) prato.gostos = dados.gostos;
      if (dados.gostou) gostados.add(pratoId);
      else gostados.delete(pratoId);
      atualizarBotaoGosto(pratoId);
      SLEY.toast(dados.gostou ? 'Gosto registado.' : 'Gosto removido.');
    } catch (erro) {
      SLEY.toast(erro.message, 'erro');
      if (erro.status === 401 || erro.status === 403) {
        SLEY.limparSessao(mesa);
        sessao = null;
        pararTempoReal();
        falharAcesso(erro, false);
      }
    } finally {
      botao.disabled = false;
    }
  }

  /* --------------------------------------------------------------- carrinho */

  function itensNoCarrinho() {
    return carrinho.reduce((soma, item) => soma + item.quantidade, 0);
  }

  function totalDoCarrinho() {
    return carrinho.reduce((soma, item) => soma + item.preco_centavos * item.quantidade, 0);
  }

  function persistirCarrinho() {
    SLEY.guardarCarrinho(mesa, carrinho);
  }

  function adicionarItem(prato, quantidade, observacao) {
    if (!prato) return;
    const obs = String(observacao || '').trim().slice(0, 200);
    const existente = carrinho.find(
      (item) => item.prato_id === prato.id && String(item.observacao || '') === obs
    );
    if (existente) {
      existente.quantidade = Math.min(20, existente.quantidade + quantidade);
    } else {
      carrinho.push({
        prato_id: prato.id,
        nome: prato.nome,
        preco_centavos: prato.preco_centavos,
        quantidade: Math.min(20, Math.max(1, quantidade)),
        observacao: obs
      });
    }
    persistirCarrinho();
    atualizarCarrinho();
    SLEY.toast(`${prato.nome} adicionado ao pedido.`);
  }

  function alterarQuantidade(indice, delta) {
    const item = carrinho[indice];
    if (!item) return;
    item.quantidade = Math.min(20, item.quantidade + delta);
    if (item.quantidade <= 0) carrinho.splice(indice, 1);
    persistirCarrinho();
    atualizarCarrinho();
  }

  function removerItem(indice) {
    carrinho.splice(indice, 1);
    persistirCarrinho();
    atualizarCarrinho();
    SLEY.toast('Item removido do pedido.');
  }

  function bonecoItem(item, indice) {
    const artigo = document.createElement('article');
    artigo.className = 'mesa-item';

    const topo = document.createElement('div');
    topo.className = 'mesa-item__topo';
    const nome = document.createElement('span');
    nome.className = 'mesa-item__nome';
    nome.textContent = item.nome;
    const preco = document.createElement('span');
    preco.className = 'mesa-item__preco';
    preco.textContent = SLEY.formatarMZN(item.preco_centavos * item.quantidade);
    topo.append(nome, preco);

    const acoes = document.createElement('div');
    acoes.className = 'mesa-item__acoes';
    const controlo = document.createElement('div');
    controlo.className = 'controle-qtd';
    const menos = document.createElement('button');
    menos.type = 'button';
    menos.setAttribute('aria-label', `Diminuir quantidade de ${item.nome}`);
    menos.textContent = '−';
    const quantidade = document.createElement('span');
    quantidade.textContent = String(item.quantidade);
    quantidade.setAttribute('aria-live', 'polite');
    const mais = document.createElement('button');
    mais.type = 'button';
    mais.setAttribute('aria-label', `Aumentar quantidade de ${item.nome}`);
    mais.textContent = '+';
    menos.addEventListener('click', () => alterarQuantidade(indice, -1));
    mais.addEventListener('click', () => alterarQuantidade(indice, 1));
    controlo.append(menos, quantidade, mais);

    const remover = document.createElement('button');
    remover.type = 'button';
    remover.className = 'remover-item';
    remover.textContent = 'Remover';
    remover.addEventListener('click', () => removerItem(indice));
    acoes.append(controlo, remover);

    const obs = document.createElement('div');
    obs.className = 'mesa-item__obs';
    const campo = document.createElement('input');
    campo.type = 'text';
    campo.maxLength = 200;
    campo.placeholder = 'Ex.: sem cebola';
    campo.setAttribute('aria-label', `Observação para ${item.nome}`);
    campo.value = item.observacao;
    campo.addEventListener('input', () => {
      item.observacao = campo.value.slice(0, 200);
      persistirCarrinho();
    });
    obs.appendChild(campo);

    artigo.append(topo, acoes, obs);
    return artigo;
  }

  function atualizarCarrinho() {
    const quantidade = itensNoCarrinho();
    const total = totalDoCarrinho();
    if (navBadge) {
      navBadge.hidden = quantidade === 0;
      navBadge.textContent = String(quantidade);
    }
    if (carrinhoContagem) {
      carrinhoContagem.textContent = quantidade === 1 ? '1 item' : `${quantidade} itens`;
    }
    if (totalCarrinho) totalCarrinho.textContent = SLEY.formatarMZN(total);
    if (btnConfirmar) btnConfirmar.disabled = quantidade === 0 || bloqueado;
    if (document.getElementById('vista-mesa').classList.contains('is-ativa')) renderizarCarrinho();
  }

  function renderizarCarrinho() {
    if (!carrinhoLista) return;
    carrinhoLista.replaceChildren();

    if (!carrinho.length) {
      const vazio = document.createElement('div');
      vazio.className = 'mesa-vazio';
      const texto = document.createElement('p');
      texto.textContent = 'Ainda não adicionou pratos ao pedido.';
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'btn btn-contorno';
      link.textContent = 'Ver o menu';
      link.addEventListener('click', () => mostrarVista('menu'));
      vazio.append(texto, link);
      carrinhoLista.appendChild(vazio);
      return;
    }

    carrinho.forEach((item, indice) => {
      carrinhoLista.appendChild(bonecoItem(item, indice));
    });
  }

  /* ---------------------------------------------------------- detalhe do prato */

  function tagsDoPrato(prato) {
    detalheEtiquetas.replaceChildren();
    (prato.etiquetas || []).forEach((etiqueta) => {
      const tag = document.createElement('span');
      tag.className = `etiqueta etiqueta--${String(etiqueta.chave).replace(' ', '-')}`;
      tag.textContent = etiqueta.rotulo;
      detalheEtiquetas.appendChild(tag);
    });
  }

  function abrirDetalhe(pratoId) {
    const prato = pratos.get(pratoId);
    if (!prato) return;
    pratoDetalhe = prato;

    if (prato.video_url) {
      detalheFoto.classList.add('oculto');
      detalheVideo.classList.remove('oculto');
      detalheVideo.poster = prato.foto || '';
      detalheVideo.muted = false;
      if (detalheVideo.getAttribute('src') !== prato.video_url) {
        detalheVideo.src = prato.video_url;
        detalheVideo.load();
      }
    } else {
      pausarVideo(detalheVideo);
      detalheVideo.classList.add('oculto');
      detalheVideo.removeAttribute('src');
      try {
        detalheVideo.load();
      } catch {
        /* ignora */
      }
      detalheFoto.classList.remove('oculto');
      detalheFoto.src = prato.foto || '/img/prato-placeholder.svg';
      detalheFoto.alt = prato.nome;
    }
    detalheNome.textContent = prato.nome;
    detalhePreco.textContent = prato.preco_formatado;
    detalheDescricao.textContent = prato.descricao || 'Sem descrição.';
    detalheDescricao.classList.toggle('oculto', !prato.descricao);
    detalheTempo.textContent = `${prato.tempo_preparo} min`;
    tagsDoPrato(prato);
    detalheSelo.classList.toggle('oculto', prato.disponivel);
    detalheObs.value = '';
    detalheQuantidade.textContent = '1';
    btnDetalheAdicionar.disabled = !prato.disponivel;
    btnDetalheAdicionar.textContent = prato.disponivel ? 'Adicionar' : 'Esgotado';

    if (typeof dialogo.showModal === 'function') dialogo.showModal();
    else dialogo.setAttribute('open', '');
  }

  function fecharDetalhePainel() {
    pausarVideo(detalheVideo);
    if (dialogo.open) dialogo.close();
    else dialogo.removeAttribute('open');
  }

  dialogo.addEventListener('close', () => pausarVideo(detalheVideo));

  fecharDetalhe.addEventListener('click', fecharDetalhePainel);
  dialogo.addEventListener('click', (evento) => {
    if (evento.target === dialogo) fecharDetalhePainel();
  });

  document.querySelectorAll('[data-detalhe-delta]').forEach((botao) => {
    botao.addEventListener('click', () => {
      const atual = Number(detalheQuantidade.textContent) || 1;
      const novo = Math.min(20, Math.max(1, atual + Number(botao.dataset.detalheDelta)));
      detalheQuantidade.textContent = String(novo);
    });
  });

  btnDetalheAdicionar.addEventListener('click', () => {
    if (!pratoDetalhe || !pratoDetalhe.disponivel) return;
    if (!garantirSessao()) {
      fecharDetalhePainel();
      return;
    }
    adicionarItem(pratoDetalhe, Number(detalheQuantidade.textContent) || 1, detalheObs.value);
    fecharDetalhePainel();
    mostrarVista('mesa');
  });

  /* ------------------------------------------------------------- menu (grelha) */

  botoesCategoria.forEach((botao) => {
    botao.addEventListener('click', () => {
      botoesCategoria.forEach((outro) => {
        const ativo = outro === botao;
        outro.classList.toggle('is-ativa', ativo);
        outro.setAttribute('aria-selected', String(ativo));
      });
      const filtro = botao.dataset.filtro;
      cardsMenu.forEach((card) => {
        card.hidden = filtro !== 'todos' && card.dataset.categoria !== String(filtro);
      });
      videosCards.forEach((video) => {
        const card = video.closest('.menu-card');
        if (!card || card.hidden) pausarVideo(video);
      });
      tocarCartoesVisiveis();
      if (menuGrelha) menuGrelha.scrollTop = 0;
    });
  });

  function abrirPeloCard(card) {
    abrirDetalhe(Number(card.dataset.pratoId));
  }

  cardsMenu.forEach((card) => {
    card.addEventListener('click', () => abrirPeloCard(card));
    card.addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter' || evento.key === ' ') {
        evento.preventDefault();
        abrirPeloCard(card);
      }
    });
  });

  /* ------------------------------------------------------------------ pedidos */

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
      <article class="mesa-pedido">
        <header class="mesa-pedido__topo">
          <strong>Pedido #${Number(pedido.id)}</strong>
          <span class="estado estado--${classe}">${SLEY.escaparHtml(pedido.estado)}</span>
        </header>
        <ul class="mesa-pedido__itens">${itens}</ul>
        ${
          pedido.observacoes
            ? `<p class="mesa-pedido__obs">${SLEY.escaparHtml(pedido.observacoes)}</p>`
            : ''
        }
        <footer class="mesa-pedido__rodape">
          <span>${SLEY.escaparHtml(SLEY.formatarHora(pedido.criado_em))} · ${Number(pedido.tempo_previsto_min)} min previstos</span>
          <strong>${SLEY.escaparHtml(pedido.total_formatado)}</strong>
        </footer>
      </article>`;
  }

  function renderResumo(resumo) {
    resumoAtual = resumo;
    aplicarGostosDaSessao(resumo.pratos_gostados);

    mesaEstado.textContent = resumo.estado_atual;
    mesaTotal.textContent = resumo.total_formatado;
    mesaContagemPedidos.textContent =
      resumo.total_pedidos === 1 ? '1 pedido' : `${resumo.total_pedidos} pedidos`;

    avisoFechada.classList.toggle('oculto', resumo.aberta);
    if (resumo.chamada_pendente) {
      avisoChamada.classList.remove('oculto');
      avisoChamada.textContent =
        resumo.chamada_pendente.tipo === 'conta'
          ? 'Pedido de conta enviado. Um empregado está a caminho.'
          : 'Empregado chamado. Aguarde um momento.';
    } else {
      avisoChamada.classList.add('oculto');
    }

    const bloqueadoServico = !resumo.pode_pedir || Boolean(resumo.chamada_pendente);
    btnEmpregado.disabled = bloqueadoServico;
    btnConta.disabled = bloqueadoServico;

    listaPedidos.innerHTML = resumo.pedidos.length
      ? resumo.pedidos.map(htmlPedido).join('')
      : '<p class="mesa-vazio-texto">Ainda não fez nenhum pedido nesta mesa.</p>';
  }

  async function carregarResumo() {
    if (!sessao || !sessao.token || carregandoResumo) return;
    carregandoResumo = true;
    try {
      const resumo = await SLEY.fetchJSON(`/api/sessoes/${encodeURIComponent(sessao.token)}`);
      renderResumo(resumo);
    } catch (erro) {
      if (erro.status === 404 || erro.status === 403) {
        SLEY.limparSessao(mesa);
        sessao = null;
        pararTempoReal();
        if (erro.status === 404) {
          falharAcesso(
            new Error('A sessão desta mesa terminou. Introduza o código atual da mesa.'),
            false
          );
        } else {
          SLEY.toast(erro.message, 'erro');
        }
      }
    } finally {
      carregandoResumo = false;
    }
  }

  function iniciarTempoReal() {
    if (!sessao || !sessao.token) return;
    if (!socket && typeof window.io === 'function') {
      socket = window.io({ auth: { token: sessao.token }, transports: ['websocket', 'polling'] });
      ['pedido_atualizado', 'nova_chamada', 'chamada_resolvida', 'sessao_fechada', 'connect'].forEach(
        (evento) => socket.on(evento, carregarResumo)
      );
    }
    if (!temporizador) {
      temporizador = setInterval(carregarResumo, 15000);
    }
  }

  function pararTempoReal() {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    if (temporizador) {
      clearInterval(temporizador);
      temporizador = null;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && sessao) carregarResumo();
  });

  /* ------------------------------------------------------------------- enviar */

  btnConfirmar.addEventListener('click', async () => {
    if (!carrinho.length) return;
    if (!garantirSessao()) return;

    const textoOriginal = btnConfirmar.textContent;
    btnConfirmar.disabled = true;
    btnConfirmar.textContent = 'A enviar pedido…';

    try {
      await SLEY.fetchJSON('/api/pedidos', {
        method: 'POST',
        body: {
          token: sessao.token,
          itens: carrinho.map((item) => ({
            prato_id: item.prato_id,
            quantidade: item.quantidade,
            observacao: item.observacao
          })),
          observacoes: observacaoGeral.value.trim()
        }
      });
      carrinho = [];
      observacaoGeral.value = '';
      SLEY.guardarCarrinho(mesa, []);
      atualizarCarrinho();
      SLEY.toast('Pedido enviado para a cozinha.');
      await carregarResumo();
      iniciarTempoReal();
    } catch (erro) {
      SLEY.toast(erro.message, 'erro');
      if (erro.status === 401 || erro.status === 403) {
        SLEY.limparSessao(mesa);
        sessao = null;
        pararTempoReal();
        falharAcesso(erro, false);
      }
    } finally {
      btnConfirmar.textContent = textoOriginal;
      atualizarCarrinho();
    }
  });

  /* ----------------------------------------------------------------- serviços */

  async function chamarServico(tipo, botao) {
    if (!garantirSessao()) return;

    const alvo = botao.querySelector('strong') || botao;
    const textoOriginal = alvo.textContent;
    botao.disabled = true;
    alvo.textContent = 'A enviar…';

    try {
      const dados = await SLEY.fetchJSON('/api/chamadas', {
        method: 'POST',
        body: { token: sessao.token, tipo }
      });
      SLEY.toast(dados.mensagem);
      await carregarResumo();
    } catch (erro) {
      SLEY.toast(erro.message, 'erro');
      if (erro.status === 401 || erro.status === 403) {
        SLEY.limparSessao(mesa);
        sessao = null;
        pararTempoReal();
        falharAcesso(erro, false);
      }
    } finally {
      setTimeout(() => {
        alvo.textContent = textoOriginal;
        if (resumoAtual) {
          const bloqueadoServico = !resumoAtual.pode_pedir || Boolean(resumoAtual.chamada_pendente);
          botao.disabled = bloqueadoServico;
        } else {
          botao.disabled = false;
        }
      }, 900);
    }
  }

  btnEmpregado.addEventListener('click', () => chamarServico('empregado', btnEmpregado));
  btnConta.addEventListener('click', () => chamarServico('conta', btnConta));

  /* --------------------------------------------- ações do feed/fluxo principal */

  document.addEventListener('click', (evento) => {
    const gosto = evento.target.closest('[data-acao="gosto"]');
    if (gosto) {
      alternarGosto(Number(gosto.dataset.pratoId), gosto);
      return;
    }

    const adicionar = evento.target.closest('[data-acao="adicionar"]');
    if (adicionar) {
      const prato = pratos.get(Number(adicionar.dataset.pratoId));
      if (!prato || !prato.disponivel) return;
      if (!garantirSessao()) return;
      adicionarItem(prato, 1, '');
    }
  });

  /* ------------------------------------------------------------------ arranque */

  mostrarVista('feed');
  renderizarCarrinho();
  atualizarCarrinho();
  iniciarAcesso();
})();

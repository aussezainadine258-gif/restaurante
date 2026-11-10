// Painel da gerência: pedidos em tempo real, menu, mesas e definições.
'use strict';

(() => {
  const {
    fetchJSON,
    escaparHtml: esc,
    toast,
    formatarMZN,
    formatarHora,
    formatarDataHora,
    slugify,
    carregandoBotao
  } = window.SLEY;

  const corpo = document.body;
  const uploadMaxMb = Number(corpo.dataset.uploadMax || 5);
  const videoMaxMb = Number(corpo.dataset.videoMax || 5);
  const videoMaxSegundos = Number(corpo.dataset.videoSegundos || 15);
  const MENSAGEM_VIDEO_GRANDE = 'Vídeo demasiado grande, comprime-o ou usa um mais curto';

  const ROTULOS_ESTADO = {
    Recebido: 'Recebido',
    'Em preparo': 'Em preparo',
    Pronto: 'Pronto',
    Entregue: 'Entregue',
    Cancelado: 'Cancelado'
  };

  const ROTULOS_ETIQUETA = {
    vegetariano: 'Vegetariano',
    picante: 'Picante',
    novo: 'Novo',
    'mais pedido': 'Mais pedido'
  };

  // Transições aceites pelo servidor (espelhadas aqui para desenhar os botões).
  const TRANSICOES = {
    Recebido: ['Em preparo', 'Pronto', 'Cancelado'],
    'Em preparo': ['Pronto', 'Recebido', 'Cancelado'],
    Pronto: ['Entregue', 'Em preparo', 'Cancelado'],
    Entregue: [],
    Cancelado: []
  };

  const ACAO_POR_ESTADO = {
    'Em preparo': { rotulo: 'Iniciar preparo', classe: 'btn-acao--principal' },
    Pronto: { rotulo: 'Marcar pronto', classe: 'btn-acao--principal' },
    Entregue: { rotulo: 'Entregar', classe: 'btn-acao--principal' },
    Recebido: { rotulo: 'Voltar a recebido', classe: 'btn-acao--neutro' },
    Cancelado: { rotulo: 'Cancelar', classe: 'btn-acao--perigo' }
  };

  const CHAVE_SOM = 'sley:admin:som';

  const abaPedidos = document.getElementById('aba-pedidos');
  const abaMenu = document.getElementById('aba-menu');
  const abaMesas = document.getElementById('aba-mesas');
  const abaDefinicoes = document.getElementById('aba-definicoes');
  const botoesAba = [...document.querySelectorAll('.aba-botao')];
  const badgePedidos = document.getElementById('aba-badge-pedidos');

  const estadoLigacao = document.getElementById('estado-ligacao');
  const btnSom = document.getElementById('btn-som');

  const resumoRecebido = document.getElementById('resumo-recebido');
  const resumoPreparo = document.getElementById('resumo-preparo');
  const resumoPronto = document.getElementById('resumo-pronto');
  const resumoAtrasados = document.getElementById('resumo-atrasados');
  const resumoChamadas = document.getElementById('resumo-chamadas');
  const cartaoAtrasados = document.getElementById('cartao-atrasados');
  const cartaoChamadas = document.getElementById('cartao-chamadas');

  const listaChamadas = document.getElementById('lista-chamadas');
  const chamadasContagem = document.getElementById('chamadas-contagem');
  const filtrosPedidos = document.getElementById('filtros-pedidos');
  const listaPedidos = document.getElementById('lista-pedidos-admin');

  const filtroCategoriaPratos = document.getElementById('filtro-categoria-pratos');
  const listaCategorias = document.getElementById('lista-categorias');
  const listaPratos = document.getElementById('lista-pratos');

  const listaMesas = document.getElementById('lista-mesas');

  const listaUtilizadores = document.getElementById('lista-utilizadores');
  const formDefinicoes = document.getElementById('form-definicoes');
  const inputConfigNome = document.getElementById('config-nome');
  const inputConfigCodigo = document.getElementById('config-codigo');
  const btnGuardarDefinicoes = document.getElementById('btn-guardar-definicoes');
  const formUtilizador = document.getElementById('form-utilizador');

  const modalPrato = document.getElementById('modal-prato');
  const formPrato = document.getElementById('form-prato');
  const modalPratoTitulo = document.getElementById('modal-prato-titulo');
  const modalPratoEyebrow = document.getElementById('modal-prato-eyebrow');
  const campoPratoNome = document.getElementById('prato-nome');
  const campoPratoCategoria = document.getElementById('prato-categoria');
  const campoPratoPreco = document.getElementById('prato-preco');
  const campoPratoTempo = document.getElementById('prato-tempo');
  const campoPratoDescricao = document.getElementById('prato-descricao');
  const campoPratoFoto = document.getElementById('prato-foto');
  const campoPratoVideo = document.getElementById('prato-video');
  const previewPrato = document.getElementById('prato-foto-preview');
  const notaPratoFoto = document.getElementById('prato-foto-nota');
  const btnRemoverFoto = document.getElementById('btn-remover-foto');
  const caixaPreviewVideo = document.getElementById('prato-video-caixa');
  const previewVideo = document.getElementById('prato-video-preview');
  const notaPratoVideo = document.getElementById('prato-video-nota');
  const btnRemoverVideo = document.getElementById('btn-remover-video');
  const progressoPrato = document.getElementById('prato-progresso');
  const progressoBarra = document.getElementById('prato-progresso-barra');
  const progressoTexto = document.getElementById('prato-progresso-texto');
  const estadoMedia = document.getElementById('prato-media-estado');
  const campoPratoDisponivel = document.getElementById('prato-disponivel');
  const checksEtiquetas = [...document.querySelectorAll('.etiqueta-check')];
  const btnGuardarPrato = document.getElementById('btn-guardar-prato');

  const modalCategoria = document.getElementById('modal-categoria');
  const formCategoria = document.getElementById('form-categoria');
  const modalCategoriaTitulo = document.getElementById('modal-categoria-titulo');
  const modalCategoriaEyebrow = document.getElementById('modal-categoria-eyebrow');
  const campoCategoriaNome = document.getElementById('categoria-nome');
  const campoCategoriaOrdem = document.getElementById('categoria-ordem');

  const modalConta = document.getElementById('modal-conta');
  const contaTitulo = document.getElementById('conta-titulo');
  const contaConteudo = document.getElementById('conta-conteudo');
  const btnFecharConta = document.getElementById('btn-fechar-conta');

  const modalMesaAtivada = document.getElementById('modal-mesa-ativada');
  const codigoMesaNumero = document.getElementById('codigo-mesa-numero');
  const codigoMesaValor = document.getElementById('codigo-mesa-valor');
  const avisoCodigoDesligado = document.getElementById('aviso-codigo-desligado');
  const linkQrMesa = document.getElementById('link-qr-mesa');

  const modalPassword = document.getElementById('modal-password');
  const formPassword = document.getElementById('form-password');
  const modalPasswordTitulo = document.getElementById('modal-password-titulo');
  const campoPasswordNova = document.getElementById('password-nova');
  const btnGuardarPassword = document.getElementById('btn-guardar-password');

  let abaAtual = 'pedidos';
  let filtroPedidos = 'ativos';
  let pedidosCarregados = false;
  let sequenciaPedidos = 0;
  let menuEstado = { categorias: [], pratos: [] };
  let menuCarregado = false;
  let mesasEstado = [];
  let mesasCarregadas = false;
  let definicoesCarregadas = false;
  let utilizadoresCarregados = false;
  let codigoMesaAtivo = true;
  let pratoEditandoId = null;
  let categoriaEditandoId = null;
  let contaMesaId = null;
  let utilizadorPasswordId = null;
  let urlPreviewFoto = null;
  let urlPreviewVideo = null;
  let ficheiroFoto = null;
  let ficheiroVideo = null;
  let promessaFoto = null;
  let removerFoto = false;
  let removerVideo = false;
  let fotoAtualPrato = null;
  let videoAtualPrato = null;

  /* --------------------------------------------------------------- utilitários */

  function minutosDesde(iso) {
    const inicio = new Date(iso).getTime();
    if (Number.isNaN(inicio)) return 0;
    return Math.max(0, Math.floor((Date.now() - inicio) / 60000));
  }

  function debounce(funcao, espera = 300) {
    let temporizador = null;
    return (...args) => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => funcao(...args), espera);
    };
  }

  function seloEstado(estado) {
    return `<span class="estado-selo estado-selo--${slugify(estado)}">${esc(estado)}</span>`;
  }

  function iniciais(nome) {
    return String(nome || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((parte) => parte.charAt(0).toUpperCase())
      .join('');
  }

  function tratarErroApi(erro) {
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

  async function comBotaoOcupado(botao, texto, acao) {
    carregandoBotao(botao, true, texto);
    try {
      return await acao();
    } finally {
      carregandoBotao(botao, false);
    }
  }

  /* -------------------------------------------------------------------- abas */

  function secaoPorNome(nome) {
    return { pedidos: abaPedidos, menu: abaMenu, mesas: abaMesas, definicoes: abaDefinicoes }[nome];
  }

  function carregarSecao(nome, silencioso = false) {
    if (nome === 'pedidos') return carregarPedidos({ silencioso });
    if (nome === 'menu') return carregarMenu(silencioso);
    if (nome === 'mesas') return carregarMesas(silencioso);
    if (nome === 'definicoes') return carregarDefinicoes(silencioso);
    return Promise.resolve();
  }

  function mostrarAba(nome, atualizarUrl = true) {
    if (!secaoPorNome(nome)) nome = 'pedidos';
    abaAtual = nome;

    botoesAba.forEach((botao) => {
      const ativa = botao.dataset.aba === nome;
      botao.classList.toggle('is-ativa', ativa);
      botao.setAttribute('aria-selected', ativa ? 'true' : 'false');
    });

    ['pedidos', 'menu', 'mesas', 'definicoes'].forEach((chave) => {
      const secao = secaoPorNome(chave);
      if (secao) secao.hidden = chave !== nome;
    });

    if (atualizarUrl && window.location.hash !== `#${nome}`) {
      history.replaceState(null, '', `#${nome}`);
    }

    if (nome === 'pedidos') {
      if (!pedidosCarregados) carregarPedidos();
    } else if (nome === 'menu') {
      if (!menuCarregado) carregarMenu();
    } else if (nome === 'mesas') {
      if (!mesasCarregadas) carregarMesas();
    } else if (nome === 'definicoes') {
      carregarDefinicoes(!definicoesCarregadas);
      carregarUtilizadores(!utilizadoresCarregados);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  botoesAba.forEach((botao) => {
    botao.addEventListener('click', () => mostrarAba(botao.dataset.aba));
  });

  /* --------------------------------------------------------------- som/ligação */

  let somAtivo = false;
  try {
    somAtivo = localStorage.getItem(CHAVE_SOM) === '1';
  } catch {
    /* armazenamento indisponível */
  }

  let contextoAudio = null;

  function obterContextoAudio() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!contextoAudio) contextoAudio = new AudioCtx();
    if (contextoAudio.state === 'suspended') contextoAudio.resume().catch(() => {});
    return contextoAudio;
  }

  function tocarBip() {
    if (!somAtivo) return;
    const contexto = obterContextoAudio();
    if (!contexto) return;
    const agora = contexto.currentTime;
    [0, 0.19].forEach((atraso, indice) => {
      const oscilador = contexto.createOscillator();
      const ganho = contexto.createGain();
      oscilador.type = 'sine';
      oscilador.frequency.setValueAtTime(indice === 0 ? 740 : 980, agora + atraso);
      ganho.gain.setValueAtTime(0.0001, agora + atraso);
      ganho.gain.exponentialRampToValueAtTime(0.18, agora + atraso + 0.02);
      ganho.gain.exponentialRampToValueAtTime(0.0001, agora + atraso + 0.16);
      oscilador.connect(ganho).connect(contexto.destination);
      oscilador.start(agora + atraso);
      oscilador.stop(agora + atraso + 0.18);
    });
  }

  function atualizarBotaoSom() {
    if (!btnSom) return;
    btnSom.setAttribute('aria-pressed', somAtivo ? 'true' : 'false');
    btnSom.textContent = somAtivo ? 'Som ativo' : 'Ativar som';
    btnSom.style.borderColor = somAtivo ? 'var(--laranja)' : '';
    btnSom.style.background = somAtivo ? 'rgba(255, 107, 0, 0.18)' : '';
  }

  if (btnSom) {
    btnSom.addEventListener('click', () => {
      somAtivo = !somAtivo;
      try {
        localStorage.setItem(CHAVE_SOM, somAtivo ? '1' : '0');
      } catch {
        /* ignora */
      }
      if (somAtivo) {
        obterContextoAudio();
        tocarBip();
        toast('Alertas sonoros ativados.');
      } else {
        toast('Alertas sonoros desativados.');
      }
      atualizarBotaoSom();
    });
  }

  function marcarLigacao(ligado) {
    if (!estadoLigacao) return;
    estadoLigacao.classList.toggle('offline', !ligado);
    estadoLigacao.innerHTML = ligado
      ? '<span class="ponto-vivo"></span> Em tempo real'
      : 'Sem ligação — a tentar…';
  }

  /* ------------------------------------------------------------------ pedidos */

  function atualizarResumo(resumo) {
    const contagem = (resumo && resumo.contagem) || {};
    resumoRecebido.textContent = String(contagem.Recebido || 0);
    resumoPreparo.textContent = String(contagem['Em preparo'] || 0);
    resumoPronto.textContent = String(contagem.Pronto || 0);
    resumoAtrasados.textContent = String(resumo.atrasados || 0);
    resumoChamadas.textContent = String(resumo.chamadas_pendentes || 0);

    const ativos = Number(resumo.ativos) || 0;
    badgePedidos.textContent = String(ativos);
    badgePedidos.hidden = ativos === 0;

    cartaoAtrasados.classList.toggle('is-alerta', Number(resumo.atrasados) > 0);
    cartaoChamadas.classList.toggle('is-alerta', Number(resumo.chamadas_pendentes) > 0);
  }

  function htmlAcoesPedido(pedido) {
    const permitidos = TRANSICOES[pedido.estado] || [];
    if (!permitidos.length) {
      return `<span class="pedido-admin__fim">Pedido ${esc(pedido.estado.toLowerCase())}</span>`;
    }
    return permitidos
      .map((estado) => {
        const config = ACAO_POR_ESTADO[estado] || { rotulo: estado, classe: '' };
        return `<button type="button" class="btn-acao ${config.classe}" data-acao="estado" data-estado="${esc(
          estado
        )}">${esc(config.rotulo)}</button>`;
      })
      .join('');
  }

  function htmlPedido(pedido) {
    const atrasado = Boolean(pedido.atrasado);
    const restante = Number(pedido.tempo_restante_min) || 0;
    const itens = pedido.itens
      .map(
        (item) => `
          <li>
            <span class="item-qtd">${Number(item.quantidade)}×</span>
            <span class="item-nome">
              ${esc(item.nome)}
              ${item.observacao ? `<small class="item-obs">${esc(item.observacao)}</small>` : ''}
            </span>
            <span class="item-subtotal">${esc(item.subtotal_formatado)}</span>
          </li>`
      )
      .join('');

    return `
      <article class="pedido-admin${atrasado ? ' atrasado' : ''}" data-pedido-id="${Number(pedido.id)}">
        <div class="pedido-admin__topo">
          <div class="mesa-quadro">
            <span>Mesa</span>
            <strong>${Number(pedido.mesa_numero)}</strong>
          </div>
          <div class="pedido-admin__info">
            <div class="pedido-admin__linha">
              <strong>Pedido #${Number(pedido.id)}</strong>
              ${atrasado ? '<span class="selo-atraso">Atrasado</span>' : seloEstado(pedido.estado)}
            </div>
            <div class="pedido-admin__meta">
              <span>Há <strong>${Number(pedido.minutos_decorridos)} min</strong></span>
              <span>Previsão <strong>${Number(pedido.tempo_previsto_min)} min</strong></span>
              <span class="${atrasado ? 'atraso' : ''}">${
                atrasado
                  ? `+${Math.max(0, Number(pedido.minutos_decorridos) - Number(pedido.tempo_previsto_min))} min de atraso`
                  : `${restante} min restantes`
              }</span>
              <span>${esc(formatarHora(pedido.criado_em))}</span>
            </div>
          </div>
        </div>

        <ul class="pedido-admin__itens">${itens}</ul>

        ${
          pedido.observacoes
            ? `<p class="pedido-admin__obs"><strong>Observação:</strong> ${esc(pedido.observacoes)}</p>`
            : ''
        }

        <div class="pedido-admin__acoes">
          ${htmlAcoesPedido(pedido)}
          <span class="pedido-admin__total">${esc(pedido.total_formatado)}</span>
        </div>
      </article>`;
  }

  function htmlChamada(chamada) {
    const conta = chamada.tipo === 'conta';
    return `
      <article class="chamada-item" data-chamada-id="${Number(chamada.id)}">
        <div class="chamada-item__mesa">
          <span>Mesa</span>
          <strong>${Number(chamada.mesa_numero)}</strong>
        </div>
        <div class="chamada-item__info">
          <strong>${conta ? 'Pedido de conta' : 'Chamou um empregado'}</strong>
          <span>Há ${Number(chamada.minutos_decorridos)} min · ${esc(formatarHora(chamada.criada_em))}</span>
        </div>
        <button type="button" class="btn btn-laranja" data-acao="resolver-chamada">Resolvido</button>
      </article>`;
  }

  function renderizarChamadas(chamadas) {
    const lista = Array.isArray(chamadas) ? chamadas : [];
    chamadasContagem.textContent = String(lista.length);
    if (!lista.length) {
      listaChamadas.innerHTML = '<p class="estado-vazio estado-vazio--compacto">Sem chamadas pendentes.</p>';
      return;
    }
    listaChamadas.innerHTML = lista
      .map((chamada) => htmlChamada(chamada))
      .join('');
  }

  function mensagemVazio() {
    if (filtroPedidos === 'ativos') return 'Não há pedidos ativos neste momento.';
    if (filtroPedidos === 'todos') return 'Ainda não existem pedidos.';
    return `Não existem pedidos com o estado “${filtroPedidos}”.`;
  }

  function renderizarPedidos(lista) {
    if (!Array.isArray(lista) || !lista.length) {
      listaPedidos.innerHTML = `<p class="estado-vazio estado-vazio--compacto">${esc(mensagemVazio())}</p>`;
      return;
    }
    listaPedidos.innerHTML = lista.map((pedido) => htmlPedido(pedido)).join('');
  }

  async function carregarPedidos({ silencioso = false } = {}) {
    const sequencia = ++sequenciaPedidos;
    if (!silencioso && !pedidosCarregados) {
      listaPedidos.innerHTML = '<div class="estado-carregando"><span class="spinner"></span> A carregar pedidos…</div>';
    }
    try {
      const dados = await fetchJSON(`/admin/api/pedidos?estado=${encodeURIComponent(filtroPedidos)}`);
      if (sequencia !== sequenciaPedidos) return;
      pedidosCarregados = true;
      atualizarResumo(dados.resumo || {});
      renderizarChamadas(dados.chamadas || []);
      renderizarPedidos(dados.pedidos || []);
      if (dados.resumo) codigoMesaAtivo = Boolean(dados.resumo.codigo_mesa_ativo);
    } catch (erro) {
      if (sequencia !== sequenciaPedidos) return;
      if (!silencioso) {
        listaPedidos.innerHTML =
          '<p class="estado-vazio estado-vazio--compacto">Não foi possível carregar os pedidos. Tente novamente.</p>';
      }
      tratarErroApi(erro);
    }
  }

  async function mudarEstadoPedido(pedidoId, novoEstado, botao) {
    if (novoEstado === 'Cancelado') {
      const confirmar = window.confirm('Cancelar este pedido? Esta ação não pode ser desfeita.');
      if (!confirmar) return;
    }
    const cartao = botao.closest('[data-pedido-id]');
    const botoes = cartao ? [...cartao.querySelectorAll('button')] : [];
    botoes.forEach((b) => {
      b.disabled = true;
    });
    carregandoBotao(botao, true, 'A atualizar…');
    try {
      const dados = await fetchJSON(`/admin/api/pedidos/${pedidoId}/estado`, {
        method: 'PATCH',
        body: { estado: novoEstado }
      });
      toast(`Pedido #${pedidoId} passou a “${novoEstado}”.`);
      if (dados.resumo) atualizarResumo(dados.resumo);
      await carregarPedidos({ silencioso: true });
    } catch (erro) {
      tratarErroApi(erro);
      botoes.forEach((b) => {
        b.disabled = false;
      });
    } finally {
      carregandoBotao(botao, false);
    }
  }

  async function resolverChamada(chamadaId, botao) {
    carregandoBotao(botao, true, 'A resolver…');
    try {
      await fetchJSON(`/admin/api/chamadas/${chamadaId}/resolver`, { method: 'PATCH' });
      toast('Chamada resolvida.');
      await carregarPedidos({ silencioso: true });
    } catch (erro) {
      tratarErroApi(erro);
      carregandoBotao(botao, false);
    }
  }

  filtrosPedidos.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-filtro]');
    if (!botao) return;
    filtroPedidos = botao.dataset.filtro;
    [...filtrosPedidos.querySelectorAll('[data-filtro]')].forEach((outro) => {
      outro.classList.toggle('is-ativo', outro === botao);
      outro.setAttribute('aria-pressed', outro === botao ? 'true' : 'false');
    });
    listaPedidos.innerHTML = '<div class="estado-carregando"><span class="spinner"></span> A carregar…</div>';
    carregarPedidos({ silencioso: true });
  });

  listaPedidos.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-acao="estado"]');
    if (!botao) return;
    const cartao = botao.closest('[data-pedido-id]');
    if (!cartao) return;
    mudarEstadoPedido(Number(cartao.dataset.pedidoId), botao.dataset.estado, botao);
  });

  listaChamadas.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-acao="resolver-chamada"]');
    if (!botao) return;
    const item = botao.closest('[data-chamada-id]');
    if (!item) return;
    resolverChamada(Number(item.dataset.chamadaId), botao);
  });

  /* --------------------------------------------------------------------- menu */

  function atualizarOpcoesCategorias() {
    const opcoes = menuEstado.categorias
      .map((categoria) => `<option value="${Number(categoria.id)}">${esc(categoria.nome)}</option>`)
      .join('');

    const filtroAtual = filtroCategoriaPratos.value;
    filtroCategoriaPratos.innerHTML = `<option value="">Todas as categorias</option>${opcoes}`;
    if ([...filtroCategoriaPratos.options].some((opcao) => opcao.value === filtroAtual)) {
      filtroCategoriaPratos.value = filtroAtual;
    }

    const categoriaModalAtual = campoPratoCategoria.value;
    campoPratoCategoria.innerHTML = opcoes || '<option value="">Sem categorias</option>';
    if ([...campoPratoCategoria.options].some((opcao) => opcao.value === categoriaModalAtual)) {
      campoPratoCategoria.value = categoriaModalAtual;
    }
  }

  function renderizarCategorias() {
    if (!menuEstado.categorias.length) {
      listaCategorias.innerHTML =
        '<p class="estado-vazio estado-vazio--compacto">Ainda não existem categorias.</p>';
      return;
    }
    listaCategorias.innerHTML = menuEstado.categorias
      .map(
        (categoria) => `
          <div class="categoria-item" data-categoria-id="${Number(categoria.id)}">
            <div class="categoria-item__info">
              <strong>${esc(categoria.nome)}</strong>
              <span>${Number(categoria.total_pratos)} prato(s) · ordem ${Number(categoria.ordem)}</span>
            </div>
            <div class="categoria-item__acoes">
              <button type="button" class="btn-mini" data-acao="editar-categoria">Editar</button>
              <button type="button" class="btn-mini btn-mini--perigo" data-acao="eliminar-categoria">Eliminar</button>
            </div>
          </div>`
      )
      .join('');
  }

  function pratosFiltrados() {
    const categoriaId = Number(filtroCategoriaPratos.value) || 0;
    if (!categoriaId) return menuEstado.pratos;
    return menuEstado.pratos.filter((prato) => Number(prato.categoria_id) === categoriaId);
  }

  function renderizarPratos() {
    const pratos = pratosFiltrados();
    if (!pratos.length) {
      listaPratos.innerHTML =
        '<p class="estado-vazio estado-vazio--compacto">Nenhum prato nesta categoria.</p>';
      return;
    }

    listaPratos.innerHTML = pratos
      .map((prato) => {
        const etiquetas = prato.etiquetas
          .map(
            (etiqueta) =>
              `<span class="etiqueta etiqueta--${slugify(etiqueta)}">${esc(
                ROTULOS_ETIQUETA[etiqueta] || etiqueta
              )}</span>`
          )
          .join('');

        return `
          <article class="prato-admin${prato.disponivel ? '' : ' prato-admin--esgotado'}" data-prato-id="${Number(
            prato.id
          )}">
            <img class="prato-admin__foto" src="${esc(prato.foto)}" alt="${esc(
              prato.nome
            )}" loading="lazy" width="88" height="68">
            <div class="prato-admin__info">
              <div class="prato-admin__topo">
                <span class="prato-admin__nome">${esc(prato.nome)}</span>
                <span class="prato-admin__preco">${esc(prato.preco_formatado)}</span>
              </div>
              <p class="prato-admin__meta">
                ${esc(prato.categoria_nome || 'Sem categoria')} · ${Number(prato.tempo_preparo)} min
                ${prato.video_url ? ' · Vídeo' : ''}
                ${prato.disponivel ? '' : ' · Esgotado'}
              </p>
              <div class="prato-admin__tags">${etiquetas}</div>
            </div>
            <div class="prato-admin__acoes">
              <label class="prato-admin__disponibilidade">
                <span class="switch">
                  <input type="checkbox" data-acao="disponibilidade" ${
                    prato.disponivel ? 'checked' : ''
                  } aria-label="Disponibilidade de ${esc(prato.nome)}">
                  <span class="switch__pista" aria-hidden="true"></span>
                </span>
                Disponível
              </label>
              <button type="button" class="btn-mini" data-acao="editar-prato">Editar</button>
              <button type="button" class="btn-mini btn-mini--perigo" data-acao="eliminar-prato">Eliminar</button>
            </div>
          </article>`;
      })
      .join('');
  }

  async function carregarMenu(silencioso = false) {
    if (!silencioso) {
      listaCategorias.innerHTML = '<div class="estado-carregando"><span class="spinner"></span> A carregar…</div>';
      listaPratos.innerHTML = '<div class="estado-carregando"><span class="spinner"></span> A carregar pratos…</div>';
    }
    try {
      const dados = await fetchJSON('/admin/api/menu');
      menuEstado = {
        categorias: Array.isArray(dados.categorias) ? dados.categorias : [],
        pratos: Array.isArray(dados.pratos) ? dados.pratos : []
      };
      menuCarregado = true;
      atualizarOpcoesCategorias();
      renderizarCategorias();
      renderizarPratos();
    } catch (erro) {
      if (!silencioso) {
        listaCategorias.innerHTML =
          '<p class="estado-vazio estado-vazio--compacto">Não foi possível carregar as categorias.</p>';
        listaPratos.innerHTML =
          '<p class="estado-vazio estado-vazio--compacto">Não foi possível carregar os pratos.</p>';
      }
      tratarErroApi(erro);
    }
  }

  function revogarUrl(url) {
    if (!url) return;
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignora */
    }
  }

  function mostrarEstadoMedia(mensagem, tipo = 'ok') {
    estadoMedia.hidden = !mensagem;
    estadoMedia.textContent = mensagem || '';
    estadoMedia.classList.toggle('upload-estado--erro', tipo === 'erro');
    estadoMedia.classList.toggle('upload-estado--aviso', tipo === 'aviso');
  }

  function mostrarProgresso(ativo, percentagem = 0, texto = 'A enviar…') {
    progressoPrato.hidden = !ativo;
    if (!ativo) return;
    const valor = Math.max(0, Math.min(100, Math.round(percentagem)));
    progressoBarra.style.width = `${valor}%`;
    progressoTexto.textContent = texto;
  }

  function atualizarPreviewFoto() {
    revogarUrl(urlPreviewFoto);
    urlPreviewFoto = null;

    if (ficheiroFoto) {
      urlPreviewFoto = URL.createObjectURL(ficheiroFoto);
      previewPrato.src = urlPreviewFoto;
      notaPratoFoto.textContent = `Nova foto: ${ficheiroFoto.name}`;
      btnRemoverFoto.hidden = false;
      return;
    }

    const foto = removerFoto ? null : fotoAtualPrato;
    previewPrato.src = foto || '/img/prato-placeholder.svg';
    notaPratoFoto.textContent = foto
      ? 'Fotografia atual'
      : removerFoto
        ? 'A fotografia será removida ao guardar.'
        : 'Sem fotografia';
    btnRemoverFoto.hidden = !foto;
  }

  function atualizarPreviewVideo() {
    revogarUrl(urlPreviewVideo);
    urlPreviewVideo = null;

    const video = ficheiroVideo || (!removerVideo ? videoAtualPrato : null);
    caixaPreviewVideo.hidden = !video;

    if (!video) {
      try {
        previewVideo.pause();
      } catch {
        /* ignora */
      }
      previewVideo.removeAttribute('src');
      previewVideo.load();
      notaPratoVideo.textContent = removerVideo ? 'O vídeo será removido ao guardar.' : 'Sem vídeo';
      btnRemoverVideo.hidden = true;
      return;
    }

    if (ficheiroVideo) {
      urlPreviewVideo = URL.createObjectURL(ficheiroVideo);
      previewVideo.src = urlPreviewVideo;
      notaPratoVideo.textContent = `Novo vídeo: ${ficheiroVideo.name}`;
    } else {
      previewVideo.src = video;
      notaPratoVideo.textContent = 'Vídeo atual';
    }
    btnRemoverVideo.hidden = false;
  }

  function carregarImagem(ficheiro) {
    if (typeof window.createImageBitmap === 'function') {
      return window.createImageBitmap(ficheiro);
    }
    return new Promise((resolve, reject) => {
      const imagem = new Image();
      const url = URL.createObjectURL(ficheiro);
      imagem.onload = () => {
        URL.revokeObjectURL(url);
        resolve(imagem);
      };
      imagem.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('imagem inválida'));
      };
      imagem.src = url;
    });
  }

  // Redimensiona para no máximo 800px de largura e comprime em JPEG (0,8).
  async function comprimirImagem(ficheiro) {
    const imagem = await carregarImagem(ficheiro);
    const larguraOriginal = imagem.width || imagem.naturalWidth;
    const alturaOriginal = imagem.height || imagem.naturalHeight;
    if (!larguraOriginal || !alturaOriginal) throw new Error('imagem inválida');

    const escala = Math.min(1, 800 / larguraOriginal);
    const largura = Math.max(1, Math.round(larguraOriginal * escala));
    const altura = Math.max(1, Math.round(alturaOriginal * escala));

    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const contexto = canvas.getContext('2d');
    if (!contexto) throw new Error('canvas indisponível');
    contexto.fillStyle = '#ffffff';
    contexto.fillRect(0, 0, largura, altura);
    contexto.drawImage(imagem, 0, 0, largura, altura);
    if (typeof imagem.close === 'function') imagem.close();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    if (!blob) throw new Error('compressão falhou');

    const base = String(ficheiro.name || 'foto')
      .replace(/\.[^.]+$/, '')
      .slice(0, 40);
    return new File([blob], `${base || 'foto'}.jpg`, { type: 'image/jpeg' });
  }

  function obterDuracaoVideo(ficheiro) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(ficheiro);
      const terminar = (valor) => {
        URL.revokeObjectURL(url);
        video.removeAttribute('src');
        try {
          video.load();
        } catch {
          /* ignora */
        }
        resolve(valor);
      };
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const duracao = Number(video.duration);
        terminar(Number.isFinite(duracao) ? duracao : null);
      };
      video.onerror = () => terminar(null);
      video.src = url;
      setTimeout(() => terminar(null), 6000);
    });
  }

  function enviarComProgresso(url, metodo, dados, aoProgresso) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(metodo, url, true);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.responseType = 'json';

      xhr.upload.onprogress = (evento) => {
        if (!evento.lengthComputable) return;
        aoProgresso((evento.loaded / evento.total) * 100);
      };
      xhr.onload = () => {
        let corpo = xhr.response;
        if (typeof corpo === 'string') {
          try {
            corpo = JSON.parse(corpo);
          } catch {
            corpo = null;
          }
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(corpo || {});
          return;
        }
        const erro = new Error(
          (corpo && corpo.erro) || 'Não foi possível guardar o prato. Tente novamente.'
        );
        erro.status = xhr.status;
        erro.campo = corpo && corpo.campo;
        reject(erro);
      };
      xhr.onerror = () => {
        const erro = new Error('Sem ligação ao servidor. Verifique a internet e tente novamente.');
        erro.status = 0;
        reject(erro);
      };
      xhr.onabort = () => {
        const erro = new Error('O envio foi cancelado.');
        erro.status = 0;
        reject(erro);
      };
      xhr.send(dados);
    });
  }

  function abrirModalPrato(prato = null) {
    if (!menuEstado.categorias.length) {
      toast('Crie primeiro uma categoria de menu.', 'erro');
      return;
    }

    pratoEditandoId = prato ? Number(prato.id) : null;
    formPrato.reset();
    campoPratoDisponivel.checked = true;
    checksEtiquetas.forEach((check) => {
      check.checked = false;
    });

    revogarUrl(urlPreviewFoto);
    revogarUrl(urlPreviewVideo);
    urlPreviewFoto = null;
    urlPreviewVideo = null;
    ficheiroFoto = null;
    ficheiroVideo = null;
    promessaFoto = null;
    removerFoto = false;
    removerVideo = false;
    campoPratoFoto.value = '';
    campoPratoVideo.value = '';
    fotoAtualPrato = prato ? prato.foto_url || prato.foto || null : null;
    videoAtualPrato = prato ? prato.video_url || null : null;
    mostrarEstadoMedia('');
    mostrarProgresso(false);

    atualizarOpcoesCategorias();

    if (prato) {
      modalPratoEyebrow.textContent = 'Editar prato';
      modalPratoTitulo.textContent = prato.nome;
      campoPratoNome.value = prato.nome;
      campoPratoCategoria.value = String(prato.categoria_id);
      campoPratoPreco.value = (Number(prato.preco_centavos) / 100).toFixed(2);
      campoPratoTempo.value = String(prato.tempo_preparo);
      campoPratoDescricao.value = prato.descricao || '';
      campoPratoDisponivel.checked = Boolean(prato.disponivel);
      checksEtiquetas.forEach((check) => {
        check.checked = prato.etiquetas.includes(check.value);
      });
    } else {
      modalPratoEyebrow.textContent = 'Novo prato';
      modalPratoTitulo.textContent = 'Adicionar prato';
      campoPratoTempo.value = '15';
      campoPratoCategoria.value = String(menuEstado.categorias[0].id);
    }

    atualizarPreviewFoto();
    atualizarPreviewVideo();
    if (!modalPrato.open) modalPrato.showModal();
    setTimeout(() => campoPratoNome.focus(), 80);
  }

  campoPratoFoto.addEventListener('change', () => {
    const ficheiro = campoPratoFoto.files && campoPratoFoto.files[0];
    promessaFoto = null;
    if (!ficheiro) {
      ficheiroFoto = null;
      atualizarPreviewFoto();
      return;
    }

    if (!/^image\//i.test(ficheiro.type)) {
      toast('Envie uma imagem JPG, PNG ou WEBP.', 'erro');
      campoPratoFoto.value = '';
      ficheiroFoto = null;
      atualizarPreviewFoto();
      return;
    }
    if (ficheiro.size > 25 * 1024 * 1024) {
      toast('A fotografia é demasiado grande. Escolha uma imagem mais pequena.', 'erro');
      campoPratoFoto.value = '';
      ficheiroFoto = null;
      atualizarPreviewFoto();
      return;
    }

    removerFoto = false;
    ficheiroFoto = null;
    mostrarEstadoMedia('A preparar a fotografia (800px, qualidade 0,8)…', 'aviso');
    promessaFoto = comprimirImagem(ficheiro)
      .then((comprimida) => {
        if (comprimida.size > uploadMaxMb * 1024 * 1024) {
          toast(`A fotografia comprimida excede o limite de ${uploadMaxMb} MB.`, 'erro');
          ficheiroFoto = null;
          campoPratoFoto.value = '';
          atualizarPreviewFoto();
          mostrarEstadoMedia('');
          return null;
        }
        ficheiroFoto = comprimida;
        atualizarPreviewFoto();
        mostrarEstadoMedia('Fotografia pronta a enviar.', 'ok');
        return comprimida;
      })
      .catch(() => {
        toast('Não foi possível processar a fotografia. Tente outra imagem.', 'erro');
        ficheiroFoto = null;
        campoPratoFoto.value = '';
        atualizarPreviewFoto();
        mostrarEstadoMedia('');
        return null;
      });
  });

  campoPratoVideo.addEventListener('change', async () => {
    const ficheiro = campoPratoVideo.files && campoPratoVideo.files[0];
    if (!ficheiro) {
      ficheiroVideo = null;
      atualizarPreviewVideo();
      return;
    }

    if (!/^video\/(mp4|webm|quicktime|ogg)$/i.test(ficheiro.type)) {
      toast('Envie um vídeo MP4, WEBM ou MOV.', 'erro');
      campoPratoVideo.value = '';
      ficheiroVideo = null;
      atualizarPreviewVideo();
      return;
    }

    if (ficheiro.size > videoMaxMb * 1024 * 1024) {
      toast(MENSAGEM_VIDEO_GRANDE, 'erro');
      campoPratoVideo.value = '';
      ficheiroVideo = null;
      atualizarPreviewVideo();
      return;
    }

    mostrarEstadoMedia('A validar o vídeo…', 'aviso');
    const duracao = await obterDuracaoVideo(ficheiro);
    if (duracao && duracao > videoMaxSegundos + 0.5) {
      toast(MENSAGEM_VIDEO_GRANDE, 'erro');
      campoPratoVideo.value = '';
      ficheiroVideo = null;
      atualizarPreviewVideo();
      mostrarEstadoMedia('');
      return;
    }

    ficheiroVideo = ficheiro;
    removerVideo = false;
    atualizarPreviewVideo();
    mostrarEstadoMedia('Vídeo pronto a enviar.', 'ok');
  });

  btnRemoverFoto.addEventListener('click', () => {
    ficheiroFoto = null;
    promessaFoto = null;
    removerFoto = true;
    campoPratoFoto.value = '';
    atualizarPreviewFoto();
    mostrarEstadoMedia('A fotografia será removida ao guardar o prato.', 'aviso');
  });

  btnRemoverVideo.addEventListener('click', () => {
    ficheiroVideo = null;
    removerVideo = true;
    campoPratoVideo.value = '';
    atualizarPreviewVideo();
    mostrarEstadoMedia('O vídeo será removido ao guardar o prato.', 'aviso');
  });

  formPrato.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!formPrato.reportValidity()) return;

    if (promessaFoto) await promessaFoto;

    const dados = new FormData();
    dados.append('nome', campoPratoNome.value);
    dados.append('categoria_id', campoPratoCategoria.value);
    dados.append('preco', campoPratoPreco.value);
    dados.append('tempo_preparo', campoPratoTempo.value);
    dados.append('descricao', campoPratoDescricao.value);
    dados.append('disponivel', campoPratoDisponivel.checked ? '1' : '0');
    dados.append(
      'etiquetas',
      JSON.stringify(checksEtiquetas.filter((check) => check.checked).map((check) => check.value))
    );

    if (ficheiroFoto) dados.append('foto', ficheiroFoto, ficheiroFoto.name);
    if (ficheiroVideo) dados.append('video', ficheiroVideo, ficheiroVideo.name);
    if (removerFoto && !ficheiroFoto) dados.append('remover_foto', '1');
    if (removerVideo && !ficheiroVideo) dados.append('remover_video', '1');

    const editando = Boolean(pratoEditandoId);
    const url = editando ? `/admin/api/pratos/${pratoEditandoId}` : '/admin/api/pratos';
    const textoOriginal = btnGuardarPrato.textContent;

    btnGuardarPrato.disabled = true;
    btnGuardarPrato.textContent = 'A guardar…';
    mostrarEstadoMedia('');
    mostrarProgresso(true, 0, 'A enviar ficheiros…');

    try {
      await enviarComProgresso(url, editando ? 'PUT' : 'POST', dados, (percentagem) => {
        mostrarProgresso(true, percentagem, `A enviar… ${Math.round(percentagem)}%`);
      });
      mostrarProgresso(true, 100, 'Guardado.');
      modalPrato.close();
      toast(editando ? 'Prato atualizado com sucesso.' : 'Prato adicionado ao menu com sucesso.');
      await carregarMenu(true);
    } catch (erro) {
      mostrarProgresso(false);
      tratarErroApi(erro);
      mostrarEstadoMedia(erro.message || 'Não foi possível guardar o prato.', 'erro');
      const mapaCampos = {
        nome: campoPratoNome,
        preco: campoPratoPreco,
        'tempo de preparo': campoPratoTempo,
        categoria: campoPratoCategoria,
        descrição: campoPratoDescricao,
        foto: campoPratoFoto,
        video: campoPratoVideo
      };
      const campo = mapaCampos[erro.campo];
      if (campo) campo.focus();
    } finally {
      btnGuardarPrato.disabled = false;
      btnGuardarPrato.textContent = textoOriginal;
      setTimeout(() => mostrarProgresso(false), 700);
    }
  });

  function abrirModalCategoria(categoria = null) {
    categoriaEditandoId = categoria ? Number(categoria.id) : null;
    formCategoria.reset();
    if (categoria) {
      modalCategoriaEyebrow.textContent = 'Editar categoria';
      modalCategoriaTitulo.textContent = categoria.nome;
      campoCategoriaNome.value = categoria.nome;
      campoCategoriaOrdem.value = String(categoria.ordem);
    } else {
      modalCategoriaEyebrow.textContent = 'Nova categoria';
      modalCategoriaTitulo.textContent = 'Adicionar categoria';
      campoCategoriaOrdem.value = String(menuEstado.categorias.length);
    }
    if (!modalCategoria.open) modalCategoria.showModal();
    setTimeout(() => campoCategoriaNome.focus(), 80);
  }

  formCategoria.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!formCategoria.reportValidity()) return;

    const editando = Boolean(categoriaEditandoId);
    const url = editando ? `/admin/api/categorias/${categoriaEditandoId}` : '/admin/api/categorias';
    const botao = formCategoria.querySelector('button[type="submit"]');

    try {
      await comBotaoOcupado(botao, 'A guardar…', () =>
        fetchJSON(url, {
          method: editando ? 'PUT' : 'POST',
          body: { nome: campoCategoriaNome.value, ordem: Number(campoCategoriaOrdem.value) || 0 }
        })
      );
      modalCategoria.close();
      toast(editando ? 'Categoria atualizada.' : 'Categoria criada.');
      await carregarMenu(true);
    } catch (erro) {
      tratarErroApi(erro);
      if (erro.campo === 'nome') campoCategoriaNome.focus();
    }
  });

  async function eliminarCategoria(id) {
    const categoria = menuEstado.categorias.find((item) => Number(item.id) === Number(id));
    if (!categoria) return;
    if (!window.confirm(`Eliminar a categoria “${categoria.nome}”?`)) return;
    try {
      await fetchJSON(`/admin/api/categorias/${Number(id)}`, { method: 'DELETE' });
      toast('Categoria eliminada.');
      await carregarMenu(true);
    } catch (erro) {
      tratarErroApi(erro);
    }
  }

  async function eliminarPrato(id) {
    const prato = menuEstado.pratos.find((item) => Number(item.id) === Number(id));
    if (!prato) return;
    if (!window.confirm(`Eliminar “${prato.nome}” do menu? Esta ação não pode ser desfeita.`)) return;
    try {
      await fetchJSON(`/admin/api/pratos/${Number(id)}`, { method: 'DELETE' });
      toast('Prato eliminado.');
      await carregarMenu(true);
    } catch (erro) {
      tratarErroApi(erro);
    }
  }

  async function alternarDisponibilidade(id, checkbox) {
    const caixa = checkbox.closest('.prato-admin');
    const todos = caixa ? [...caixa.querySelectorAll('input, button')] : [];
    todos.forEach((elemento) => {
      elemento.disabled = true;
    });
    try {
      const dados = await fetchJSON(`/admin/api/pratos/${Number(id)}/disponibilidade`, {
        method: 'PATCH',
        body: { disponivel: checkbox.checked }
      });
      toast(dados.prato.disponivel ? 'Prato disponível.' : 'Prato marcado como esgotado.');
      await carregarMenu(true);
    } catch (erro) {
      checkbox.checked = !checkbox.checked;
      todos.forEach((elemento) => {
        elemento.disabled = false;
      });
      tratarErroApi(erro);
    }
  }

  document.getElementById('btn-novo-prato').addEventListener('click', () => abrirModalPrato());
  document.getElementById('btn-nova-categoria').addEventListener('click', () => abrirModalCategoria());
  filtroCategoriaPratos.addEventListener('change', renderizarPratos);

  listaCategorias.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-acao]');
    if (!botao) return;
    const item = botao.closest('[data-categoria-id]');
    if (!item) return;
    const id = Number(item.dataset.categoriaId);
    const categoria = menuEstado.categorias.find((linha) => Number(linha.id) === id);
    if (!categoria) return;
    if (botao.dataset.acao === 'editar-categoria') abrirModalCategoria(categoria);
    if (botao.dataset.acao === 'eliminar-categoria') eliminarCategoria(id);
  });

  listaPratos.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-acao]');
    if (!botao) return;
    const item = botao.closest('[data-prato-id]');
    if (!item) return;
    const id = Number(item.dataset.pratoId);
    const prato = menuEstado.pratos.find((linha) => Number(linha.id) === id);
    if (!prato) return;
    if (botao.dataset.acao === 'editar-prato') abrirModalPrato(prato);
    if (botao.dataset.acao === 'eliminar-prato') eliminarPrato(id);
  });

  listaPratos.addEventListener('change', (evento) => {
    const checkbox = evento.target.closest('[data-acao="disponibilidade"]');
    if (!checkbox) return;
    const item = checkbox.closest('[data-prato-id]');
    if (!item) return;
    alternarDisponibilidade(Number(item.dataset.pratoId), checkbox);
  });

  /* -------------------------------------------------------------------- mesas */

  function renderizarMesas() {
    if (!mesasEstado.length) {
      listaMesas.innerHTML = '<p class="estado-vazio estado-vazio--compacto">Ainda não existem mesas.</p>';
      return;
    }

    listaMesas.innerHTML = mesasEstado
      .map((mesa) => {
        const ativa = Boolean(mesa.ativa);
        const sessao = mesa.sessao;
        return `
          <article class="mesa-admin${ativa ? ' mesa-admin--ativa' : ''}" data-mesa-id="${Number(
            mesa.id
          )}" data-numero="${Number(mesa.numero)}">
            <div class="mesa-admin__topo">
              <div class="mesa-admin__numero">
                <span>Mesa</span>
                <strong>${Number(mesa.numero)}</strong>
              </div>
              <span class="pill${ativa ? ' pill--laranja' : ''}">${ativa ? 'Ativa' : 'Inativa'}</span>
            </div>

            ${
              ativa
                ? `<button type="button" class="mesa-admin__codigo" data-acao="mostrar-codigo">
                     <span>Código do cliente</span>
                     <strong>${esc(mesa.codigo || '----')}</strong>
                   </button>`
                : ''
            }

            <div class="mesa-admin__resumo">
              <span>${sessao ? `Aberta desde ${esc(formatarHora(sessao.aberta_em))}` : 'Sem sessão aberta'}</span>
              <strong>${esc(formatarMZN(mesa.total_centavos || 0))}</strong>
            </div>

            <p class="mesa-admin__meta">
              ${
                sessao
                  ? `${Number(mesa.total_pedidos)} pedido(s) na conta`
                  : 'Ative a mesa para gerar o código e abrir a conta.'
              }
            </p>

            <div class="mesa-admin__acoes">
              ${
                ativa
                  ? `<button type="button" class="btn-acao btn-acao--neutro" data-acao="conta">Ver conta</button>
                     <a class="btn-acao btn-acao--qr" href="/admin/mesas/${Number(
                       mesa.id
                     )}/qrcode.png" download>QR code</a>
                     <button type="button" class="btn-acao btn-acao--perigo" data-acao="fechar-mesa">Fechar conta</button>`
                  : `<button type="button" class="btn-acao btn-acao--principal" data-acao="ativar-mesa">Ativar mesa</button>
                     <a class="btn-acao btn-acao--qr" href="/admin/mesas/${Number(
                       mesa.id
                     )}/qrcode.png" download>QR code</a>`
              }
            </div>
          </article>`;
      })
      .join('');
  }

  async function carregarMesas(silencioso = false) {
    if (!silencioso) {
      listaMesas.innerHTML = '<div class="estado-carregando"><span class="spinner"></span> A carregar mesas…</div>';
    }
    try {
      const dados = await fetchJSON('/admin/api/mesas');
      mesasEstado = Array.isArray(dados.mesas) ? dados.mesas : [];
      codigoMesaAtivo = Boolean(dados.codigo_ativo);
      mesasCarregadas = true;
      renderizarMesas();
    } catch (erro) {
      if (!silencioso) {
        listaMesas.innerHTML =
          '<p class="estado-vazio estado-vazio--compacto">Não foi possível carregar as mesas.</p>';
      }
      tratarErroApi(erro);
    }
  }

  function mostrarCodigoMesa(numero, codigo, mesaId) {
    codigoMesaNumero.textContent = String(numero);
    codigoMesaValor.textContent = String(codigo || '----');
    avisoCodigoDesligado.classList.toggle('oculto', codigoMesaAtivo);
    linkQrMesa.href = `/admin/mesas/${Number(mesaId)}/qrcode.png`;
    if (!modalMesaAtivada.open) modalMesaAtivada.showModal();
  }

  async function ativarMesa(id, botao) {
    try {
      const dados = await comBotaoOcupado(botao, 'A ativar…', () =>
        fetchJSON(`/admin/api/mesas/${Number(id)}/ativar`, { method: 'POST' })
      );
      codigoMesaAtivo = Boolean(dados.codigo_ativo);
      mostrarCodigoMesa(dados.mesa.numero, dados.mesa.codigo, dados.mesa.id);
      toast(dados.nova === false ? 'A mesa já estava ativa.' : 'Mesa ativada.');
      await carregarMesas(true);
    } catch (erro) {
      tratarErroApi(erro);
    }
  }

  function renderizarConta(dados) {
    contaTitulo.textContent = `Mesa ${dados.mesa.numero}`;
    const resumo = dados.resumo;

    if (!dados.aberta || !resumo) {
      contaMesaId = null;
      btnFecharConta.hidden = true;
      contaConteudo.innerHTML = `
        <div class="estado-vazio">
          <p>Não há nenhuma conta aberta nesta mesa.</p>
        </div>`;
      return;
    }

    contaMesaId = Number(dados.mesa.id);
    btnFecharConta.hidden = false;

    const pedidos = (resumo.pedidos || []).filter((pedido) => pedido.estado !== 'Cancelado');
    const pedidosHtml = pedidos.length
      ? pedidos
          .map(
            (pedido) => `
              <article class="conta-pedido">
                <div class="conta-pedido__topo">
                  <strong>Pedido #${Number(pedido.id)} · ${esc(formatarHora(pedido.criado_em))}</strong>
                  ${seloEstado(pedido.estado)}
                </div>
                <ul>
                  ${pedido.itens
                    .map(
                      (item) => `
                        <li>
                          <span>${Number(item.quantidade)}× ${esc(item.nome)}</span>
                          <strong>${esc(item.subtotal_formatado)}</strong>
                        </li>`
                    )
                    .join('')}
                </ul>
                <div class="conta-pedido__total">
                  <span>Total do pedido</span>
                  <strong>${esc(pedido.total_formatado)}</strong>
                </div>
              </article>`
          )
          .join('')
      : '<p class="estado-vazio estado-vazio--compacto">Sem pedidos lançados nesta sessão.</p>';

    contaConteudo.innerHTML = `
      <div class="conta-resumo">
        <div>
          <span>Total acumulado</span>
          <strong>${esc(resumo.total_formatado)}</strong>
        </div>
        <span>${Number(resumo.total_pedidos)} pedido(s)</span>
      </div>
      <div class="lista-conta">${pedidosHtml}</div>`;
  }

  async function abrirConta(mesaId) {
    contaMesaId = null;
    btnFecharConta.hidden = true;
    contaTitulo.textContent = 'Conta da mesa';
    contaConteudo.innerHTML = '<div class="estado-carregando"><span class="spinner"></span> A carregar conta…</div>';
    if (!modalConta.open) modalConta.showModal();
    try {
      const dados = await fetchJSON(`/admin/api/mesas/${Number(mesaId)}/conta`);
      renderizarConta(dados);
    } catch (erro) {
      contaConteudo.innerHTML =
        '<p class="estado-vazio estado-vazio--compacto">Não foi possível carregar a conta.</p>';
      tratarErroApi(erro);
    }
  }

  async function fecharContaMesa(mesaId, forcar, botao) {
    try {
      const dados = await comBotaoOcupado(botao, 'A fechar…', () =>
        fetchJSON(`/admin/api/mesas/${Number(mesaId)}/fechar`, {
          method: 'POST',
          body: { forcar: Boolean(forcar) }
        })
      );
      modalConta.close();
      toast(
        dados.ja_fechada
          ? 'A mesa já não tinha uma conta aberta.'
          : `Conta fechada · ${dados.total_formatado}`
      );
      await carregarMesas(true);
      await carregarPedidos({ silencioso: true });
    } catch (erro) {
      if (erro.campo === 'pedidos_ativos' && !forcar) {
        const confirmar = window.confirm(
          'Esta mesa ainda tem pedidos por entregar. Fechar a conta mesmo assim? Os pedidos ativos serão marcados como entregues.'
        );
        if (confirmar) {
          await fecharContaMesa(mesaId, true, botao);
          return;
        }
        carregandoBotao(botao, false);
        return;
      }
      tratarErroApi(erro);
      carregandoBotao(botao, false);
    }
  }

  listaMesas.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-acao]');
    if (!botao) return;
    const cartao = botao.closest('[data-mesa-id]');
    if (!cartao) return;
    const id = Number(cartao.dataset.mesaId);
    const numero = Number(cartao.dataset.numero);
    const acao = botao.dataset.acao;

    if (acao === 'ativar-mesa') ativarMesa(id, botao);
    if (acao === 'conta') abrirConta(id);
    if (acao === 'mostrar-codigo') {
      const mesa = mesasEstado.find((linha) => Number(linha.id) === id);
      if (mesa) mostrarCodigoMesa(mesa.numero, mesa.codigo, mesa.id);
    }
    if (acao === 'fechar-mesa') {
      const mesa = mesasEstado.find((linha) => Number(linha.id) === id);
      if (!mesa) return;
      const confirmar = window.confirm(
        `Fechar a conta da Mesa ${numero}? O total atual é ${formatarMZN(mesa.total_centavos || 0)}.`
      );
      if (confirmar) fecharContaMesa(id, false, botao);
    }
  });

  btnFecharConta.addEventListener('click', () => {
    if (!contaMesaId) return;
    const confirmar = window.confirm('Fechar a conta desta mesa?');
    if (confirmar) fecharContaMesa(contaMesaId, false, btnFecharConta);
  });

  /* --------------------------------------------------------------- definições */

  async function carregarDefinicoes(silencioso = false) {
    try {
      const dados = await fetchJSON('/admin/api/configuracoes');
      inputConfigNome.value = dados.nome_restaurante || '';
      inputConfigCodigo.checked = String(dados.codigo_mesa_ativo) === '1';
      codigoMesaAtivo = inputConfigCodigo.checked;
      definicoesCarregadas = true;
    } catch (erro) {
      if (!silencioso) tratarErroApi(erro);
    }
  }

  formDefinicoes.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!inputConfigNome.value.trim()) {
      toast('Indique o nome do restaurante.', 'erro');
      inputConfigNome.focus();
      return;
    }
    try {
      const dados = await comBotaoOcupado(btnGuardarDefinicoes, 'A guardar…', () =>
        fetchJSON('/admin/api/configuracoes', {
          method: 'PUT',
          body: {
            nome_restaurante: inputConfigNome.value.trim(),
            codigo_mesa_ativo: inputConfigCodigo.checked
          }
        })
      );
      codigoMesaAtivo = String(dados.configuracoes.codigo_mesa_ativo) === '1';
      document.querySelectorAll('[data-nome-restaurante]').forEach((elemento) => {
        elemento.textContent = dados.configuracoes.nome_restaurante;
      });
      toast('Definições guardadas.');
    } catch (erro) {
      tratarErroApi(erro);
      if (erro.campo === 'nome do restaurante') inputConfigNome.focus();
    }
  });

  /* -------------------------------------------------------------- utilizadores */

  function renderizarUtilizadores(lista) {
    const atual = Number(corpo.dataset.utilizadorAtual) || 0;
    if (!lista.length) {
      listaUtilizadores.innerHTML =
        '<p class="estado-vazio estado-vazio--compacto">Ainda não existem utilizadores.</p>';
      return;
    }

    listaUtilizadores.innerHTML = lista
      .map((utilizador) => {
        const eu = Number(utilizador.id) === atual;
        return `
          <article class="utilizador-item" data-utilizador-id="${Number(utilizador.id)}">
            <div class="utilizador-avatar" aria-hidden="true">${esc(iniciais(utilizador.nome))}</div>
            <div class="utilizador-item__info">
              <strong>${esc(utilizador.nome)}${eu ? ' (você)' : ''}</strong>
              <span>@${esc(utilizador.username)}${
                utilizador.deve_alterar_password ? ' · password inicial por alterar' : ''
              }</span>
            </div>
            <span class="pill${utilizador.papel === 'admin' ? ' pill--admin' : ''}">${
              utilizador.papel === 'admin' ? 'Admin' : 'Cozinha'
            }</span>
            <label class="switch" title="${eu ? 'Não pode desativar a sua própria conta' : 'Ativar ou desativar'}">
              <input type="checkbox" data-acao="alternar-utilizador" ${
                utilizador.ativo ? 'checked' : ''
              } ${eu ? 'disabled' : ''} aria-label="Conta ativa de ${esc(utilizador.nome)}">
              <span class="switch__pista" aria-hidden="true"></span>
            </label>
            ${
              eu
                ? ''
                : '<button type="button" class="btn-mini" data-acao="repor-password">Password</button>'
            }
          </article>`;
      })
      .join('');
  }

  async function carregarUtilizadores(silencioso = false) {
    if (!silencioso && !utilizadoresCarregados) {
      listaUtilizadores.innerHTML =
        '<div class="estado-carregando"><span class="spinner"></span> A carregar…</div>';
    }
    try {
      const dados = await fetchJSON('/admin/api/utilizadores');
      utilizadoresCarregados = true;
      renderizarUtilizadores(Array.isArray(dados.utilizadores) ? dados.utilizadores : []);
    } catch (erro) {
      if (!silencioso) {
        listaUtilizadores.innerHTML =
          '<p class="estado-vazio estado-vazio--compacto">Não foi possível carregar os utilizadores.</p>';
      }
      tratarErroApi(erro);
    }
  }

  formUtilizador.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!formUtilizador.reportValidity()) return;
    const botao = document.getElementById('btn-criar-utilizador');
    const dados = new FormData(formUtilizador);
    try {
      await comBotaoOcupado(botao, 'A criar…', () =>
        fetchJSON('/admin/api/utilizadores', {
          method: 'POST',
          body: {
            nome: dados.get('nome'),
            username: dados.get('username'),
            password: dados.get('password'),
            papel: dados.get('papel')
          }
        })
      );
      formUtilizador.reset();
      toast('Utilizador criado. Terá de alterar a password no primeiro acesso.');
      await carregarUtilizadores(true);
    } catch (erro) {
      tratarErroApi(erro);
      const campo = { nome: 'novo-user-nome', username: 'novo-user-username', password: 'novo-user-password' }[
        erro.campo
      ];
      if (campo) document.getElementById(campo).focus();
    }
  });

  listaUtilizadores.addEventListener('change', async (evento) => {
    const checkbox = evento.target.closest('[data-acao="alternar-utilizador"]');
    if (!checkbox) return;
    const item = checkbox.closest('[data-utilizador-id]');
    if (!item) return;
    checkbox.disabled = true;
    try {
      const dados = await fetchJSON(`/admin/api/utilizadores/${Number(item.dataset.utilizadorId)}/ativo`, {
        method: 'PATCH',
        body: { ativo: checkbox.checked }
      });
      toast(dados.utilizador.ativo ? 'Utilizador ativado.' : 'Utilizador desativado.');
      await carregarUtilizadores(true);
    } catch (erro) {
      checkbox.checked = !checkbox.checked;
      checkbox.disabled = false;
      tratarErroApi(erro);
    }
  });

  listaUtilizadores.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-acao="repor-password"]');
    if (!botao) return;
    const item = botao.closest('[data-utilizador-id]');
    if (!item) return;
    utilizadorPasswordId = Number(item.dataset.utilizadorId);
    const nome = item.querySelector('.utilizador-item__info strong').textContent.replace(' (você)', '');
    modalPasswordTitulo.textContent = `Repor password · ${nome}`;
    formPassword.reset();
    if (!modalPassword.open) modalPassword.showModal();
    setTimeout(() => campoPasswordNova.focus(), 80);
  });

  formPassword.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!formPassword.reportValidity() || !utilizadorPasswordId) return;
    try {
      const dados = await comBotaoOcupado(btnGuardarPassword, 'A repor…', () =>
        fetchJSON(`/admin/api/utilizadores/${utilizadorPasswordId}/password`, {
          method: 'POST',
          body: { password: campoPasswordNova.value }
        })
      );
      modalPassword.close();
      toast(dados.mensagem || 'Password reposta.');
      await carregarUtilizadores(true);
    } catch (erro) {
      tratarErroApi(erro);
      if (erro.campo === 'password') campoPasswordNova.focus();
    }
  });

  /* ------------------------------------------------------------------- modais */

  document.addEventListener('click', (evento) => {
    const fechar = evento.target.closest('[data-fechar-modal]');
    if (!fechar) return;
    const dialogo = fechar.closest('dialog');
    if (dialogo) dialogo.close();
  });

  document.querySelectorAll('dialog.modal').forEach((dialogo) => {
    dialogo.addEventListener('click', (evento) => {
      if (evento.target === dialogo) dialogo.close();
    });
  });

  modalPrato.addEventListener('close', () => {
    pratoEditandoId = null;
    revogarUrl(urlPreviewFoto);
    revogarUrl(urlPreviewVideo);
    urlPreviewFoto = null;
    urlPreviewVideo = null;
    ficheiroFoto = null;
    ficheiroVideo = null;
    promessaFoto = null;
    removerFoto = false;
    removerVideo = false;
    campoPratoFoto.value = '';
    campoPratoVideo.value = '';
    try {
      previewVideo.pause();
    } catch {
      /* ignora */
    }
    previewVideo.removeAttribute('src');
    previewVideo.load();
    mostrarEstadoMedia('');
    mostrarProgresso(false);
  });

  modalCategoria.addEventListener('close', () => {
    categoriaEditandoId = null;
  });

  modalPassword.addEventListener('close', () => {
    utilizadorPasswordId = null;
  });

  /* ---------------------------------------------------------- tempo real/polling */

  let socketTempoReal = null;

  const recarregarPedidosRT = debounce(() => carregarPedidos({ silencioso: true }), 250);
  const recarregarMesasRT = debounce(() => {
    if (mesasCarregadas) carregarMesas(true);
  }, 350);
  const recarregarMenuRT = debounce(() => {
    if (menuCarregado) carregarMenu(true);
  }, 350);
  const recarregarDefinicoesRT = debounce(() => {
    if (definicoesCarregadas) carregarDefinicoes(true);
  }, 350);
  const recarregarUtilizadoresRT = debounce(() => {
    if (utilizadoresCarregados) carregarUtilizadores(true);
  }, 350);

  function iniciarTempoReal() {
    if (!window.io) {
      marcarLigacao(false);
      return;
    }

    socketTempoReal = window.io({ transports: ['websocket', 'polling'] });

    socketTempoReal.on('connect', () => marcarLigacao(true));
    socketTempoReal.on('disconnect', () => marcarLigacao(false));
    socketTempoReal.on('connect_error', () => marcarLigacao(false));

    socketTempoReal.on('novo_pedido', (pedido) => {
      tocarBip();
      const referencia = pedido && pedido.id ? `#${pedido.id}` : '';
      const mesa = pedido && pedido.mesa_numero ? ` · Mesa ${pedido.mesa_numero}` : '';
      toast(`Novo pedido ${referencia}${mesa}`);
      recarregarPedidosRT();
      recarregarMesasRT();
    });

    socketTempoReal.on('pedido_atualizado', () => {
      recarregarPedidosRT();
      recarregarMesasRT();
    });

    socketTempoReal.on('nova_chamada', (chamada) => {
      tocarBip();
      const mesa = chamada && chamada.mesa_numero ? ` · Mesa ${chamada.mesa_numero}` : '';
      toast(
        chamada && chamada.tipo === 'conta'
          ? `Pedido de conta${mesa}`
          : `Chamada de empregado${mesa}`
      );
      recarregarPedidosRT();
      recarregarMesasRT();
    });

    socketTempoReal.on('chamada_resolvida', () => recarregarPedidosRT());
    socketTempoReal.on('mesa_atualizada', () => recarregarMesasRT());
    socketTempoReal.on('sessao_fechada', () => {
      recarregarPedidosRT();
      recarregarMesasRT();
    });
    socketTempoReal.on('menu_atualizado', () => recarregarMenuRT());
    socketTempoReal.on('configuracoes_atualizadas', () => recarregarDefinicoesRT());
    socketTempoReal.on('utilizadores_atualizados', () => recarregarUtilizadoresRT());
  }

  function atualizarAbaVisivel() {
    if (document.visibilityState !== 'visible') return;
    carregarSecao(abaAtual, true);
    if (abaAtual !== 'pedidos') carregarPedidos({ silencioso: true });
  }

  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (abaAtual === 'pedidos') carregarPedidos({ silencioso: true });
    if (!socketTempoReal || !socketTempoReal.connected) {
      if (abaAtual === 'menu' && menuCarregado) carregarMenu(true);
      if (abaAtual === 'mesas' && mesasCarregadas) carregarMesas(true);
      if (abaAtual === 'definicoes') {
        if (definicoesCarregadas) carregarDefinicoes(true);
        if (utilizadoresCarregados) carregarUtilizadores(true);
      }
    }
  }, 45000);

  document.addEventListener('visibilitychange', atualizarAbaVisivel);

  /* ------------------------------------------------------------------ arranque */

  atualizarBotaoSom();

  const abaInicial = ['pedidos', 'menu', 'mesas', 'definicoes'].includes(window.location.hash.slice(1))
    ? window.location.hash.slice(1)
    : 'pedidos';
  mostrarAba(abaInicial, false);
  if (abaAtual !== 'pedidos') carregarPedidos({ silencioso: true });
  iniciarTempoReal();
})();

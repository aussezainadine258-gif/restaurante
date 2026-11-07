// Utilitários partilhados pelo front-end (sem frameworks).
'use strict';

window.SLEY = (() => {
  const formatoMoeda = new Intl.NumberFormat('pt-MZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  function formatarMZN(centavos) {
    const valor = (Number(centavos) || 0) / 100;
    return `${formatoMoeda.format(valor)} MT`;
  }

  function escaparHtml(valor) {
    return String(valor == null ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function slugify(texto) {
    return String(texto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async function fetchJSON(url, opcoes = {}) {
    const config = {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(opcoes.headers || {}) },
      ...opcoes
    };
    if (opcoes.body && !(opcoes.body instanceof FormData)) {
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(opcoes.body);
    }
    let resposta;
    try {
      resposta = await fetch(url, config);
    } catch {
      const erro = new Error('Sem ligação ao servidor. Verifique a internet e tente novamente.');
      erro.status = 0;
      throw erro;
    }
    const tipo = resposta.headers.get('content-type') || '';
    let dados = null;
    if (tipo.includes('application/json')) {
      dados = await resposta.json().catch(() => null);
    } else {
      await resposta.text().catch(() => '');
    }
    if (!resposta.ok) {
      const erro = new Error((dados && dados.erro) || 'Não foi possível concluir a operação.');
      erro.status = resposta.status;
      erro.campo = dados && dados.campo;
      erro.dados = dados;
      throw erro;
    }
    return dados;
  }

  let temporizadorToast = null;
  function toast(mensagem, tipo = 'ok') {
    const elemento = document.getElementById('toast');
    if (!elemento) return;
    elemento.textContent = mensagem;
    elemento.classList.toggle('toast--erro', tipo === 'erro');
    elemento.hidden = false;
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => {
      elemento.hidden = true;
    }, tipo === 'erro' ? 5200 : 3200);
  }

  // Armazenamento local com proteção (modo privado pode bloquear localStorage).
  function lerJSON(chave) {
    try {
      const valor = localStorage.getItem(chave);
      return valor ? JSON.parse(valor) : null;
    } catch {
      return null;
    }
  }

  function gravarJSON(chave, valor) {
    try {
      if (valor == null) localStorage.removeItem(chave);
      else localStorage.setItem(chave, JSON.stringify(valor));
    } catch {
      /* ignora */
    }
  }

  const chaveSessao = (mesa) => `sley:sessao:${mesa}`;
  const chaveCarrinho = (mesa) => `sley:carrinho:${mesa}`;

  function lerSessao(mesa) {
    const dados = lerJSON(chaveSessao(mesa));
    return dados && dados.token ? dados : null;
  }

  function guardarSessao(mesa, dados) {
    gravarJSON(chaveSessao(mesa), dados);
  }

  function limparSessao(mesa) {
    gravarJSON(chaveSessao(mesa), null);
  }

  function lerCarrinho(mesa) {
    const dados = lerJSON(chaveCarrinho(mesa));
    if (!Array.isArray(dados)) return [];
    return dados
      .filter((item) => item && Number.isInteger(Number(item.prato_id)) && Number(item.quantidade) > 0)
      .map((item) => ({
        prato_id: Number(item.prato_id),
        nome: String(item.nome || ''),
        preco_centavos: Number(item.preco_centavos) || 0,
        quantidade: Math.min(20, Math.max(1, Number(item.quantidade))),
        observacao: String(item.observacao || '').slice(0, 200)
      }));
  }

  function guardarCarrinho(mesa, carrinho) {
    gravarJSON(chaveCarrinho(mesa), carrinho);
  }

  function formatarHora(iso) {
    if (!iso) return '—';
    const data = new Date(iso);
    if (Number.isNaN(data.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-MZ', {
      timeZone: 'Africa/Maputo',
      hour: '2-digit',
      minute: '2-digit'
    }).format(data);
  }

  function formatarDataHora(iso) {
    if (!iso) return '—';
    const data = new Date(iso);
    if (Number.isNaN(data.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-MZ', {
      timeZone: 'Africa/Maputo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(data);
  }

  function carregandoBotao(botao, ativo, textoAtivo) {
    if (!botao) return;
    if (ativo) {
      botao.dataset.textoOriginal = botao.textContent;
      botao.disabled = true;
      botao.textContent = textoAtivo || 'A processar…';
    } else {
      botao.disabled = false;
      if (botao.dataset.textoOriginal) botao.textContent = botao.dataset.textoOriginal;
    }
  }

  return {
    formatarMZN,
    escaparHtml,
    slugify,
    fetchJSON,
    toast,
    lerSessao,
    guardarSessao,
    limparSessao,
    lerCarrinho,
    guardarCarrinho,
    formatarHora,
    formatarDataHora,
    carregandoBotao
  };
})();

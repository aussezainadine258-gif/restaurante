// Relatórios: carregamento por dia, cartões de resumo e gráficos Chart.js.
'use strict';

(() => {
  const { fetchJSON, escaparHtml: esc, formatarMZN, formatarHora, toast } = window.SLEY;

  const corpo = document.body;
  const hoje = corpo.dataset.hoje;
  const form = document.getElementById('form-relatorio');
  const inputData = document.getElementById('data-relatorio');
  const btnHoje = document.getElementById('btn-hoje');
  const btnAtualizar = document.getElementById('btn-atualizar-relatorio');
  const erro = document.getElementById('relatorio-erro');
  const legenda = document.getElementById('relatorio-legenda');
  const periodo = document.getElementById('relatorio-periodo');
  const tabela = document.getElementById('tabela-pratos');

  const elReceita = document.getElementById('relatorio-receita');
  const elPedidos = document.getElementById('relatorio-pedidos');
  const elTicket = document.getElementById('relatorio-ticket');
  const elArtigos = document.getElementById('relatorio-artigos');
  const elHoraPico = document.getElementById('relatorio-hora-pico');

  const graficos = {};
  const temChart = typeof window.Chart !== 'undefined';

  if (temChart) {
    window.Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    window.Chart.defaults.font.size = 11;
    window.Chart.defaults.color = '#7C7C7C';
  }

  const OPCOES_TOOLTIP = {
    backgroundColor: '#111111',
    titleColor: '#FFFFFF',
    bodyColor: '#FFFFFF',
    borderColor: '#FF6B00',
    borderWidth: 1,
    padding: 10,
    displayColors: false,
    titleFont: { weight: '700' }
  };

  const OPCOES_ESCALA = {
    x: {
      grid: { display: false },
      ticks: { color: '#7C7C7C' }
    },
    y: {
      beginAtZero: true,
      grid: { color: 'rgba(17, 17, 17, 0.08)' },
      ticks: { color: '#7C7C7C', precision: 0 }
    }
  };

  function formatarEixoMoeda(valor) {
    const meticais = Number(valor) / 100;
    if (meticais >= 1000000) {
      return `${(meticais / 1000000).toLocaleString('pt-MZ', { maximumFractionDigits: 1 })} M MT`;
    }
    if (meticais >= 1000) {
      return `${(meticais / 1000).toLocaleString('pt-MZ', { maximumFractionDigits: 1 })} mil MT`;
    }
    return `${meticais.toLocaleString('pt-MZ', { maximumFractionDigits: 0 })} MT`;
  }

  function criarGrafico(id, configuracao) {
    const canvas = document.getElementById(id);
    if (!canvas || !temChart) return;
    if (graficos[id]) graficos[id].destroy();
    graficos[id] = new window.Chart(canvas, configuracao);
  }

  function renderizarReceita(dias) {
    criarGrafico('grafico-receita', {
      type: 'line',
      data: {
        labels: dias.map((dia) => dia.rotulo),
        datasets: [
          {
            label: 'Receita',
            data: dias.map((dia) => dia.total_centavos),
            borderColor: '#FF6B00',
            backgroundColor: 'rgba(255, 107, 0, 0.13)',
            borderWidth: 3,
            fill: true,
            tension: 0.32,
            pointRadius: 4,
            pointHoverRadius: 7,
            pointBackgroundColor: '#FF6B00',
            pointBorderColor: '#FFFFFF',
            pointBorderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...OPCOES_TOOLTIP,
            callbacks: {
              label(contexto) {
                const dia = dias[contexto.dataIndex];
                return `${dia.total_formatado} · ${dia.pedidos} pedido(s)`;
              }
            }
          }
        },
        scales: {
          x: OPCOES_ESCALA.x,
          y: {
            ...OPCOES_ESCALA.y,
            ticks: {
              color: '#7C7C7C',
              callback: (valor) => formatarEixoMoeda(valor)
            }
          }
        }
      }
    });
  }

  function renderizarHoras(horas) {
    const maximo = Math.max(...horas.map((hora) => hora.pedidos), 0);
    criarGrafico('grafico-horas', {
      type: 'bar',
      data: {
        labels: horas.map((hora) => hora.rotulo),
        datasets: [
          {
            label: 'Pedidos',
            data: horas.map((hora) => hora.pedidos),
            backgroundColor: horas.map((hora) =>
              hora.pedidos > 0 && hora.pedidos === maximo ? '#111111' : '#FF6B00'
            ),
            borderRadius: 5,
            maxBarThickness: 24
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...OPCOES_TOOLTIP,
            callbacks: {
              title(itens) {
                const hora = horas[itens[0].dataIndex];
                return `${hora.rotulo} — ${hora.pedidos} pedido(s)`;
              },
              label(contexto) {
                const hora = horas[contexto.dataIndex];
                return `Receita: ${formatarMZN(hora.total_centavos)}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#7C7C7C', autoSkip: true, maxTicksLimit: 12, maxRotation: 0 }
          },
          y: OPCOES_ESCALA.y
        }
      }
    });
  }

  function renderizarPratos(pratos) {
    criarGrafico('grafico-pratos', {
      type: 'bar',
      data: {
        labels: pratos.map((prato) => prato.nome),
        datasets: [
          {
            label: 'Quantidade',
            data: pratos.map((prato) => prato.quantidade),
            backgroundColor: pratos.map((_, indice) => (indice === 0 ? '#FF6B00' : '#111111')),
            borderRadius: 5,
            maxBarThickness: 26
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...OPCOES_TOOLTIP,
            callbacks: {
              label(contexto) {
                const prato = pratos[contexto.dataIndex];
                return `${prato.quantidade} un. · ${prato.total_formatado}`;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: 'rgba(17, 17, 17, 0.08)' },
            ticks: { color: '#7C7C7C', precision: 0 }
          },
          y: {
            grid: { display: false },
            ticks: { color: '#111111', font: { weight: '700' } }
          }
        }
      }
    });
  }

  function renderizarTabela(pratos) {
    if (!pratos.length) {
      tabela.innerHTML = '<p class="estado-vazio estado-vazio--compacto">Sem vendas de pratos neste dia.</p>';
      return;
    }

    tabela.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Prato</th>
            <th>Quantidade</th>
            <th>Receita</th>
          </tr>
        </thead>
        <tbody>
          ${pratos
            .map(
              (prato, indice) => `
                <tr>
                  <td><span class="posicao">${indice + 1}</span>${esc(prato.nome)}</td>
                  <td>${Number(prato.quantidade)}</td>
                  <td>${esc(prato.total_formatado)}</td>
                </tr>`
            )
            .join('')}
        </tbody>
      </table>`;
  }

  function renderizar(dados) {
    const resumo = dados.resumo || {};
    elReceita.textContent = resumo.total_formatado || '0,00 MT';
    elPedidos.textContent = String(resumo.pedidos || 0);
    elTicket.textContent = resumo.ticket_medio_formatado || '0,00 MT';
    elArtigos.textContent = String(resumo.artigos_vendidos || 0);
    elHoraPico.textContent =
      resumo.hora_pico && resumo.hora_pico !== '—'
        ? `${resumo.hora_pico}${resumo.hora_pico_pedidos ? ` · ${resumo.hora_pico_pedidos}` : ''}`
        : '—';

    legenda.textContent = `${dados.data_formatada} · atualizado às ${formatarHora(dados.gerado_em)}`;
    const dias = dados.dias || [];
    if (dias.length) {
      periodo.textContent = `${dias[0].rotulo} – ${dias[dias.length - 1].rotulo}`;
    }
    inputData.value = dados.data;
    inputData.max = dados.hoje;
    erro.hidden = true;

    renderizarTabela(dados.pratos || []);
    if (!temChart) {
      erro.hidden = false;
      erro.textContent = 'Os gráficos não puderam ser carregados. Os totais e a tabela continuam disponíveis.';
      return;
    }
    renderizarReceita(dias);
    renderizarHoras(dados.horas || []);
    renderizarPratos(dados.pratos || []);
  }

  async function carregar(data) {
    const valor = data || inputData.value || hoje;
    btnAtualizar.disabled = true;
    btnAtualizar.textContent = 'A carregar…';
    try {
      const dados = await fetchJSON(`/admin/api/relatorios?data=${encodeURIComponent(valor)}`);
      renderizar(dados);
    } catch (falha) {
      if (falha.status === 401) {
        window.location.href = '/admin/login';
        return;
      }
      if (falha.status === 403 && falha.dados && falha.dados.codigo === 'TROCAR_PASSWORD') {
        window.location.href = '/admin/password';
        return;
      }
      erro.hidden = false;
      erro.textContent = falha.message || 'Não foi possível carregar o relatório.';
      toast(erro.textContent, 'erro');
    } finally {
      btnAtualizar.disabled = false;
      btnAtualizar.textContent = 'Ver relatório';
    }
  }

  form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    carregar(inputData.value);
  });

  btnHoje.addEventListener('click', () => {
    inputData.value = hoje;
    carregar(hoje);
  });

  carregar(inputData.value || hoje);
})();

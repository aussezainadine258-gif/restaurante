// Agregações dos relatórios. As datas e horas são calculadas no fuso de
// Africa/Maputo para que a faturação do dia corresponda ao horário local.
const db = require('../db');
const { diaLocal, horaLocalNumero, formatarMZN } = require('../lib/utils');

const HORAS = Array.from({ length: 24 }, (_, indice) => indice);
const MAX_PRATOS = 8;

function hojeLocal() {
  return diaLocal(new Date().toISOString());
}

function dataValida(valor) {
  const texto = String(valor || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [ano, mes, dia] = texto.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia, 12));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

function normalizarData(valor) {
  return dataValida(valor) ? String(valor) : hojeLocal();
}

function rotuloCurto(data) {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}

function rotuloLongo(data) {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-MZ', {
    timeZone: 'Africa/Maputo',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(new Date(Date.UTC(ano, mes - 1, dia, 12)));
}

// Os últimos sete dias terminam sempre no dia selecionado.
function ultimosDias(dataFinal, quantidade = 7) {
  const base = new Date(`${dataFinal}T12:00:00+02:00`);
  const dias = [];
  for (let indice = quantidade - 1; indice >= 0; indice -= 1) {
    const data = new Date(base.getTime() - indice * 24 * 60 * 60 * 1000);
    dias.push(diaLocal(data.toISOString()));
  }
  return dias;
}

function inicioDaJanela(primeiroDia) {
  return new Date(`${primeiroDia}T00:00:00+02:00`).toISOString();
}

function gerarRelatorio(valorData) {
  const dataSelecionada = normalizarData(valorData);
  const dias = ultimosDias(dataSelecionada);
  const diasPermitidos = new Set(dias);
  const inicio = inicioDaJanela(dias[0]);

  const pedidos = db
    .prepare(`
      SELECT id, criado_em, total_centavos
      FROM pedidos
      WHERE estado != 'Cancelado' AND criado_em >= ?
      ORDER BY criado_em ASC
    `)
    .all(inicio);

  const itens = db
    .prepare(`
      SELECT ip.nome_prato, ip.quantidade, ip.preco_centavos, p.criado_em
      FROM itens_pedido ip
      JOIN pedidos p ON p.id = ip.pedido_id
      WHERE p.estado != 'Cancelado' AND p.criado_em >= ?
    `)
    .all(inicio);

  const resumoPorDia = new Map(
    dias.map((data) => [data, { data, rotulo: rotuloCurto(data), pedidos: 0, total_centavos: 0 }])
  );

  const pedidosDoDia = [];
  for (const pedido of pedidos) {
    const dia = diaLocal(pedido.criado_em);
    if (!diasPermitidos.has(dia)) continue;
    const resumo = resumoPorDia.get(dia);
    resumo.pedidos += 1;
    resumo.total_centavos += Number(pedido.total_centavos) || 0;
    if (dia === dataSelecionada) pedidosDoDia.push(pedido);
  }

  const pratosPorNome = new Map();
  let artigosVendidos = 0;
  for (const item of itens) {
    if (diaLocal(item.criado_em) !== dataSelecionada) continue;
    const quantidade = Number(item.quantidade) || 0;
    artigosVendidos += quantidade;
    const chave = item.nome_prato;
    const atual = pratosPorNome.get(chave) || { nome: chave, quantidade: 0, total_centavos: 0 };
    atual.quantidade += quantidade;
    atual.total_centavos += quantidade * (Number(item.preco_centavos) || 0);
    pratosPorNome.set(chave, atual);
  }

  const pratos = [...pratosPorNome.values()]
    .sort((a, b) => b.quantidade - a.quantidade || b.total_centavos - a.total_centavos)
    .slice(0, MAX_PRATOS)
    .map((prato) => ({ ...prato, total_formatado: formatarMZN(prato.total_centavos) }));

  const horas = HORAS.map((hora) => ({
    hora,
    rotulo: `${String(hora).padStart(2, '0')}h`,
    pedidos: 0,
    total_centavos: 0
  }));

  for (const pedido of pedidosDoDia) {
    const hora = horaLocalNumero(pedido.criado_em);
    const registo = horas[hora];
    if (!registo) continue;
    registo.pedidos += 1;
    registo.total_centavos += Number(pedido.total_centavos) || 0;
  }

  const horaPico = horas.reduce(
    (melhor, atual) => (atual.pedidos > melhor.pedidos ? atual : melhor),
    { hora: null, rotulo: '—', pedidos: 0, total_centavos: 0 }
  );

  const totalCentavos = pedidosDoDia.reduce((soma, pedido) => soma + (Number(pedido.total_centavos) || 0), 0);
  const totalPedidos = pedidosDoDia.length;
  const ticketMedio = totalPedidos ? Math.round(totalCentavos / totalPedidos) : 0;

  return {
    data: dataSelecionada,
    data_formatada: rotuloLongo(dataSelecionada),
    hoje: hojeLocal(),
    gerado_em: new Date().toISOString(),
    resumo: {
      total_centavos: totalCentavos,
      total_formatado: formatarMZN(totalCentavos),
      pedidos: totalPedidos,
      ticket_medio_centavos: ticketMedio,
      ticket_medio_formatado: formatarMZN(ticketMedio),
      artigos_vendidos: artigosVendidos,
      hora_pico: horaPico.pedidos > 0 ? horaPico.rotulo : '—',
      hora_pico_pedidos: horaPico.pedidos
    },
    dias: dias.map((data) => {
      const resumo = resumoPorDia.get(data);
      return {
        ...resumo,
        total_formatado: formatarMZN(resumo.total_centavos)
      };
    }),
    horas,
    pratos
  };
}

module.exports = { gerarRelatorio, hojeLocal, normalizarData };

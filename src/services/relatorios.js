// Agregações dos relatórios. As datas e horas são calculadas no fuso de
// Africa/Maputo para que a faturação do dia corresponda ao horário local.
const { query } = require('../db');
const { diaLocal, formatarMZN } = require('../lib/utils');

const HORAS = Array.from({ length: 24 }, (_, indice) => indice);
const MAX_PRATOS = 8;
const FUSO = 'Africa/Maputo';

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
    timeZone: FUSO,
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

function inicioDoDia(data) {
  return new Date(`${data}T00:00:00+02:00`).toISOString();
}

function fimDoDia(data) {
  return new Date(new Date(`${data}T00:00:00+02:00`).getTime() + 24 * 60 * 60 * 1000).toISOString();
}

// Totais por dia da janela de sete dias (agregação feita no Postgres).
const SQL_POR_DIA = `
  SELECT
    to_char(criado_em AT TIME ZONE '${FUSO}', 'YYYY-MM-DD') AS dia,
    COUNT(*)::int AS pedidos,
    COALESCE(SUM(total_centavos), 0)::bigint AS total_centavos
  FROM pedidos
  WHERE estado <> 'Cancelado' AND criado_em >= $1
  GROUP BY 1
`;

// Resumo do dia selecionado.
const SQL_RESUMO_DIA = `
  SELECT
    COUNT(*)::int AS pedidos,
    COALESCE(SUM(total_centavos), 0)::bigint AS total_centavos
  FROM pedidos
  WHERE estado <> 'Cancelado' AND criado_em >= $1 AND criado_em < $2
`;

// Artigos vendidos no dia selecionado.
const SQL_ARTIGOS_DIA = `
  SELECT COALESCE(SUM(ip.quantidade), 0)::int AS artigos
  FROM itens_pedido ip
  JOIN pedidos p ON p.id = ip.pedido_id
  WHERE p.estado <> 'Cancelado' AND p.criado_em >= $1 AND p.criado_em < $2
`;

// Vendas por hora no dia selecionado.
const SQL_POR_HORA = `
  SELECT
    EXTRACT(HOUR FROM criado_em AT TIME ZONE '${FUSO}')::int AS hora,
    COUNT(*)::int AS pedidos,
    COALESCE(SUM(total_centavos), 0)::bigint AS total_centavos
  FROM pedidos
  WHERE estado <> 'Cancelado' AND criado_em >= $1 AND criado_em < $2
  GROUP BY 1
`;

// Pratos mais vendidos no dia selecionado.
const SQL_PRATOS = `
  SELECT
    ip.nome_prato AS nome,
    SUM(ip.quantidade)::int AS quantidade,
    SUM(ip.quantidade * ip.preco_centavos)::bigint AS total_centavos
  FROM itens_pedido ip
  JOIN pedidos p ON p.id = ip.pedido_id
  WHERE p.estado <> 'Cancelado' AND p.criado_em >= $1 AND p.criado_em < $2
  GROUP BY ip.nome_prato
  ORDER BY quantidade DESC, total_centavos DESC
  LIMIT ${MAX_PRATOS}
`;

async function gerarRelatorio(valorData) {
  const dataSelecionada = normalizarData(valorData);
  const dias = ultimosDias(dataSelecionada);
  const diasPermitidos = new Set(dias);
  const inicio = inicioDaJanela(dias[0]);
  const inicioDia = inicioDoDia(dataSelecionada);
  const fimDia = fimDoDia(dataSelecionada);

  const [porDiaRes, resumoRes, artigosRes, porHoraRes, pratosRes] = await Promise.all([
    query(SQL_POR_DIA, [inicio]),
    query(SQL_RESUMO_DIA, [inicioDia, fimDia]),
    query(SQL_ARTIGOS_DIA, [inicioDia, fimDia]),
    query(SQL_POR_HORA, [inicioDia, fimDia]),
    query(SQL_PRATOS, [inicioDia, fimDia])
  ]);

  const resumoPorDia = new Map(
    dias.map((data) => [data, { data, rotulo: rotuloCurto(data), pedidos: 0, total_centavos: 0 }])
  );

  for (const linha of porDiaRes.rows) {
    if (!diasPermitidos.has(linha.dia)) continue;
    const resumo = resumoPorDia.get(linha.dia);
    resumo.pedidos = Number(linha.pedidos) || 0;
    resumo.total_centavos = Number(linha.total_centavos) || 0;
  }

  const pratos = pratosRes.rows.map((linha) => ({
    nome: linha.nome,
    quantidade: Number(linha.quantidade) || 0,
    total_centavos: Number(linha.total_centavos) || 0,
    total_formatado: formatarMZN(linha.total_centavos)
  }));

  const horas = HORAS.map((hora) => ({
    hora,
    rotulo: `${String(hora).padStart(2, '0')}h`,
    pedidos: 0,
    total_centavos: 0
  }));

  for (const linha of porHoraRes.rows) {
    const registo = horas[Number(linha.hora)];
    if (!registo) continue;
    registo.pedidos = Number(linha.pedidos) || 0;
    registo.total_centavos = Number(linha.total_centavos) || 0;
  }

  const horaPico = horas.reduce(
    (melhor, atual) => (atual.pedidos > melhor.pedidos ? atual : melhor),
    { hora: null, rotulo: '—', pedidos: 0, total_centavos: 0 }
  );

  const totalCentavos = Number(resumoRes.rows[0].total_centavos) || 0;
  const totalPedidos = Number(resumoRes.rows[0].pedidos) || 0;
  const artigosVendidos = Number(artigosRes.rows[0].artigos) || 0;
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

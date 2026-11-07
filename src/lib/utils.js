// Funções utilitárias partilhadas pelo servidor.
const crypto = require('crypto');

const ESTADOS_PEDIDO = ['Recebido', 'Em preparo', 'Pronto', 'Entregue', 'Cancelado'];
const ESTADOS_ATIVOS = ['Recebido', 'Em preparo', 'Pronto'];
const ETIQUETAS_VALIDAS = ['vegetariano', 'picante', 'novo', 'mais pedido'];

// Formata cêntimos como "1 250,00 MT" (padrão de Moçambique).
function formatarMZN(centavos) {
  const valor = (Number(centavos) || 0) / 100;
  const [inteiro, decimal] = valor.toFixed(2).split('.');
  const comMilhares = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${comMilhares},${decimal} MT`;
}

function agoraISO() {
  return new Date().toISOString();
}

function normalizarTexto(valor) {
  return String(valor == null ? '' : valor).replace(/\s+/g, ' ').trim();
}

function removerAcentos(texto) {
  return String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function slugify(texto) {
  return removerAcentos(texto)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function tokenAleatorio() {
  return crypto.randomBytes(24).toString('hex');
}

// Código de 4 dígitos (1000-9999), fácil de ditar ao cliente.
function gerarCodigoMesa() {
  return String(crypto.randomInt(1000, 10000));
}

function parseEtiquetas(valor) {
  if (Array.isArray(valor)) return valor.filter((e) => ETIQUETAS_VALIDAS.includes(e));
  try {
    const lista = JSON.parse(valor || '[]');
    return Array.isArray(lista) ? lista.filter((e) => ETIQUETAS_VALIDAS.includes(e)) : [];
  } catch {
    return [];
  }
}

function dataHoraLocal(iso, opcoes = {}) {
  if (!iso) return '—';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-MZ', {
    timeZone: 'Africa/Maputo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...opcoes
  }).format(data);
}

function horaLocal(iso) {
  return dataHoraLocal(iso, { day: undefined, month: undefined, year: undefined, hour: '2-digit', minute: '2-digit' });
}

// Minutos decorridos desde uma data ISO.
function minutosDecorridos(iso) {
  const inicio = new Date(iso).getTime();
  if (Number.isNaN(inicio)) return 0;
  return Math.max(0, Math.floor((Date.now() - inicio) / 60000));
}

// Devolve a data local (Africa/Maputo) no formato AAAA-MM-DD.
function diaLocal(iso) {
  const data = new Date(iso);
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Maputo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(data);
  const mapa = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  return `${mapa.year}-${mapa.month}-${mapa.day}`;
}

function horaLocalNumero(iso) {
  const data = new Date(iso);
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Maputo',
    hour: '2-digit',
    hour12: false
  }).formatToParts(data);
  const hora = partes.find((p) => p.type === 'hour');
  return hora ? Number(hora.value) : 0;
}

module.exports = {
  ESTADOS_PEDIDO,
  ESTADOS_ATIVOS,
  ETIQUETAS_VALIDAS,
  formatarMZN,
  agoraISO,
  normalizarTexto,
  removerAcentos,
  slugify,
  tokenAleatorio,
  gerarCodigoMesa,
  parseEtiquetas,
  dataHoraLocal,
  horaLocal,
  minutosDecorridos,
  diaLocal,
  horaLocalNumero
};

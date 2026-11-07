// Validação e normalização de dados recebidos do cliente.
// Todas as rotas usam estas funções antes de tocar na base de dados.

class ErroValidacao extends Error {
  constructor(mensagem, campo) {
    super(mensagem);
    this.name = 'ErroValidacao';
    this.status = 400;
    this.campo = campo;
  }
}

function texto(valor, { min = 0, max = 255, obrigatorio = false, campo = 'campo' } = {}) {
  const limpo = String(valor == null ? '' : valor).replace(/\s+/g, ' ').trim();
  if (obrigatorio && !limpo) throw new ErroValidacao(`O ${campo} é obrigatório.`, campo);
  if (limpo.length < min) throw new ErroValidacao(`O ${campo} deve ter pelo menos ${min} caracteres.`, campo);
  if (limpo.length > max) throw new ErroValidacao(`O ${campo} não pode ter mais de ${max} caracteres.`, campo);
  return limpo;
}

function textoLongo(valor, { max = 1000, campo = 'campo' } = {}) {
  const limpo = String(valor == null ? '' : valor).trim();
  if (limpo.length > max) throw new ErroValidacao(`O ${campo} não pode ter mais de ${max} caracteres.`, campo);
  return limpo;
}

function inteiro(valor, { min = 0, max = Number.MAX_SAFE_INTEGER, campo = 'campo', obrigatorio = true } = {}) {
  if ((valor === '' || valor == null) && !obrigatorio) return null;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < min || numero > max) {
    throw new ErroValidacao(`O ${campo} deve ser um número inteiro entre ${min} e ${max}.`, campo);
  }
  return numero;
}

// Converte "1 250,50", "1250.50" ou "1250" em cêntimos (125050).
function precoParaCentavos(valor, campo = 'preço') {
  let s = String(valor == null ? '' : valor).replace(/\s/g, '').replace(/MZN|MT/gi, '');
  if (!s) throw new ErroValidacao(`O ${campo} é obrigatório.`, campo);
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const numero = Number(s);
  if (!Number.isFinite(numero) || numero < 0 || numero > 1000000) {
    throw new ErroValidacao(`O ${campo} não é válido.`, campo);
  }
  return Math.round(numero * 100);
}

function booleano(valor, padrao = false) {
  if (valor === undefined || valor === null || valor === '') return padrao;
  return ['1', 'true', 'on', 'sim', 'yes'].includes(String(valor).toLowerCase());
}

function id(valor, campo = 'identificador') {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new ErroValidacao(`O ${campo} não é válido.`, campo);
  }
  return numero;
}

function etiquetas(valor) {
  const validas = ['vegetariano', 'picante', 'novo', 'mais pedido'];
  let lista = valor;
  if (typeof lista === 'string') {
    try {
      lista = JSON.parse(lista);
    } catch {
      lista = [lista];
    }
  }
  if (!Array.isArray(lista)) return [];
  return [...new Set(lista.filter((e) => validas.includes(e)))];
}

function codigoMesa(valor) {
  const codigo = String(valor == null ? '' : valor).trim();
  if (!/^\d{4}$/.test(codigo)) {
    throw new ErroValidacao('O código da mesa deve ter 4 dígitos.', 'codigo');
  }
  return codigo;
}

function pagina(valor, padrao = 1) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : padrao;
}

module.exports = {
  ErroValidacao,
  texto,
  textoLongo,
  inteiro,
  precoParaCentavos,
  booleano,
  id,
  etiquetas,
  codigoMesa,
  pagina
};

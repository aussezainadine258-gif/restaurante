// Leitura/escrita das definições guardadas na base de dados.
const { query, transacao } = require('../db');
const config = require('../config');

const SQL_GRAVAR = `
  INSERT INTO configuracoes (chave, valor) VALUES ($1, $2)
  ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor
`;

const PADROES = {
  nome_restaurante: config.restaurantName,
  codigo_mesa_ativo: config.codigoMesaAtivoDefault ? '1' : '0',
  som_admin: '1'
};

async function obter(chave, padrao = null) {
  const { rows } = await query('SELECT valor FROM configuracoes WHERE chave = $1', [chave]);
  if (!rows[0]) return padrao !== null ? padrao : PADROES[chave] != null ? PADROES[chave] : null;
  return rows[0].valor;
}

async function obterBooleano(chave, padrao = false) {
  const valor = await obter(chave, padrao ? '1' : '0');
  return String(valor) === '1';
}

async function definir(chave, valor) {
  await query(SQL_GRAVAR, [String(chave), String(valor)]);
}

// Grava várias definições de forma atómica.
async function definirVarios(valores) {
  await transacao(async (cliente) => {
    for (const [chave, valor] of Object.entries(valores)) {
      await cliente.query(SQL_GRAVAR, [String(chave), String(valor)]);
    }
  });
}

async function listar() {
  const { rows } = await query('SELECT chave, valor FROM configuracoes ORDER BY chave');
  const valores = Object.fromEntries(rows.map((linha) => [linha.chave, linha.valor]));
  return { ...PADROES, ...valores };
}

async function nomeRestaurante() {
  return obter('nome_restaurante', config.restaurantName);
}

async function codigoMesaAtivo() {
  return obterBooleano('codigo_mesa_ativo', config.codigoMesaAtivoDefault);
}

module.exports = { obter, obterBooleano, definir, definirVarios, listar, nomeRestaurante, codigoMesaAtivo };

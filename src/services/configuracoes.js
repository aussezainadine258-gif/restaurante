// Leitura/escrita das definições guardadas na base de dados.
const db = require('../db');
const config = require('../config');

const stmtLer = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?');
const stmtGravar = db.prepare(`
  INSERT INTO configuracoes (chave, valor) VALUES (?, ?)
  ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor
`);
const stmtListar = db.prepare('SELECT chave, valor FROM configuracoes ORDER BY chave');

const PADROES = {
  nome_restaurante: config.restaurantName,
  codigo_mesa_ativo: config.codigoMesaAtivoDefault ? '1' : '0',
  som_admin: '1'
};

function obter(chave, padrao = null) {
  const linha = stmtLer.get(chave);
  if (!linha) return padrao !== null ? padrao : PADROES[chave] != null ? PADROES[chave] : null;
  return linha.valor;
}

function obterBooleano(chave, padrao = false) {
  const valor = obter(chave, padrao ? '1' : '0');
  return String(valor) === '1';
}

function definir(chave, valor) {
  stmtGravar.run(String(chave), String(valor));
}

function listar() {
  const valores = Object.fromEntries(stmtListar.all().map((l) => [l.chave, l.valor]));
  return { ...PADROES, ...valores };
}

function nomeRestaurante() {
  return obter('nome_restaurante', config.restaurantName);
}

function codigoMesaAtivo() {
  return obterBooleano('codigo_mesa_ativo', config.codigoMesaAtivoDefault);
}

module.exports = { obter, obterBooleano, definir, listar, nomeRestaurante, codigoMesaAtivo };

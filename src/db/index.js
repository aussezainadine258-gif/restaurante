// Ligação única ao PostgreSQL (Supabase) através de um Pool do pacote `pg`.
// Todo o acesso é feito com SQL parametrizado através de query()/transacao().
//
// DATABASE_URL vem do .env (ver .env.example). Por omissão a ligação usa SSL
// com rejectUnauthorized=false, necessário nos poolers do Supabase.
// DATABASE_SSL=false permite ligar a um Postgres local sem SSL.
require('dotenv').config();

const { Pool, types } = require('pg');

// O Postgres devolve BIGINT como string. IDs, cêntimos e contadores cabem
// confortavelmente no Number do JavaScript, por isso normalizamos aqui.
types.setTypeParser(20, (valor) => Number(valor));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    'DATABASE_URL não está definida. Copie .env.example para .env e indique a connection string do Postgres/Supabase.'
  );
}

const sslAtivo = String(process.env.DATABASE_SSL || 'true').toLowerCase() !== 'false';

const pool = new Pool({
  connectionString,
  ...(sslAtivo ? { ssl: { rejectUnauthorized: false } } : {})
});

pool.on('error', (erro) => {
  console.error('Erro inesperado na ligação Postgres:', erro);
});

// Executa uma query e devolve o resultado do `pg` (rows, rowCount, etc.).
async function query(texto, params) {
  return pool.query(texto, params);
}

// Executa `callback(cliente)` dentro de BEGIN/COMMIT, com ROLLBACK em erro.
// O callback recebe o cliente do pool e deve usar sempre esse cliente.
async function transacao(callback) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await callback(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (erro) {
    try {
      await cliente.query('ROLLBACK');
    } catch (erroRollback) {
      console.error('Falha no ROLLBACK da transação:', erroRollback);
    }
    throw erro;
  } finally {
    cliente.release();
  }
}

module.exports = { pool, query, transacao };

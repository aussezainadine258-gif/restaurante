// Guarda as sessões do painel numa tabela Postgres.
// Evita o aviso de MemoryStore do express-session e mantém os logins
// após reiniciar o servidor.
const session = require('express-session');
const { query } = require('../db');

const SQL_LER = 'SELECT sess, expira_em FROM sessoes_web WHERE sid = $1';
const SQL_GRAVAR = `
  INSERT INTO sessoes_web (sid, sess, expira_em) VALUES ($1, $2, $3)
  ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expira_em = EXCLUDED.expira_em
`;
const SQL_APAGAR = 'DELETE FROM sessoes_web WHERE sid = $1';
const SQL_EXPIRAR = 'UPDATE sessoes_web SET expira_em = $1 WHERE sid = $2';
const SQL_LIMPAR = 'DELETE FROM sessoes_web WHERE expira_em < $1';

class StorePostgres extends session.Store {
  constructor() {
    super();

    // Limpeza periódica (a cada 30 minutos).
    this.timer = setInterval(() => {
      query(SQL_LIMPAR, [Date.now()]).catch(() => {
        /* ignora falhas de limpeza */
      });
    }, 30 * 60 * 1000);
    this.timer.unref();
  }

  expiracao(sess) {
    const expira = sess && sess.cookie && sess.cookie.expires;
    const data = expira ? new Date(expira).getTime() : NaN;
    return Number.isFinite(data) ? data : Date.now() + 8 * 60 * 60 * 1000;
  }

  get(sid, callback) {
    query(SQL_LER, [sid])
      .then(({ rows }) => {
        const linha = rows[0];
        if (!linha) return callback(null, null);
        if (Number(linha.expira_em) < Date.now()) {
          return query(SQL_APAGAR, [sid]).then(
            () => callback(null, null),
            (erro) => callback(erro)
          );
        }
        try {
          return callback(null, JSON.parse(linha.sess));
        } catch {
          // Sessão ilegível: apaga e trata como inexistente.
          return query(SQL_APAGAR, [sid]).then(
            () => callback(null, null),
            (erro) => callback(erro)
          );
        }
      })
      .catch((erro) => callback(erro));
  }

  set(sid, sess, callback) {
    query(SQL_GRAVAR, [sid, JSON.stringify(sess), this.expiracao(sess)]).then(
      () => callback(null),
      (erro) => callback(erro)
    );
  }

  destroy(sid, callback) {
    query(SQL_APAGAR, [sid]).then(
      () => callback(null),
      (erro) => callback(erro)
    );
  }

  touch(sid, sess, callback) {
    query(SQL_EXPIRAR, [this.expiracao(sess), sid]).then(
      () => callback(null),
      (erro) => callback(erro)
    );
  }
}

module.exports = StorePostgres;

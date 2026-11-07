// Guarda as sessões do painel na própria base de dados SQLite.
// Evita o aviso de MemoryStore do express-session e mantém os logins
// após reiniciar o servidor.
const session = require('express-session');

class StoreSQLite extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    this.stmtLer = db.prepare('SELECT sess, expira_em FROM sessoes_web WHERE sid = ?');
    this.stmtGravar = db.prepare(`
      INSERT INTO sessoes_web (sid, sess, expira_em) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expira_em = excluded.expira_em
    `);
    this.stmtApagar = db.prepare('DELETE FROM sessoes_web WHERE sid = ?');
    this.stmtExpirar = db.prepare('UPDATE sessoes_web SET expira_em = ? WHERE sid = ?');
    this.stmtLimpar = db.prepare('DELETE FROM sessoes_web WHERE expira_em < ?');

    // Limpeza periódica (a cada 30 minutos).
    this.timer = setInterval(() => {
      try {
        this.stmtLimpar.run(Date.now());
      } catch {
        /* ignora falhas de limpeza */
      }
    }, 30 * 60 * 1000);
    this.timer.unref();
  }

  expiracao(sess) {
    const expira = sess && sess.cookie && sess.cookie.expires;
    const data = expira ? new Date(expira).getTime() : NaN;
    return Number.isFinite(data) ? data : Date.now() + 8 * 60 * 60 * 1000;
  }

  get(sid, callback) {
    try {
      const linha = this.stmtLer.get(sid);
      if (!linha) return callback(null, null);
      if (linha.expira_em < Date.now()) {
        this.stmtApagar.run(sid);
        return callback(null, null);
      }
      return callback(null, JSON.parse(linha.sess));
    } catch (erro) {
      return callback(erro);
    }
  }

  set(sid, sess, callback) {
    try {
      this.stmtGravar.run(sid, JSON.stringify(sess), this.expiracao(sess));
      return callback(null);
    } catch (erro) {
      return callback(erro);
    }
  }

  destroy(sid, callback) {
    try {
      this.stmtApagar.run(sid);
      return callback(null);
    } catch (erro) {
      return callback(erro);
    }
  }

  touch(sid, sess, callback) {
    try {
      this.stmtExpirar.run(this.expiracao(sess), sid);
      return callback(null);
    } catch (erro) {
      return callback(erro);
    }
  }
}

module.exports = StoreSQLite;

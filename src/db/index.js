// Ligação única à base de dados SQLite.
// Para migrar para MySQL basta substituir este módulo por um pool mysql2,
// mantendo as mesmas funções e queries parametrizadas usadas nos controllers.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

fs.mkdirSync(config.paths.data, { recursive: true });

const db = new Database(config.paths.db);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

require('./migracoes').aplicar(db);

module.exports = db;

// Migrações incrementais da base de dados.
// Cada migração é idempotente e fica registada em migracoes_aplicadas, para
// poder evoluir o esquema sem apagar dados existentes.
//
// As migrações são escritas em JavaScript porque o SQLite não suporta
// "ADD COLUMN IF NOT EXISTS". O ficheiro src/db/migrations/001_gostos_prato.sql
// documenta a mesma alteração para quem migrar para PostgreSQL/Supabase.

function garantirRegisto(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migracoes_aplicadas (
      id TEXT PRIMARY KEY,
      aplicada_em TEXT NOT NULL
    )
  `);
}

function jaAplicada(db, id) {
  return Boolean(db.prepare('SELECT id FROM migracoes_aplicadas WHERE id = ?').get(id));
}

function marcarAplicada(db, id) {
  db.prepare('INSERT OR IGNORE INTO migracoes_aplicadas (id, aplicada_em) VALUES (?, ?)')
    .run(id, new Date().toISOString());
}

// Migração 001: gostos dos pratos.
// - coluna pratos.gostos (contador denormalizado)
// - tabela gostos_prato com um gosto por (prato, sessão de mesa)
function migracaoGostos(db) {
  const colunas = db.prepare('PRAGMA table_info(pratos)').all().map((coluna) => coluna.name);
  if (!colunas.includes('gostos')) {
    db.exec('ALTER TABLE pratos ADD COLUMN gostos INTEGER NOT NULL DEFAULT 0');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS gostos_prato (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prato_id INTEGER NOT NULL REFERENCES pratos(id) ON DELETE CASCADE,
      sessao_id INTEGER NOT NULL REFERENCES sessoes_mesa(id) ON DELETE CASCADE,
      criado_em TEXT NOT NULL,
      UNIQUE (prato_id, sessao_id)
    );

    CREATE INDEX IF NOT EXISTS idx_gostos_prato ON gostos_prato(prato_id);
    CREATE INDEX IF NOT EXISTS idx_gostos_sessao ON gostos_prato(sessao_id);
  `);

  // Reconcilia o contador com a tabela (protege dados antigos).
  db.exec(
    'UPDATE pratos SET gostos = (SELECT COUNT(*) FROM gostos_prato WHERE gostos_prato.prato_id = pratos.id)'
  );
}

// Migração 002: URLs públicas de fotografia e vídeo (Supabase Storage).
// - pratos.foto_url: URL pública da fotografia (bucket 'pratos' ou /uploads).
// - pratos.video_url: URL pública do vídeo (bucket 'videos-pratos' ou /uploads).
// A coluna antiga pratos.foto mantém-se sincronizada para compatibilidade.
function migracaoMediaUrls(db) {
  const colunas = db.prepare('PRAGMA table_info(pratos)').all().map((coluna) => coluna.name);
  if (!colunas.includes('foto_url')) {
    db.exec('ALTER TABLE pratos ADD COLUMN foto_url TEXT');
  }
  if (!colunas.includes('video_url')) {
    db.exec('ALTER TABLE pratos ADD COLUMN video_url TEXT');
  }

  db.exec(`
    UPDATE pratos
    SET foto_url = foto
    WHERE foto_url IS NULL AND foto IS NOT NULL AND foto != ''
  `);
}

function aplicar(db) {
  garantirRegisto(db);

  if (!jaAplicada(db, '001_gostos_prato')) {
    migracaoGostos(db);
    marcarAplicada(db, '001_gostos_prato');
  }

  if (!jaAplicada(db, '002_media_urls')) {
    migracaoMediaUrls(db);
    marcarAplicada(db, '002_media_urls');
  }
}

module.exports = { aplicar };

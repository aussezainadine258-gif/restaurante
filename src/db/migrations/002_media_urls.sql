-- Migração 002: URLs públicas de fotografia e vídeo dos pratos.
-- Referência para PostgreSQL/Supabase. Em SQLite a migração equivalente é
-- aplicada por src/db/migracoes.js (SQLite não suporta ADD COLUMN IF NOT EXISTS).

ALTER TABLE pratos ADD COLUMN IF NOT EXISTS foto_url TEXT;
ALTER TABLE pratos ADD COLUMN IF NOT EXISTS video_url TEXT;

UPDATE pratos
SET foto_url = foto
WHERE foto_url IS NULL AND foto IS NOT NULL AND foto <> '';

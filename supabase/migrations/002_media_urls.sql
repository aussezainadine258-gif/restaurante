-- =============================================================================
-- 002 — URLs públicas de fotografia e vídeo (PostgreSQL / Supabase)
-- =============================================================================
-- Reproduz src/db/migrations/002_media_urls.sql.
-- Idempotente: as colunas já existem no 000; o ALTER serve para bases criadas
-- a partir do esquema SQLite antigo.
-- =============================================================================

ALTER TABLE pratos ADD COLUMN IF NOT EXISTS foto_url TEXT;
ALTER TABLE pratos ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Preenche foto_url a partir da coluna antiga `foto`, quando aplicável.
UPDATE pratos
SET foto_url = foto
WHERE foto_url IS NULL
  AND foto IS NOT NULL
  AND foto <> '';

-- Migração 001 — gostos dos pratos (referência para PostgreSQL/Supabase).
-- A migração é aplicada automaticamente por src/db/migracoes.js no SQLite.
-- Este ficheiro NÃO é executado pelo sistema; serve de guia para quem ligar
-- o projeto ao Supabase/PostgreSQL mais tarde.

ALTER TABLE pratos ADD COLUMN IF NOT EXISTS gostos INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS gostos_prato (
  id BIGSERIAL PRIMARY KEY,
  prato_id BIGINT NOT NULL REFERENCES pratos(id) ON DELETE CASCADE,
  sessao_id BIGINT NOT NULL REFERENCES sessoes_mesa(id) ON DELETE CASCADE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (prato_id, sessao_id)
);

CREATE INDEX IF NOT EXISTS idx_gostos_prato ON gostos_prato(prato_id);
CREATE INDEX IF NOT EXISTS idx_gostos_sessao ON gostos_prato(sessao_id);

-- Equivalente à RPC pedida na especificação: valida a sessão da mesa,
-- alterna o gosto e devolve o estado e o contador atualizado.
CREATE OR REPLACE FUNCTION alternar_gosto(p_token TEXT, p_prato_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sessao sessoes_mesa%ROWTYPE;
  v_existente gostos_prato%ROWTYPE;
  v_gostou BOOLEAN;
  v_total INTEGER;
BEGIN
  SELECT * INTO v_sessao FROM sessoes_mesa WHERE token = p_token LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão não encontrada ou expirada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_sessao.estado <> 'aberta' THEN
    RAISE EXCEPTION 'A sessão desta mesa já terminou.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_existente
  FROM gostos_prato
  WHERE prato_id = p_prato_id AND sessao_id = v_sessao.id
  LIMIT 1;

  IF FOUND THEN
    DELETE FROM gostos_prato WHERE id = v_existente.id;
    v_gostou := FALSE;
  ELSE
    INSERT INTO gostos_prato (prato_id, sessao_id) VALUES (p_prato_id, v_sessao.id);
    v_gostou := TRUE;
  END IF;

  SELECT COUNT(*) INTO v_total FROM gostos_prato WHERE prato_id = p_prato_id;
  UPDATE pratos SET gostos = v_total WHERE id = p_prato_id;

  RETURN jsonb_build_object('gostou', v_gostou, 'gostos', v_total);
END;
$$;

-- RLS: o cliente anónimo só lê pratos; gostos apenas através da RPC.
-- ALTER TABLE pratos ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "pratos_leitura_publica" ON pratos FOR SELECT TO anon USING (true);
-- ALTER TABLE gostos_prato ENABLE ROW LEVEL SECURITY; -- sem políticas diretas
-- REVOKE ALL ON gostos_prato FROM anon;
-- GRANT EXECUTE ON FUNCTION alternar_gosto(TEXT, BIGINT) TO anon;

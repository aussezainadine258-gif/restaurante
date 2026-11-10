-- =============================================================================
-- 003 — Row Level Security em todas as tabelas
-- =============================================================================
-- Não são criadas políticas públicas: com RLS ativa e zero políticas, os
-- papéis `anon` e `authenticated` não conseguem ler nem escrever diretamente.
--
-- O servidor Express acede com a chave `service_role` (ou com uma ligação
-- Postgres privilegiada), que ignora RLS. A chave `service_role` fica apenas
-- no backend e nunca deve ser exposta no front-end.
-- =============================================================================

ALTER TABLE utilizadores    ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pratos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessoes_mesa    ENABLE ROW LEVEL SECURITY;
ALTER TABLE gostos_prato    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_pedido    ENABLE ROW LEVEL SECURITY;
ALTER TABLE chamadas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessoes_web     ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- Conferência (deve devolver 11 linhas com rowsecurity = true):
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
-- --------------------------------------------------------------------------

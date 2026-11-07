-- Esquema da base de dados (SQLite).
-- O código de acesso usa apenas SQL parametrizado, o que facilita a migração
-- para MySQL (basta trocar o driver em src/db/index.js e os tipos de dados).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS utilizadores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  papel TEXT NOT NULL CHECK (papel IN ('admin', 'cozinha')),
  deve_alterar_password INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS configuracoes (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pratos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  preco_centavos INTEGER NOT NULL CHECK (preco_centavos >= 0),
  foto TEXT,
  foto_url TEXT,
  video_url TEXT,
  tempo_preparo INTEGER NOT NULL DEFAULT 15,
  categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
  disponivel INTEGER NOT NULL DEFAULT 1,
  etiquetas TEXT NOT NULL DEFAULT '[]',
  gostos INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mesas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero INTEGER NOT NULL UNIQUE,
  ativa INTEGER NOT NULL DEFAULT 0,
  codigo TEXT,
  criada_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessoes_mesa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mesa_id INTEGER NOT NULL REFERENCES mesas(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  aberta_em TEXT NOT NULL,
  fechada_em TEXT,
  estado TEXT NOT NULL DEFAULT 'aberta' CHECK (estado IN ('aberta', 'fechada'))
);

CREATE INDEX IF NOT EXISTS idx_sessoes_mesa_aberta ON sessoes_mesa(mesa_id, estado);

-- Um gosto por prato e por sessão de mesa (o cliente só pode gostar uma vez).
CREATE TABLE IF NOT EXISTS gostos_prato (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prato_id INTEGER NOT NULL REFERENCES pratos(id) ON DELETE CASCADE,
  sessao_id INTEGER NOT NULL REFERENCES sessoes_mesa(id) ON DELETE CASCADE,
  criado_em TEXT NOT NULL,
  UNIQUE (prato_id, sessao_id)
);

CREATE INDEX IF NOT EXISTS idx_gostos_prato ON gostos_prato(prato_id);
CREATE INDEX IF NOT EXISTS idx_gostos_sessao ON gostos_prato(sessao_id);

CREATE TABLE IF NOT EXISTS pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mesa_id INTEGER NOT NULL REFERENCES mesas(id) ON DELETE RESTRICT,
  sessao_id INTEGER NOT NULL REFERENCES sessoes_mesa(id) ON DELETE RESTRICT,
  estado TEXT NOT NULL DEFAULT 'Recebido'
    CHECK (estado IN ('Recebido', 'Em preparo', 'Pronto', 'Entregue', 'Cancelado')),
  observacoes TEXT NOT NULL DEFAULT '',
  total_centavos INTEGER NOT NULL DEFAULT 0,
  tempo_previsto_min INTEGER NOT NULL DEFAULT 15,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos(estado, criado_em);
CREATE INDEX IF NOT EXISTS idx_pedidos_sessao ON pedidos(sessao_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_criado ON pedidos(criado_em);

CREATE TABLE IF NOT EXISTS itens_pedido (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  prato_id INTEGER REFERENCES pratos(id) ON DELETE SET NULL,
  nome_prato TEXT NOT NULL,
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  preco_centavos INTEGER NOT NULL CHECK (preco_centavos >= 0),
  observacao TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_itens_pedido ON itens_pedido(pedido_id);

CREATE TABLE IF NOT EXISTS chamadas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mesa_id INTEGER NOT NULL REFERENCES mesas(id) ON DELETE CASCADE,
  sessao_id INTEGER REFERENCES sessoes_mesa(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('empregado', 'conta')),
  estado TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente', 'resolvida')),
  criada_em TEXT NOT NULL,
  resolvida_em TEXT
);

CREATE INDEX IF NOT EXISTS idx_chamadas_pendentes ON chamadas(estado, criada_em);

CREATE TABLE IF NOT EXISTS sessoes_web (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,
  expira_em INTEGER NOT NULL
);

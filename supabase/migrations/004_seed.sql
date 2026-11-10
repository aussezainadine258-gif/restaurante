-- =============================================================================
-- 004 — Seed inicial (PostgreSQL / Supabase)
-- =============================================================================
-- Reproduz src/db/seed.js:
--   * 4 categorias
--   * 12 pratos
--   * 10 mesas (todas inativas, sem código)
--   * utilizadores admin / cozinha
--   * configurações iniciais
--
-- Tal como o seed.js, não faz nada se já existirem utilizadores.
-- As fotografias apontam para /uploads/pratos/*.jpg (ficheiros já no repositório).
--
-- Passwords:
--   admin    -> admin123   (pede alteração no primeiro login)
--   cozinha  -> cozinha123
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM utilizadores) THEN
    RAISE NOTICE 'A base de dados já contém dados. Seed ignorado.';
    RETURN;
  END IF;

  -- ------------------------------------------------------------------------
  -- Categorias
  -- ------------------------------------------------------------------------
  INSERT INTO categorias (nome, ordem, ativo, criado_em) VALUES
    ('Entradas',  1, TRUE, NOW()),
    ('Pratos',    2, TRUE, NOW()),
    ('Bebidas',   3, TRUE, NOW()),
    ('Sobremesas', 4, TRUE, NOW());

  -- ------------------------------------------------------------------------
  -- Pratos
  -- ------------------------------------------------------------------------
  WITH dados (ordem, nome, descricao, preco_centavos, foto, tempo_preparo, categoria, disponivel, etiquetas) AS (
    VALUES
      (1, 'Chamuças de Carne',
          'Seis chamuças crocantes recheadas com carne temperada, acompanhadas de molho de piri-piri.',
          35000, '/uploads/pratos/chamucas-de-carne.jpg', 12, 'Entradas', TRUE, '["picante"]'),
      (2, 'Salada Tropical',
          'Folhas frescas, manga, abacate, tomate cereja e sementes, com molho de lima.',
          28000, '/uploads/pratos/salada-tropical.jpg', 8, 'Entradas', TRUE, '["vegetariano","novo"]'),
      (3, 'Frango à Zambeziana',
          'Frango marinado em leite de coco e piri-piri, grelhado na brasa, com batata e salada.',
          65000, '/uploads/pratos/frango-a-zambeziana.jpg', 25, 'Pratos', TRUE, '["picante","mais pedido"]'),
      (4, 'Camarão Grelhado',
          'Camarões grandes grelhados com manteiga de alho e limão, servidos com arroz de coco.',
          85000, '/uploads/pratos/camarao-grelhado.jpg', 20, 'Pratos', TRUE, '["mais pedido"]'),
      (5, 'Matapa com Camarão',
          'Folhas de mandioca cozinhadas lentamente com amendoim, coco e camarão, servidas com xima.',
          78000, '/uploads/pratos/matapa-com-camarao.jpg', 25, 'Pratos', TRUE, '["mais pedido"]'),
      (6, 'Bife de Vaca com Batata',
          'Bife grelhado no ponto, batata rústica e legumes salteados com molho de manteiga.',
          95000, '/uploads/pratos/bife-de-vaca-com-batata.jpg', 20, 'Pratos', TRUE, '[]'),
      (7, 'Arroz de Marisco',
          'Arroz solto com camarão, mexilhão e lulas, cozinhado em caldo de marisco e coentros.',
          110000, '/uploads/pratos/arroz-de-marisco.jpg', 30, 'Pratos', TRUE, '["novo"]'),
      (8, 'Água Mineral 500 ml',
          'Garrafa de água mineral sem gás, servida gelada.',
          8000, '/uploads/pratos/agua-mineral-500-ml.jpg', 1, 'Bebidas', TRUE, '[]'),
      (9, 'Sumo Natural de Manga',
          'Sumo de manga fresca espremido no momento, sem açúcar adicionado.',
          18000, '/uploads/pratos/sumo-natural-de-manga.jpg', 5, 'Bebidas', TRUE, '["vegetariano"]'),
      (10, 'Cerveja 2M',
          'Cerveja moçambicana 2M, garrafa de 600 ml, bem gelada.',
          15000, '/uploads/pratos/cerveja-2m.jpg', 2, 'Bebidas', FALSE, '[]'),
      (11, 'Pudim de Coco',
          'Pudim cremoso de coco com caramelo suave e raspas de lima.',
          22000, '/uploads/pratos/pudim-de-coco.jpg', 10, 'Sobremesas', TRUE, '["vegetariano"]'),
      (12, 'Bolo de Chocolate',
          'Fatia de bolo de chocolate húmido com ganache de cacau e flor de sal.',
          25000, '/uploads/pratos/bolo-de-chocolate.jpg', 12, 'Sobremesas', TRUE, '["novo"]')
  )
  INSERT INTO pratos (
    nome, descricao, preco_centavos, foto, foto_url, video_url,
    tempo_preparo, categoria_id, disponivel, etiquetas, criado_em, atualizado_em
  )
  SELECT
    d.nome, d.descricao, d.preco_centavos, d.foto, d.foto, NULL,
    d.tempo_preparo, c.id, d.disponivel, d.etiquetas, NOW(), NOW()
  FROM dados d
  JOIN categorias c ON c.nome = d.categoria
  ORDER BY d.ordem;

  -- ------------------------------------------------------------------------
  -- Mesas 1 a 10 (inativas, como no seed.js)
  -- ------------------------------------------------------------------------
  INSERT INTO mesas (numero, ativa, codigo, criada_em)
  SELECT numero, FALSE, NULL, NOW()
  FROM generate_series(1, 10) AS g(numero);

  -- ------------------------------------------------------------------------
  -- Utilizadores
  -- ------------------------------------------------------------------------
  INSERT INTO utilizadores (
    nome, username, password_hash, papel, deve_alterar_password, ativo, criado_em
  ) VALUES
    ('Administrador', 'admin',
     '$2b$12$HULLYNtPO/0Mu9/JST.r3uxH8k/FTWXMZvLeToKU2dArwVTvzFjvO',
     'admin', TRUE, TRUE, NOW()),
    ('Equipa de Cozinha', 'cozinha',
     '$2b$12$UL/A8.22j4yKFGk3VQkJl.UNTv6U2EZ3OJucU1DpVKG9.mT5YbFLq',
     'cozinha', FALSE, TRUE, NOW());

  -- ------------------------------------------------------------------------
  -- Configurações
  -- ------------------------------------------------------------------------
  INSERT INTO configuracoes (chave, valor) VALUES
    ('nome_restaurante', 'Restaurante SLEY'),
    ('codigo_mesa_ativo', '1'),
    ('som_admin', '1');
END
$$;

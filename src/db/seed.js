// Popula a base de dados com dados iniciais.
// Executar: npm run seed (não apaga dados existentes)
// Para recomeçar do zero: npm run reset
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const config = require('../config');
const db = require('./index');
const { agoraISO, slugify } = require('../lib/utils');
const { gerarPlaceholder } = require('../lib/imagens');

fs.mkdirSync(config.paths.uploads, { recursive: true });
fs.mkdirSync(config.paths.qrcodes, { recursive: true });
fs.writeFileSync(path.join(config.paths.uploads, '.gitkeep'), '');
fs.writeFileSync(path.join(config.paths.qrcodes, '.gitkeep'), '');

const CATEGORIAS = [
  { nome: 'Entradas', ordem: 1 },
  { nome: 'Pratos', ordem: 2 },
  { nome: 'Bebidas', ordem: 3 },
  { nome: 'Sobremesas', ordem: 4 }
];

const PRATOS = [
  {
    nome: 'Chamuças de Carne',
    descricao: 'Seis chamuças crocantes recheadas com carne temperada, acompanhadas de molho de piri-piri.',
    preco: 35000,
    tempo: 12,
    categoria: 'Entradas',
    etiquetas: ['picante'],
    disponivel: 1
  },
  {
    nome: 'Salada Tropical',
    descricao: 'Folhas frescas, manga, abacate, tomate cereja e sementes, com molho de lima.',
    preco: 28000,
    tempo: 8,
    categoria: 'Entradas',
    etiquetas: ['vegetariano', 'novo'],
    disponivel: 1
  },
  {
    nome: 'Frango à Zambeziana',
    descricao: 'Frango marinado em leite de coco e piri-piri, grelhado na brasa, com batata e salada.',
    preco: 65000,
    tempo: 25,
    categoria: 'Pratos',
    etiquetas: ['picante', 'mais pedido'],
    disponivel: 1
  },
  {
    nome: 'Camarão Grelhado',
    descricao: 'Camarões grandes grelhados com manteiga de alho e limão, servidos com arroz de coco.',
    preco: 85000,
    tempo: 20,
    categoria: 'Pratos',
    etiquetas: ['mais pedido'],
    disponivel: 1
  },
  {
    nome: 'Matapa com Camarão',
    descricao: 'Folhas de mandioca cozinhadas lentamente com amendoim, coco e camarão, servidas com xima.',
    preco: 78000,
    tempo: 25,
    categoria: 'Pratos',
    etiquetas: ['mais pedido'],
    disponivel: 1
  },
  {
    nome: 'Bife de Vaca com Batata',
    descricao: 'Bife grelhado no ponto, batata rústica e legumes salteados com molho de manteiga.',
    preco: 95000,
    tempo: 20,
    categoria: 'Pratos',
    etiquetas: [],
    disponivel: 1
  },
  {
    nome: 'Arroz de Marisco',
    descricao: 'Arroz solto com camarão, mexilhão e lulas, cozinhado em caldo de marisco e coentros.',
    preco: 110000,
    tempo: 30,
    categoria: 'Pratos',
    etiquetas: ['novo'],
    disponivel: 1
  },
  {
    nome: 'Água Mineral 500 ml',
    descricao: 'Garrafa de água mineral sem gás, servida gelada.',
    preco: 8000,
    tempo: 1,
    categoria: 'Bebidas',
    etiquetas: [],
    disponivel: 1
  },
  {
    nome: 'Sumo Natural de Manga',
    descricao: 'Sumo de manga fresca espremido no momento, sem açúcar adicionado.',
    preco: 18000,
    tempo: 5,
    categoria: 'Bebidas',
    etiquetas: ['vegetariano'],
    disponivel: 1
  },
  {
    nome: 'Cerveja 2M',
    descricao: 'Cerveja moçambicana 2M, garrafa de 600 ml, bem gelada.',
    preco: 15000,
    tempo: 2,
    categoria: 'Bebidas',
    etiquetas: [],
    disponivel: 0
  },
  {
    nome: 'Pudim de Coco',
    descricao: 'Pudim cremoso de coco com caramelo suave e raspas de lima.',
    preco: 22000,
    tempo: 10,
    categoria: 'Sobremesas',
    etiquetas: ['vegetariano'],
    disponivel: 1
  },
  {
    nome: 'Bolo de Chocolate',
    descricao: 'Fatia de bolo de chocolate húmido com ganache de cacau e flor de sal.',
    preco: 25000,
    tempo: 12,
    categoria: 'Sobremesas',
    etiquetas: ['novo'],
    disponivel: 1
  }
];

async function semear() {
  const existentes = db.prepare('SELECT COUNT(*) AS total FROM utilizadores').get().total;
  if (existentes > 0) {
    console.log('A base de dados já contém dados. Use "npm run reset" para recomeçar do zero.');
    db.close();
    return;
  }

  console.log('A criar fotografias ilustrativas...');
  for (const prato of PRATOS) {
    const ficheiro = `${slugify(prato.nome)}.jpg`;
    await gerarPlaceholder({
      nome: prato.nome,
      categoria: prato.categoria,
      destino: path.join(config.paths.uploads, ficheiro)
    });
    prato.foto = `/uploads/pratos/${ficheiro}`;
  }

  const inserirCategoria = db.prepare(
    'INSERT INTO categorias (nome, ordem, ativo, criado_em) VALUES (?, ?, 1, ?)'
  );
  const inserirPrato = db.prepare(`
    INSERT INTO pratos
      (nome, descricao, preco_centavos, foto, foto_url, video_url, tempo_preparo, categoria_id, disponivel, etiquetas, criado_em, atualizado_em)
    VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
  `);
  const inserirMesa = db.prepare('INSERT INTO mesas (numero, ativa, codigo, criada_em) VALUES (?, 0, NULL, ?)');
  const inserirUtilizador = db.prepare(`
    INSERT INTO utilizadores (nome, username, password_hash, papel, deve_alterar_password, ativo, criado_em)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `);
  const inserirConfig = db.prepare('INSERT INTO configuracoes (chave, valor) VALUES (?, ?)');

  const semearTudo = db.transaction(() => {
    const idsCategorias = {};
    for (const categoria of CATEGORIAS) {
      const info = inserirCategoria.run(categoria.nome, categoria.ordem, agoraISO());
      idsCategorias[categoria.nome] = info.lastInsertRowid;
    }

    for (const prato of PRATOS) {
      inserirPrato.run(
        prato.nome,
        prato.descricao,
        prato.preco,
        prato.foto,
        prato.foto,
        prato.tempo,
        idsCategorias[prato.categoria],
        prato.disponivel,
        JSON.stringify(prato.etiquetas),
        agoraISO(),
        agoraISO()
      );
    }

    for (let numero = 1; numero <= 10; numero += 1) {
      inserirMesa.run(numero, agoraISO());
    }

    inserirUtilizador.run(
      'Administrador',
      'admin',
      bcrypt.hashSync('admin123', 12),
      'admin',
      1,
      agoraISO()
    );
    inserirUtilizador.run(
      'Equipa de Cozinha',
      'cozinha',
      bcrypt.hashSync('cozinha123', 12),
      'cozinha',
      0,
      agoraISO()
    );

    inserirConfig.run('nome_restaurante', config.restaurantName);
    inserirConfig.run('codigo_mesa_ativo', config.codigoMesaAtivoDefault ? '1' : '0');
    inserirConfig.run('som_admin', '1');
  });

  semearTudo();

  console.log('');
  console.log('Base de dados criada com sucesso.');
  console.log(`- ${PRATOS.length} pratos, ${CATEGORIAS.length} categorias e 10 mesas`);
  console.log('- Admin: admin / admin123 (será pedido para alterar no primeiro login)');
  console.log('- Cozinha: cozinha / cozinha123');
  console.log('');
  db.close();
}

semear().catch((erro) => {
  console.error('Falha ao criar o seed:', erro);
  process.exitCode = 1;
});

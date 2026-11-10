// Popula o PostgreSQL com os dados iniciais definidos em
// supabase/migrations/004_seed.sql.
// Uso: npm run seed (não apaga dados existentes)
// Para recomeçar do zero: npm run reset
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { slugify } = require('../lib/utils');
const { gerarPlaceholder } = require('../lib/imagens');
const { pool, query } = require('./index');

const FICHEIRO = path.join(__dirname, '..', '..', 'supabase', 'migrations', '004_seed.sql');

// Usado apenas para gerar as fotografias ilustrativas locais (public/uploads).
// Os dados em si vivem no SQL de seed.
const PRATOS = [
  { nome: 'Chamuças de Carne', categoria: 'Entradas' },
  { nome: 'Salada Tropical', categoria: 'Entradas' },
  { nome: 'Frango à Zambeziana', categoria: 'Pratos' },
  { nome: 'Camarão Grelhado', categoria: 'Pratos' },
  { nome: 'Matapa com Camarão', categoria: 'Pratos' },
  { nome: 'Bife de Vaca com Batata', categoria: 'Pratos' },
  { nome: 'Arroz de Marisco', categoria: 'Pratos' },
  { nome: 'Água Mineral 500 ml', categoria: 'Bebidas' },
  { nome: 'Sumo Natural de Manga', categoria: 'Bebidas' },
  { nome: 'Cerveja 2M', categoria: 'Bebidas' },
  { nome: 'Pudim de Coco', categoria: 'Sobremesas' },
  { nome: 'Bolo de Chocolate', categoria: 'Sobremesas' }
];

async function gerarImagens() {
  fs.mkdirSync(config.paths.uploads, { recursive: true });
  fs.mkdirSync(config.paths.qrcodes, { recursive: true });
  fs.writeFileSync(path.join(config.paths.uploads, '.gitkeep'), '');
  fs.writeFileSync(path.join(config.paths.qrcodes, '.gitkeep'), '');

  console.log('A criar fotografias ilustrativas...');
  for (const prato of PRATOS) {
    const ficheiro = `${slugify(prato.nome)}.jpg`;
    await gerarPlaceholder({
      nome: prato.nome,
      categoria: prato.categoria,
      destino: path.join(config.paths.uploads, ficheiro)
    });
  }
}

async function principal() {
  if (!fs.existsSync(FICHEIRO)) {
    throw new Error(`Ficheiro de seed em falta: ${FICHEIRO}`);
  }

  let jaTinhaDados = false;
  try {
    const { rows } = await query('SELECT COUNT(*)::int AS total FROM utilizadores');
    jaTinhaDados = rows[0].total > 0;
  } catch (erro) {
    if (erro.code === '42P01') {
      throw new Error(
        'Esquema não encontrado. Execute primeiro as migrações de supabase/migrations (ou npm run reset).'
      );
    }
    throw erro;
  }

  if (jaTinhaDados) {
    console.log('A base de dados já contém dados. Use "npm run reset" para recomeçar do zero.');
    return;
  }

  await gerarImagens();

  const sql = fs.readFileSync(FICHEIRO, 'utf8');
  await pool.query(sql);

  const { rows } = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM pratos) AS pratos,
      (SELECT COUNT(*)::int FROM categorias) AS categorias,
      (SELECT COUNT(*)::int FROM mesas) AS mesas
  `);
  const { pratos, categorias, mesas } = rows[0];

  console.log('');
  console.log('Base de dados criada com sucesso.');
  console.log(`- ${pratos} pratos, ${categorias} categorias e ${mesas} mesas`);
  console.log('- Admin: admin / admin123 (será pedido para alterar no primeiro login)');
  console.log('- Cozinha: cozinha / cozinha123');
}

if (require.main === module) {
  (async () => {
    try {
      await principal();
    } catch (erro) {
      console.error('Falha ao criar o seed:', erro.message);
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  })();
}

module.exports = { gerarImagens };

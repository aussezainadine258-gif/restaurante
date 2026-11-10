// Apaga as tabelas da aplicação e recria o esquema no PostgreSQL.
// Uso: npm run reset
//
// Os ficheiros de supabase/migrations são a única fonte de verdade do esquema.
// No fim corre o seed.js, que gera as fotografias locais e aplica o 004_seed.sql.
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { pool, transacao } = require('./index');

const RAIZ = path.join(__dirname, '..', '..');
const DIR_MIGRACOES = path.join(RAIZ, 'supabase', 'migrations');

// O 004_seed.sql é aplicado pelo seed.js, depois de gerar as imagens locais.
const FICHEIROS = [
  '000_schema_inicial.sql',
  '001_gostos_prato.sql',
  '002_media_urls.sql',
  '003_row_level_security.sql'
];

// Ordem inversa das dependências. `migracoes_aplicadas` só existe em bases
// antigas vindas do SQLite; o IF EXISTS torna a remoção segura.
const TABELAS = [
  'sessoes_web',
  'chamadas',
  'itens_pedido',
  'pedidos',
  'gostos_prato',
  'sessoes_mesa',
  'mesas',
  'pratos',
  'categorias',
  'configuracoes',
  'utilizadores',
  'migracoes_aplicadas'
];

async function principal() {
  // Ler e validar todos os ficheiros antes de apagar qualquer tabela.
  const sqls = FICHEIROS.map((nome) => {
    const caminho = path.join(DIR_MIGRACOES, nome);
    if (!fs.existsSync(caminho)) {
      throw new Error(`Ficheiro de migração em falta: ${caminho}`);
    }
    return { nome, sql: fs.readFileSync(caminho, 'utf8') };
  });

  const caminhoSeed = path.join(DIR_MIGRACOES, '004_seed.sql');
  if (!fs.existsSync(caminhoSeed)) {
    throw new Error(`Ficheiro de seed em falta: ${caminhoSeed}`);
  }

  await transacao(async (cliente) => {
    await cliente.query(`DROP TABLE IF EXISTS ${TABELAS.join(', ')} CASCADE`);
    console.log('Tabelas antigas removidas.');

    for (const ficheiro of sqls) {
      await cliente.query(ficheiro.sql);
      console.log(`Aplicado: ${ficheiro.nome}`);
    }
  });
}

(async () => {
  let codigo = 0;
  try {
    await principal();
  } catch (erro) {
    console.error('Falha ao reiniciar a base de dados:', erro.message);
    codigo = 1;
  } finally {
    await pool.end();
  }

  if (codigo !== 0) {
    process.exitCode = codigo;
    return;
  }

  const resultado = spawnSync(process.execPath, [path.join(__dirname, 'seed.js')], {
    stdio: 'inherit',
    cwd: RAIZ
  });
  process.exitCode = resultado.status == null ? 1 : resultado.status;
})();

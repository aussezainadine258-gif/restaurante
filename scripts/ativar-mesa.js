// Ativa uma mesa pela linha de comandos e mostra o código de 4 dígitos.
// Útil para testes antes de usar o painel: node scripts/ativar-mesa.js 5
const mesas = require('../src/services/mesas');
const { pool } = require('../src/db');

async function principal() {
  const numero = Number(process.argv[2] || 5);
  const mesa = await mesas.obterMesaPorNumero(numero);
  if (!mesa) {
    console.error(`A mesa ${numero} não existe.`);
    process.exitCode = 1;
    return;
  }

  const resultado = await mesas.ativarMesa(mesa.id);
  console.log(`Mesa ${resultado.mesa.numero} ativa.`);
  console.log(`Código: ${resultado.mesa.codigo}`);
  console.log(`Link: http://localhost:3000/menu?mesa=${resultado.mesa.numero}`);
}

principal()
  .catch((erro) => {
    console.error('Falha ao ativar a mesa:', erro.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

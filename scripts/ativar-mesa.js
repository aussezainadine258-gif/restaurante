// Ativa uma mesa pela linha de comandos e mostra o código de 4 dígitos.
// Útil para testes antes de usar o painel: node scripts/ativar-mesa.js 5
const mesas = require('../src/services/mesas');

const numero = Number(process.argv[2] || 5);
const mesa = mesas.obterMesaPorNumero(numero);
if (!mesa) {
  console.error(`A mesa ${numero} não existe.`);
  process.exit(1);
}

const resultado = mesas.ativarMesa(mesa.id);
console.log(`Mesa ${resultado.mesa.numero} ativa.`);
console.log(`Código: ${resultado.mesa.codigo}`);
console.log(`Link: http://localhost:3000/menu?mesa=${resultado.mesa.numero}`);

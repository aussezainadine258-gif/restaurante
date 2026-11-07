// Apaga a base de dados e volta a criar os dados iniciais.
// Uso: npm run reset
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const config = require('../config');

for (const sufixo of ['', '-wal', '-shm']) {
  const ficheiro = `${config.paths.db}${sufixo}`;
  if (fs.existsSync(ficheiro)) {
    fs.rmSync(ficheiro, { force: true });
    console.log(`Removido: ${path.basename(ficheiro)}`);
  }
}

const resultado = spawnSync(process.execPath, [path.join(__dirname, 'seed.js')], {
  stdio: 'inherit',
  cwd: config.rootDir
});

process.exit(resultado.status == null ? 1 : resultado.status);

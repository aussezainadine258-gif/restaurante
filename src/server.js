// Ponto de entrada: cria o servidor HTTP, liga o Socket.IO e as sessões.
const http = require('http');
const { Server } = require('socket.io');
const config = require('./config');
const { app, sessionMiddleware } = require('./app');
const { configurarSocket } = require('./socket');
const realtime = require('./lib/realtime');
const { pool } = require('./db');

const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e5,
  pingTimeout: 25000
});

// Partilha a mesma sessão Express com os handshakes do Socket.IO.
io.engine.use(sessionMiddleware);
configurarSocket(io);
realtime.inicializar(io);

server.listen(config.port, () => {
  console.log('');
  console.log(`  ${config.restaurantName}`);
  console.log(`  Menu:    ${config.baseUrl}/menu?mesa=5`);
  console.log(`  Painel:  ${config.baseUrl}/admin`);
  console.log(`  Cozinha: ${config.baseUrl}/cozinha`);
  console.log(`  Servidor a escutar na porta ${config.port}`);
  console.log('');
});

function encerrar() {
  console.log('\nA encerrar o servidor...');
  io.close();
  server.close(async () => {
    try {
      await pool.end();
    } catch (erro) {
      console.error('Falha ao fechar a ligação Postgres:', erro);
    } finally {
      process.exit(0);
    }
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);

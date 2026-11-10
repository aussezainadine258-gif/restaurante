// Rotas do ecrã da cozinha. A autenticação é partilhada com o painel.
const express = require('express');
const cozinhaController = require('../controllers/cozinhaController');
const { exigirCozinha } = require('../middleware/auth');
const { semCache } = require('../middleware/seguranca');
const { asyncHandler } = require('../lib/async-handler');

const router = express.Router();

router.use(semCache);

router.get('/', exigirCozinha, asyncHandler(cozinhaController.paginaCozinha));
router.get('/api/pedidos', exigirCozinha, asyncHandler(cozinhaController.apiPedidos));
router.patch('/api/pedidos/:id/estado', exigirCozinha, asyncHandler(cozinhaController.apiMudarEstado));

module.exports = router;

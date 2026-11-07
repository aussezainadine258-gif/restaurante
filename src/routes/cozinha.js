// Rotas do ecrã da cozinha. A autenticação é partilhada com o painel.
const express = require('express');
const cozinhaController = require('../controllers/cozinhaController');
const { exigirCozinha } = require('../middleware/auth');
const { semCache } = require('../middleware/seguranca');

const router = express.Router();

router.use(semCache);

router.get('/', exigirCozinha, cozinhaController.paginaCozinha);
router.get('/api/pedidos', exigirCozinha, cozinhaController.apiPedidos);
router.patch('/api/pedidos/:id/estado', exigirCozinha, cozinhaController.apiMudarEstado);

module.exports = router;

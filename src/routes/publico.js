// Rotas públicas: menu, acompanhamento e APIs do cliente.
const express = require('express');
const controller = require('../controllers/publicoController');
const { semCache } = require('../middleware/seguranca');
const { asyncHandler } = require('../lib/async-handler');

const router = express.Router();

router.get('/', asyncHandler(controller.paginaInicial));
router.get('/menu', semCache, asyncHandler(controller.paginaMenu));
router.get('/acompanhar', semCache, asyncHandler(controller.paginaAcompanhar));

// APIs usadas pelo menu e pela página de acompanhamento
router.post('/api/mesa/verificar', semCache, asyncHandler(controller.apiVerificarMesa));
router.get('/api/mesa/:numero/estado', semCache, asyncHandler(controller.apiEstadoMesa));
router.get('/api/sessoes/:token', semCache, asyncHandler(controller.apiResumoSessao));
router.post('/api/pedidos', semCache, asyncHandler(controller.apiCriarPedido));
router.post('/api/chamadas', semCache, asyncHandler(controller.apiCriarChamada));
router.post('/api/pratos/:id/gosto', semCache, asyncHandler(controller.apiAlternarGosto));

router.get('/saude', asyncHandler(controller.saude));

module.exports = router;

// Rotas públicas: menu, acompanhamento e APIs do cliente.
const express = require('express');
const controller = require('../controllers/publicoController');
const { semCache } = require('../middleware/seguranca');

const router = express.Router();

router.get('/', controller.paginaInicial);
router.get('/menu', semCache, controller.paginaMenu);
router.get('/acompanhar', semCache, controller.paginaAcompanhar);

// APIs usadas pelo menu e pela página de acompanhamento
router.post('/api/mesa/verificar', semCache, controller.apiVerificarMesa);
router.get('/api/mesa/:numero/estado', semCache, controller.apiEstadoMesa);
router.get('/api/sessoes/:token', semCache, controller.apiResumoSessao);
router.post('/api/pedidos', semCache, controller.apiCriarPedido);
router.post('/api/chamadas', semCache, controller.apiCriarChamada);
router.post('/api/pratos/:id/gosto', semCache, controller.apiAlternarGosto);

router.get('/saude', controller.saude);

module.exports = router;

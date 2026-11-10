// Rotas do painel da gerência.
const express = require('express');
const adminController = require('../controllers/adminController');
const api = require('../controllers/adminApiController');
const relatoriosController = require('../controllers/relatoriosController');
const { exigirLogin, exigirAdmin, exigirPasswordAlterada } = require('../middleware/auth');
const { uploadMedia } = require('../middleware/upload');
const { semCache } = require('../middleware/seguranca');
const { asyncHandler } = require('../lib/async-handler');

const router = express.Router();

router.use(semCache);

// Autenticação (público)
router.get('/login', asyncHandler(adminController.paginaLogin));
router.post('/login', asyncHandler(adminController.login));
router.post('/logout', asyncHandler(adminController.logout));

// Alteração de password (utilizador autenticado, antes de entrar no painel)
router.get('/password', exigirLogin, asyncHandler(adminController.paginaPassword));
router.post('/password', exigirLogin, asyncHandler(adminController.alterarPassword));

// A partir daqui só administradores com a password inicial já alterada.
router.use(exigirAdmin, exigirPasswordAlterada);

router.get('/', asyncHandler(adminController.painel));
router.get('/qrcodes', asyncHandler(adminController.qrcodesParaImprimir));
router.get('/relatorios', asyncHandler(relatoriosController.paginaRelatorios));
router.get('/api/relatorios', asyncHandler(relatoriosController.apiRelatorios));
router.get('/mesas/:id/qrcode.png', asyncHandler(adminController.qrcodeMesa));

// APIs de pedidos e chamadas
router.get('/api/pedidos', asyncHandler(api.painelPedidos));
router.patch('/api/pedidos/:id/estado', asyncHandler(api.mudarEstadoPedido));
router.patch('/api/chamadas/:id/resolver', asyncHandler(api.resolverChamada));

// APIs do menu
router.get('/api/menu', asyncHandler(api.listarMenu));
router.post('/api/categorias', asyncHandler(api.criarCategoria));
router.put('/api/categorias/:id', asyncHandler(api.atualizarCategoria));
router.delete('/api/categorias/:id', asyncHandler(api.eliminarCategoria));
const camposMedia = uploadMedia.fields([
  { name: 'foto', maxCount: 1 },
  { name: 'video', maxCount: 1 }
]);

router.post('/api/pratos', camposMedia, asyncHandler(api.criarPrato));
router.put('/api/pratos/:id', camposMedia, asyncHandler(api.atualizarPrato));
router.patch('/api/pratos/:id/disponibilidade', asyncHandler(api.alternarDisponibilidade));
router.delete('/api/pratos/:id', asyncHandler(api.eliminarPrato));

// APIs das mesas
router.get('/api/mesas', asyncHandler(api.listarMesas));
router.post('/api/mesas/:id/ativar', asyncHandler(api.ativarMesa));
router.get('/api/mesas/:id/conta', asyncHandler(api.contaDaMesa));
router.post('/api/mesas/:id/fechar', asyncHandler(api.fecharMesa));

// Definições e utilizadores
router.get('/api/configuracoes', asyncHandler(api.obterConfiguracoes));
router.put('/api/configuracoes', asyncHandler(api.guardarConfiguracoes));
router.get('/api/utilizadores', asyncHandler(api.listarUtilizadores));
router.post('/api/utilizadores', asyncHandler(api.criarUtilizador));
router.patch('/api/utilizadores/:id/ativo', asyncHandler(api.alternarUtilizador));
router.post('/api/utilizadores/:id/password', asyncHandler(api.reporPassword));

module.exports = router;

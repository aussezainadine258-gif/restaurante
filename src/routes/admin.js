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
router.get('/login', adminController.paginaLogin);
router.post('/login', adminController.login);
router.post('/logout', adminController.logout);

// Alteração de password (utilizador autenticado, antes de entrar no painel)
router.get('/password', exigirLogin, adminController.paginaPassword);
router.post('/password', exigirLogin, adminController.alterarPassword);

// A partir daqui só administradores com a password inicial já alterada.
router.use(exigirAdmin, exigirPasswordAlterada);

router.get('/', adminController.painel);
router.get('/qrcodes', adminController.qrcodesParaImprimir);
router.get('/relatorios', relatoriosController.paginaRelatorios);
router.get('/api/relatorios', relatoriosController.apiRelatorios);
router.get('/mesas/:id/qrcode.png', adminController.qrcodeMesa);

// APIs de pedidos e chamadas
router.get('/api/pedidos', api.painelPedidos);
router.patch('/api/pedidos/:id/estado', api.mudarEstadoPedido);
router.patch('/api/chamadas/:id/resolver', api.resolverChamada);

// APIs do menu
router.get('/api/menu', api.listarMenu);
router.post('/api/categorias', api.criarCategoria);
router.put('/api/categorias/:id', api.atualizarCategoria);
router.delete('/api/categorias/:id', api.eliminarCategoria);
const camposMedia = uploadMedia.fields([
  { name: 'foto', maxCount: 1 },
  { name: 'video', maxCount: 1 }
]);

router.post('/api/pratos', camposMedia, asyncHandler(api.criarPrato));
router.put('/api/pratos/:id', camposMedia, asyncHandler(api.atualizarPrato));
router.patch('/api/pratos/:id/disponibilidade', api.alternarDisponibilidade);
router.delete('/api/pratos/:id', asyncHandler(api.eliminarPrato));

// APIs das mesas
router.get('/api/mesas', api.listarMesas);
router.post('/api/mesas/:id/ativar', api.ativarMesa);
router.get('/api/mesas/:id/conta', api.contaDaMesa);
router.post('/api/mesas/:id/fechar', api.fecharMesa);

// Definições e utilizadores
router.get('/api/configuracoes', api.obterConfiguracoes);
router.put('/api/configuracoes', api.guardarConfiguracoes);
router.get('/api/utilizadores', api.listarUtilizadores);
router.post('/api/utilizadores', asyncHandler(api.criarUtilizador));
router.patch('/api/utilizadores/:id/ativo', api.alternarUtilizador);
router.post('/api/utilizadores/:id/password', asyncHandler(api.reporPassword));

module.exports = router;

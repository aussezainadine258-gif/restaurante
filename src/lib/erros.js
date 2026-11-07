// Erro de negócio com código HTTP, usado pelos serviços e controllers.
class ErroAplicacao extends Error {
  constructor(mensagem, status = 400, campo = null) {
    super(mensagem);
    this.name = 'ErroAplicacao';
    this.status = status;
    this.campo = campo;
  }
}

module.exports = { ErroAplicacao };

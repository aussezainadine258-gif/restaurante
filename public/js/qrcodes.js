// Impressão dos QR codes (o browser trata do layout A4).
'use strict';

(() => {
  const botao = document.getElementById('btn-imprimir');
  if (botao) {
    botao.addEventListener('click', () => window.print());
  }
})();

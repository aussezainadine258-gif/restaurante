// Página de espera: verifica se o empregado já ativou a mesa.
'use strict';

(() => {
  const mesa = Number(document.body.dataset.mesa);
  const dica = document.getElementById('estado-dica');
  let ativa = false;
  let tentativas = 0;

  async function verificar() {
    if (ativa) return;
    try {
      const estado = await SLEY.fetchJSON(`/api/mesa/${mesa}/estado`);
      if (estado.ativa) {
        ativa = true;
        dica.textContent = 'Mesa ativada! A abrir o menu…';
        setTimeout(() => window.location.reload(), 500);
      }
    } catch {
      tentativas += 1;
      if (tentativas > 3 && dica) {
        dica.textContent = 'Ainda à espera. Peça ao empregado para ativar a mesa.';
      }
    }
  }

  verificar();
  setInterval(verificar, 4000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') verificar();
  });
})();

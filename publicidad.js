// Apariciones espaciadas entre 90 y 150 s. Solo cuenta mientras la página está visible.
(() => {
  'use strict';
  const cartel = document.getElementById('cartel-sancor');
  const cerrar = document.getElementById('cerrar-sancor');
  const imagen = cartel.querySelector('img');
  let temporizador;
  let focoAnterior;

  function programar() {
    clearTimeout(temporizador);
    if (document.hidden || !cartel.hidden) return;
    temporizador = setTimeout(() => {
      if (document.hidden) return;
      if (!imagen.complete || !imagen.naturalWidth) { programar(); return; }
      focoAnterior = document.activeElement;
      cartel.hidden = false;
      // Es un aviso no modal: no interrumpe el foco ni bloquea el resto de la página.
    }, 90000 + Math.floor(Math.random() * 60001));
  }

  function ocultar() {
    if (cartel.hidden) return;
    const restaurarFoco = cartel.contains(document.activeElement);
    cartel.hidden = true;
    if (restaurarFoco && focoAnterior?.isConnected) focoAnterior.focus({ preventScroll: true });
    programar();
  }

  cerrar.addEventListener('click', ocultar);
  document.addEventListener('keydown', evento => {
    if (evento.key === 'Escape' && !cartel.hidden) ocultar();
  });
  document.addEventListener('visibilitychange', () => {
    clearTimeout(temporizador);
    if (document.hidden) ocultar();
    else programar();
  });
  programar();
})();

/* Presentación: el histórico no participa del sorteo por partida. */
(function () {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const seleccion = new Map();
  let partidasPorId = new Map();
  let candidatasPorId = new Map();
  function tarjeta(c, historica = false) {
    const larga = c.texto.length > 440;
    const avance = historica ? c.texto.split('\n')[0] : c.texto.slice(0, 210).replace(/\s+\S*$/, '') + '…';
    const contenido = larga ? `<p>${esc(avance)}</p><details class="funcion-relato"><summary>Leer ${c.tipo.startsWith('Narrativa') || c.tipo.startsWith('Ficción') ? 'el relato' : 'el detalle'}</summary><p>${esc(c.texto)}</p></details>` : `<p>${esc(c.texto)}</p>`;
    return `<article class="funcion ${historica ? 'funcion-historica' : 'funcion-partida'} ${c.disponible ? '' : 'funcion-pendiente'}" data-funcion="${c.id}">
      <span class="funcion-tipo">${esc(c.tipo)}</span><h4>${esc(c.titulo)}</h4>
      ${contenido}
      ${c.metodo ? `<details class="funcion-metodo"><summary>Cómo se calcula / fuente</summary><p>${esc(c.metodo)}</p></details>` : ''}
    </article>`;
  }
  function partida(p) {
    if (!seleccion.has(String(p.id))) seleccion.set(String(p.id), Campamento.sortear(candidatasPorId.get(String(p.id)) || Campamento.dePartida(p)));
    const cartas = seleccion.get(String(p.id));
    if (!cartas.length) return '';
    return `<section class="funciones-batalla" data-partida-funciones="${esc(p.id)}" aria-label="Tres historias de esta batalla">
      <div class="funciones-cabecera"><div><h3>Los ecos de la batalla</h3><p>Tres miradas al azar. Los relatos inventados se identifican como ficción.</p></div>
      <button type="button" class="boton secundario chico" data-sortear="${esc(p.id)}" aria-label="Sortear otras tres funciones de esta partida">↻ Otras tres</button></div>
      <div class="funciones-grid" aria-live="polite">${cartas.map(c => tarjeta(c)).join('')}</div>
    </section>`;
  }
  function iniciar(partidas, miembros) {
    partidasPorId = new Map(partidas.map(p => [String(p.id), p]));
    candidatasPorId = new Map(partidas.map(p => [String(p.id), Campamento.dePartida(p)]));
    const disponiblesPorPartida = new Set([...candidatasPorId.values()].flatMap(cs => cs.map(c => c.id)));
    const h = Campamento.historial(partidas, miembros);
    const cartas = Campamento.historicas(h);
    const grupos = [
      ['Rivalidades', [11, 12, 13, 14]],
      ['Premios y rankings', [6, 7, 15, 16, 17, 20, 32, 33, 36, 38]],
      ['Duplas del campamento', [18, 19]],
      ['El Noticiero Imperial', [30]],
    ];
    document.getElementById('historia-campamento').innerHTML = grupos.map(([titulo, ids], i) => {
      const grupo = ids.map(id => cartas.find(c => c.id === id));
      const disponibles = grupo.filter(c => c.disponible).length;
      return `<details class="historia-grupo" ${i === 0 ? 'open' : ''}><summary>${titulo} <span>${disponibles}/${grupo.length} con datos</span></summary>
        <div class="funciones-grid historia-grid">${grupo.map(c => tarjeta(c, true)).join('')}</div></details>`;
    }).join('');
    const pendientes = Campamento.CATALOGO.filter(c => c.ambito === 'partida' && !disponiblesPorPartida.has(c.id));
    document.getElementById('cobertura-funciones').textContent = pendientes.length
      ? `Fuera del sorteo por falta de datos o de casos que cumplan el criterio: ${pendientes.map(c => c.titulo).join(', ')}. Se incorporarán cuando haya evidencia suficiente. Las bajas, ovejas robadas y estados de unidades necesitan telemetría adicional a las órdenes de la grabación.`
      : 'Todas las funciones por partida tienen al menos un caso con datos. Cada sorteo utiliza solo las aplicables a esa batalla.';
    const oraculo = document.getElementById('oraculo-equipos');
    oraculo.innerHTML = miembros.map(m => `<label>${esc(m.nick)}<select data-oraculo-id="${esc(m.id)}" aria-label="Equipo de ${esc(m.nick)}"><option value="">No juega</option><option value="A">Equipo A</option><option value="B">Equipo B</option></select></label>`).join('');
    const predecir = () => {
      const a = [], b = [];
      for (const el of oraculo.querySelectorAll('select')) {
        const id = miembros.find(m => String(m.id) === el.dataset.oraculoId)?.id;
        if (el.value === 'A') a.push(id);
        if (el.value === 'B') b.push(id);
      }
      const prob = Campamento.probabilidad(h, a, b);
      const output = document.getElementById('oraculo-resultado');
      if (prob === null) { output.textContent = 'Elegí al menos un jugador por equipo.'; return; }
      const muestra = [...a, ...b].map(id => h.registros.get(id).pj);
      output.textContent = `Equipo A: ${Math.round(prob * 100)}% · Equipo B: ${100 - Math.round(prob * 100)}%. ${Math.min(...muestra) < 5 ? 'Poca evidencia: alguno de los jugadores tiene menos de cinco partidas.' : 'Estimación lúdica, no una garantía.'}${a.length !== b.length ? ' Equipos desiguales: el modelo usa ELO medio y no corrige la ventaja numérica.' : ''}`;
    };
    oraculo.onchange = predecir;
    predecir();
    document.getElementById('batallas').addEventListener('click', e => {
      const boton = e.target.closest('button[data-sortear]');
      if (!boton) return;
      const p = partidasPorId.get(boton.dataset.sortear);
      if (!p) return;
      const cartas = Campamento.sortear(candidatasPorId.get(String(p.id)) || Campamento.dePartida(p));
      seleccion.set(String(p.id), cartas);
      // Conserva el botón y su foco; no mueve el scroll ni redibuja las estadísticas.
      boton.closest('.funciones-batalla').querySelector('.funciones-grid').innerHTML = cartas.map(c => tarjeta(c)).join('');
    });
  }
  window.CampamentoUI = { iniciar, partida };
})();

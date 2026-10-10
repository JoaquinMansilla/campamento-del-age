const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (g, pj) => (pj ? Math.round((g / pj) * 100) : 0);
const MAX_SERIES = 8;

function fechaLarga(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function duracion(min) {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

function calcular(partidas) {
  const jugadores = new Map();
  const civs = new Map();
  const mapas = new Map();
  // Victorias acumuladas de cada jugador después de cada partida (índice 0 = antes de empezar)
  const evolucion = new Map();

  partidas.forEach((p, i) => {
    const mapa = mapas.get(p.mapa) || { nombre: p.mapa, pj: 0, minutos: 0, conDuracion: 0 };
    mapa.pj++;
    if (p.duracionMin) { mapa.minutos += p.duracionMin; mapa.conDuracion++; }
    mapas.set(p.mapa, mapa);

    for (const j of p.jugadores) {
      const gano = j.equipo === p.ganador;
      if (!jugadores.has(j.nombre)) {
        jugadores.set(j.nombre, { nombre: j.nombre, orden: jugadores.size, pj: 0, g: 0, racha: 0, civs: new Map() });
        evolucion.set(j.nombre, new Array(i + 1).fill(0));
      }
      const s = jugadores.get(j.nombre);
      s.pj++;
      if (gano) s.g++;
      s.racha = gano ? Math.max(s.racha, 0) + 1 : Math.min(s.racha, 0) - 1;
      s.civs.set(j.civ, (s.civs.get(j.civ) || 0) + 1);

      const c = civs.get(j.civ) || { nombre: j.civ, pj: 0, g: 0 };
      c.pj++;
      if (gano) c.g++;
      civs.set(j.civ, c);
    }
    for (const [nombre, serie] of evolucion) serie.push(jugadores.get(nombre).g);
  });

  const tabla = [...jugadores.values()]
    .map((s) => ({ ...s, p: s.pj - s.g, pct: pct(s.g, s.pj), civFav: [...s.civs].sort((a, b) => b[1] - a[1])[0][0] }))
    .sort((a, b) => b.pct - a.pct || b.g - a.g || a.nombre.localeCompare(b.nombre));

  return {
    tabla,
    evolucion,
    civs: [...civs.values()].sort((a, b) => b.pj - a.pj || b.g - a.g),
    mapas: [...mapas.values()].sort((a, b) => b.pj - a.pj),
  };
}

// El color sigue al jugador (orden de primera aparición), no a su puesto en la tabla
const colorDe = (jugador) => (jugador.orden < MAX_SERIES ? `var(--serie-${jugador.orden + 1})` : 'var(--tinta-3)');

function mostrarTooltip(html, x, y) {
  const t = $('tooltip');
  t.innerHTML = html;
  t.hidden = false;
  const r = t.getBoundingClientRect();
  t.style.left = `${Math.max(8, Math.min(x + 14, window.innerWidth - r.width - 8))}px`;
  t.style.top = `${Math.max(8, Math.min(y + 14, window.innerHeight - r.height - 8))}px`;
}
const ocultarTooltip = () => { $('tooltip').hidden = true; };

function pintarFichas(partidas, st) {
  const conDuracion = partidas.filter((p) => p.duracionMin);
  const minutos = conDuracion.reduce((a, p) => a + p.duracionMin, 0);
  const lider = st.tabla[0];
  const mapa = st.mapas[0];
  const fichas = [
    ['Puntero', lider.nombre, `${lider.pct}% de victorias`],
    ['Partidas jugadas', partidas.length, `${st.tabla.length} jugadores`],
    ['Tiempo de juego', duracion(minutos), `${duracion(conDuracion.length ? minutos / conDuracion.length : 0)} por partida`],
    ['Mapa más jugado', mapa.nombre, `${mapa.pj} partidas`],
    ['Civilización más elegida', st.civs[0].nombre, `${st.civs[0].pj} veces`],
  ];
  $('fichas').innerHTML = fichas.map(([etiqueta, valor, detalle]) => `
    <div class="ficha">
      <div class="ficha-etiqueta">${etiqueta}</div>
      <div class="ficha-valor">${esc(valor)}</div>
      <div class="ficha-detalle">${esc(detalle)}</div>
    </div>`).join('');
}

function pintarPosiciones(st) {
  const filas = st.tabla.map((s, i) => `
    <tr>
      <td class="puesto num">${i + 1}</td>
      <td class="jugador"><span class="punto" style="background:${colorDe(s)}"></span>${esc(s.nombre)}</td>
      <td class="num">${s.pj}</td>
      <td class="num">${s.g}</td>
      <td class="num">${s.p}</td>
      <td class="celda-pct">
        <div class="medidor">
          <div class="medidor-pista"><div class="medidor-relleno" style="width:${s.pct}%"></div></div>
          <span class="medidor-valor">${s.pct}%</span>
        </div>
      </td>
      <td class="${s.racha > 0 ? 'racha-g' : 'racha-p'}">${Math.abs(s.racha)} ${s.racha > 0 ? 'ganadas' : 'perdidas'}</td>
      <td>${esc(s.civFav)}</td>
    </tr>`).join('');
  $('tabla-posiciones').innerHTML = `
    <thead><tr>
      <th class="num">#</th><th>Jugador</th><th class="num">PJ</th><th class="num">G</th><th class="num">P</th>
      <th>% de victorias</th><th>Racha</th><th>Civ. favorita</th>
    </tr></thead>
    <tbody>${filas}</tbody>`;
}

function pintarBarras(id, items, valorTexto, tooltip) {
  const max = Math.max(...items.map((d) => d.pj));
  const cont = $(id);
  cont.innerHTML = items.map((d, i) => `
    <div class="barra-fila" data-i="${i}">
      <div class="barra-nombre">${esc(d.nombre)}</div>
      <div class="barra-zona">
        <div class="barra" style="width:${(d.pj / max) * 70}%"></div>
        <span class="barra-valor">${esc(valorTexto(d))}</span>
      </div>
    </div>`).join('');
  cont.onmousemove = (e) => {
    const fila = e.target.closest('.barra-fila');
    if (!fila) return ocultarTooltip();
    mostrarTooltip(tooltip(items[fila.dataset.i]), e.clientX, e.clientY);
  };
  cont.onmouseleave = ocultarTooltip;
}

function pintarEvolucion(partidas, st) {
  const series = st.tabla.filter((s) => s.orden < MAX_SERIES);
  $('leyenda-evolucion').innerHTML = series
    .map((s) => `<span><span class="punto" style="background:${colorDe(s)}"></span>${esc(s.nombre)}</span>`).join('');

  const cont = $('grafico-evolucion');
  const n = partidas.length;
  const W = Math.max(cont.clientWidth, 280);
  const H = Math.min(320, Math.max(220, W * 0.42));
  const m = { arriba: 12, der: 16, abajo: 34, izq: 30 };
  const maxY = Math.max(1, ...series.map((s) => s.g));
  const x = (i) => m.izq + (i / n) * (W - m.izq - m.der);
  const y = (v) => H - m.abajo - (v / maxY) * (H - m.arriba - m.abajo);
  // Los jugadores que se sumaron tarde tienen una serie más corta: se alinea a la derecha
  const valor = (s, i) => st.evolucion.get(s.nombre)[i - (n + 1 - st.evolucion.get(s.nombre).length)];

  const pasoY = Math.ceil(maxY / 5);
  let grilla = '';
  for (let v = 0; v <= maxY; v += pasoY) {
    grilla += `<line class="${v ? 'linea-grilla' : 'linea-eje'}" x1="${m.izq}" x2="${W - m.der}" y1="${y(v)}" y2="${y(v)}"/>
      <text x="${m.izq - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  const pasoX = Math.max(1, Math.ceil(n / (W / 60)));
  for (let i = pasoX; i <= n; i += pasoX) {
    grilla += `<text x="${x(i)}" y="${H - m.abajo + 16}" text-anchor="middle">${i}</text>`;
  }
  grilla += `<text x="${(m.izq + W - m.der) / 2}" y="${H - 2}" text-anchor="middle">Partida n.º</text>`;

  const lineas = series.map((s) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const v = valor(s, i);
      if (v !== undefined) pts.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    }
    return `<polyline class="linea-serie" stroke="${colorDe(s)}" points="${pts.join(' ')}"/>`;
  }).join('');

  cont.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Victorias acumuladas por jugador">
    ${grilla}${lineas}<g id="capa-mira"></g></svg>`;

  const svg = cont.querySelector('svg');
  svg.onmousemove = (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(n, Math.round(((px - m.izq) / (W - m.izq - m.der)) * n)));
    const presentes = series.filter((s) => valor(s, i) !== undefined).sort((a, b) => valor(b, i) - valor(a, i));
    svg.querySelector('#capa-mira').innerHTML =
      `<line class="mira" x1="${x(i)}" x2="${x(i)}" y1="${m.arriba}" y2="${H - m.abajo}"/>` +
      presentes.map((s) => `<circle class="marcador" r="5" cx="${x(i)}" cy="${y(valor(s, i))}" fill="${colorDe(s)}"/>`).join('');
    const titulo = i ? `Partida ${i} · ${esc(partidas[i - 1].mapa)}` : 'Antes de empezar';
    mostrarTooltip(`<div class="tooltip-titulo">${titulo}</div>` + presentes.map((s) =>
      `<div class="tooltip-fila"><span><span class="punto" style="background:${colorDe(s)}"></span>${esc(s.nombre)}</span><b>${valor(s, i)}</b></div>`
    ).join(''), e.clientX, e.clientY);
  };
  svg.onmouseleave = () => { svg.querySelector('#capa-mira').innerHTML = ''; ocultarTooltip(); };
}

function pintarHistorial(partidas) {
  const filas = partidas.map((p, i) => {
    const equipos = new Map();
    for (const j of p.jugadores) {
      if (!equipos.has(j.equipo)) equipos.set(j.equipo, []);
      equipos.get(j.equipo).push(`${esc(j.nombre)} <span class="vs" style="padding:0">(${esc(j.civ)})</span>`);
    }
    const texto = [...equipos].map(([equipo, js]) =>
      `<span class="${equipo === p.ganador ? 'equipo-ganador' : ''}">${js.join(', ')}</span>`
    ).join('<span class="vs">vs</span>');
    return `<tr>
      <td class="num puesto">${i + 1}</td>
      <td>${fechaLarga(p.fecha)}</td>
      <td>${esc(p.mapa)}</td>
      <td class="num">${duracion(p.duracionMin)}</td>
      <td class="equipos">${texto}</td>
    </tr>`;
  }).reverse().join('');
  $('tabla-historial').innerHTML = `
    <thead><tr><th class="num">#</th><th>Fecha</th><th>Mapa</th><th class="num">Duración</th><th>Equipos (👑 ganador)</th></tr></thead>
    <tbody>${filas}</tbody>`;
}

function pintarComidas(comidas) {
  if (!comidas.length) {
    $('tabla-comidas').innerHTML = '<tbody><tr><td class="vacio">Todavía no hay comidas cargadas.</td></tr></tbody>';
    $('barras-cocineros').innerHTML = '<p class="vacio">Sin datos.</p>';
    return;
  }
  const orden = [...comidas].sort((a, b) =>
    b.fecha.localeCompare(a.fecha) || MOMENTOS.indexOf(b.momento) - MOMENTOS.indexOf(a.momento));
  $('tabla-comidas').innerHTML = `
    <thead><tr><th>Fecha</th><th>Momento</th><th>Plato</th><th>Cocinó</th></tr></thead>
    <tbody>${orden.map((c) => `<tr>
      <td>${fechaLarga(c.fecha)}</td>
      <td class="capital">${esc(c.momento)}</td>
      <td class="jugador">${esc(c.plato)}</td>
      <td>${esc((c.cocineros || []).join(', ') || '—')}</td>
    </tr>`).join('')}</tbody>`;

  const cocineros = new Map();
  for (const c of comidas) {
    for (const nombre of c.cocineros || []) {
      const s = cocineros.get(nombre) || { nombre, pj: 0, platos: [] };
      s.pj++;
      s.platos.push(c.plato);
      cocineros.set(nombre, s);
    }
  }
  const lista = [...cocineros.values()].sort((a, b) => b.pj - a.pj || a.nombre.localeCompare(b.nombre));
  if (!lista.length) { $('barras-cocineros').innerHTML = '<p class="vacio">Sin datos.</p>'; return; }
  pintarBarras('barras-cocineros', lista,
    (c) => `${c.pj} ${c.pj === 1 ? 'comida' : 'comidas'}`,
    (c) => `<div class="tooltip-titulo">${esc(c.nombre)}</div>${c.platos.map((p) => `<div class="tooltip-fila"><span>${esc(p)}</span></div>`).join('')}`);
}

function pintarActividades(actividades) {
  if (!actividades.length) {
    $('tabla-actividades').innerHTML = '<tbody><tr><td class="vacio">Todavía no hay actividades cargadas.</td></tr></tbody>';
    return;
  }
  const orden = [...actividades].sort((a, b) => b.fecha.localeCompare(a.fecha));
  $('tabla-actividades').innerHTML = `
    <thead><tr><th>Fecha</th><th>Actividad</th><th>Detalle</th><th>Participantes</th></tr></thead>
    <tbody>${orden.map((a) => `<tr>
      <td>${fechaLarga(a.fecha)}</td>
      <td class="jugador">${esc(a.nombre)}</td>
      <td class="largo">${esc(a.descripcion || '—')}</td>
      <td class="largo">${esc((a.participantes || []).join(', ') || '—')}</td>
    </tr>`).join('')}</tbody>`;
}

async function iniciar() {
  let datos;
  try {
    datos = await cargarDatos();
  } catch (err) {
    $('bajada').textContent = '';
    $('aviso-error').hidden = false;
    $('aviso-error').textContent = `No se pudieron cargar los datos (${err.message}).`;
    return;
  }

  const partidas = [...datos.partidas].sort((a, b) => a.fecha.localeCompare(b.fecha));
  $('aviso-ejemplo').hidden = !datos.ejemplo;
  pintarComidas(datos.comidas);
  pintarActividades(datos.actividades);
  if (!partidas.length) {
    $('bajada').textContent = 'Todavía no hay partidas cargadas.';
    for (const s of document.querySelectorAll('[data-partidas]')) s.hidden = true;
    return;
  }

  const st = calcular(partidas);
  $('bajada').textContent = `${partidas.length} partidas · del ${fechaLarga(partidas[0].fecha)} al ${fechaLarga(partidas[partidas.length - 1].fecha)}`;
  pintarFichas(partidas, st);
  pintarPosiciones(st);
  pintarBarras('barras-civs', st.civs.slice(0, 10),
    (c) => `${c.pj} · ${pct(c.g, c.pj)}% vic.`,
    (c) => `<div class="tooltip-titulo">${esc(c.nombre)}</div>
      <div class="tooltip-fila"><span>Veces elegida</span><b>${c.pj}</b></div>
      <div class="tooltip-fila"><span>Victorias</span><b>${c.g} (${pct(c.g, c.pj)}%)</b></div>`);
  pintarBarras('barras-mapas', st.mapas.slice(0, 10),
    (mp) => `${mp.pj} · ${duracion(mp.conDuracion ? mp.minutos / mp.conDuracion : 0)}`,
    (mp) => `<div class="tooltip-titulo">${esc(mp.nombre)}</div>
      <div class="tooltip-fila"><span>Partidas</span><b>${mp.pj}</b></div>
      <div class="tooltip-fila"><span>Duración promedio</span><b>${duracion(mp.conDuracion ? mp.minutos / mp.conDuracion : 0)}</b></div>`);
  pintarEvolucion(partidas, st);
  pintarHistorial(partidas);

  let pendiente;
  window.addEventListener('resize', () => {
    clearTimeout(pendiente);
    pendiente = setTimeout(() => pintarEvolucion(partidas, st), 150);
  });
}

iniciar();

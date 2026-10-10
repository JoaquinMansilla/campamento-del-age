const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (g, pj) => (pj ? Math.round((g / pj) * 100) : 0);
const plural = (n, uno, muchos) => `${n} ${n === 1 ? uno : muchos}`;
const promedio = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const colorDe = (miembro) => `var(--serie-${miembro.orden + 1})`;

function fechaLarga(fecha) {
  const d = typeof fecha === 'string' ? new Date(...fecha.split('-').map((n, i) => (i === 1 ? n - 1 : Number(n)))) : fecha;
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}
const hora = (d) => d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

function duracion(min) {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

// Tiempo de juego en minutos:segundos, como el reloj de la partida
function reloj(segundos) {
  if (segundos == null) return '—';
  const s = Math.round(segundos);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
const numero = (n) => (n == null ? '—' : Math.round(n));

const imagen = (url, clase, alt = '') =>
  (url ? `<img class="${clase}" src="${esc(url)}" alt="${esc(alt)}" loading="lazy">` : `<span class="${clase} sin-imagen"></span>`);

function mostrarTooltip(html, x, y) {
  const t = $('tooltip');
  t.innerHTML = html;
  t.hidden = false;
  const r = t.getBoundingClientRect();
  t.style.left = `${Math.max(8, Math.min(x + 14, window.innerWidth - r.width - 8))}px`;
  t.style.top = `${Math.max(8, Math.min(y + 14, window.innerHeight - r.height - 8))}px`;
}
const ocultarTooltip = () => { $('tooltip').hidden = true; };

function calcular(miembros, partidas) {
  const guerreros = new Map(miembros.map((m) => [m.id, { miembro: m, pj: 0, g: 0, racha: 0, civs: new Map(), detalles: [], serie: [] }]));
  const civs = new Map();
  const mapas = new Map();
  const clan = { pj: 0, g: 0, p: 0, internas: 0, minutos: 0, racha: 0 };

  partidas.forEach((p, i) => {
    clan.pj++;
    clan.minutos += p.minutos;
    if (p.resultado === 'interna') clan.internas++;
    else {
      const gano = p.resultado === 'victoria';
      clan[gano ? 'g' : 'p']++;
      clan.racha = gano ? Math.max(clan.racha, 0) + 1 : Math.min(clan.racha, 0) - 1;
    }

    const mapa = mapas.get(p.mapa) || { nombre: p.mapa, img: p.mapaImg, pj: 0, g: 0, p: 0 };
    mapa.pj++;
    if (p.resultado === 'victoria') mapa.g++;
    if (p.resultado === 'derrota') mapa.p++;
    mapas.set(p.mapa, mapa);

    for (const j of p.clan) {
      const s = guerreros.get(j.id);
      s.pj++;
      if (j.gano) s.g++;
      s.racha = j.gano ? Math.max(s.racha, 0) + 1 : Math.min(s.racha, 0) - 1;
      if (j.detalle) { s.detalles.push(j.detalle); s.serie[i] = j.detalle.eapm; }
      const propia = s.civs.get(j.civ) || { nombre: j.civ, img: j.civImg, pj: 0 };
      propia.pj++;
      s.civs.set(j.civ, propia);

      const c = civs.get(j.civ) || { nombre: j.civ, img: j.civImg, pj: 0, g: 0, quienes: new Set() };
      c.pj++;
      if (j.gano) c.g++;
      c.quienes.add(j.miembro.nick);
      civs.set(j.civ, c);
    }
  });

  const media = (s, campo) => promedio(s.detalles.map((d) => d[campo]).filter((v) => v != null));
  const lista = [...guerreros.values()]
    .map((s) => ({
      ...s,
      p: s.pj - s.g,
      pct: pct(s.g, s.pj),
      civFav: [...s.civs.values()].sort((a, b) => b.pj - a.pj)[0],
      eapm: media(s, 'eapm'),
      feudal: media(s, 'feudal'),
      castillos: media(s, 'castillos'),
      aldeanos: media(s, 'aldeanos'),
      tropas: media(s, 'tropas'),
    }))
    .sort((a, b) => b.pct - a.pct || b.g - a.g || (b.eapm || 0) - (a.eapm || 0) || a.miembro.orden - b.miembro.orden);

  return {
    clan,
    guerreros: lista,
    civs: [...civs.values()].sort((a, b) => b.pj - a.pj || b.g - a.g || a.nombre.localeCompare(b.nombre)),
    mapas: [...mapas.values()].sort((a, b) => b.pj - a.pj || a.nombre.localeCompare(b.nombre)),
  };
}

function pintarMarcador(st) {
  const { clan } = st;
  const decididas = clan.g + clan.p;
  const rapido = [...st.guerreros].filter((s) => s.eapm != null).sort((a, b) => b.eapm - a.eapm)[0];
  const racha = clan.racha > 0 ? plural(clan.racha, 'victoria seguida', 'victorias seguidas')
    : clan.racha < 0 ? plural(-clan.racha, 'derrota seguida', 'derrotas seguidas') : 'Sin racha';
  const fichas = [
    ['Partidas', clan.pj, clan.internas ? `${plural(clan.internas, 'interna', 'internas')} entre el clan` : 'jugadas en equipo'],
    ['Efectividad', decididas ? `${pct(clan.g, decididas)}%` : '—', racha],
    ['Tiempo en batalla', duracion(clan.minutos), `${duracion(clan.minutos / clan.pj)} por partida`],
    rapido ? ['Manos más rápidas', rapido.miembro.nick, `${numero(rapido.eapm)} APM de promedio`] : ['Manos más rápidas', '—', 'Esperando las grabaciones'],
  ];
  $('marcador').innerHTML = `
    <div class="record">
      <div class="record-lado">
        <div class="record-numero">${clan.g}</div>
        <div class="record-rotulo victoria">▲ Victorias</div>
      </div>
      <div class="record-escudo" aria-hidden="true">⚔</div>
      <div class="record-lado">
        <div class="record-numero">${clan.p}</div>
        <div class="record-rotulo derrota">▼ Derrotas</div>
      </div>
    </div>
    <div class="fichas">${fichas.map(([etiqueta, valor, detalle]) => `
      <div class="ficha">
        <div class="ficha-etiqueta">${etiqueta}</div>
        <div class="ficha-valor">${esc(valor)}</div>
        <div class="ficha-detalle">${esc(detalle)}</div>
      </div>`).join('')}
    </div>`;
}

function pintarGuerreros(st, tag) {
  const lider = st.guerreros[0];
  $('guerreros').innerHTML = st.guerreros.map((s) => {
    const cabeza = (extra = '') => `<div class="guerrero-cabeza">
        <span class="escudo" style="--color:${colorDe(s.miembro)}">${esc(s.miembro.nick[0])}</span>
        <div><div class="guerrero-tag">${esc(tag)}${extra}</div><div class="guerrero-nombre">${esc(s.miembro.nick)}</div></div>
      </div>`;
    if (!s.pj) return `<article class="guerrero ausente">${cabeza()}<p class="vacio">Todavía no entró en batalla.</p></article>`;
    const racha = s.racha > 0 ? `<span class="victoria">▲</span> ${plural(s.racha, 'ganada', 'ganadas')}`
      : `<span class="derrota">▼</span> ${plural(-s.racha, 'perdida', 'perdidas')}`;
    return `<article class="guerrero">
      ${cabeza(s === lider && s.g > 0 ? ' · 👑 Rey del campamento' : '')}
      <div class="guerrero-apm">
        <span class="apm-valor">${numero(s.eapm)}</span>
        <span class="apm-rotulo">APM promedio</span>
      </div>
      <div class="medidor-fila">
        <div class="medidor"><div class="medidor-relleno" style="width:${s.pct}%"></div></div>
        <span>${s.pct}% de victorias</span>
      </div>
      <dl class="guerrero-datos">
        <div><dt>Partidas</dt><dd>${s.pj}</dd></div>
        <div><dt>Ganadas</dt><dd>${s.g}</dd></div>
        <div><dt>Perdidas</dt><dd>${s.p}</dd></div>
        <div><dt>Feudal</dt><dd>${reloj(s.feudal)}</dd></div>
        <div><dt>Castillos</dt><dd>${reloj(s.castillos)}</dd></div>
        <div><dt>Aldeanos</dt><dd>${numero(s.aldeanos)}</dd></div>
      </dl>
      <div class="guerrero-pie">
        <span>${imagen(s.civFav.img, 'civ')} ${esc(s.civFav.nombre)}</span>
        <span>${racha}</span>
      </div>
    </article>`;
  }).join('');
}

function pintarBarras(id, items, valorTexto, tooltip) {
  const cont = $(id);
  if (!items.length) { cont.innerHTML = '<p class="vacio">Sin datos todavía.</p>'; return; }
  const max = Math.max(...items.map((d) => d.pj));
  cont.innerHTML = items.map((d, i) => `
    <div class="barra-fila" data-i="${i}">
      <div class="barra-nombre">${'img' in d ? imagen(d.img, 'civ') : ''}<span>${esc(d.nombre)}</span></div>
      <div class="barra-zona">
        <div class="barra" style="width:${(d.pj / max) * 62}%"></div>
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

// APM de cada jugador en cada partida. Los huecos son partidas que no jugó o sin grabación.
function pintarApm(partidas, st) {
  const series = st.guerreros.filter((s) => s.detalles.length).sort((a, b) => a.miembro.orden - b.miembro.orden);
  $('panel-apm').hidden = !series.length;
  if (!series.length) return;
  $('leyenda-apm').innerHTML = series
    .map((s) => `<span><span class="punto" style="background:${colorDe(s.miembro)}"></span>${esc(s.miembro.nick)}</span>`).join('');

  const cont = $('grafico-apm');
  const n = partidas.length;
  const W = Math.max(cont.clientWidth, 280);
  const H = Math.min(320, Math.max(220, W * 0.4));
  const m = { arriba: 14, der: 18, abajo: 34, izq: 36 };
  const paso = [10, 20, 25, 50, 100].find((p) => Math.max(...series.flatMap((s) => s.serie.filter((v) => v != null))) / p <= 5) || 200;
  const maxY = Math.ceil(Math.max(...series.flatMap((s) => s.serie.filter((v) => v != null))) / paso) * paso;
  const x = (i) => (n === 1 ? (m.izq + W - m.der) / 2 : m.izq + (i / (n - 1)) * (W - m.izq - m.der));
  const y = (v) => H - m.abajo - (v / maxY) * (H - m.arriba - m.abajo);

  let grilla = '';
  for (let v = 0; v <= maxY; v += paso) {
    grilla += `<line class="${v ? 'linea-grilla' : 'linea-eje'}" x1="${m.izq}" x2="${W - m.der}" y1="${y(v)}" y2="${y(v)}"/>
      <text x="${m.izq - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  const pasoX = Math.max(1, Math.ceil(n / (W / 60)));
  for (let i = 0; i < n; i += pasoX) {
    grilla += `<text x="${x(i)}" y="${H - m.abajo + 16}" text-anchor="middle">${i + 1}</text>`;
  }
  grilla += `<text x="${(m.izq + W - m.der) / 2}" y="${H - 2}" text-anchor="middle">Partida n.º</text>`;

  const conPuntos = n <= 14;
  const lineas = series.map((s) => {
    const tramos = [];
    let actual = [];
    for (let i = 0; i < n; i++) {
      if (s.serie[i] == null) { if (actual.length) tramos.push(actual); actual = []; } else actual.push(i);
    }
    if (actual.length) tramos.push(actual);
    return tramos.map((t) => (t.length > 1
      ? `<polyline class="linea-serie" stroke="${colorDe(s.miembro)}" points="${t.map((i) => `${x(i).toFixed(1)},${y(s.serie[i]).toFixed(1)}`).join(' ')}"/>` : '') +
      t.filter((i) => conPuntos || t.length === 1).map((i) => `<circle class="marcador" r="5" cx="${x(i)}" cy="${y(s.serie[i])}" fill="${colorDe(s.miembro)}"/>`).join('')).join('');
  }).join('');

  cont.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="APM de cada jugador por partida">
    ${grilla}${lineas}<g id="capa-mira"></g></svg>`;

  const svg = cont.querySelector('svg');
  svg.onmousemove = (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((px - m.izq) / (W - m.izq - m.der)) * (n - 1))));
    const presentes = series.filter((s) => s.serie[i] != null).sort((a, b) => b.serie[i] - a.serie[i]);
    svg.querySelector('#capa-mira').innerHTML =
      `<line class="mira" x1="${x(i)}" x2="${x(i)}" y1="${m.arriba}" y2="${H - m.abajo}"/>` +
      presentes.map((s) => `<circle class="marcador" r="6" cx="${x(i)}" cy="${y(s.serie[i])}" fill="${colorDe(s.miembro)}"/>`).join('');
    mostrarTooltip(`<div class="tooltip-titulo">Partida ${i + 1} · ${esc(partidas[i].mapa)}</div>` + (presentes.length ? presentes.map((s) =>
      `<div class="tooltip-fila"><span><span class="punto" style="background:${colorDe(s.miembro)}"></span>${esc(s.miembro.nick)}</span><b>${s.serie[i]} APM</b></div>`
    ).join('') : '<div class="tooltip-fila"><span>Sin grabación</span></div>'), e.clientX, e.clientY);
  };
  svg.onmouseleave = () => { svg.querySelector('#capa-mira').innerHTML = ''; ocultarTooltip(); };
}

const ROTULOS = { victoria: '▲ Victoria', derrota: '▼ Derrota', interna: '⚔ Interna' };

function pintarBatallas(partidas) {
  const fila = (j, delClan) => {
    const d = j.detalle || {};
    return `<tr>
      <td class="batalla-jugador">${imagen(j.civImg, 'civ', '')}${delClan ? `<span class="punto" style="background:${colorDe(j.miembro)}"></span>` : ''}<span>${esc(delClan ? j.miembro.nick : j.nombre)}</span></td>
      <td class="batalla-civ">${esc(j.civ)}</td>
      <td class="num">${numero(d.eapm)}</td>
      <td class="num">${reloj(d.feudal)}</td>
      <td class="num">${reloj(d.castillos)}</td>
      <td class="num">${reloj(d.imperial)}</td>
      <td class="num">${numero(d.aldeanos)}</td>
      <td class="num">${numero(d.tropas)}</td>
      <td class="num">${numero(d.edificios)}</td>
    </tr>`;
  };
  const bando = (titulo, filas) => (filas ? `<tr class="bando"><th colspan="9">${titulo}</th></tr>${filas}` : '');
  $('batallas').innerHTML = [...partidas].reverse().map((p, i) => `
    <article class="batalla ${p.resultado}">
      <div class="batalla-mapa">
        ${imagen(p.mapaImg, 'mapa', '')}
        <div>
          <div class="batalla-rotulo ${p.resultado}">${ROTULOS[p.resultado]}</div>
          <div class="batalla-titulo">${esc(p.mapa)}</div>
          <div class="batalla-meta">Partida ${partidas.length - i} · ${esc(p.modo)} · ${esc(fechaLarga(p.inicio))}, ${hora(p.inicio)} · ${duracion(p.minutos)}</div>
        </div>
      </div>
      <div class="tabla-scroll">
        <table class="batalla-tabla">
          <thead><tr>
            <th>Jugador</th><th>Civilización</th><th class="num">APM</th><th class="num">Feudal</th><th class="num">Castillos</th>
            <th class="num">Imperial</th><th class="num">Aldeanos</th><th class="num">Tropas</th><th class="num">Edificios</th>
          </tr></thead>
          <tbody>
            ${bando('Clan', p.clan.map((j) => fila(j, true)).join('') + p.aliados.map((j) => fila(j, false)).join(''))}
            ${bando('Rivales', p.rivales.map((j) => fila(j, false)).join(''))}
          </tbody>
        </table>
      </div>
      ${p.tieneDetalle ? '' : '<p class="batalla-meta">La grabación de esta partida todavía no está procesada.</p>'}
    </article>`).join('');
}

async function iniciar() {
  let datos;
  try {
    datos = await cargarPartidas();
  } catch (err) {
    $('bajada').textContent = '';
    $('aviso-error').hidden = false;
    $('aviso-error').textContent = `No se pudieron cargar las partidas (${err.message}).`;
    for (const s of document.querySelectorAll('[data-partidas]')) s.hidden = true;
    return;
  }
  const { campamento, miembros, partidas } = datos;
  window.MIEMBROS = miembros;
  $('titulo').textContent = campamento.nombre;
  $('anio').textContent = campamento.anio;
  $('tag').textContent = campamento.clan.tag;
  document.title = `${campamento.nombre} ${campamento.anio}`;
  document.dispatchEvent(new Event('miembros-listos'));

  if (!partidas.length) {
    $('bajada').textContent = 'Todavía no se libró ninguna batalla.';
    for (const s of document.querySelectorAll('[data-partidas]')) s.hidden = true;
    return;
  }

  const st = calcular(miembros, partidas);
  const dias = new Set(partidas.map((p) => p.inicio.toDateString())).size;
  $('bajada').textContent = `${plural(partidas.length, 'batalla', 'batallas')} en ${plural(dias, 'jornada', 'jornadas')} · desde el ${partidas[0].inicio.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}`;
  $('nota-cronica').textContent = `Cuentan las partidas con al menos ${campamento.minimoClan} miembros del clan. La más reciente primero. Los tiempos de edad son en reloj de juego; aldeanos y tropas son los que se mandaron a crear.`;

  pintarMarcador(st);
  pintarGuerreros(st, campamento.clan.tag);
  pintarBarras('barras-civs', st.civs.slice(0, 12),
    (c) => `${c.pj} · ${pct(c.g, c.pj)}% vic.`,
    (c) => `<div class="tooltip-titulo">${esc(c.nombre)}</div>
      <div class="tooltip-fila"><span>Veces elegida</span><b>${c.pj}</b></div>
      <div class="tooltip-fila"><span>Victorias</span><b>${c.g} (${pct(c.g, c.pj)}%)</b></div>
      <div class="tooltip-fila"><span>${esc([...c.quienes].join(', '))}</span></div>`);
  pintarBarras('barras-mapas', st.mapas.slice(0, 12),
    (mp) => `${mp.pj} · ${mp.g} V – ${mp.p} D`,
    (mp) => `<div class="tooltip-titulo">${esc(mp.nombre)}</div>
      <div class="tooltip-fila"><span>Partidas</span><b>${mp.pj}</b></div>
      <div class="tooltip-fila"><span>Victorias</span><b>${mp.g}</b></div>
      <div class="tooltip-fila"><span>Derrotas</span><b>${mp.p}</b></div>`);
  pintarApm(partidas, st);
  pintarBatallas(partidas);

  let pendiente;
  window.addEventListener('resize', () => {
    clearTimeout(pendiente);
    pendiente = setTimeout(() => pintarApm(partidas, st), 150);
  });
}

iniciar();

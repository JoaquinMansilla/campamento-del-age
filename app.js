const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (g, pj) => (pj ? Math.round((g / pj) * 100) : 0);
const signo = (n) => (n > 0 ? `+${n}` : String(n).replace('-', '−'));
const plural = (n, uno, muchos) => `${n} ${n === 1 ? uno : muchos}`;
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

function haceCuanto(d) {
  const min = Math.round((Date.now() - d) / 60000);
  if (min < 2) return 'recién';
  if (min < 60) return `hace ${min} min`;
  if (min < 1440) return `hace ${Math.round(min / 60)} h`;
  return `el ${d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}`;
}

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
  const guerreros = new Map(miembros.map((m) => [m.id, { miembro: m, pj: 0, g: 0, elo: 0, rating: null, racha: 0, civs: new Map(), serie: [0] }]));
  const civs = new Map();
  const mapas = new Map();
  const clan = { pj: 0, g: 0, p: 0, internas: 0, minutos: 0, racha: 0 };

  for (const p of partidas) {
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
      s.elo += j.diff || 0;
      if (j.rating != null) s.rating = j.rating;
      s.racha = j.gano ? Math.max(s.racha, 0) + 1 : Math.min(s.racha, 0) - 1;
      const propia = s.civs.get(j.civ) || { nombre: j.civ, img: j.civImg, pj: 0 };
      propia.pj++;
      s.civs.set(j.civ, propia);

      const c = civs.get(j.civ) || { nombre: j.civ, img: j.civImg, pj: 0, g: 0, quienes: new Set() };
      c.pj++;
      if (j.gano) c.g++;
      c.quienes.add(j.miembro.nick);
      civs.set(j.civ, c);
    }
    // Quien no jugó esta partida mantiene su ELO acumulado
    for (const s of guerreros.values()) s.serie.push(s.elo);
  }

  const lista = [...guerreros.values()]
    .map((s) => ({ ...s, p: s.pj - s.g, pct: pct(s.g, s.pj), civFav: [...s.civs.values()].sort((a, b) => b.pj - a.pj)[0] }))
    .sort((a, b) => b.elo - a.elo || b.pct - a.pct || a.miembro.orden - b.miembro.orden);

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
  const mejor = st.guerreros.find((s) => s.pj);
  const racha = clan.racha > 0 ? plural(clan.racha, 'victoria seguida', 'victorias seguidas')
    : clan.racha < 0 ? plural(-clan.racha, 'derrota seguida', 'derrotas seguidas') : 'Sin racha';
  const fichas = [
    ['Partidas', clan.pj, clan.internas ? `${plural(clan.internas, 'interna', 'internas')} entre el clan` : 'jugadas en equipo'],
    ['Efectividad', decididas ? `${pct(clan.g, decididas)}%` : '—', racha],
    ['Tiempo en batalla', duracion(clan.minutos), `${duracion(clan.minutos / clan.pj)} por partida`],
    ['Mejor guerrero', mejor.miembro.nick, `${signo(mejor.elo)} de ELO`],
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
    if (!s.pj) {
      return `<article class="guerrero ausente">
        <div class="guerrero-cabeza">
          <span class="escudo" style="--color:${colorDe(s.miembro)}">${esc(s.miembro.nick[0])}</span>
          <div><div class="guerrero-tag">${esc(tag)}</div><div class="guerrero-nombre">${esc(s.miembro.nick)}</div></div>
        </div>
        <p class="vacio">Todavía no entró en batalla.</p>
      </article>`;
    }
    const racha = s.racha > 0 ? `<span class="victoria">▲</span> ${plural(s.racha, 'ganada', 'ganadas')}`
      : `<span class="derrota">▼</span> ${plural(-s.racha, 'perdida', 'perdidas')}`;
    return `<article class="guerrero">
      <div class="guerrero-cabeza">
        <span class="escudo" style="--color:${colorDe(s.miembro)}">${esc(s.miembro.nick[0])}</span>
        <div>
          <div class="guerrero-tag">${esc(tag)}${s === lider && s.elo > 0 ? ' · 👑 Rey del campamento' : ''}</div>
          <div class="guerrero-nombre">${esc(s.miembro.nick)}</div>
        </div>
      </div>
      <div class="guerrero-elo">
        <span class="elo-delta"><span class="${s.elo < 0 ? 'derrota' : 'victoria'}">${s.elo < 0 ? '▼' : '▲'}</span> ${signo(s.elo)}</span>
        <span class="elo-actual">ELO ${s.rating ?? '—'}</span>
      </div>
      <div class="medidor-fila">
        <div class="medidor"><div class="medidor-relleno" style="width:${s.pct}%"></div></div>
        <span>${s.pct}% de victorias</span>
      </div>
      <dl class="guerrero-datos">
        <div><dt>Partidas</dt><dd>${s.pj}</dd></div>
        <div><dt>Ganadas</dt><dd>${s.g}</dd></div>
        <div><dt>Perdidas</dt><dd>${s.p}</dd></div>
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

function pasoLindo(rango) {
  return [5, 10, 20, 25, 50, 100, 200, 500].find((p) => rango / p <= 5) || 1000;
}

function pintarElo(partidas, st) {
  const series = st.guerreros.filter((s) => s.pj).sort((a, b) => a.miembro.orden - b.miembro.orden);
  $('leyenda-elo').innerHTML = series
    .map((s) => `<span><span class="punto" style="background:${colorDe(s.miembro)}"></span>${esc(s.miembro.nick)}</span>`).join('');

  const cont = $('grafico-elo');
  const n = partidas.length;
  const W = Math.max(cont.clientWidth, 280);
  const H = Math.min(320, Math.max(220, W * 0.4));
  const m = { arriba: 14, der: 18, abajo: 34, izq: 40 };
  const valores = series.flatMap((s) => s.serie);
  const paso = pasoLindo(Math.max(...valores, 0) - Math.min(...valores, 0) || 1);
  const minY = Math.floor(Math.min(...valores, 0) / paso) * paso;
  const maxY = Math.max(Math.ceil(Math.max(...valores, 0) / paso) * paso, minY + paso);
  const x = (i) => m.izq + (i / n) * (W - m.izq - m.der);
  const y = (v) => H - m.abajo - ((v - minY) / (maxY - minY)) * (H - m.arriba - m.abajo);

  let grilla = '';
  for (let v = minY; v <= maxY; v += paso) {
    grilla += `<line class="${v === 0 ? 'linea-eje' : 'linea-grilla'}" x1="${m.izq}" x2="${W - m.der}" y1="${y(v)}" y2="${y(v)}"/>
      <text x="${m.izq - 8}" y="${y(v) + 4}" text-anchor="end">${v === 0 ? 0 : signo(v)}</text>`;
  }
  const pasoX = Math.max(1, Math.ceil(n / (W / 60)));
  for (let i = pasoX; i <= n; i += pasoX) {
    grilla += `<text x="${x(i)}" y="${H - m.abajo + 16}" text-anchor="middle">${i}</text>`;
  }
  grilla += `<text x="${(m.izq + W - m.der) / 2}" y="${H - 2}" text-anchor="middle">Partida n.º</text>`;

  const lineas = series.map((s) => `<polyline class="linea-serie" stroke="${colorDe(s.miembro)}"
    points="${s.serie.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>
    <circle class="marcador" r="5" cx="${x(n)}" cy="${y(s.serie[n])}" fill="${colorDe(s.miembro)}"/>`).join('');

  cont.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="ELO acumulado por jugador durante el campamento">
    ${grilla}${lineas}<g id="capa-mira"></g></svg>`;

  const svg = cont.querySelector('svg');
  svg.onmousemove = (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(n, Math.round(((px - m.izq) / (W - m.izq - m.der)) * n)));
    const orden = [...series].sort((a, b) => b.serie[i] - a.serie[i]);
    svg.querySelector('#capa-mira').innerHTML =
      `<line class="mira" x1="${x(i)}" x2="${x(i)}" y1="${m.arriba}" y2="${H - m.abajo}"/>` +
      orden.map((s) => `<circle class="marcador" r="5" cx="${x(i)}" cy="${y(s.serie[i])}" fill="${colorDe(s.miembro)}"/>`).join('');
    const titulo = i ? `Partida ${i} · ${esc(partidas[i - 1].mapa)}` : 'Inicio del campamento';
    mostrarTooltip(`<div class="tooltip-titulo">${titulo}</div>` + orden.map((s) =>
      `<div class="tooltip-fila"><span><span class="punto" style="background:${colorDe(s.miembro)}"></span>${esc(s.miembro.nick)}</span><b>${signo(s.serie[i])}</b></div>`
    ).join(''), e.clientX, e.clientY);
  };
  svg.onmouseleave = () => { svg.querySelector('#capa-mira').innerHTML = ''; ocultarTooltip(); };
}

const ROTULOS = { victoria: '▲ Victoria', derrota: '▼ Derrota', interna: '⚔ Interna' };

function pintarBatallas(partidas) {
  const jugador = (j, delClan) => `<li>
      ${imagen(j.civImg, 'civ', j.civ)}
      <span class="batalla-jugador">${delClan ? `<span class="punto" style="background:${colorDe(j.miembro)}"></span>` : ''}${esc(delClan ? j.miembro.nick : j.nombre)}</span>
      <span class="batalla-civ">${esc(j.civ)}</span>
      ${j.diff != null ? `<span class="batalla-elo">${signo(j.diff)}</span>` : ''}
    </li>`;
  $('batallas').innerHTML = [...partidas].reverse().map((p, i) => `
    <article class="batalla ${p.resultado}">
      <div class="batalla-mapa">
        ${imagen(p.mapaImg, 'mapa', '')}
        <div>
          <div class="batalla-rotulo ${p.resultado}">${ROTULOS[p.resultado]}</div>
          <div class="batalla-titulo">${esc(p.mapa)}</div>
          <div class="batalla-meta">Partida ${partidas.length - i} · ${esc(p.modo)}</div>
          <div class="batalla-meta">${esc(fechaLarga(p.inicio))}, ${hora(p.inicio)} · ${duracion(p.minutos)}</div>
        </div>
      </div>
      <div class="batalla-bandos">
        <div>
          <h3>Clan</h3>
          <ul>${p.clan.map((j) => jugador(j, true)).join('')}${p.aliados.map((j) => jugador(j, false)).join('')}</ul>
        </div>
        ${p.rivales.length ? `<div><h3>Rivales</h3><ul>${p.rivales.map((j) => jugador(j, false)).join('')}</ul></div>` : ''}
      </div>
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
  const { campamento, miembros, partidas, actualizado } = datos;
  window.MIEMBROS = miembros;
  $('titulo').textContent = campamento.nombre;
  $('anio').textContent = campamento.anio;
  $('tag').textContent = campamento.clan.tag;
  document.title = `${campamento.nombre} ${campamento.anio}`;
  if (actualizado) $('actualizado').textContent = `Partidas actualizadas ${haceCuanto(actualizado)}.`;
  document.dispatchEvent(new Event('miembros-listos'));

  if (!partidas.length) {
    $('bajada').textContent = 'Todavía no se libró ninguna batalla.';
    for (const s of document.querySelectorAll('[data-partidas]')) s.hidden = true;
    return;
  }

  const st = calcular(miembros, partidas);
  const dias = new Set(partidas.map((p) => p.inicio.toDateString())).size;
  $('bajada').textContent = `${plural(partidas.length, 'batalla', 'batallas')} en ${plural(dias, 'jornada', 'jornadas')} · desde el ${partidas[0].inicio.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}`;
  $('nota-cronica').textContent = `Cuentan las partidas con al menos ${campamento.minimoClan} miembros del clan. La más reciente primero.`;

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
  pintarElo(partidas, st);
  pintarBatallas(partidas);

  let pendiente;
  window.addEventListener('resize', () => {
    clearTimeout(pendiente);
    pendiente = setTimeout(() => pintarElo(partidas, st), 150);
  });
}

iniciar();

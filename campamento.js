/* Estadísticas lúdicas: funciones puras, compartidas por la web y las pruebas. */
(function (root) {
  'use strict';
  const nombres = [
    'El Aldeano de Oro', 'El Cono de la Vergüenza', 'El Simulador de Granjas', 'El General de Cartón',
    'El Turista Imperial', 'El AFK del Año', 'El Judas', 'El Come TC', 'El Señor de las Ovejas', 'El Rey del Humo',
    'El Clásico', 'El Padre y el Hijo', 'La Maldición', 'El Verdugo', 'La Tabla de la Vergüenza',
    'El ELO del Campamento', 'La Bolsa de Valores', 'El Dream Team', 'La Pareja Tóxica', 'El Más Carreado',
    'El Cronista Medieval', 'El Tribunal de Guerra', 'La Conferencia de Prensa', 'El Roast Imperial',
    'La Profecía del Oráculo', 'El Diario del Aldeano', 'El Historiador Mentiroso', 'El Consejo de Guerra',
    'Los Juicios de la Inquisición', 'El Noticiero Imperial', 'El Momento Exacto del Desastre',
    'El Índice de Pecheo', 'El Índice de Carreo', 'El Economista Frustrado', 'El Pacifista', 'El Cementerio',
    'El Síndrome del Último Superviviente', 'El Fast Castle Más Lento', 'El Índice de Pánico', 'El Ejército de Desempleados',
  ];
  const historicos = new Set([6, 7, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 25, 30, 32, 33, 36, 38]);
  const CATALOGO = nombres.map((titulo, i) => ({ id: i + 1, titulo, ambito: historicos.has(i + 1) ? 'historia' : 'partida' }));
  const finito = x => typeof x === 'number' && Number.isFinite(x);
  const media = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  const sumar = xs => xs.reduce((a, b) => a + b, 0);
  const red = x => Math.round(x * 10) / 10;
  const porcentaje = x => `${Math.round(x * 100)}%`;
  const nombre = j => j.miembro?.nick || j.nick || j.nombre || `Jugador ${j.id}`;
  const medida = (j, campo) => j.detalle?.telemetria?.[campo];
  const dato = (j, campo) => j.detalle?.[campo];
  const seg = t => { const s = Math.round(t); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const fecha = p => new Date(p.inicio).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
  const ficha = (id, texto, metodo = '', tipo = 'Dato', extra = {}) => ({ ...CATALOGO[id - 1], texto, metodo, tipo, disponible: true, ...extra });
  const pendiente = (id, texto) => ({ ...CATALOGO[id - 1], disponible: false, texto, tipo: 'Sin datos suficientes', metodo: '' });
  const porMayor = (xs, valor) => [...xs].sort((a, b) => valor(b) - valor(a) || String(a.id).localeCompare(String(b.id)));
  const equipos = p => [...new Set(p.jugadores.map(j => j.equipo))];
  function decidida(p) {
    const es = equipos(p);
    if (es.length !== 2 || es.some(e => e == null)) return false;
    const bandos = es.map(e => p.jugadores.filter(j => j.equipo === e));
    return bandos.every(b => b.every(j => typeof j.gano === 'boolean' && j.gano === b[0].gano)) && bandos[0][0].gano !== bandos[1][0].gano;
  }
  function produccion(p) {
    if (!p.jugadores.length || !p.jugadores.every(j => dato(j, 'completa') !== false && finito(dato(j, 'tropas')) && finito(dato(j, 'aldeanos')))) return null;
    const tropas = sumar(p.jugadores.map(j => dato(j, 'tropas')));
    const aldeanos = sumar(p.jugadores.map(j => dato(j, 'aldeanos')));
    if (!tropas && !aldeanos) return null;
    return new Map(p.jugadores.map(j => [j.id, 100 * (0.6 * (tropas ? dato(j, 'tropas') / tropas : 0) + 0.4 * (aldeanos ? dato(j, 'aldeanos') / aldeanos : 0))]));
  }
  const METODO_PRODUCCION = 'Índice lúdico: 60% de la cuota de órdenes de tropas + 40% de la cuota de órdenes de aldeanos. Las colas pueden cancelarse; no mide bajas ni habilidad real. Requiere producción de todos y excluye grabaciones marcadas como interrumpidas.';
  function rendicionTemprana(p, j) {
    const t = dato(j, 'rendicion');
    return finito(t) && p.jugadores.some(a => a.id !== j.id && a.equipo === j.equipo && finito(dato(a, 'rendicion')) && dato(a, 'rendicion') >= t + 120);
  }
  // Las muestras son valores totales de ejército + economía en recursos, sincronizados por segundo.
  function curva(p) {
    if (!decidida(p)) return [];
    const muestras = p.jugadores.map(j => medida(j, 'muestras'));
    if (!muestras.every(m => Array.isArray(m) && m.length >= 2)) return [];
    const es = equipos(p);
    const indices = muestras.map(ms => new Map(ms.filter(m => finito(m.t) && finito(m.valor)).map(m => [m.t, m.valor])));
    return [...indices[0].keys()].sort((a, b) => a - b).filter(t => indices.every(m => m.has(t))).map(t => {
      const valores = es.map(e => sumar(p.jugadores.map((j, i) => j.equipo === e ? indices[i].get(t) : 0)));
      return { t, equipos: es, ventaja: valores[0] + valores[1] > 0 ? (valores[0] - valores[1]) / (valores[0] + valores[1]) : 0 };
    });
  }
  function desastre(p) {
    const cs = curva(p);
    if (cs.length < 3) return null;
    const ganador = p.jugadores.find(j => j.gano).equipo;
    const signo = cs[0].equipos[0] === ganador ? 1 : -1;
    // Primera ventaja >= 20% mantenida hasta el final; requiere al menos 120 s observados.
    return cs.find((m, i) => m.ventaja * signo >= 0.2 && cs.at(-1).t - m.t >= 120 && cs.slice(i).every(n => n.ventaja * signo >= 0.2)) || null;
  }
  function pecheo(p, equipo) {
    const cs = curva(p);
    if (cs.length < 3) return null;
    const signo = cs[0].equipos[0] === equipo ? 1 : -1;
    return cs.some((m, i) => m.ventaja * signo >= 0.2 && cs.slice(i + 1).some((n, k) => n.t - m.t >= 120 && cs.slice(i, i + k + 2).every(x => x.ventaja * signo >= 0.2)));
  }
  function historial(partidas, miembros) {
    const clan = new Set(miembros.map(m => m.id));
    const registros = new Map();
    const duelos = new Map();
    const parejas = new Map();
    const altas = new Map(miembros.map(m => [m.id, m]));
    const registro = j => {
      if (!registros.has(j.id)) registros.set(j.id, { id: j.id, nombre: altas.get(j.id)?.nick || nombre(j), clan: clan.has(j.id), pj: 0, g: 0, elo: 1000, ultimas: [], afk: [], judas: 0, carreo: [], carreado: 0, perdidas: [], castillos: [], pecheos: 0, ventajas: 0, evaluadas: 0, verdugos: new Map() });
      return registros.get(j.id);
    };
    miembros.forEach(registro);
    const ordenadas = [...new Map(partidas.map(p => [p.id, p])).values()].sort((a, b) => new Date(a.fin) - new Date(b.fin) || String(a.id).localeCompare(String(b.id)));
    for (const p of ordenadas) {
      p.jugadores.forEach(registro);
      if (!decidida(p)) continue;
      const es = equipos(p);
      const ratings = es.map(e => media(p.jugadores.filter(j => j.equipo === e).map(j => registro(j).elo)));
      const expectativa = e => 1 / (1 + 10 ** ((ratings[1 - es.indexOf(e)] - ratings[es.indexOf(e)]) / 400));
      const indice = produccion(p);
      for (const j of p.jugadores) {
        const r = registro(j);
        r.pj++; r.g += Number(j.gano);
        const delta = 32 * (Number(j.gano) - expectativa(j.equipo));
        r.elo += delta;
        r.ultimas.push({ gano: j.gano, delta, id: p.id });
        if (finito(dato(j, 'inactividadMaxima'))) r.afk.push(dato(j, 'inactividadMaxima'));
        if (rendicionTemprana(p, j)) r.judas++;
        if (finito(dato(j, 'castillos'))) r.castillos.push(dato(j, 'castillos'));
        if (finito(medida(j, 'unidadesPerdidas'))) r.perdidas.push(medida(j, 'unidadesPerdidas'));
        if (indice && j.gano) {
          const aliados = p.jugadores.filter(a => a.equipo === j.equipo);
          const total = sumar(aliados.map(a => indice.get(a.id)));
          if (total > 0 && aliados.length > 1) {
            const cuota = indice.get(j.id) / total;
            r.carreo.push(cuota);
            if (aliados.length > 1 && cuota < 0.5 / aliados.length) r.carreado++;
          }
        }
        const ventaja = pecheo(p, j.equipo);
        if (ventaja !== null) { r.evaluadas++; if (ventaja) { r.ventajas++; if (!j.gano) r.pecheos++; } }
        const verdugo = medida(j, 'eliminadoPor');
        if (p.jugadores.some(a => a.id === verdugo && a.equipo !== j.equipo)) r.verdugos.set(verdugo, (r.verdugos.get(verdugo) || 0) + 1);
        for (const rival of p.jugadores.filter(a => a.equipo !== j.equipo)) {
          const clave = `${j.id}/${rival.id}`;
          const duelo = duelos.get(clave) || { id: clave, a: r, b: registro(rival), n: 0, g: 0, racha: 0, minutos: 0, apm: [] };
          duelo.n++; duelo.g += Number(j.gano); duelo.racha = j.gano ? 0 : duelo.racha + 1;
          duelo.minutos += p.minutos || 0;
          if (finito(dato(j, 'eapm'))) duelo.apm.push(dato(j, 'eapm'));
          duelos.set(clave, duelo);
        }
      }
      const presentes = p.jugadores.filter(j => clan.has(j.id));
      for (let i = 0; i < presentes.length; i++) for (let k = i + 1; k < presentes.length; k++) {
        const a = presentes[i], b = presentes[k];
        if (a.equipo !== b.equipo) continue;
        const ids = [a.id, b.id].sort((x, y) => x - y);
        const clave = ids.join('/');
        const par = parejas.get(clave) || { id: clave, a: registros.get(ids[0]), b: registros.get(ids[1]), n: 0, g: 0 };
        par.n++; par.g += Number(a.gano); parejas.set(clave, par);
      }
    }
    return { registros, duelos: [...duelos.values()], parejas: [...parejas.values()], partidas: ordenadas, clan: [...registros.values()].filter(r => r.clan) };
  }
  function probabilidad(hist, equipoA, equipoB) {
    if (!equipoA.length || !equipoB.length || new Set([...equipoA, ...equipoB]).size !== equipoA.length + equipoB.length) return null;
    if (![...equipoA, ...equipoB].every(id => hist.registros.has(id))) return null;
    const rating = ids => media(ids.map(id => hist.registros.get(id).elo));
    return 1 / (1 + 10 ** ((rating(equipoB) - rating(equipoA)) / 400));
  }
  function historicas(h) {
    const salida = new Map();
    const poner = (id, texto, metodo, tipo = 'Histórico') => salida.set(id, ficha(id, texto, metodo, tipo));
    const jugados = h.clan.filter(r => r.pj);
    const ranking = (xs, valor, texto) => porMayor(xs, valor).map((r, i) => `${i + 1}. ${texto(r)}`).join('\n');
    if (jugados.length) {
      poner(15, ranking(jugados, r => 1 - r.g / r.pj, r => `${r.nombre}: ${r.pj - r.g} derrotas / ${r.pj} partidas (${porcentaje(1 - r.g / r.pj)}).`), 'Orden por porcentaje de derrotas; se muestra la muestra, incluso si es pequeña.');
      poner(16, ranking(jugados, r => r.elo, r => `${r.nombre}: ${Math.round(r.elo)} · ${r.pj} partidas.`), 'Todos empiezan en 1000, K = 32. Expectativa según ELO medio de cada equipo; se actualiza al finalizar cada partida. Solo dos bandos con resultado válido.');
      poner(17, ranking(jugados, r => 100 + sumar(r.ultimas.slice(-5).map(x => x.delta)), r => `${r.nombre}: $${red(100 + sumar(r.ultimas.slice(-5).map(x => x.delta)))} ficticios · últimas ${Math.min(5, r.pj)}.`), 'Cotización ficticia = 100 + suma de los cambios de ELO de las últimas cinco partidas. Sin dinero real.', 'Juego');
      poner(25, 'Armá dos equipos en el Oráculo para consultar su probabilidad antes de jugar.', 'Modelo ELO del campamento, sin ranking oficial. No considera mapa ni civilización y no está calibrado.', 'Estimación');
    }
    const afk = jugados.filter(r => r.afk.length);
    if (afk.length) poner(6, ranking(afk, r => Math.max(...r.afk), r => `${r.nombre}: ${seg(Math.max(...r.afk))} sin órdenes · ${r.afk.length}/${r.pj} grabaciones.`), 'Mayor intervalo sin acciones antes de rendirse. Es una aproximación: observar el mapa no genera órdenes.', 'Aproximación');
    const conRendiciones = h.partidas.some(p => p.jugadores.some(j => finito(dato(j, 'rendicion'))));
    if (conRendiciones) poner(7, ranking(jugados, r => r.judas, r => `${r.nombre}: ${r.judas} rendiciones anticipadas observadas.`), 'Cuenta rendiciones al menos 2 minutos antes que otro aliado que también se rindió. No demuestra abandono intencional.', 'Aproximación');
    const duelos = h.duelos.filter(d => d.a.clan);
    const unicos = duelos.filter(d => !d.b.clan || d.a.id < d.b.id);
    if (unicos.length) poner(11, ranking(unicos, d => d.n, d => `${d.a.nombre} vs ${d.b.nombre}: ${d.g}–${d.n - d.g} · ${d.n} cruces · ${Math.round(d.minutos / d.n)} min promedio${d.apm.length ? ` · ${Math.round(media(d.apm))} APM de ${d.a.nombre} (${d.apm.length} grabaciones)` : ''}.`), 'Victorias de cada bando cuando fueron rivales. No atribuye eliminaciones individuales.');
    const dominados = duelos.filter(d => d.n >= 3 && d.g / d.n >= 0.75);
    if (dominados.length) poner(12, ranking(dominados, d => d.g / d.n, d => `${d.a.nombre} domina a ${d.b.nombre}: ${d.g}–${d.n - d.g}.`), 'Al menos 3 cruces y 75% de victorias. Una muestra pequeña no demuestra superioridad permanente.');
    const malditos = duelos.filter(d => d.racha >= 3);
    if (malditos.length) poner(13, ranking(malditos, d => d.racha, d => `${d.a.nombre}: ${d.racha} derrotas seguidas contra ${d.b.nombre}.`), 'Cuenta solo los últimos cruces contra ese rival; jugar contra otro no corta la racha.');
    const ejecutados = jugados.filter(r => r.verdugos.size);
    if (ejecutados.length) poner(14, ejecutados.map(r => `${r.nombre}: ${[...r.verdugos].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${h.registros.get(id)?.nombre || id} (${n})`).join(', ')}.`).join('\n'), 'Eliminaciones atribuidas por telemetría verificada; ganar un equipo no identifica al verdugo.');
    const parejas = h.parejas.filter(p => p.n >= 3);
    if (parejas.length) poner(18, ranking(parejas, p => (p.g + 1) / (p.n + 2), p => `${p.a.nombre} + ${p.b.nombre}: ${p.g}/${p.n} victorias · estimación suavizada ${porcentaje((p.g + 1) / (p.n + 2))}.`), 'Mejores duplas observadas, mínimo 3 partidas. (Victorias + 1) / (partidas + 2) reduce el efecto de muestras pequeñas; no extrapola a equipos nunca probados.', 'Estimación');
    const toxicas = parejas.map(p => {
      const na = p.a.pj - p.n, nb = p.b.pj - p.n;
      const esperada = na >= 3 && nb >= 3 ? ((p.a.g - p.g) / na + (p.b.g - p.g) / nb) / 2 : null;
      return { ...p, esperada, caida: esperada == null ? null : esperada - p.g / p.n };
    }).filter(p => p.caida >= 0.2);
    if (toxicas.length) poner(19, ranking(toxicas, p => p.caida, p => `${p.a.nombre} + ${p.b.nombre}: ${porcentaje(p.g / p.n)} juntos (${p.n} partidas) vs ${porcentaje(p.esperada)} de referencia.`), 'Mínimo 3 juntos y 3 por separado cada uno. Caída de al menos 20 puntos respecto del promedio de sus victorias separados. Correlación, no causalidad.', 'Estimación');
    const carreo = jugados.filter(r => r.carreo.length);
    if (carreo.length) {
      poner(20, ranking(carreo, r => r.carreado, r => `${r.nombre}: ${r.carreado}/${r.carreo.length} victorias analizadas con cuota muy baja.`), 'Cuota de producción inferior a la mitad del reparto igualitario en victorias de equipo. ' + METODO_PRODUCCION, 'Aproximación');
      poner(33, ranking(carreo, r => media(r.carreo), r => `${r.nombre}: ${porcentaje(media(r.carreo))} de la producción ponderada de su equipo · ${r.carreo.length} victorias.`), METODO_PRODUCCION + ' Promedio de su cuota dentro del equipo en las victorias.', 'Aproximación');
    }
    const pechos = jugados.filter(r => r.evaluadas);
    if (pechos.length) poner(32, ranking(pechos, r => r.ventajas ? r.pecheos / r.ventajas : 0, r => `${r.nombre}: ${r.pecheos}/${r.ventajas} partidas perdidas después de una ventaja · ${r.evaluadas}/${r.pj} analizadas.`), 'Ventaja de equipo >= 20% del valor total de ejército + economía, sostenida 120 s en muestras sincronizadas. No significa victoria asegurada.', 'Estimación');
    const cementerio = jugados.filter(r => r.perdidas.length);
    if (cementerio.length) poner(36, ranking(cementerio, r => sumar(r.perdidas), r => `${r.nombre}: ${sumar(r.perdidas)} unidades perdidas · ${r.perdidas.length}/${r.pj} partidas con telemetría.`), 'Suma de pérdidas registradas, no de unidades enviadas a producir. Se indica la cobertura.');
    const castillos = jugados.filter(r => r.castillos.length);
    if (castillos.length) poner(38, ranking(castillos, r => Math.max(...r.castillos), r => `${r.nombre}: peor ${seg(Math.max(...r.castillos))} · promedio ${seg(media(r.castillos))} · ${r.castillos.length} avances.`), 'Tiempos en reloj de juego. Incluye todas las estrategias; no presupone que intentara Fast Castle.');
    const dias = new Map();
    for (const p of h.partidas) { const dia = fecha(p); if (!dias.has(dia)) dias.set(dia, []); dias.get(dia).push(p); }
    if (dias.size) poner(30, [...dias].reverse().map(([dia, ps]) => {
      const victorias = ps.filter(p => p.resultado === 'victoria').length;
      const derrotas = ps.filter(p => p.resultado === 'derrota').length;
      const internas = ps.filter(p => p.resultado === 'interna').length;
      return `${dia} — ¡Las tabernas exigen explicaciones! ${ps.length} batallas: ${victorias} victorias, ${derrotas} derrotas y ${internas} internas. ${Math.round(sumar(ps.map(p => p.minutos || 0)))} minutos de guerra. Escándalo editorial: nadie se responsabiliza por la vajilla del banquete.`;
    }).join('\n\n'), 'Resumen por fecha de Argentina. Estadísticas reales del historial cargado; titulares y escándalo son ficción humorística.', 'Noticiero · ficción');
    const requisitos = {
      6: 'Esperando grabaciones con intervalos entre órdenes.', 7: 'Esperando rendiciones observadas.',
      12: 'Nadie alcanzó 75% de victorias en al menos 3 cruces.', 13: 'No hay rachas de al menos 3 derrotas contra el mismo rival.',
      14: 'Falta telemetría que identifique al autor de cada eliminación.', 18: 'Se necesitan al menos 3 partidas de una misma dupla.',
      19: 'No hay una dupla con caída de 20 puntos y muestra suficiente (3 juntos y 3 separados por jugador).',
      20: 'Faltan victorias con producción completa de todos los jugadores.', 32: 'Faltan series de valor de ejército y economía.',
      33: 'Faltan victorias con producción completa de todos los jugadores.', 36: 'Falta el registro de unidades perdidas.',
      38: 'No hay avances a Castillos registrados.',
    };
    return CATALOGO.filter(c => c.ambito === 'historia').map(c => salida.get(c.id) || pendiente(c.id, requisitos[c.id] || 'Todavía no hay partidas suficientes.'));
  }
  function dePartida(p) {
    const salida = new Map();
    const js = p.jugadores || [];
    if (!js.length) return [];
    const poner = (id, texto, metodo, tipo = 'Dato') => salida.set(id, ficha(id, texto, metodo, tipo));
    const premio = (id, valor, texto, metodo, candidatos = js, tipo = 'Dato') => {
      const validos = candidatos.filter(j => finito(valor(j)));
      if (!validos.length) return;
      const max = Math.max(...validos.map(valor));
      const ganadores = validos.filter(j => valor(j) === max);
      poner(id, ganadores.map(j => texto(j, max)).join('\n'), `${metodo} Cobertura: ${validos.length}/${candidatos.length} jugadores elegibles. Los empates se comparten.`, tipo);
    };
    const indice = produccion(p);
    if (indice) {
      premio(1, j => indice.get(j.id), (j, v) => `${nombre(j)} se lleva el oro: ${red(v)} puntos de producción. El herrero pide una foto.`, METODO_PRODUCCION, js, 'Premio · aproximación');
      premio(2, j => -indice.get(j.id), (j, v) => `${nombre(j)} recibe el cono: ${red(-v)} puntos de producción. Se entrega con manual de instrucciones.`, METODO_PRODUCCION, js, 'Premio · aproximación');
    }
    premio(3, j => dato(j, 'aldeanos'), (j, v) => `${nombre(j)} ordenó ${v} aldeanos y perdió. La granja cotiza; el imperio, no.`, 'Órdenes de producción, no aldeanos realmente creados.', js.filter(j => j.gano === false), 'Premio');
    premio(4, j => medida(j, 'unidadesMilitaresPerdidas'), (j, v) => `${nombre(j)} perdió ${v} tropas sin bajas enemigas ni edificios destruidos registrados.`, 'Criterio conservador: cero bajas y cero edificios enemigos destruidos; no evalúa control del mapa.', js.filter(j => medida(j, 'bajas') === 0 && medida(j, 'edificiosDestruidos') === 0 && medida(j, 'unidadesMilitaresPerdidas') > 0), 'Premio');
    const giro = desastre(p);
    if (giro) {
      premio(5, j => dato(j, 'imperial'), (j, v) => `${nombre(j)} llegó a Imperial en ${seg(v)}, después de la ventaja sostenida detectada en ${seg(giro.t)}. El tour incluía ruinas.`, 'Usa el cambio de ventaja observado, no una certeza sobre cuándo se decidió la partida.', js.filter(j => dato(j, 'imperial') > giro.t), 'Aproximación');
      poner(31, `${seg(giro.t)}: primera muestra de ventaja sostenida del bando ganador. El escribano dejó caer la pluma.`, 'Estimación: diferencia >= 20% del valor total de ejército + economía, mantenida al menos 120 s hasta la última muestra. La resolución depende de la telemetría; no identifica un instante causal exacto.', 'Estimación');
    }
    premio(8, j => medida(j, 'centrosUrbanosPerdidos'), (j, v) => `${nombre(j)} perdió ${v} centros urbanos. Mudanza sin depósito de garantía.`, 'Centros urbanos destruidos registrados, no construidos.', js.filter(j => medida(j, 'centrosUrbanosPerdidos') > 0), 'Premio');
    premio(9, j => medida(j, 'ovejasRobadas'), (j, v) => `${nombre(j)} robó ${v} ovejas. El rebaño exige abogado.`, 'Cambios de propiedad desde un rival, excluyendo ovejas neutrales.', js.filter(j => medida(j, 'ovejasRobadas') > 0), 'Premio');
    premio(10, j => dato(j, 'eapm'), (j, v) => `${nombre(j)}: ${v} APM, cero bajas y cero edificios enemigos destruidos. Mucha oficina, poca conquista.`, 'APM de órdenes y resultados militares registrados. No mide apoyo, exploración ni sacrificios útiles.', js.filter(j => medida(j, 'bajas') === 0 && medida(j, 'edificiosDestruidos') === 0), 'Premio');
    premio(34, j => medida(j, 'recursosSinGastar'), (j, v) => `${nombre(j)} terminó con ${v} recursos sin gastar. La tesorería sobrevivió mejor que el plan.`, 'Suma de comida, madera, oro y piedra al final; no demuestra que fueran desperdiciados.');
    if (finito(p.segundosDeJuego) && p.segundosDeJuego > 0) {
      premio(35, j => (dato(j, 'primeraTropa') ?? p.segundosDeJuego) / p.segundosDeJuego, (j, v) => `${nombre(j)} pasó ${porcentaje(v)} de la partida sin ordenar su primera tropa.`, 'Mide primera orden militar, no ausencia de ejército: puede haber unidades iniciales o colas canceladas.', js.filter(j => dato(j, 'accionesVersion') >= 3 && (dato(j, 'primeraTropa') === null || (finito(dato(j, 'primeraTropa')) && dato(j, 'primeraTropa') <= p.segundosDeJuego))), 'Aproximación');
      premio(37, j => {
        const aliados = js.filter(a => a.id !== j.id && a.equipo === j.equipo);
        if (!aliados.length || !aliados.every(a => finito(dato(a, 'rendicion')))) return null;
        const ultima = Math.max(...aliados.map(a => dato(a, 'rendicion')));
        const hasta = dato(j, 'rendicion') ?? p.segundosDeJuego;
        return hasta > ultima ? hasta - ultima : null;
      }, (j, v) => `${nombre(j)} resistió ${seg(v)} después de la última rendición de sus aliados. Cerró el castillo y apagó las luces.`, 'Desde la última rendición aliada hasta la propia o el final de la grabación. No incluye eliminaciones sin rendición.', js, 'Aproximación');
    }
    premio(39, j => {
      const ms = medida(j, 'muestras');
      if (!Array.isArray(ms)) return null;
      const saltos = [...ms].sort((a, b) => a.t - b.t).flatMap((m, i, orden) => i && m.bajoAtaque === true && finito(m.apm) && finito(orden[i - 1].apm) && orden[i - 1].apm > 0 ? [m.apm / orden[i - 1].apm - 1] : []);
      return saltos.length && Math.max(...saltos) >= 0.5 ? Math.max(...saltos) : null;
    }, (j, v) => `${nombre(j)} aumentó sus APM ${porcentaje(v)} bajo ataque. El teclado pidió refuerzos.`, 'Mayor salto >= 50% frente a la muestra anterior, mientras la telemetría marca ataque. Correlación, no lectura de emociones.', js, 'Estimación');
    premio(40, j => {
      const inactivos = medida(j, 'militaresInactivosSegundos'), total = medida(j, 'militaresSegundos');
      return finito(inactivos) && finito(total) && total > 0 && inactivos <= total ? inactivos / total : null;
    }, (j, v) => `${nombre(j)}: ${porcentaje(v)} de tiempo militar inactivo. La formación se convirtió en asamblea.`, 'Suma de segundos inactivos de cada unidad / suma de segundos de vida de todas las unidades militares. Estar quieto defendiendo también cuenta.');
    const ganadores = js.filter(j => j.gano === true).map(nombre).join(', ') || 'sin ganador confirmado';
    const perdedores = js.filter(j => j.gano === false);
    const todos = js.map(nombre).join(', ');
    const protagonista = indice ? porMayor(js, j => indice.get(j.id))[0] : js[0];
    const acusado = indice && perdedores.length ? [...perdedores].sort((a, b) => indice.get(a.id) - indice.get(b.id))[0] : null;
    const evidencia = j => `${nombre(j)}: ${finito(dato(j, 'aldeanos')) ? `${dato(j, 'aldeanos')} órdenes de aldeanos` : 'sin dato de aldeanos'}, ${finito(dato(j, 'tropas')) ? `${dato(j, 'tropas')} órdenes de tropas` : 'sin dato de tropas'}; ${j.gano === true ? 'victoria' : j.gano === false ? 'derrota' : 'resultado desconocido'}`;
    const cargos = js.flatMap(j => {
      const aliados = js.filter(a => a.equipo === j.equipo);
      const textos = [];
      if (indice && aliados.length > 1) {
        const mediaTropas = media(aliados.map(a => dato(a, 'tropas')));
        const mediaAldeanos = media(aliados.map(a => dato(a, 'aldeanos')));
        if (mediaTropas > 0 && dato(j, 'tropas') < mediaTropas / 2) textos.push(`${nombre(j)} — cargo de negligencia militar: ${dato(j, 'tropas')} órdenes de tropas, frente a ${red(mediaTropas)} de promedio en su equipo.`);
        if (mediaAldeanos > 0 && dato(j, 'aldeanos') < mediaAldeanos / 2) textos.push(`${nombre(j)} — cargo de abandono económico: ${dato(j, 'aldeanos')} órdenes de aldeanos, frente a ${red(mediaAldeanos)} de promedio en su equipo.`);
      }
      if (rendicionTemprana(p, j)) textos.push(`${nombre(j)} — cargo teatral de traición: se rindió en ${seg(dato(j, 'rendicion'))}, al menos dos minutos antes que otro aliado que también se rindió.`);
      return textos;
    });
    const narraciones = {
      21: p.cronica?.relato ? `${p.cronica.titulo || 'Crónica de batalla'}\n${p.cronica.relato}` : `En ${p.mapa}, ${todos} desplegaron sus estandartes. El registro reconoce al bando de ${ganadores}. El escribano consigna ${finito(p.segundosDeJuego) ? seg(p.segundosDeJuego) + ' de reloj de juego' : 'una batalla cuya grabación todavía espera en el archivo'}. La taberna ya discute la versión oficial.`,
      22: acusado ? `El juez señala a ${nombre(acusado)} como acusado de utilería. Prueba: ${evidencia(acusado)}; ${red(indice.get(acusado.id))} puntos, la menor cuota de producción del bando derrotado. Veredicto humorístico: lavar los platos. Estos datos no permiten atribuir la causa real de la derrota.` : 'El tribunal se declara incompetente: no hay derrota con datos de producción comparables para sostener una acusación. El juez igual factura la audiencia.',
      23: js.map(j => `Periodista: «${nombre(j)}, ¿su balance?»\nRespuesta ficticia: «${j.gano ? 'El plan era ganar, así que claramente había un plan.' : 'Fue una inversión a largo plazo en experiencia.'}»\nRegistro: ${evidencia(j)}.`).join('\n\n'),
      24: js.map(j => `${evidencia(j)}. ${j.gano ? 'Ganó y ya está ensayando una charla de estrategia de tres horas.' : 'Su imperio presentó quiebra; el departamento de excusas sigue contratando.'}`).join('\n\n'),
      26: `Querido diario: hoy trabajé para ${nombre(protagonista)} en ${p.mapa}. ${finito(dato(protagonista, 'aldeanos')) ? `El registro marca ${dato(protagonista, 'aldeanos')} órdenes de aldeanos: el jefe llamó a eso "familia".` : 'No dejaron el registro de contratación, pero sí la lista de obligaciones.'} ${protagonista.gano ? 'Ganamos. Supongo que mañana también trabajo.' : 'Perdimos. La pala, por supuesto, no tenía seguro.'}`,
      27: equipos(p).map(e => {
        const bando = js.filter(j => j.equipo === e);
        return `Propaganda del bando de ${bando.map(nombre).join(', ')}: «${bando[0].gano ? 'Nuestra gloria eclipsó al sol. El rival vino exclusivamente a admirarnos.' : 'La retirada fue una victoria filosófica. Cedimos el mapa para no desgastarlo.'}»\nRegistro real: ${bando[0].gano ? 'victoria' : 'derrota'}.`;
      }).join('\n\n'),
      28: `General: «Mi candidato es ${nombre(protagonista)}${indice ? ', por encabezar el índice de producción' : ', pero faltan estadísticas para justificarlo'}.»\nTesorera: «${evidencia(protagonista)}. Producir no basta para medir calidad.»\nBufón: «Que gane quien pague el asado.»\nEl consejo es ficticio y no reemplaza un análisis militar.`,
      29: `${cargos.length ? cargos.join('\n\n') : 'No hay acusaciones con evidencia suficiente.'}\n\nCargos ficticios, no culpabilidad probada: producir menos o rendirse antes no demuestra negligencia ni intención. La Inquisición ordena revisar el contexto antes de dictar sentencia.`,
    };
    for (const [clave, texto] of Object.entries(narraciones)) {
      const id = Number(clave);
      const generado = p.cronica?.funciones?.[clave];
      const valido = typeof generado === 'string' && generado.trim();
      poner(id, valido ? generado : texto, id === 21 && p.cronica?.relato ? 'Crónica generada por Claude a partir de la grabación.' : 'Personajes, declaraciones y juicios son ficción humorística. Las cifras provienen del registro; los indicadores no prueban culpabilidad.', valido || (id === 21 && p.cronica?.relato) ? 'Narrativa IA' : 'Ficción · relato local');
    }
    return [...salida.values()];
  }
  function sortear(candidatas, random = Math.random) {
    const bolsa = [...new Map(candidatas.filter(c => c.disponible && c.ambito === 'partida').map(c => [c.id, c])).values()];
    for (let i = bolsa.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
      [bolsa[i], bolsa[j]] = [bolsa[j], bolsa[i]];
    }
    return bolsa.slice(0, 3);
  }
  const api = { CATALOGO, historial, historicas, dePartida, sortear, probabilidad, produccion, decidida, curva, desastre, pecheo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Campamento = api;
})(globalThis);

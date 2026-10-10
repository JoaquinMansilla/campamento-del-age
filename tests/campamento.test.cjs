const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../campamento.js');
const miembros = [1, 2, 3, 4].map(id => ({ id, nick: `J${id}` }));
const jugador = (id, equipo, gano, extra = {}) => ({ id, nombre: `J${id}`, equipo, gano, detalle: { tropas: 10, aldeanos: 20, eapm: 30, ...extra } });
const partida = (id = 1, jugadores = [jugador(1, 1, true), jugador(2, 1, true), jugador(3, 2, false), jugador(4, 2, false)]) => ({ id, jugadores, mapa: 'Arabia', resultado: 'interna', minutos: 30, segundosDeJuego: 1800, inicio: new Date(2026, 9, 10, id), fin: new Date(2026, 9, 10, id, 30) });

test('40 funciones, separadas en 18 históricas y 22 por partida', () => {
  assert.equal(C.CATALOGO.length, 40);
  assert.equal(new Set(C.CATALOGO.map(c => c.id)).size, 40);
  assert.equal(C.CATALOGO.filter(c => c.ambito === 'historia').length, 18);
  assert.equal(C.CATALOGO.filter(c => c.ambito === 'partida').length, 22);
});
test('sorteo sin repetición, exactamente tres y nunca funciones históricas', () => {
  const candidatas = [...C.dePartida(partida()), ...C.historicas(C.historial([partida()], miembros))];
  const vistos = new Set();
  let semilla = 12345;
  const random = () => ((semilla = (1664525 * semilla + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 300; i++) {
    const tres = C.sortear(candidatas, random);
    assert.equal(tres.length, 3);
    assert.equal(new Set(tres.map(c => c.id)).size, 3);
    tres.forEach(c => { assert.equal(c.ambito, 'partida'); vistos.add(c.id); });
  }
  assert.equal(vistos.size, candidatas.filter(c => c.ambito === 'partida').length);
  assert.deepEqual(C.sortear([]), []);
});
test('sin grabación conserva tres relatos y no inventa premios ni métricas', () => {
  const p = partida(); p.jugadores.forEach(j => { j.detalle = null; }); p.segundosDeJuego = null;
  const cartas = C.dePartida(p);
  assert.equal(C.sortear(cartas).length, 3);
  assert.ok(cartas.every(c => [21, 22, 23, 24, 26, 27, 28, 29].includes(c.id)));
  assert.ok(!JSON.stringify(cartas).includes('undefined'));
  assert.ok(!JSON.stringify(cartas).includes('NaN'));
});
test('los empates comparten premio; datos parciales no dan MVP', () => {
  const p = partida();
  assert.ok(C.dePartida(p).find(c => c.id === 1).texto.includes('J4'));
  p.jugadores[0].detalle.completa = false;
  assert.equal(C.produccion(p), null);
  assert.ok(!C.dePartida(p).some(c => c.id === 1 || c.id === 2));
});
test('ELO simultáneo por equipo, orden por fin y sin contar partidas duplicadas', () => {
  const p = partida();
  const h = C.historial([p, p], miembros);
  assert.equal(h.registros.get(1).elo, 1016);
  assert.equal(h.registros.get(2).elo, 1016);
  assert.equal(h.registros.get(3).elo, 984);
  assert.equal(h.registros.get(1).pj, 1);
  const p2 = partida(2);
  const a = C.historial([p, p2], miembros), b = C.historial([p2, p], miembros);
  assert.equal(a.registros.get(1).elo, b.registros.get(1).elo);
  assert.ok(a.registros.get(1).elo > 1030 && a.registros.get(1).elo < 1032);
});
test('Oráculo valida equipos y no usa el ranking oficial', () => {
  const h = C.historial([], miembros);
  assert.equal(C.probabilidad(h, [1, 2], [3, 4]), 0.5);
  assert.equal(C.probabilidad(h, [1], [1]), null);
  assert.equal(C.probabilidad(h, [], [1]), null);
  assert.equal(C.probabilidad(h, [99], [1]), null);
  assert.ok(C.probabilidad(C.historial([partida()], miembros), [1, 2], [3, 4]) > 0.5);
});
test('rivalidades cuentan oponentes, no aliados; maldición se corta al ganar', () => {
  const ps = [1, 2, 3].map(n => partida(n));
  const h = C.historial(ps, miembros);
  assert.ok(!h.duelos.some(d => d.a.id === 1 && d.b.id === 2));
  assert.equal(h.duelos.find(d => d.a.id === 3 && d.b.id === 1).racha, 3);
  assert.ok(C.historicas(h).find(c => c.id === 13).disponible);
  const revancha = partida(4); revancha.jugadores.forEach(j => { j.gano = !j.gano; });
  assert.equal(C.historial([...ps, revancha], miembros).duelos.find(d => d.a.id === 3 && d.b.id === 1).racha, 0);
});
test('resultados inconsistentes o más de dos bandos no alteran los ratings', () => {
  const p = partida(); p.jugadores[1].gano = false;
  assert.equal(C.decidida(p), false);
  assert.equal(C.historial([p], miembros).registros.get(1).elo, 1000);
  p.jugadores[1].equipo = 3;
  assert.equal(C.decidida(p), false);
});
test('duplas exigen muestra y carreo se calcula dentro del equipo', () => {
  const p = partida(); p.jugadores[0].detalle.tropas = 90; p.jugadores[0].detalle.aldeanos = 180;
  const h = C.historial([p], miembros);
  assert.ok(h.registros.get(1).carreo[0] > 0.89);
  assert.equal(h.registros.get(2).carreado, 1);
  assert.equal(C.historicas(h).find(c => c.id === 18).disponible, false);
  assert.equal(C.historicas(C.historial([1, 2, 3].map(n => partida(n)), miembros)).find(c => c.id === 18).disponible, true);
});
test('telemetría faltante no se convierte en cero ni una rendición identifica verdugo', () => {
  const p = partida(); p.jugadores[2].detalle.rendicion = 1000;
  const h = C.historial([p], miembros);
  for (const id of [14, 32, 36]) assert.equal(C.historicas(h).find(c => c.id === id).disponible, false);
  for (const id of [4, 8, 9, 10, 31, 34, 39, 40]) assert.ok(!C.dePartida(p).some(c => c.id === id));
  p.jugadores[0].detalle.telemetria = { unidadesPerdidas: 0 };
  assert.equal(C.historicas(C.historial([p], miembros)).find(c => c.id === 36).disponible, true);
});
test('datos completos habilitan los 22 tipos por partida, sin contaminar la selección', () => {
  const p = partida();
  p.jugadores.forEach((j, i) => {
    j.detalle = { ...j.detalle, imperial: 1600, accionesVersion: 3, primeraTropa: 400, rendicion: 1400 + i * 100,
      telemetria: { unidadesMilitaresPerdidas: 30, bajas: 0, edificiosDestruidos: 0, centrosUrbanosPerdidos: 2,
        ovejasRobadas: 3, recursosSinGastar: 1000, militaresInactivosSegundos: 100, militaresSegundos: 500,
        muestras: [0, 900, 1200, 1500, 1800].map(t => ({ t, valor: t < 900 ? 100 : j.gano ? 400 : 100, apm: t < 900 ? 20 : 50, bajoAtaque: t === 900 })) } };
  });
  const cartas = C.dePartida(p);
  const esperadas = C.CATALOGO.filter(c => c.ambito === 'partida').map(c => c.id).sort((a, b) => a - b);
  assert.deepEqual(cartas.map(c => c.id).sort((a, b) => a - b), esperadas);
  assert.equal(C.desastre(p).t, 900);
  assert.ok(cartas.find(c => c.id === 39).texto.includes('150%'));
  assert.ok(cartas.find(c => c.id === 40).texto.includes('20%'));
});
test('ventaja sostenida perdida computa pecheo; curvas incompletas no lo imputan', () => {
  const p = partida();
  p.jugadores.forEach(j => { j.detalle.telemetria = { muestras: [0, 120, 240, 600].map(t => ({ t, valor: !j.gano && t < 600 ? 400 : 100 })) }; });
  assert.equal(C.pecheo(p, 2), true);
  const r = C.historial([p], miembros).registros.get(3);
  assert.equal(r.ventajas, 1); assert.equal(r.pecheos, 1);
  delete p.jugadores[0].detalle.telemetria;
  assert.equal(C.pecheo(p, 2), null);
});
test('lecturas y sorteos no mutan las partidas ni confunden propaganda con resultado', () => {
  const p = partida();
  const antes = JSON.stringify(p);
  C.historial([p], miembros); C.sortear(C.dePartida(p));
  assert.equal(JSON.stringify(p), antes);
  const propaganda = C.dePartida(p).find(c => c.id === 27);
  assert.ok(propaganda.texto.includes('Registro real: victoria'));
  assert.ok(propaganda.texto.includes('Registro real: derrota'));
});

test('las 18 funciones históricas se activan con evidencia, incluida pareja tóxica y verdugo', () => {
  const derrotas = [1, 2, 3].map(id => {
    const p = partida(id); p.jugadores.forEach(j => {
      j.gano = !j.gano;
      j.detalle = { ...j.detalle, inactividadMaxima: 120, castillos: 1400, rendicion: j.id === 1 ? 100 : 500,
        telemetria: { unidadesPerdidas: 10, ...(j.id === 1 ? { eliminadoPor: 3 } : {}),
          muestras: [0, 120, 240, 600].map(t => ({ t, valor: j.equipo === 1 && t < 600 ? 400 : 100 })) } };
    }); return p;
  });
  const separadas = [4, 5, 6].flatMap(id => [
    partida(id, [jugador(1, 1, true, { tropas: 1, aldeanos: 1 }), jugador(3, 1, true), jugador(4, 2, false)]),
    partida(id + 3, [jugador(2, 1, true), jugador(3, 1, true), jugador(4, 2, false)]),
  ]);
  const h = C.historial([...derrotas, ...separadas], miembros);
  const cartas = C.historicas(h);
  assert.equal(cartas.length, 18);
  assert.deepEqual(cartas.filter(c => !c.disponible).map(c => c.id), []);
  assert.ok(cartas.find(c => c.id === 19).texto.includes('0% juntos'));
  assert.ok(cartas.find(c => c.id === 19).texto.includes('100% de referencia'));
  assert.equal(h.registros.get(1).verdugos.get(3), 3);
  assert.equal(h.registros.get(1).pecheos, 3);
  assert.equal(h.registros.get(1).judas, 3);
});

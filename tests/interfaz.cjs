/* Prueba opcional de navegador: requiere Playwright y servidor local; nunca escribe en Supabase. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8765';
const jugadores = [1, 2, 3, 4].map(id => ({ id, nombre: `Jugador ${id}`, equipo: id < 3 ? 1 : 2, gano: id < 3, civ: 'Mayas' }));
const configCampamento = { nombre: 'Prueba del campamento', anio: 2026, minimoClan: 2, clan: { tag: '[T]', miembros: jugadores.map(j => ({ id: j.id, nick: j.nombre })) } };
const fila = (id, detalle = null) => ({ id, datos: { id, inicio: `2026-10-10T0${id}:00:00Z`, fin: `2026-10-10T0${id}:30:00Z`, mapa: 'Arabia', modo: '2 vs 2', jugadores }, detalle, cronica: null });
const detalle = { segundosDeJuego: 1800, jugadores: Object.fromEntries(jugadores.map(j => [j.id, { eapm: 0, tropas: 10, aldeanos: 20, castillos: 1200 }])), chat: [] };
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 950 } });
    const errores = []; page.on('pageerror', e => errores.push(e.message));
    let filas = [fila(1, detalle), fila(2)];
    await page.route('**/campamento.json', route => route.fulfill({ json: configCampamento }));
    await page.route('**/rest/v1/**', route => {
      assert.equal(route.request().method(), 'GET', 'No se debe escribir en la base');
      return route.fulfill({ json: route.request().url().includes('/partidas?') ? filas : [] });
    });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.locator('.funcion-partida').first().waitFor();
    assert.deepEqual(await page.locator('.batalla').evaluateAll(xs => xs.map(x => x.querySelectorAll('.funcion-partida').length)), [3, 3]);
    const ids = () => page.locator('.funcion-partida').evaluateAll(xs => xs.map(x => x.dataset.funcion));
    const antes = await ids();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.deepEqual(await ids(), antes, 'Cambiar tamaño no vuelve a sortear');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Sin scroll horizontal de página');
    await page.locator('[data-sortear]').first().click();
    const seleccion = await page.locator('.funciones-batalla').first().locator('[data-funcion]').evaluateAll(xs => xs.map(x => x.dataset.funcion));
    assert.equal(seleccion.length, 3); assert.equal(new Set(seleccion).size, 3);
    assert.ok(!(await page.locator('#grafico-apm').innerHTML()).includes('NaN'), 'APM cero tiene escala válida');
    await page.locator('summary').filter({ hasText: 'La Profecía del Oráculo' }).click();
    await page.locator('[data-oraculo-id="1"]').selectOption('A');
    await page.locator('[data-oraculo-id="3"]').selectOption('B');
    assert.match(await page.locator('#oraculo-resultado').textContent(), /Equipo A: \d+% · Equipo B: \d+%/);
    assert.match(await page.locator('#oraculo-resultado').textContent(), /Poca evidencia/);
    filas = [fila(1)];
    filas[0].cronica = { funciones: { 21: '<img src=x onerror="window.inyeccion=true">', 23: '<script>window.inyeccion=true</script>' } };
    filas[0].datos.jugadores = jugadores.map(j => ({ ...j, nombre: '<svg onload="window.inyeccion=true">' }));
    await page.reload({ waitUntil: 'networkidle' });
    for (let i = 0; i < 12; i++) await page.locator('[data-sortear]').click();
    assert.equal(await page.evaluate(() => window.inyeccion), undefined);
    assert.equal(await page.locator('.funcion img, .funcion script, .funcion svg').count(), 0);
    assert.equal(await page.locator('#panel-apm').isVisible(), false, 'Sin APM se oculta el gráfico');
    filas = [];
    await page.reload({ waitUntil: 'networkidle' });
    assert.match(await page.locator('#bajada').textContent(), /Todavía no/);
    assert.equal(await page.locator('.funcion-partida').count(), 0);
    assert.deepEqual(errores, []);
    console.log('Interfaz verificada: tres tarjetas, sorteo, móvil, Oráculo, datos vacíos, APM cero y escape de contenido.');
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });

// Trae las partidas del clan desde el backend de World's Edge (el que usa el juego) y las guarda en data/partidas.json.
// Referencia de la API: https://github.com/ustacode/aoe2-apis
//
//   node scripts/sincronizar.mjs             sincroniza las partidas del campamento
//   node scripts/sincronizar.mjs --catalogo  además reconstruye data/catalogo.json con todo el historial disponible
import { readFile, writeFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';

const RAIZ = new URL('../', import.meta.url);
const WORLDS_EDGE = 'https://aoe-api.worldsedgelink.com/community/leaderboard';
const COMPANION = 'https://data.aoe2companion.com/api';
const CABECERAS = { 'User-Agent': 'campamento-del-age (https://github.com/JoaquinMansilla/campamento-del-age)' };
const MODOS = { 0: 'Sala personalizada', 6: '1 vs 1', 7: 'Equipos 2 vs 2', 8: 'Equipos 3 vs 3', 9: 'Equipos 4 vs 4' };

const leer = async (ruta, porDefecto) => {
  try { return JSON.parse(await readFile(new URL(ruta, RAIZ), 'utf8')); } catch { return porDefecto; }
};
const escribir = (ruta, datos) => writeFile(new URL(ruta, RAIZ), `${JSON.stringify(datos, null, 1)}\n`);

async function pedir(url) {
  const res = await fetch(url, { headers: CABECERAS, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res.json();
}

// El campo `mapname` de World's Edge no es confiable en partidas igualadas: el mapa real es la clave 10 de `options`
function idDeMapa(options) {
  try {
    const externo = inflateSync(Buffer.from(options, 'base64')).toString().replace(/"/g, '');
    const m = Buffer.from(externo, 'base64').toString('latin1').match(/[^\d]10:(\d+)/);
    return m ? m[1] : null;
  } catch { return null; }
}

// World's Edge solo da ids numéricos. Los nombres en español y las imágenes se aprenden cruzando
// las mismas partidas con aoe2companion, y quedan guardados en data/catalogo.json.
async function aprender(catalogo, partidas, ids, paginas) {
  const porId = new Map(partidas.map((p) => [p.id, p]));
  for (let pagina = 1; pagina <= paginas; pagina++) {
    const { matches } = await pedir(`${COMPANION}/matches?profile_ids=${ids.join(',')}&per_page=200&page=${pagina}&language=es`);
    for (const m of matches) {
      const cruda = porId.get(m.matchId);
      if (!cruda) continue;
      const mapa = idDeMapa(cruda.options);
      if (mapa && m.mapName) catalogo.mapas[mapa] = { nombre: m.mapName, img: m.mapImageUrl };
      for (const j of m.teams.flatMap((t) => t.players)) {
        const fila = cruda.matchhistoryreportresults.find((r) => r.profile_id === j.profileId);
        if (fila && j.civName) catalogo.civs[fila.civilization_id] = { nombre: j.civName, img: j.civImageUrl };
      }
    }
    if (matches.length < 200) break;
  }
}

function normalizar(cruda, alias, catalogo) {
  const mapaId = idDeMapa(cruda.options);
  const mapa = catalogo.mapas[mapaId];
  return {
    id: cruda.id,
    inicio: new Date(cruda.startgametime * 1000).toISOString(),
    fin: new Date(cruda.completiontime * 1000).toISOString(),
    modo: MODOS[cruda.matchtype_id] || 'Otro modo',
    mapa: mapa ? mapa.nombre : cruda.mapname.replace(/\.rms$/, ''),
    mapaImg: mapa ? mapa.img : null,
    jugadores: cruda.matchhistoryreportresults.map((r) => {
      const miembro = cruda.matchhistorymember.find((x) => x.profile_id === r.profile_id) || {};
      const civ = catalogo.civs[r.civilization_id];
      return {
        id: r.profile_id,
        nombre: alias.get(r.profile_id) || `Jugador ${r.profile_id}`,
        equipo: r.teamid,
        gano: r.resulttype === 1,
        civ: civ ? civ.nombre : `Civilización ${r.civilization_id}`,
        civImg: civ ? civ.img : null,
        rating: miembro.newrating ?? null,
        diff: miembro.newrating != null && miembro.oldrating != null ? miembro.newrating - miembro.oldrating : null,
      };
    }).sort((a, b) => a.equipo - b.equipo),
  };
}

const campamento = await leer('campamento.json');
const catalogo = await leer('data/catalogo.json', { civs: {}, mapas: {} });
const guardado = await leer('data/partidas.json', { partidas: [] });
const ids = campamento.clan.miembros.map((m) => m.id);
const clan = new Set(ids);

const respuesta = await pedir(`${WORLDS_EDGE}/getRecentMatchHistory?title=age2&profile_ids=${encodeURIComponent(JSON.stringify(ids))}`);
if (respuesta.result.code !== 0) throw new Error(`World's Edge respondió ${respuesta.result.message}`);

// La respuesta repite cada partida una vez por cada miembro del clan que la jugó
const crudas = [...new Map(respuesta.matchHistoryStats.map((p) => [p.id, p])).values()];
const alias = new Map(respuesta.profiles.map((p) => [p.profile_id, p.alias]));

const desde = Date.parse(campamento.desde) / 1000;
const hasta = campamento.hasta ? Date.parse(campamento.hasta) / 1000 : Infinity;
const delCampamento = crudas.filter((p) =>
  p.completiontime && p.startgametime >= desde && p.startgametime <= hasta &&
  p.matchhistoryreportresults.filter((r) => clan.has(r.profile_id)).length >= campamento.minimoClan);

const reconstruir = process.argv.includes('--catalogo');
const faltaAlgo = delCampamento.some((p) =>
  !catalogo.mapas[idDeMapa(p.options)] || p.matchhistoryreportresults.some((r) => !catalogo.civs[r.civilization_id]));
if (reconstruir || faltaAlgo) {
  try {
    await aprender(catalogo, reconstruir ? crudas : delCampamento, ids, reconstruir ? 8 : 1);
    await escribir('data/catalogo.json', catalogo);
  } catch (err) {
    console.warn(`No se pudo actualizar el catálogo: ${err.message}`);
  }
}

// Se conservan las partidas ya guardadas: World's Edge solo devuelve el historial reciente
const todas = new Map(guardado.partidas.map((p) => [p.id, p]));
for (const p of delCampamento) todas.set(p.id, normalizar(p, alias, catalogo));
const partidas = [...todas.values()].sort((a, b) => a.inicio.localeCompare(b.inicio));

const nombres = Object.fromEntries(ids.map((id) => [id, alias.get(id) || null]));
const cambio = JSON.stringify([guardado.partidas, guardado.nombres]) !== JSON.stringify([partidas, nombres]);
if (cambio) await escribir('data/partidas.json', { actualizado: new Date().toISOString(), nombres, partidas });
console.log(`${partidas.length} partidas del campamento (${cambio ? 'con cambios' : 'sin cambios'}).`);

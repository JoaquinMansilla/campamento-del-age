// Acceso a datos: todo vive en Supabase. Las partidas las escribe scripts/sincronizar.mjs;
// las comidas y actividades se cargan desde el sitio.
const MOMENTOS = ['desayuno', 'almuerzo', 'merienda', 'cena'];

const hayBase = () => Boolean(window.CONFIG && CONFIG.supabaseUrl && CONFIG.supabaseAnonKey && window.supabase);

let cliente;
function base() {
  if (!cliente) cliente = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
  return cliente;
}

async function consultar(consulta) {
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return data;
}

async function leerJson(ruta) {
  const res = await fetch(ruta, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status} al leer ${ruta}`);
  return res.json();
}

async function cargarPartidas() {
  if (!hayBase()) throw new Error('falta configurar Supabase en config.js');
  const [campamento, filas] = await Promise.all([
    leerJson('campamento.json'),
    consultar(base().from('partidas').select('datos, detalle, cronica').order('inicio')),
  ]);
  const miembros = campamento.clan.miembros.map((m, orden) => ({ ...m, orden }));
  const porId = new Map(miembros.map((m) => [m.id, m]));

  const partidas = filas.map(({ datos, detalle, cronica }) => {
    // El detalle (APM, edades, producción) sale de la grabación y puede no estar todavía
    const p = { ...datos, jugadores: datos.jugadores.map((j) => ({ ...j, detalle: detalle?.jugadores?.[j.id] || null })) };
    const clan = p.jugadores.filter((j) => porId.has(j.id)).map((j) => ({ ...j, miembro: porId.get(j.id) }));
    const equipos = new Set(clan.map((j) => j.equipo));
    // Si hay miembros del clan en los dos bandos, la partida no cuenta para el récord del clan
    const resultado = equipos.size > 1 ? 'interna' : clan[0].gano ? 'victoria' : 'derrota';
    const equipoClan = equipos.size > 1 ? null : clan[0].equipo;
    return {
      ...p,
      inicio: new Date(p.inicio),
      fin: new Date(p.fin),
      minutos: (Date.parse(p.fin) - Date.parse(p.inicio)) / 60000,
      clan,
      aliados: p.jugadores.filter((j) => !porId.has(j.id) && j.equipo === equipoClan),
      rivales: p.jugadores.filter((j) => !porId.has(j.id) && j.equipo !== equipoClan),
      resultado,
      tieneDetalle: Boolean(detalle),
      cronica,
      chat: detalle?.chat || [],
    };
  });
  return { campamento, miembros, partidas };
}

async function cargarCampamento() {
  if (!hayBase()) return { comidas: [], actividades: [] };
  const [comidas, actividades] = await Promise.all([
    consultar(base().from('comidas').select('*').order('fecha').order('id')),
    consultar(base().from('actividades').select('*').order('fecha').order('id')),
  ]);
  return { comidas, actividades };
}

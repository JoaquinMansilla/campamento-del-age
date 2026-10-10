// Acceso a datos compartido por el dashboard y la página de carga.
const MOMENTOS = ['desayuno', 'almuerzo', 'merienda', 'cena'];

const hayBase = () => Boolean(window.CONFIG && CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);

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

// Devuelve { ejemplo, partidas, comidas, actividades } con la misma forma venga de Supabase o del JSON de ejemplo
async function cargarDatos() {
  if (!hayBase()) {
    const res = await fetch('data/ejemplo.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ...(await res.json()), ejemplo: true };
  }
  const [partidas, comidas, actividades] = await Promise.all([
    consultar(base().from('partidas').select('*, partida_jugadores(jugador, civ, equipo)').order('fecha').order('id')),
    consultar(base().from('comidas').select('*').order('fecha').order('id')),
    consultar(base().from('actividades').select('*').order('fecha').order('id')),
  ]);
  return {
    ejemplo: false,
    partidas: partidas.map((p) => ({
      id: p.id,
      fecha: p.fecha,
      mapa: p.mapa,
      duracionMin: p.duracion_min,
      ganador: p.equipo_ganador,
      jugadores: p.partida_jugadores.map((j) => ({ nombre: j.jugador, civ: j.civ, equipo: j.equipo })),
    })),
    comidas,
    actividades,
  };
}

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lista = (texto) => texto.split(',').map((s) => s.trim()).filter(Boolean);
const TABLAS = { partida: 'partidas', comida: 'comidas', actividad: 'actividades' };

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mensaje(id, texto, ok) {
  const el = $(id);
  el.textContent = texto;
  el.className = `mensaje ${ok ? 'ok' : 'mal'}`;
}

function sumarJugador(equipo) {
  const fila = document.createElement('div');
  fila.className = 'fila-jugador';
  fila.innerHTML = `
    <input name="jugador" list="lista-jugadores" placeholder="Jugador" required aria-label="Jugador">
    <input name="civ" list="lista-civs" placeholder="Civilización" required aria-label="Civilización">
    <input name="equipo" type="number" min="1" value="${equipo}" required aria-label="Equipo" title="Equipo">
    <button type="button" class="chico" aria-label="Quitar jugador">✕</button>`;
  fila.querySelector('button').onclick = () => fila.remove();
  $('jugadores').append(fila);
}

function reiniciarPartida() {
  $('jugadores').innerHTML = '';
  sumarJugador(1);
  sumarJugador(2);
}

// Guarda con el botón deshabilitado y muestra el resultado en el mensaje del formulario
function alEnviar(tipo, guardar) {
  const form = $(`form-${tipo}`);
  form.fecha.value = hoy();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const boton = form.querySelector('button.primario');
    boton.disabled = true;
    try {
      await guardar(form);
      const fecha = form.fecha.value;
      form.reset();
      form.fecha.value = fecha;
      if (tipo === 'partida') reiniciarPartida();
      mensaje(`msj-${tipo}`, 'Guardado.', true);
      await refrescar();
    } catch (err) {
      mensaje(`msj-${tipo}`, `No se pudo guardar: ${err.message}`, false);
    }
    boton.disabled = false;
  };
}

async function guardarPartida(form) {
  const jugadores = [...$('jugadores').children].map((f) => ({
    jugador: f.querySelector('[name=jugador]').value.trim(),
    civ: f.querySelector('[name=civ]').value.trim(),
    equipo: Number(f.querySelector('[name=equipo]').value),
  }));
  const ganador = Number(form.ganador.value);
  if (jugadores.length < 2) throw new Error('hacen falta al menos dos jugadores');
  if (new Set(jugadores.map((j) => j.jugador)).size !== jugadores.length) throw new Error('hay un jugador repetido');
  if (!jugadores.some((j) => j.equipo === ganador)) throw new Error(`ningún jugador está en el equipo ${ganador}`);
  if (jugadores.every((j) => j.equipo === ganador)) throw new Error('todos los jugadores están en el equipo ganador');

  const [partida] = await consultar(base().from('partidas').insert({
    fecha: form.fecha.value,
    mapa: form.mapa.value.trim(),
    duracion_min: form.duracion.value ? Number(form.duracion.value) : null,
    equipo_ganador: ganador,
  }).select());
  try {
    await consultar(base().from('partida_jugadores').insert(jugadores.map((j) => ({ ...j, partida_id: partida.id }))));
  } catch (err) {
    // No dejar una partida sin jugadores si falla la segunda escritura
    await base().from('partidas').delete().eq('id', partida.id);
    throw err;
  }
}

const guardarComida = (form) => consultar(base().from('comidas').insert({
  fecha: form.fecha.value,
  momento: form.momento.value,
  plato: form.plato.value.trim(),
  cocineros: lista(form.cocineros.value),
}));

const guardarActividad = (form) => consultar(base().from('actividades').insert({
  fecha: form.fecha.value,
  nombre: form.nombre.value.trim(),
  descripcion: form.descripcion.value.trim() || null,
  participantes: lista(form.participantes.value),
}));

function opciones(id, valores) {
  $(id).innerHTML = [...new Set(valores)].sort((a, b) => a.localeCompare(b)).map((v) => `<option value="${esc(v)}">`).join('');
}

async function refrescar() {
  const d = await cargarDatos();
  const jugadores = d.partidas.flatMap((p) => p.jugadores);
  opciones('lista-jugadores', jugadores.map((j) => j.nombre));
  opciones('lista-civs', jugadores.map((j) => j.civ));
  opciones('lista-mapas', d.partidas.map((p) => p.mapa));

  const cargas = [
    ...d.partidas.map((p) => ({ tipo: 'partida', id: p.id, fecha: p.fecha, creado: p.id,
      texto: `${p.mapa} · ${p.jugadores.map((j) => j.nombre).join(', ')}` })),
    ...d.comidas.map((c) => ({ tipo: 'comida', id: c.id, fecha: c.fecha, creado: c.id, texto: `${c.momento}: ${c.plato}` })),
    ...d.actividades.map((a) => ({ tipo: 'actividad', id: a.id, fecha: a.fecha, creado: a.id, texto: a.nombre })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado - a.creado).slice(0, 30);

  $('tabla-cargas').innerHTML = cargas.length ? `
    <thead><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th><th></th></tr></thead>
    <tbody>${cargas.map((c) => `<tr>
      <td>${esc(c.fecha)}</td>
      <td class="capital">${c.tipo}</td>
      <td class="largo">${esc(c.texto)}</td>
      <td class="num"><button class="chico" data-tipo="${c.tipo}" data-id="${c.id}">Borrar</button></td>
    </tr>`).join('')}</tbody>` : '<tbody><tr><td class="vacio">Todavía no hay nada cargado.</td></tr></tbody>';
}

$('tabla-cargas').onclick = async (e) => {
  const b = e.target.closest('button[data-id]');
  if (!b || !confirm(`¿Borrar esta ${b.dataset.tipo}?`)) return;
  b.disabled = true;
  try {
    await consultar(base().from(TABLAS[b.dataset.tipo]).delete().eq('id', b.dataset.id));
    await refrescar();
  } catch (err) {
    alert(`No se pudo borrar: ${err.message}`);
    b.disabled = false;
  }
};

function mostrarSesion(sesion) {
  $('seccion-login').hidden = Boolean(sesion);
  $('seccion-carga').hidden = !sesion;
  if (sesion) {
    $('sesion').textContent = `Sesión de ${sesion.user.email}`;
    refrescar().catch((err) => alert(`No se pudieron leer los datos: ${err.message}`));
  }
}

function iniciar() {
  if (!hayBase()) { $('sin-base').hidden = false; return; }

  $('form-login').onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await base().auth.signInWithPassword({ email: e.target.email.value, password: e.target.clave.value });
    mensaje('msj-login', error ? 'Email o contraseña incorrectos.' : '', false);
  };
  $('salir').onclick = () => base().auth.signOut();
  $('sumar-jugador').onclick = () => sumarJugador(1);

  reiniciarPartida();
  alEnviar('partida', guardarPartida);
  alEnviar('comida', guardarComida);
  alEnviar('actividad', guardarActividad);

  // setTimeout: no llamar a Supabase dentro del callback de auth (se bloquea)
  base().auth.onAuthStateChange((_evento, sesion) => setTimeout(() => mostrarSesion(sesion), 0));
}

iniciar();

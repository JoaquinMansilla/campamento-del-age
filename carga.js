// Comidas y actividades: listado para todos, carga rápida para quien inició sesión.
let sesion = null;
let campamentoDatos = { comidas: [], actividades: [] };

const lista = (texto) => texto.split(',').map((s) => s.trim()).filter(Boolean);

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function momentoAhora() {
  const h = new Date().getHours();
  return h < 11 ? 'desayuno' : h < 16 ? 'almuerzo' : h < 20 ? 'merienda' : 'cena';
}

function botonBorrar(tabla, id) {
  return sesion ? `<button class="borrar" data-tabla="${tabla}" data-id="${id}" aria-label="Borrar">✕</button>` : '';
}

// Agrupa por día, del más reciente al más antiguo
function porDia(items, pintarItem, vacio) {
  if (!items.length) return `<li class="vacio">${vacio}</li>`;
  const dias = new Map();
  for (const it of [...items].sort((a, b) => b.fecha.localeCompare(a.fecha))) {
    if (!dias.has(it.fecha)) dias.set(it.fecha, []);
    dias.get(it.fecha).push(it);
  }
  return [...dias].map(([fecha, grupo]) =>
    `<li class="lista-dia">${esc(fechaLarga(fecha))}</li>${grupo.map(pintarItem).join('')}`).join('');
}

function pintarCampamento() {
  const comidas = [...campamentoDatos.comidas].sort((a, b) => MOMENTOS.indexOf(a.momento) - MOMENTOS.indexOf(b.momento));
  $('lista-comidas').innerHTML = porDia(comidas, (c) => `
    <li class="lista-item">
      <span class="lista-momento">${esc(c.momento)}</span>
      <span class="lista-texto"><b>${esc(c.plato)}</b>${(c.cocineros || []).length ? ` · cocinó ${esc(c.cocineros.join(', '))}` : ''}</span>
      ${botonBorrar('comidas', c.id)}
    </li>`, 'Todavía no hay comidas cargadas.');
  $('lista-actividades').innerHTML = porDia(campamentoDatos.actividades, (a) => `
    <li class="lista-item">
      <span class="lista-texto"><b>${esc(a.nombre)}</b>${a.descripcion ? ` · ${esc(a.descripcion)}` : ''}${(a.participantes || []).length ? ` · ${esc(a.participantes.join(', '))}` : ''}</span>
      ${botonBorrar('actividades', a.id)}
    </li>`, 'Todavía no hay actividades cargadas.');
}

async function refrescarCampamento() {
  try {
    campamentoDatos = await cargarCampamento();
  } catch (err) {
    $('lista-comidas').innerHTML = `<li class="vacio">No se pudieron leer las comidas (${esc(err.message)}).</li>`;
    return;
  }
  pintarCampamento();
}

function pintarChips(form, marcados) {
  form.querySelector('[data-chips]').innerHTML = (window.MIEMBROS || []).map((m) => `
    <label class="chip"><input type="checkbox" value="${esc(m.nick)}" ${marcados ? 'checked' : ''}><span>${esc(m.nick)}</span></label>`).join('');
}

function prepararFormulario(id, todosMarcados, armarFila, tabla) {
  const form = $(id);
  const reiniciar = () => {
    form.reset();
    form.fecha.value = hoy();
    if (form.momento) form.momento.value = momentoAhora();
    pintarChips(form, todosMarcados);
  };
  reiniciar();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const boton = form.querySelector('button');
    const msj = form.querySelector('[data-mensaje]');
    const elegidos = [...form.querySelectorAll('[data-chips] input:checked')].map((c) => c.value);
    boton.disabled = true;
    try {
      await consultar(base().from(tabla).insert(armarFila(form, elegidos)));
      reiniciar();
      msj.className = 'mensaje ok';
      msj.textContent = 'Guardado.';
      await refrescarCampamento();
    } catch (err) {
      msj.className = 'mensaje mal';
      msj.textContent = `No se pudo guardar: ${err.message}`;
    }
    boton.disabled = false;
  };
}

function mostrarSesion(nueva) {
  sesion = nueva;
  $('acceso-cerrado').hidden = Boolean(sesion);
  $('acceso-abierto').hidden = !sesion;
  $('form-comida').hidden = !sesion;
  $('form-actividad').hidden = !sesion;
  if (sesion) $('sesion').textContent = `Sesión de ${sesion.user.email}`;
  pintarCampamento();
}

function iniciarCarga() {
  refrescarCampamento();
  if (!hayBase()) { $('acceso').hidden = true; return; }

  prepararFormulario('form-comida', false, (f, cocineros) => ({
    fecha: f.fecha.value, momento: f.momento.value, plato: f.plato.value.trim(), cocineros,
  }), 'comidas');
  prepararFormulario('form-actividad', true, (f, participantes) => ({
    fecha: f.fecha.value, nombre: f.nombre.value.trim(), participantes,
  }), 'actividades');

  $('abrir-login').onclick = () => { $('abrir-login').hidden = true; $('form-login').hidden = false; $('form-login').email.focus(); };
  $('form-login').onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await base().auth.signInWithPassword({ email: e.target.email.value, password: e.target.clave.value });
    $('msj-login').textContent = error ? 'Email o contraseña incorrectos.' : '';
  };
  $('salir').onclick = () => base().auth.signOut();

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('button.borrar');
    if (!b || !confirm('¿Borrar este registro?')) return;
    b.disabled = true;
    try {
      await consultar(base().from(b.dataset.tabla).delete().eq('id', b.dataset.id));
      await refrescarCampamento();
    } catch (err) {
      alert(`No se pudo borrar: ${err.message}`);
      b.disabled = false;
    }
  });

  // Los chips dependen de la lista de miembros, que llega con las partidas
  document.addEventListener('miembros-listos', () => {
    pintarChips($('form-comida'), false);
    pintarChips($('form-actividad'), true);
  });

  // setTimeout: no llamar a Supabase dentro del callback de auth (se bloquea)
  base().auth.onAuthStateChange((_evento, nueva) => setTimeout(() => mostrarSesion(nueva), 0));
}

iniciarCarga();

# Campamento del Age 2026

Dashboard del Campamento del Age 2026 del clan [LW]: partidas de Age of Empires II: Definitive Edition, comidas y actividades.

Sitio: <https://joaquinmansilla.github.io/campamento-del-age/>

Sin build ni dependencias: HTML, CSS y JavaScript plano, publicado con GitHub Pages.

## Partidas (automáticas)

Las partidas no se cargan a mano. Durante el campamento, una rutina programada en una PC ([`scripts/rutina.sh`](scripts/rutina.sh), por cron cada 10 minutos) hace tres pasos:

1. **Sincronizar** ([`scripts/sincronizar.mjs`](scripts/sincronizar.mjs)): pide el historial reciente de los miembros del clan al backend de World's Edge, el mismo que usa el juego (ver [ustacode/aoe2-apis](https://github.com/ustacode/aoe2-apis)), se queda con las partidas terminadas del campamento con al menos `minimoClan` miembros y las guarda en la tabla `partidas` de Supabase.
2. **Leer las grabaciones** ([`scripts/grabaciones.py`](scripts/grabaciones.py)): baja de aoe.ms la grabación de cada jugador y saca APM, tiempos de subida de edad, aldeanos y tropas creados, edificios, rendiciones y el chat (incluido el de los rivales, si su grabación está disponible). Lo guarda en la columna `detalle`.
3. **Escribir la crónica** ([`scripts/cronicas.py`](scripts/cronicas.py)): le pasa el detalle a Claude (CLI `claude`, sin herramientas) y guarda el relato en la columna `cronica`.

El sitio lee todo de Supabase, así que las novedades aparecen sin republicar nada. Fuera de las fechas de `campamento.json` la rutina no hace nada.

Los puntajes del juego (militar, economía, tecnología, sociedad) no están en ninguna API ni en la grabación, por eso no se muestran.

### Instalar la rutina en una PC

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
mkdir -p ~/.config/campamento-del-age   # y guardar ahí el token de escritura en el archivo `token`
(crontab -l; echo "*/10 * * * * $PWD/scripts/rutina.sh") | crontab -
```

Hace falta `node`, y la CLI `claude` con sesión iniciada. El registro queda en `logs/`.

El token de escritura es un valor aleatorio; en la base solo se guarda su hash, en `privado.claves`. Para cambiarlo:

```bash
openssl rand -hex 32 > ~/.config/campamento-del-age/token && chmod 600 ~/.config/campamento-del-age/token
tr -d '\n' < ~/.config/campamento-del-age/token | sha256sum   # pegar el hash en: update privado.claves set hash = '...' where nombre = 'sincronizador';
```

El workflow [`sincronizar.yml`](.github/workflows/sincronizar.yml) quedó como respaldo manual (pasos 1 y 2, sin crónicas) y usa el mismo token desde el secreto `SYNC_TOKEN`.

World's Edge solo devuelve ids numéricos de civilización y mapa. Los nombres en español y las imágenes salen de [`data/catalogo.json`](data/catalogo.json), que se arma cruzando las mismas partidas con aoe2companion. Si aparece una civilización o un mapa nuevo, el script lo aprende solo; para reconstruirlo entero: `node scripts/sincronizar.mjs --catalogo`.

## Configuración del campamento

Todo está en [`campamento.json`](campamento.json):

- `desde` / `hasta`: fechas del campamento (`hasta: null` lo deja abierto).
- `minimoClan`: cuántos miembros del clan tienen que estar en una partida para que cuente.
- `clan.miembros`: `id` es el profile id del juego y `nick` el nombre que se muestra.

## Comidas y actividades

Viven también en Supabase (tablas `comidas` y `actividades`, ver [`supabase/esquema.sql`](supabase/esquema.sql)). Cualquiera las ve; para cargar hay que ingresar con un usuario creado en Supabase (**Authentication → Users**), desde el botón que está al pie del sitio. La carga es en la misma página: se escribe el plato o la actividad, se tocan los nombres y listo.

La URL y la anon key del proyecto están en [`config.js`](config.js). La anon key es pública por diseño: la escritura está limitada por RLS a usuarios logueados, así que conviene tener desactivado el registro de usuarios nuevos en Supabase.

## Verlo en local

```bash
python3 -m http.server 8000
```

y abrir <http://localhost:8000>.

# Campamento del Age 2026

Dashboard del Campamento del Age 2026 del clan [LW]: partidas de Age of Empires II: Definitive Edition, comidas y actividades.

Sitio: <https://joaquinmansilla.github.io/campamento-del-age/>

Sin build ni dependencias: HTML, CSS y JavaScript plano, publicado con GitHub Pages.

## Partidas (automáticas)

Las partidas no se cargan a mano. Cada 10 minutos, el workflow [`sincronizar.yml`](.github/workflows/sincronizar.yml) corre [`scripts/sincronizar.mjs`](scripts/sincronizar.mjs), que:

1. Pide el historial reciente de los miembros del clan al backend de World's Edge, el mismo que usa el juego (ver [ustacode/aoe2-apis](https://github.com/ustacode/aoe2-apis)). No necesita clave.
2. Se queda con las partidas terminadas desde el inicio del campamento en las que jugaron al menos `minimoClan` miembros.
3. Las guarda en [`data/partidas.json`](data/partidas.json) y hace commit si hay cambios. GitHub Pages republica el sitio.

Ese backend no permite llamadas desde el navegador (no envía CORS), por eso la sincronización corre en GitHub Actions y no en la página.

World's Edge solo devuelve ids numéricos de civilización y mapa. Los nombres en español y las imágenes salen de [`data/catalogo.json`](data/catalogo.json), que se arma cruzando las mismas partidas con aoe2companion. Si aparece una civilización o un mapa nuevo, el script lo aprende solo; para reconstruir todo el catálogo:

```bash
node scripts/sincronizar.mjs --catalogo
```

Para forzar una sincronización: pestaña **Actions → Sincronizar partidas → Run workflow**, o `gh workflow run sincronizar.yml`.

## Configuración del campamento

Todo está en [`campamento.json`](campamento.json):

- `desde` / `hasta`: fechas del campamento (`hasta: null` lo deja abierto).
- `minimoClan`: cuántos miembros del clan tienen que estar en una partida para que cuente.
- `clan.miembros`: `id` es el profile id del juego y `nick` el nombre que se muestra.

## Comidas y actividades

Viven en Supabase (tablas `comidas` y `actividades`, ver [`supabase/esquema.sql`](supabase/esquema.sql)). Cualquiera las ve; para cargar hay que ingresar con un usuario creado en Supabase (**Authentication → Users**), desde el botón que está al pie del sitio. La carga es en la misma página: se escribe el plato o la actividad, se tocan los nombres y listo.

La URL y la anon key del proyecto están en [`config.js`](config.js). La anon key es pública por diseño: la escritura está limitada por RLS a usuarios logueados, así que conviene tener desactivado el registro de usuarios nuevos en Supabase.

Las tablas `partidas` y `partida_jugadores` del esquema quedaron de la primera versión y ya no se usan.

## Verlo en local

```bash
python3 -m http.server 8000
```

y abrir <http://localhost:8000>.

# Campamento del Age

Dashboard estático con las estadísticas de las partidas de Age of Empires del Campamento del Age.

Sin build ni dependencias: HTML, CSS y JavaScript plano, publicado con GitHub Pages.

## Cómo funciona

- `index.html`: el dashboard (posiciones, victorias acumuladas, civilizaciones, mapas, historial, comidas y actividades).
- `cargar.html`: formularios para cargar partidas, comidas y actividades. Pide login.
- Los datos viven en Supabase. Mientras `config.js` esté vacío, el dashboard muestra `data/ejemplo.json`.

## Conectar Supabase

1. Crear un proyecto en <https://supabase.com>.
2. En **SQL Editor**, pegar y ejecutar [`supabase/esquema.sql`](supabase/esquema.sql).
3. En **Authentication → Users**, crear un usuario (email y contraseña) por cada persona que vaya a cargar datos.
4. En **Authentication → Sign In / Providers**, desactivar *Allow new users to sign up*. Cualquier usuario logueado puede escribir, así que nadie tiene que poder registrarse solo.
5. Copiar la *Project URL* y la *anon public key* (**Project Settings → API**) en [`config.js`](config.js) y hacer push.

La anon key es pública por diseño: la lectura es abierta y la escritura está limitada por RLS a usuarios logueados.

## Tablas

| Tabla | Qué guarda |
|---|---|
| `partidas` | fecha, mapa, duración y equipo ganador |
| `partida_jugadores` | jugador, civilización y equipo en cada partida |
| `comidas` | fecha, momento (desayuno, almuerzo, merienda, cena), plato y cocineros |
| `actividades` | fecha, nombre, detalle y participantes |

Los nombres de jugadores, civilizaciones y mapas tienen que escribirse siempre igual (el formulario los autocompleta).

Al hacer push a `main`, GitHub Pages actualiza el sitio en uno o dos minutos.

## Verlo en local

```bash
python3 -m http.server 8000
```

y abrir <http://localhost:8000>.

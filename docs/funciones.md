# Funciones del campamento

## Separación y disponibilidad

El catálogo de `campamento.js` define las 40 funciones. Hay 18 históricas y 22 por
partida. Solo las funciones por partida entran al sorteo, que baraja sin reemplazo
y toma tres. Las ocho narrativas locales proporcionan alternativas aun sin grabación.
El histórico se calcula al finalizar las partidas, sin duplicar ids; no se incluye
una partida con resultados contradictorios o más de dos bandos en ELO y rivalidades.
El Oráculo usa el ELO disponible en el momento de consultar, para una partida futura.
No pretende reconstruir una predicción anterior usando resultados posteriores.

Un contador desconocido se omite. Un cero solo significa un cero observado. Los
premios indican cuántos jugadores tienen datos, y comparten los empates.
Las aproximaciones y relatos inventados están rotulados en cada tarjeta.

## Matriz de las 40 ideas

| Nº | Función | Ubicación | Datos y criterio |
|---|---|---|---|
| 1 | Aldeano de Oro | Partida | Máximo índice lúdico de producción, no MVP oficial. |
| 2 | Cono de la Vergüenza | Partida | Mínimo del mismo índice; no prueba habilidad. |
| 3 | Simulador de Granjas | Partida | Más órdenes de aldeanos entre quienes perdieron. |
| 4 | General de Cartón | Partida | Telemetría: pérdidas militares con cero bajas y edificios enemigos destruidos. |
| 5 | Turista Imperial | Partida | Edad Imperial posterior al cambio de ventaja estimado; requiere series de telemetría. |
| 6 | AFK del Año | Histórico | Mayor intervalo sin órdenes por jugador, lector v3. Observar el mapa no genera órdenes. |
| 7 | Judas | Histórico | Rendiciones al menos 120 s antes que otro aliado que también se rindió; no prueba traición. |
| 8 | Come TC | Partida | Telemetría: centros urbanos perdidos. |
| 9 | Señor de las Ovejas | Partida | Telemetría: ovejas tomadas a un rival, excluye neutrales. |
| 10 | Rey del Humo | Partida | Mayor APM entre jugadores con cero bajas y edificios enemigos destruidos. Telemetría. |
| 11 | Clásico | Histórico | Cara a cara por bandos, récord, duración y APM cuando hay grabación. Incluye rivales externos. |
| 12 | Padre y el Hijo | Histórico | Al menos 3 cruces y 75% de victorias. |
| 13 | Maldición | Histórico | Al menos 3 derrotas seguidas contra el mismo rival; otros cruces no cortan la racha. |
| 14 | Verdugo | Histórico | Telemetría: autor de la eliminación, no se infiere de la victoria del equipo. |
| 15 | Tabla de la Vergüenza | Histórico | Porcentaje de derrotas con tamaño de muestra. |
| 16 | ELO del Campamento | Histórico | Inicio 1000, K=32, expectativa por ELO medio de equipos; actualización simultánea al finalizar. |
| 17 | Bolsa de Valores | Histórico | 100 + suma de cambios de ELO de las últimas 5 partidas. Dinero ficticio. |
| 18 | Dream Team | Histórico | Duplas observadas, mínimo 3 partidas; orden por (victorias+1)/(partidas+2). |
| 19 | Pareja Tóxica | Histórico | Caída >=20 puntos porcentuales respecto del promedio por separado; 3 juntos y 3 separados cada uno. |
| 20 | Más Carreado | Histórico | Victorias en equipo con cuota de producción menor a la mitad del reparto igualitario. |
| 21 | Cronista Medieval | Partida | Crónica de Claude existente/nueva; relato local identificado si no hay. |
| 22 | Tribunal de Guerra | Partida | Acusado teatral con menor producción relativa en una derrota; evidencia y límites explícitos. |
| 23 | Conferencia de Prensa | Partida | Entrevistas ficticias para todos los jugadores. |
| 24 | Roast Imperial | Partida | Humor sobre el registro de cada jugador. |
| 25 | Profecía del Oráculo | Sección general | Selector de dos equipos y probabilidad ELO antes de jugar; avisa muestra pequeña o equipos desiguales. |
| 26 | Diario del Aldeano | Partida | Perspectiva ficticia de un aldeano. |
| 27 | Historiador Mentiroso | Partida | Propaganda de cada bando, indicando por separado el resultado real. |
| 28 | Consejo de Guerra | Partida | General, tesorera y bufón comparan un candidato con las cifras conocidas. |
| 29 | Juicios de la Inquisición | Partida | Cargos ficticios por producción <50% del promedio aliado o rendición anticipada, con pruebas y límites. |
| 30 | Noticiero Imperial | Histórico | Resumen de cada día en horario argentino; cifras reales y titulares ficticios. |
| 31 | Momento Exacto del Desastre | Partida | Estimación por series sincronizadas; no afirma conocer un instante causal exacto. Telemetría. |
| 32 | Índice de Pecheo | Histórico | Derrotas tras ventaja sostenida / partidas con ventaja; cobertura explícita. Telemetría. |
| 33 | Índice de Carreo | Histórico | Cuota media de producción ponderada del equipo en victorias de equipo. |
| 34 | Economista Frustrado | Partida | Telemetría: suma de recursos al final. No prueba desperdicio. |
| 35 | Pacifista | Partida | Tiempo hasta la primera orden militar / duración de juego, lector v3. No ignora unidades iniciales: mide órdenes. |
| 36 | Cementerio | Histórico | Suma de unidades perdidas con cobertura por jugador. Telemetría. |
| 37 | Último Superviviente | Partida | Tiempo entre última rendición aliada y propia/final. Solo aliados con rendición observada. |
| 38 | Fast Castle Más Lento | Histórico | Peor tiempo y promedio a Castillos; no supone que intentara esa estrategia. |
| 39 | Índice de Pánico | Partida | Salto de APM >=50% en una muestra bajo ataque; correlación, no emoción observada. Telemetría. |
| 40 | Ejército de Desempleados | Partida | Tiempo militar inactivo / tiempo militar de vida, sumando todas las unidades. Telemetría. |

El índice de producción es `100 × (0.6 × tropas/totalTropas + 0.4 × aldeanos/totalAldeanos)`.
Se basa en órdenes que pueden cancelarse, no unidades completadas, bajas o puntajes del juego.
Exige datos de todos los jugadores y excluye lecturas marcadas como interrumpidas.
La cuota de carreo divide ese índice por la suma del equipo y solo incluye victorias
de equipos de más de un jugador. Comparar composiciones o roles distintos puede ser injusto:
son premios humorísticos, no evaluaciones competitivas.

## Telemetría que falta en la fuente actual

**Las funciones 4, 5, 8, 9, 10, 14, 31, 32, 34, 36, 39 y 40 no se activan automáticamente
con el lector actual de órdenes.** Hay cálculos, validación e importación, pero no un
proveedor automático de estados/eventos de juego. Para activarlas se necesita una
exportación verificada que produzca las siguientes métricas. No se inventan por IA.

`python scripts/telemetria.py archivo.json` consulta la partida y valida sin escribir.
Agregar `--guardar` y disponer de `SYNC_TOKEN` guarda mediante el RPC existente.
Reemplaza la telemetría de los jugadores incluidos; conserva órdenes y otros jugadores.
No ejecutar importación y reprocesamiento de esa partida simultáneamente: ambos guardan
el documento `detalle` completo. El lector conserva la telemetría importada al reprocesar.

Ejemplo de estructura (datos de ejemplo, no corresponde a una partida real):

```json
{
  "partidaId": 123,
  "fuente": "Exportación de estados verificada, versión y origen",
  "jugadores": {
    "101": {
      "unidadesPerdidas": 42,
      "unidadesMilitaresPerdidas": 30,
      "bajas": 12,
      "edificiosDestruidos": 1,
      "centrosUrbanosPerdidos": 2,
      "ovejasRobadas": 3,
      "recursosSinGastar": 1250,
      "eliminadoPor": 102,
      "militaresInactivosSegundos": 500,
      "militaresSegundos": 2000,
      "muestras": [
        {"t": 60, "valor": 1000, "apm": 20, "bajoAtaque": false},
        {"t": 120, "valor": 800, "apm": 40, "bajoAtaque": true}
      ]
    }
  }
}
```

- `jugadores` usa profile ids existentes en la partida. `eliminadoPor` es un profile id
  rival numérico, no un número de ranura. Todas las métricas son opcionales; omitir las
  desconocidas. Conteos enteros, números finitos no negativos, cero solo observado.
- `recursosSinGastar` suma comida, madera, oro y piedra en el estado final.
- Los segundos militares son **unidad-segundos**: diez unidades vivas durante diez
  segundos suman cien. Inactivos <= total; no equivale al tiempo sin hacer clic.
- `muestras.t` usa segundos del reloj de juego, ordenados y sin duplicados. `valor` es
  valor económico + militar bajo una misma valoración en recursos para todos. Para
  comparar bandos deben existir muestras sincronizadas de todos los jugadores.
- Se busca una diferencia de al menos 20% del valor combinado, observada durante
  al menos 120 s. El desastre es la primera muestra que conserva esa ventaja hasta
  la última muestra para el bando ganador. La precisión depende de la frecuencia y
  cobertura de muestras; no prueba que la partida estuviera decidida.
- APM debe usar ventanas comparables; `bajoAtaque` es un estado observado, no inferido
  de subir APM. El pánico compara con la muestra anterior y evita dividir por cero.
- Se rechazan ids ajenos, métricas desconocidas, tiempos fuera de duración conocida,
  valores negativos/no finitos y proporciones imposibles.

## Narrativas y despliegue

`cronicas.funciones` contiene las claves `21,22,23,24,26,27,28,29`; el lector web acepta
crónicas anteriores. La generación v2 se ejecuta en la rutina existente de la PC,
con Claude sin herramientas y el token de escritura de Supabase. Se limita a tres
partidas por corrida. El navegador jamás recibe ese token ni llama a Claude.

Para publicar: revisar e integrar la rama en la rama que utiliza GitHub Pages y
actualizar el checkout de la PC que ejecuta `scripts/rutina.sh`. No requiere SQL.
Las partidas antiguas fuera de los cuatro días de reintento conservan sus datos;
no se asegura poder recuperar grabaciones que el proveedor haya retirado.

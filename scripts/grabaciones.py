"""Saca estadísticas, chat y eventos de la grabación de cada partida y los guarda en Supabase.

World's Edge no publica APM, tiempos de edad ni chat: salen de la grabación (.aoe2record), que se
baja de aoe.ms. De la grabación solo se lee la secuencia de acciones, que es estable entre parches;
la cabecera cambia con cada versión del juego y no se interpreta, salvo para ubicar a los jugadores.

  SYNC_TOKEN=... python scripts/grabaciones.py   procesa las partidas recientes que no tienen detalle
  python scripts/grabaciones.py                  sin token solo muestra lo que calculó
"""
import collections
import datetime
import io
import json
import os
import pathlib
import re
import statistics
import struct
import urllib.error
import urllib.parse
import urllib.request
import zipfile
import zlib

import aocref
from mgz import fast
from mgz.fast import Operation

RAIZ = pathlib.Path(__file__).resolve().parent.parent
CABECERAS = {'User-Agent': 'campamento-del-age (https://github.com/JoaquinMansilla/campamento-del-age)'}
# Si cambia lo que se extrae, subir la versión hace que se reprocesen las partidas recientes
VERSION = 7
DIAS_DE_REINTENTO = 4
# Tecnología de cada edad y segundos que tarda en investigarse (respaldo si falta el aviso del juego)
EDADES = {101: ('feudal', 130), 102: ('castillos', 160), 103: ('imperial', 190)}
AVISO_DE_EDAD = re.compile(r'^<player_id,(\d+),\d+> advanced to the (Feudal|Castle|Imperial) Age')
EDAD_POR_AVISO = {'Feudal': 'feudal', 'Castle': 'castillos', 'Imperial': 'imperial'}
ALDEANOS = {83, 293}
# Unidades que no cuentan como tropas: pesqueros, mercantes, carretas y transportes
CIVILES = {13, 17, 128, 545}
EDIFICIOS = {82: 'fortalezas', 109: 'centrosUrbanos', 621: 'centrosUrbanos', 276: 'maravillas'}
# Material para las perlitas de la crónica: cosas que hizo cada jugador y que suelen dar para chiste
CURIOSIDADES_POR_EDIFICIO = {50: 'granjas', 70: 'casas', 79: 'torres', 234: 'torres', 235: 'torres', 236: 'torres'}
# El juego reenvía al empezar el chat de partidas anteriores, con los números de jugador de aquella
# partida: esos mensajes se atribuirían a cualquiera, así que se descarta el primer minuto y medio.
CHAT_DESDE_MS = 90000
# Para leer el desarrollo: órdenes con coordenadas que mueven unidades, y tamaño de cada tramo
ORDENES_DE_MOVIMIENTO = {'MOVE', 'ORDER', 'DE_ATTACK_MOVE', 'PATROL', 'ATTACK_GROUND'}
TRAMO_MS = 180000
EDIFICIOS_SIN_INTERES = {50, 70, 72, 117, 155}  # granjas, casas y muros no cuentan como avanzada
# Unidades hechas para tirar edificios: saber quién las creó ayuda a explicar una rendición
ASEDIO = {'Petard', 'Battering Ram', 'Capped Ram', 'Siege Ram', 'Trebuchet', 'Trebuchet (Packed)', 'Mangonel', 'Onager',
          'Siege Onager', 'Bombard Cannon', 'Houfnice', 'Siege Tower', 'Armored Elephant', 'Siege Elephant', 'Demolition Ship',
          'Heavy Demolition Ship', 'Demolition Raft', 'Cannon Galleon', 'Elite Cannon Galleon'}
CURIOSIDADES_POR_ACCION = {
    'DELETE': 'cosasPropiasBorradas', 'FLARE': 'bengalas', 'TOWN_BELL': 'campanazos', 'WALL': 'tramosDeMuro',
    'ATTACK_GROUND': 'ataquesAlSuelo', 'GATE': 'puertasTrabadas', 'DROP_RELIC': 'reliquiasSoltadas',
    'TRIBUTE': 'tributos', 'DE_TRIBUTE': 'tributos', 'BACK_TO_WORK': 'ordenesDeVolverAlTrabajo',
    'DE_AUTOSCOUT': 'exploracionesAutomaticas', 'PATROL': 'patrullas',
}


def nombres_de_unidades():
    """Nombres (en inglés) de las unidades, del catálogo que trae el parser."""
    ruta = pathlib.Path(aocref.__file__).parent / 'data' / 'datasets' / '100.json'
    try:
        return json.loads(ruta.read_text())['objects']
    except (OSError, ValueError, KeyError):
        return {}


UNIDADES = nombres_de_unidades()


# "Housed": tener la población al tope de lo que permiten las casas, con unidades esperando para salir.
# La grabación no trae la población, así que se estima simulando los primeros minutos, cuando casi no
# hay bajas: población = lo que se mandó a crear; tope = casas, centros urbanos y castillos colocados.
HOUSED_HASTA_S = 20 * 60
VIVIENDA = {70: (5, 30), 109: (5, 110), 621: (5, 110), 82: (20, 90)}  # edificio: (lugares, segundos hasta estar listo)
SEGUNDOS_DE_CREACION = {83: 25, 293: 25, 13: 40, 128: 50, 17: 36}
SEGUNDOS_DE_CREACION_POR_DEFECTO = 30
# Mientras investiga, el edificio no crea unidades (sobre todo el centro urbano al subir de edad)
SEGUNDOS_DE_INVESTIGACION = {101: 130, 102: 160, 103: 190, 22: 25, 8: 25, 213: 75, 249: 55}
SEGUNDOS_DE_INVESTIGACION_POR_DEFECTO = 40
CIVS_SIN_CASAS = {'Hunos'}


def estimar_housed(construcciones, colas, civ, hasta_s):
    """Segundos (estimados) con unidades frenadas por falta de casas, y cuántas veces pasó."""
    if civ in CIVS_SIN_CASAS:
        return None
    hasta_s = min(hasta_s, HOUSED_HASTA_S)
    # En mapas nómadas se arranca sin centro urbano: no hay lugar hasta levantarlo
    nomada = any(e in (109, 621) and t < 180000 for t, _, _, e in construcciones)
    vivienda = sorted((t / 1000 + VIVIENDA[e][1], VIVIENDA[e][0] * (2 if civ == 'Incas' and e == 70 else 1))
                      for t, _, _, e in construcciones if e in VIVIENDA)
    pedidos = sorted(colas, key=lambda p: p[0])
    tope, poblacion = (0, 3) if nomada else (5, 4)
    edificios = collections.defaultdict(lambda: {'cola': collections.deque(), 'falta': 0})
    housed = episodios = 0
    estaba = False
    for ahora in range(hasta_s):
        while vivienda and vivienda[0][0] <= ahora:
            tope = min(200, tope + vivienda.pop(0)[1])
        while pedidos and pedidos[0][0] / 1000 <= ahora:
            _, unidad, cantidad, donde = pedidos.pop(0)
            for i in range(cantidad):
                if unidad is None:  # investigación: ocupa el edificio pero no suma población
                    edificios[donde[0] if donde else 0]['cola'].append((cantidad, False))
                    break
                edificios[donde[i % len(donde)] if donde else 0]['cola'].append(
                    (SEGUNDOS_DE_CREACION.get(unidad, SEGUNDOS_DE_CREACION_POR_DEFECTO), True))
        frenado = False
        for e in edificios.values():
            if e['falta'] > 0:
                e['falta'] -= 1
            elif e['cola']:
                segundos, ocupa_lugar = e['cola'][0]
                if not ocupa_lugar or poblacion < tope:
                    poblacion += ocupa_lugar
                    e['falta'] = segundos - 1
                    e['cola'].popleft()
                else:
                    frenado = True
        if frenado:
            housed += 1
            if not estaba:
                episodios += 1
        estaba = frenado
    return {'segundos': housed, 'veces': episodios}


def pedir(url, cuerpo=None, cabeceras=None):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(url, data=datos, headers={**CABECERAS, **(cabeceras or {})})
    with urllib.request.urlopen(req, timeout=90) as res:
        return res.read()


def bajar_grabaciones(partida_id, perfiles):
    """Cada jugador tiene su propia grabación y no todas están disponibles.

    Las estadísticas son iguales en todas, pero el chat de equipo solo figura en las del equipo.
    """
    grabaciones = []
    for perfil in perfiles:
        try:
            crudo = pedir(f'https://aoe.ms/replay/?gameId={partida_id}&profileId={perfil}')
            with zipfile.ZipFile(io.BytesIO(crudo)) as z:
                grabaciones.append(z.read(z.namelist()[0]))
        except (urllib.error.URLError, zipfile.BadZipFile, TimeoutError):
            continue
    return grabaciones


def numeros_de_jugador(cabecera, perfiles):
    """En la cabecera cada jugador figura como: tipo (2 = humano), id de perfil, 4 bytes, número."""
    numeros = {}
    for perfil in perfiles:
        i = cabecera.find(struct.pack('<II', 2, perfil))
        if i < 0:
            continue
        numero = struct.unpack_from('<i', cabecera, i + 12)[0]
        if 1 <= numero <= 8:
            numeros[numero] = perfil
    return numeros


def leer(grabacion, perfiles, equipos, civs):
    """Devuelve (segundos de juego, estadísticas por perfil, mensajes de chat)."""
    largo = struct.unpack_from('<I', grabacion)[0]
    numeros = numeros_de_jugador(zlib.decompress(grabacion[8:largo], wbits=-15), perfiles)
    flujo = io.BytesIO(grabacion)
    flujo.seek(largo)
    fast.meta(flujo)

    ms = 0
    stats = collections.defaultdict(collections.Counter)
    por_clic = collections.defaultdict(dict)
    curiosidades = collections.defaultdict(collections.Counter)
    colas = collections.defaultdict(collections.Counter)
    ultima = {}
    construcciones = collections.defaultdict(list)
    ordenes = []
    campanazos = []
    ataques = []
    pedidos = collections.defaultdict(list)
    asedio = collections.defaultdict(dict)
    pausa = collections.defaultdict(lambda: (0, 0))
    extras = collections.defaultdict(dict)
    chat = []
    try:
        while flujo.tell() < len(grabacion):
            operacion, carga = fast.operation(flujo)
            if operacion == Operation.SYNC:
                ms += carga[0]
            elif operacion == Operation.CHAT:
                try:
                    mensaje = json.loads(carga.decode('utf-8', 'replace'))
                except ValueError:
                    continue
                texto = str(mensaje.get('message', '')).strip()
                aviso = AVISO_DE_EDAD.match(texto)
                if aviso:
                    # El juego avisa por chat el momento exacto en que cada jugador sube de edad
                    extras[int(aviso.group(1))].setdefault(EDAD_POR_AVISO[aviso.group(2)], round(ms / 1000))
                elif texto and not texto.startswith('<') and mensaje.get('player') in numeros and ms >= CHAT_DESDE_MS:
                    burla = mensaje.get('tauntNumber', -1) != -1
                    if burla:
                        curiosidades[mensaje['player']]['burlasPorChat'] += 1
                    chat.append({
                        't': round(ms / 1000),
                        'jugador': numeros[mensaje['player']],
                        # Canal 0 es el chat del equipo; el 1 lo ven todos
                        'canal': 'equipo' if mensaje.get('channel') == 0 else 'todos',
                        'texto': texto[:200],
                        'burla': burla,
                    })
            elif operacion == Operation.ACTION:
                accion, d = carga
                jugador = d.get('player_id')
                if jugador is None:
                    continue
                s = stats[jugador]
                s['acciones'] += 1
                # La pausa más larga sin tocar nada (después del primer minuto, que es la carga)
                if jugador in ultima and ms - ultima[jugador] > pausa[jugador][0] and ms > 60000:
                    pausa[jugador] = (ms - ultima[jugador], ultima[jugador])
                ultima[jugador] = ms
                if accion.name in CURIOSIDADES_POR_ACCION:
                    curiosidades[jugador][CURIOSIDADES_POR_ACCION[accion.name]] += 1
                if accion.name == 'TOWN_BELL':
                    campanazos.append((ms, jugador))
                if d.get('x', 0) > 0 and 'y' in d:
                    if accion.name == 'BUILD':
                        construcciones[jugador].append((ms, d['x'], d['y'], d.get('building_id')))
                    elif accion.name in ORDENES_DE_MOVIMIENTO:
                        ordenes.append((ms, jugador, d['x'], d['y']))
                        if accion.name == 'ORDER' and d.get('target_id'):
                            ataques.append((ms, jugador, d['x'], d['y']))
                if accion.name == 'DE_QUEUE':
                    unidad = d.get('unit_id')
                    if unidad in ALDEANOS:
                        s['aldeanos'] += d.get('amount', 1)
                    elif unidad not in CIVILES:
                        s['tropas'] += d.get('amount', 1)
                        extras[jugador].setdefault('primeraTropa', round(ms / 1000))
                    colas[jugador][unidad] += d.get('amount', 1)
                    pedidos[jugador].append((ms, unidad, d.get('amount', 1), tuple(d.get('object_ids') or ())))
                    nombre = UNIDADES.get(str(unidad))
                    if nombre in ASEDIO:
                        a = asedio[jugador].setdefault(nombre, {'cantidad': 0, 'desde': round(ms / 1000)})
                        a['cantidad'] += d.get('amount', 1)
                        a['hasta'] = round(ms / 1000)
                elif accion.name == 'BUILD':
                    s['edificios'] += 1
                    if d.get('building_id') in EDIFICIOS:
                        s[EDIFICIOS[d['building_id']]] += 1
                    if d.get('building_id') in CURIOSIDADES_POR_EDIFICIO:
                        curiosidades[jugador][CURIOSIDADES_POR_EDIFICIO[d['building_id']]] += 1
                elif accion.name in ('BUY', 'SELL'):
                    s['comercio'] += 1
                elif accion.name == 'RESIGN':
                    extras[jugador].setdefault('rendicion', round(ms / 1000))
                elif accion.name == 'RESEARCH':
                    pedidos[jugador].append((ms, None, SEGUNDOS_DE_INVESTIGACION.get(d.get('technology_id'), SEGUNDOS_DE_INVESTIGACION_POR_DEFECTO),
                                             tuple(d.get('object_ids') or ())))
                    edad = EDADES.get(d.get('technology_id'))
                    if edad:
                        # Si canceló y volvió a pedirla, vale el último clic
                        por_clic[jugador][edad[0]] = round(ms / 1000) + edad[1]
                    else:
                        s['tecnologias'] += 1
    except Exception as err:  # una grabación cortada igual sirve hasta donde se pudo leer
        print(f'  lectura interrumpida: {err}')

    minutos = ms / 60000
    if minutos < 1:
        # Partida abandonada apenas empezó: no hay nada que medir
        return round(ms / 1000), {}, [], None
    jugadores = {}
    for numero, perfil in numeros.items():
        s = stats[numero]
        jugadores[str(perfil)] = {
            'eapm': round(s['acciones'] / minutos),
            **{campo: s[campo] for campo in ('aldeanos', 'tropas', 'edificios', 'tecnologias', 'fortalezas', 'centrosUrbanos', 'maravillas', 'comercio')},
            **por_clic[numero],
            **extras[numero],
            'curiosidades': {
                **curiosidades[numero],
                'unidadesMasCreadas': {UNIDADES[str(u)]: n for u, n in colas[numero].most_common(4) if str(u) in UNIDADES},
                'pausaMasLarga': {'segundos': round(pausa[numero][0] / 1000), 'desde': round(pausa[numero][1] / 1000)},
            },
            'asedio': asedio[numero],
            'housed': estimar_housed(construcciones[numero], pedidos[numero], civs.get(perfil), round(ms / 1000)),
        }
    return round(ms / 1000), jugadores, chat, desarrollo(numeros, equipos, construcciones, ordenes, campanazos, ataques, ms)


def desarrollo(numeros, equipos, construcciones, ordenes, campanazos, ataques, ms):
    """Dónde se jugó la partida: cuántas órdenes dio cada equipo en territorio del rival, tramo a tramo.

    La grabación no dice quién ganó cada pelea, pero sí adónde mandó sus unidades cada jugador. Un equipo que
    deja de dar órdenes en campo rival y solo las da en el propio se está retirando, y ahí se define la partida.
    El territorio de cada jugador es la zona más cercana a su base (el centro de sus primeras construcciones).
    """
    bases = {n: (statistics.median(x for _, x, _, _ in c[:15]), statistics.median(y for _, _, y, _ in c[:15]))
             for n, c in construcciones.items() if n in numeros and c}
    if len({equipos.get(numeros[n]) for n in bases}) < 2:
        return None

    def territorio(x, y):
        return min(bases, key=lambda n: (bases[n][0] - x) ** 2 + (bases[n][1] - y) ** 2)

    def rival(n, x, y):
        dueno = territorio(x, y)
        return dueno if equipos.get(numeros[dueno]) != equipos.get(numeros[n]) else None

    tramos = [{'desde': i * TRAMO_MS // 1000, 'presion': collections.Counter(), 'atacantes': collections.Counter(),
               'atacados': collections.Counter()} for i in range(ms // TRAMO_MS + 1)]
    for t, n, x, y in ordenes:
        if n not in numeros:
            continue
        dueno = rival(n, x, y)
        if dueno:
            tramo = tramos[t // TRAMO_MS]
            tramo['presion'][str(equipos[numeros[n]])] += 1
            tramo['atacantes'][str(numeros[n])] += 1
            tramo['atacados'][str(numeros[dueno])] += 1
    for tramo in tramos:
        tramo['atacantes'] = dict(tramo['atacantes'].most_common(3))
        tramo['atacados'] = dict(tramo['atacados'].most_common(3))

    avanzadas = []
    for n, lista in construcciones.items():
        for t, x, y, edificio in lista:
            if n in numeros and edificio not in EDIFICIOS_SIN_INTERES and str(edificio) in UNIDADES and rival(n, x, y):
                avanzadas.append({'t': round(t / 1000), 'jugador': numeros[n], 'edificio': UNIDADES[str(edificio)],
                                  'enTerritorioDe': numeros[rival(n, x, y)]})
    # Una orden sobre el lugar exacto donde un rival levantó un edificio es un ataque a ese edificio
    edificios = [(n, x, y, UNIDADES[str(e)], t) for n, lista in construcciones.items() if n in numeros
                 for t, x, y, e in lista if e not in EDIFICIOS_SIN_INTERES and str(e) in UNIDADES]
    golpes = {}
    for t, n, x, y in ataques:
        if n not in numeros:
            continue
        for dueno, ex, ey, nombre, construido in edificios:
            if construido < t and abs(ex - x) <= 1 and abs(ey - y) <= 1 and equipos.get(numeros[dueno]) != equipos.get(numeros[n]):
                g = golpes.setdefault((n, dueno, ex, ey), {'atacante': numeros[n], 'dueno': numeros[dueno], 'edificio': nombre,
                                                           'desde': round(t / 1000), 'ordenes': 0})
                g['ordenes'] += 1
                g['hasta'] = round(t / 1000)
                break

    return {
        'tramos': tramos,
        'ataquesAEdificios': sorted(golpes.values(), key=lambda g: g['desde'])[-60:],
        'edificiosEnTerritorioRival': sorted(avanzadas, key=lambda a: a['t'])[:25],
        'campanazos': [{'t': round(t / 1000), 'jugador': numeros[n]} for t, n in campanazos if n in numeros][:30],
    }


def analizar(grabaciones, equipos, civs):
    perfiles = list(equipos)
    lecturas = [leer(g, perfiles, equipos, civs) for g in grabaciones]
    if not lecturas:
        return None
    # La grabación más larga es la del que se quedó hasta el final
    segundos, jugadores, _, mapa_de_ordenes = max(lecturas, key=lambda l: l[0])
    if not jugadores:
        # Se guarda igual, sin jugadores, para no volver a bajar las grabaciones en cada corrida
        return {'version': VERSION, 'segundosDeJuego': segundos, 'grabaciones': len(lecturas), 'corta': True, 'chat': []}
    lecturas = [l for l in lecturas if l[1]]
    vistos = {}
    for _, _, chat, _ in lecturas:
        for m in chat:
            # La misma burla llega traducida distinto en cada grabación: se deja una sola
            vistos.setdefault((m['t'], m['jugador'], 'burla' if m['burla'] else m['texto']), m)
    chat = sorted(vistos.values(), key=lambda m: m['t'])
    for m in chat:
        jugadores[str(m['jugador'])]['mensajes'] = jugadores[str(m['jugador'])].get('mensajes', 0) + 1
    return {'version': VERSION, 'segundosDeJuego': segundos, 'grabaciones': len(lecturas), 'jugadores': jugadores,
            'chat': chat, 'desarrollo': mapa_de_ordenes}


def main():
    config = (RAIZ / 'config.js').read_text()
    url = re.search(r"supabaseUrl:\s*'([^']+)'", config).group(1)
    anon = re.search(r"supabaseAnonKey:\s*'([^']+)'", config).group(1)
    supabase = {'apikey': anon, 'Authorization': f'Bearer {anon}', 'Content-Type': 'application/json'}
    token = os.environ.get('SYNC_TOKEN')

    desde = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=DIAS_DE_REINTENTO)).strftime('%Y-%m-%dT%H:%M:%SZ')
    filtro = urllib.parse.urlencode({
        'select': 'id,datos',
        'inicio': f'gte.{desde}',
        'or': f'(detalle.is.null,detalle->>version.is.null,detalle->>version.neq.{VERSION})',
        'order': 'inicio.desc',
        'limit': '20',
    })
    pendientes = json.loads(pedir(f'{url}/rest/v1/partidas?{filtro}', cabeceras=supabase))
    for fila in pendientes:
        perfiles = [j['id'] for j in fila['datos']['jugadores']]
        grabaciones = bajar_grabaciones(fila['id'], perfiles)
        detalle = analizar(grabaciones, {j['id']: j['equipo'] for j in fila['datos']['jugadores']},
                           {j['id']: j['civ'] for j in fila['datos']['jugadores']}) if grabaciones else None
        if not detalle:
            print(f"{fila['id']}: sin grabación utilizable ({len(grabaciones)} bajadas)")
            continue
        print(f"{fila['id']}: {detalle['grabaciones']} grabaciones, {len(detalle.get('jugadores', {}))} jugadores, {len(detalle['chat'])} mensajes")
        if token:
            pedir(f'{url}/rest/v1/rpc/guardar_detalle', {'p_token': token, 'p_id': fila['id'], 'p_detalle': detalle}, supabase)
        else:
            print(json.dumps(detalle, ensure_ascii=False)[:1500])
    print(f'{len(pendientes)} partidas pendientes de detalle revisadas.')


main()

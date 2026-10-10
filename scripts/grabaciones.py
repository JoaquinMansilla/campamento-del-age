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
VERSION = 3
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


def leer(grabacion, perfiles):
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
                elif texto and not texto.startswith('<') and mensaje.get('player') in numeros:
                    if mensaje.get('tauntNumber', -1) != -1:
                        curiosidades[mensaje['player']]['burlasPorChat'] += 1
                    chat.append({
                        't': round(ms / 1000),
                        'jugador': numeros[mensaje['player']],
                        'canal': 'todos' if mensaje.get('channel') == 0 else 'equipo',
                        'texto': texto[:200],
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
                if accion.name == 'DE_QUEUE':
                    unidad = d.get('unit_id')
                    if unidad in ALDEANOS:
                        s['aldeanos'] += d.get('amount', 1)
                    elif unidad not in CIVILES:
                        s['tropas'] += d.get('amount', 1)
                        extras[jugador].setdefault('primeraTropa', round(ms / 1000))
                    colas[jugador][unidad] += d.get('amount', 1)
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
        return round(ms / 1000), {}, []
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
        }
    return round(ms / 1000), jugadores, chat


def analizar(grabaciones, perfiles):
    lecturas = [leer(g, perfiles) for g in grabaciones]
    if not lecturas:
        return None
    # La grabación más larga es la del que se quedó hasta el final
    segundos, jugadores, _ = max(lecturas, key=lambda l: l[0])
    if not jugadores:
        # Se guarda igual, sin jugadores, para no volver a bajar las grabaciones en cada corrida
        return {'version': VERSION, 'segundosDeJuego': segundos, 'grabaciones': len(lecturas), 'corta': True, 'chat': []}
    lecturas = [l for l in lecturas if l[1]]
    vistos = {}
    for _, _, chat in lecturas:
        for m in chat:
            vistos.setdefault((m['t'], m['jugador'], m['texto']), m)
    chat = sorted(vistos.values(), key=lambda m: m['t'])
    for m in chat:
        jugadores[str(m['jugador'])]['mensajes'] = jugadores[str(m['jugador'])].get('mensajes', 0) + 1
    return {'version': VERSION, 'segundosDeJuego': segundos, 'grabaciones': len(lecturas), 'jugadores': jugadores, 'chat': chat}


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
        detalle = analizar(grabaciones, perfiles) if grabaciones else None
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

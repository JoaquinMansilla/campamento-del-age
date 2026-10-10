"""Saca estadísticas por jugador de la grabación de cada partida y las guarda en Supabase.

World's Edge no publica APM ni tiempos de edad: salen de la grabación (.aoe2record), que se baja
de aoe.ms. De la grabación solo se lee la secuencia de acciones, que es estable entre parches;
la cabecera cambia con cada versión del juego y no se interpreta, salvo para ubicar a los jugadores.

  SYNC_TOKEN=... python scripts/grabaciones.py   procesa las partidas que todavía no tienen detalle
  python scripts/grabaciones.py                  sin token solo muestra lo que calculó
"""
import collections
import io
import json
import os
import pathlib
import re
import struct
import urllib.error
import urllib.request
import zipfile
import zlib

from mgz import fast
from mgz.fast import Operation

RAIZ = pathlib.Path(__file__).resolve().parent.parent
CABECERAS = {'User-Agent': 'campamento-del-age (https://github.com/JoaquinMansilla/campamento-del-age)'}
# Tecnología de cada edad y segundos que tarda en investigarse
EDADES = {101: ('feudal', 130), 102: ('castillos', 160), 103: ('imperial', 190)}
ALDEANOS = {83, 293}
# Unidades que no cuentan como tropas: pesqueros, mercantes, carretas y transportes
CIVILES = {13, 17, 128, 545}


def pedir(url, cuerpo=None, cabeceras=None):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(url, data=datos, headers={**CABECERAS, **(cabeceras or {})})
    with urllib.request.urlopen(req, timeout=90) as res:
        return res.read()


def bajar_grabacion(partida_id, perfiles):
    """La grabación se pide a nombre de un jugador; no todos la tienen disponible."""
    for perfil in perfiles:
        try:
            crudo = pedir(f'https://aoe.ms/replay/?gameId={partida_id}&profileId={perfil}')
            with zipfile.ZipFile(io.BytesIO(crudo)) as z:
                return z.read(z.namelist()[0])
        except (urllib.error.URLError, zipfile.BadZipFile, TimeoutError):
            continue
    return None


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


def analizar(grabacion, perfiles):
    largo = struct.unpack_from('<I', grabacion)[0]
    numeros = numeros_de_jugador(zlib.decompress(grabacion[8:largo], wbits=-15), perfiles)
    flujo = io.BytesIO(grabacion)
    flujo.seek(largo)
    fast.meta(flujo)

    ms = 0
    stats = collections.defaultdict(lambda: collections.Counter())
    edades = collections.defaultdict(dict)
    try:
        while flujo.tell() < len(grabacion):
            operacion, carga = fast.operation(flujo)
            if operacion == Operation.SYNC:
                ms += carga[0]
            elif operacion == Operation.ACTION:
                accion, d = carga
                jugador = d.get('player_id')
                if jugador is None:
                    continue
                s = stats[jugador]
                s['acciones'] += 1
                if accion.name == 'DE_QUEUE':
                    unidad = d.get('unit_id')
                    if unidad in ALDEANOS:
                        s['aldeanos'] += d.get('amount', 1)
                    elif unidad not in CIVILES:
                        s['tropas'] += d.get('amount', 1)
                elif accion.name == 'BUILD':
                    s['edificios'] += 1
                elif accion.name == 'RESEARCH':
                    edad = EDADES.get(d.get('technology_id'))
                    if edad:
                        # Si canceló y volvió a pedirla, vale el último clic
                        edades[jugador][edad[0]] = round(ms / 1000) + edad[1]
                    else:
                        s['tecnologias'] += 1
    except Exception as err:  # una grabación cortada igual sirve hasta donde se pudo leer
        print(f'  lectura interrumpida: {err}')

    minutos = ms / 60000
    if minutos < 1:
        return None
    jugadores = {}
    for numero, perfil in numeros.items():
        s = stats[numero]
        jugadores[str(perfil)] = {
            'eapm': round(s['acciones'] / minutos),
            'aldeanos': s['aldeanos'],
            'tropas': s['tropas'],
            'edificios': s['edificios'],
            'tecnologias': s['tecnologias'],
            **edades[numero],
        }
    return {'segundosDeJuego': round(ms / 1000), 'jugadores': jugadores} if jugadores else None


def main():
    config = (RAIZ / 'config.js').read_text()
    url = re.search(r"supabaseUrl:\s*'([^']+)'", config).group(1)
    anon = re.search(r"supabaseAnonKey:\s*'([^']+)'", config).group(1)
    supabase = {'apikey': anon, 'Authorization': f'Bearer {anon}', 'Content-Type': 'application/json'}
    clan = {m['id'] for m in json.loads((RAIZ / 'campamento.json').read_text())['clan']['miembros']}
    token = os.environ.get('SYNC_TOKEN')

    pendientes = json.loads(pedir(f'{url}/rest/v1/partidas?select=id,datos&detalle=is.null&order=inicio.desc&limit=20', cabeceras=supabase))
    for fila in pendientes:
        perfiles = [j['id'] for j in fila['datos']['jugadores']]
        # Primero se prueba con los miembros del clan
        grabacion = bajar_grabacion(fila['id'], sorted(perfiles, key=lambda p: p not in clan))
        if not grabacion:
            print(f"{fila['id']}: sin grabación disponible")
            continue
        detalle = analizar(grabacion, perfiles)
        if not detalle:
            print(f"{fila['id']}: no se pudo interpretar la grabación")
            continue
        print(f"{fila['id']}: {json.dumps(detalle)}" if not token else f"{fila['id']}: {len(detalle['jugadores'])} jugadores")
        if token:
            pedir(f'{url}/rest/v1/rpc/guardar_detalle', {'p_token': token, 'p_id': fila['id'], 'p_detalle': detalle}, supabase)
    print(f'{len(pendientes)} partidas sin detalle revisadas.')


main()

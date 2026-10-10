"""Importa telemetría adicional verificada. Sin --guardar solo valida y muestra un resumen.

Uso: python scripts/telemetria.py archivo.json [--guardar]
La lectura de órdenes de mgz NO produce estas métricas: se necesita una fuente de estados/eventos.
"""
import argparse
import copy
import json
import math
import os
import pathlib
import re
import urllib.parse
from cronicas import pedir

RAIZ = pathlib.Path(__file__).resolve().parent.parent
CONTEOS = {'unidadesPerdidas', 'unidadesMilitaresPerdidas', 'bajas', 'edificiosDestruidos',
           'centrosUrbanosPerdidos', 'ovejasRobadas'}
NUMEROS = {'recursosSinGastar', 'militaresInactivosSegundos', 'militaresSegundos'}
CAMPOS = CONTEOS | NUMEROS | {'eliminadoPor', 'muestras'}


def numero(valor):
    return isinstance(valor, (int, float)) and not isinstance(valor, bool) and math.isfinite(valor) and valor >= 0


def validar(documento, fila):
    if not isinstance(documento, dict) or documento.get('partidaId') != fila['id']:
        raise ValueError('partidaId debe coincidir con la partida')
    if not isinstance(documento.get('fuente'), str) or not documento['fuente'].strip():
        raise ValueError('se requiere una fuente identificable')
    if not isinstance(documento.get('jugadores'), dict) or not documento['jugadores']:
        raise ValueError('se requiere un objeto jugadores no vacío')
    jugadores = {str(j['id']): j for j in fila['datos']['jugadores']}
    duracion = (fila.get('detalle') or {}).get('segundosDeJuego')
    for perfil, metricas in documento['jugadores'].items():
        if perfil not in jugadores or not isinstance(metricas, dict) or not metricas:
            raise ValueError(f'jugador o métricas inválidos: {perfil}')
        if set(metricas) - CAMPOS:
            raise ValueError(f'campos desconocidos para {perfil}: {set(metricas) - CAMPOS}')
        for campo in CONTEOS | NUMEROS:
            if campo in metricas and (not numero(metricas[campo]) or (campo in CONTEOS and metricas[campo] != int(metricas[campo]))):
                raise ValueError(f'{perfil}.{campo} debe ser un número no negativo; los conteos son enteros')
        if 'eliminadoPor' in metricas:
            autor = jugadores.get(str(metricas['eliminadoPor']))
            if not autor or autor['equipo'] == jugadores[perfil]['equipo']:
                raise ValueError('eliminadoPor debe identificar un rival de esta partida')
        if 'militaresInactivosSegundos' in metricas and 'militaresSegundos' in metricas:
            if metricas['militaresInactivosSegundos'] > metricas['militaresSegundos']:
                raise ValueError('el tiempo militar inactivo no puede superar el total')
        if 'unidadesMilitaresPerdidas' in metricas and 'unidadesPerdidas' in metricas:
            if metricas['unidadesMilitaresPerdidas'] > metricas['unidadesPerdidas']:
                raise ValueError('las pérdidas militares no pueden superar todas las pérdidas')
        if 'muestras' in metricas:
            if not isinstance(metricas['muestras'], list) or not metricas['muestras']:
                raise ValueError('muestras debe ser una lista no vacía')
            anterior = -1
            for muestra in metricas['muestras']:
                if not isinstance(muestra, dict) or set(muestra) - {'t', 'valor', 'apm', 'bajoAtaque'}:
                    raise ValueError('muestra con campos desconocidos')
                if not numero(muestra.get('t')) or muestra['t'] <= anterior:
                    raise ValueError('los tiempos deben ser crecientes, únicos y no negativos')
                if duracion is not None and muestra['t'] > duracion:
                    raise ValueError('una muestra excede la duración de juego')
                anterior = muestra['t']
                for campo in ('valor', 'apm'):
                    if campo in muestra and not numero(muestra[campo]):
                        raise ValueError(f'muestra.{campo} inválido')
                if 'bajoAtaque' in muestra and not isinstance(muestra['bajoAtaque'], bool):
                    raise ValueError('bajoAtaque debe ser booleano')
    return documento


def combinar(documento, fila):
    validar(documento, fila)
    detalle = copy.deepcopy(fila.get('detalle') or {})
    for perfil, metricas in documento['jugadores'].items():
        jugador = detalle.setdefault('jugadores', {}).setdefault(perfil, {})
        # Cada importación reemplaza la telemetría de ese jugador, nunca completa ausencias con cero.
        jugador['telemetria'] = copy.deepcopy(metricas)
        jugador['fuenteTelemetria'] = documento['fuente'][:500]
    return detalle


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archivo', type=pathlib.Path)
    parser.add_argument('--guardar', action='store_true')
    args = parser.parse_args()
    documento = json.loads(args.archivo.read_text(encoding='utf-8-sig'))
    partida_id = documento.get('partidaId')
    if not isinstance(partida_id, int) or isinstance(partida_id, bool) or partida_id <= 0:
        raise ValueError('partidaId debe ser un entero positivo')
    config = (RAIZ / 'config.js').read_text(encoding='utf-8')
    url = re.search(r"supabaseUrl:\s*'([^']+)'", config).group(1)
    anon = re.search(r"supabaseAnonKey:\s*'([^']+)'", config).group(1)
    cabeceras = {'apikey': anon, 'Authorization': f'Bearer {anon}', 'Content-Type': 'application/json'}
    filtro = urllib.parse.urlencode({'id': f'eq.{partida_id}', 'select': 'id,datos,detalle'})
    filas = json.loads(pedir(f'{url}/rest/v1/partidas?{filtro}', cabeceras=cabeceras))
    if len(filas) != 1:
        raise ValueError('no se encontró la partida')
    detalle = combinar(documento, filas[0])
    if args.guardar:
        token = os.environ.get('SYNC_TOKEN')
        if not token:
            raise ValueError('falta SYNC_TOKEN para guardar')
        pedir(f'{url}/rest/v1/rpc/guardar_detalle', {'p_token': token, 'p_id': partida_id, 'p_detalle': detalle}, cabeceras)
    print(f"Partida {partida_id}: {len(documento['jugadores'])} jugadores validados. " + ('Guardado.' if args.guardar else 'Sin cambios en la base.'))


if __name__ == '__main__':
    main()

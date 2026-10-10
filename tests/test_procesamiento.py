import copy
import importlib.util
import io
import json
import pathlib
import struct
import sys
import unittest
import zlib
from types import SimpleNamespace
from unittest.mock import patch

RAIZ = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / 'scripts'))
import grabaciones as G
import cronicas as C
import telemetria as T


class GrabacionesTest(unittest.TestCase):
    def replay(self, ops):
        cabecera = struct.pack('<IIii', 2, 101, 0, 1)
        compresor = zlib.compressobj(wbits=-15)
        comprimida = compresor.compress(cabecera) + compresor.flush()
        largo = 8 + len(comprimida)
        grabacion = struct.pack('<II', largo, 0) + comprimida + b'x' * len(ops)
        eventos = iter(ops)
        def operacion(flujo):
            flujo.read(1)
            evento = next(eventos)
            if isinstance(evento, Exception):
                raise evento
            return evento
        with patch.object(G.fast, 'meta'), patch.object(G.fast, 'operation', side_effect=operacion):
            return G.leer(grabacion, [101])

    def test_pausas_primera_tropa_y_rendicion(self):
        accion = lambda nombre, **datos: (G.Operation.ACTION, (SimpleNamespace(name=nombre), {'player_id': 1, **datos}))
        segundos, jugadores, _ = self.replay([
            (G.Operation.SYNC, [60000]), accion('DE_QUEUE', unit_id=83, amount=1),
            (G.Operation.SYNC, [120000]), accion('DE_QUEUE', unit_id=74, amount=3),
            (G.Operation.SYNC, [10000]), accion('RESIGN'),
            (G.Operation.SYNC, [600000]),
        ])
        j = jugadores['101']
        self.assertEqual(segundos, 790)
        self.assertEqual(j['primeraTropa'], 180)
        self.assertEqual(j['inactividadMaxima'], 120)
        self.assertEqual(j['tropas'], 3)
        self.assertEqual(j['aldeanos'], 1)
        self.assertTrue(j['completa'])

    def test_grabacion_interrumpida_no_genera_afk_ni_pacifista(self):
        _, jugadores, _ = self.replay([(G.Operation.SYNC, [120000]), ValueError('cortada')])
        self.assertFalse(jugadores['101']['completa'])
        self.assertNotIn('inactividadMaxima', jugadores['101'])
        self.assertNotIn('accionesVersion', jugadores['101'])

    def test_sin_tropas_registra_null_no_cero(self):
        _, jugadores, _ = self.replay([(G.Operation.SYNC, [120000])])
        self.assertIsNone(jugadores['101']['primeraTropa'])
        self.assertEqual(jugadores['101']['inactividadMaxima'], 120)


class TelemetriaTest(unittest.TestCase):
    def setUp(self):
        self.fila = {'id': 1, 'datos': {'jugadores': [{'id': 101, 'equipo': 1}, {'id': 102, 'equipo': 2}]},
                     'detalle': {'segundosDeJuego': 300, 'jugadores': {'101': {'tropas': 10}}}}
        self.doc = {'partidaId': 1, 'fuente': 'fixture verificado', 'jugadores': {'101': {'unidadesPerdidas': 0}}}

    def test_combina_sin_borrar_ordenes_ni_inventar_otros_datos(self):
        copia = copy.deepcopy(self.fila)
        d = T.combinar(self.doc, self.fila)
        self.assertEqual(d['jugadores']['101']['tropas'], 10)
        self.assertEqual(d['jugadores']['101']['telemetria'], {'unidadesPerdidas': 0})
        self.assertEqual(self.fila, copia)

    def test_rechaza_valores_invalidos_y_jugadores_ajenos(self):
        for valor in [-1, float('nan'), float('inf'), True, 1.5, '2']:
            self.doc['jugadores']['101']['unidadesPerdidas'] = valor
            with self.assertRaises(ValueError): T.validar(self.doc, self.fila)
        self.doc['jugadores'] = {'999': {'bajas': 2}}
        with self.assertRaises(ValueError): T.validar(self.doc, self.fila)

    def test_rechaza_muestras_fuera_de_tiempo_y_proporciones_imposibles(self):
        for metricas in [
            {'muestras': [{'t': 301, 'valor': 30}]},
            {'muestras': [{'t': 10}, {'t': 10}]},
            {'militaresInactivosSegundos': 50, 'militaresSegundos': 10},
            {'eliminadoPor': 101}, {'unidadesMilitaresPerdidas': 10, 'unidadesPerdidas': 2},
        ]:
            self.doc['jugadores']['101'] = metricas
            with self.assertRaises(ValueError): T.validar(self.doc, self.fila)


class CronicasTest(unittest.TestCase):
    def test_acepta_ocho_relaciones_y_version(self):
        respuesta = {'titulo': 'Una batalla', 'relato': 'Relato', 'funciones': {str(i): f'Ficción {i}' for i in C.FUNCIONES}}
        with patch.object(C.subprocess, 'run', return_value=SimpleNamespace(stdout=json.dumps(respuesta))):
            c = C.escribir_cronica({})
            self.assertEqual(c['version'], 2)
            self.assertEqual(len(c['funciones']), 8)

    def test_rechaza_generacion_incompleta(self):
        with patch.object(C.subprocess, 'run', return_value=SimpleNamespace(stdout='{"titulo":"x","relato":"y"}')):
            with self.assertRaises(ValueError): C.escribir_cronica({})


if __name__ == '__main__':
    unittest.main()

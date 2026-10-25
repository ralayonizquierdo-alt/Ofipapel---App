# EL PUBLICADOR DEL ESTADO DE PEDIDOS (GeminisWin → Supabase).
#
#   py scripts/probar-publicador.py
#
# No necesita la unidad G:, ni GeminisWin, ni Supabase: se fabrican .dbf de
# verdad, byte a byte, y se leen con el mismo lector que en producción.
#
# Lo que se prueba no es "que no pete". Es que NO PUBLIQUE UNA MENTIRA: todo lo
# que sale de aquí se le dice a un cliente por WhatsApp, y un estado mal puesto
# no da un error — da una frase educada y falsa.

import datetime
import os
import struct
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, 'publicador-estado-pedidos'))

import dbf                                                      # noqa: E402
from estados import estado_del_pedido, pago_pendiente, pedido_web  # noqa: E402
from filas import construir_filas, hora_a_hm, instante_del_pedido, lineas_por_venta  # noqa: E402

fallos = 0


def comprobar(etiqueta, fn):
    global fallos
    try:
        fn()
        print(f'OK   {etiqueta}')
    except AssertionError as err:
        fallos += 1
        print(f'MAL  {etiqueta}\n     {err}')
    except Exception as err:  # noqa: BLE001
        fallos += 1
        print(f'MAL  {etiqueta}\n     {type(err).__name__}: {err}')


def _es(resultado, esperado):
    estado = resultado[0] if isinstance(resultado, tuple) else resultado
    assert estado == esperado, f'esperaba {esperado}, salió {estado}'


def _ok(condicion, mensaje='no cuadra'):
    assert condicion, mensaje


# --------------------------------------------------------------------------
# Fabricar un .dbf de verdad, para leerlo con el lector de producción.
# --------------------------------------------------------------------------

JULIANO_1970 = 2440588


def escribir_dbf(ruta, campos, registros, mentir_en_la_cabecera=False, borrados=()):
    """campos: [(nombre, tipo, longitud, decimales)]."""
    longitud_registro = 1 + sum(c[2] for c in campos)
    longitud_cabecera = 32 + 32 * len(campos) + 1

    cabecera = bytearray(32)
    cabecera[0] = 0x03
    hoy = datetime.date.today()
    cabecera[1], cabecera[2], cabecera[3] = hoy.year - 1900, hoy.month, hoy.day
    # Si mentimos, la cabecera dice 0 registros: es lo que pasa de verdad con
    # una tabla que se está escribiendo mientras la leemos.
    struct.pack_into('<I', cabecera, 4, 0 if mentir_en_la_cabecera else len(registros))
    struct.pack_into('<H', cabecera, 8, longitud_cabecera)
    struct.pack_into('<H', cabecera, 10, longitud_registro)

    trozos = [bytes(cabecera)]
    for nombre, tipo, longitud, decimales in campos:
        desc = bytearray(32)
        desc[0:11] = nombre.encode('cp1252')[:10].ljust(11, b'\0')
        desc[11] = ord(tipo)
        desc[16] = longitud
        desc[17] = decimales
        trozos.append(bytes(desc))
    trozos.append(b'\x0d')

    for i, reg in enumerate(registros):
        fila = bytearray(b'*' if i in borrados else b' ')
        for nombre, tipo, longitud, _dec in campos:
            fila += _celda(reg.get(nombre), tipo, longitud)
        trozos.append(bytes(fila))

    with open(ruta, 'wb') as f:
        f.write(b''.join(trozos))
    return ruta


def _celda(valor, tipo, longitud):
    if tipo == 'D':
        return (f'{valor:%Y%m%d}'.encode('ascii') if valor else b' ' * 8).ljust(longitud)[:longitud]
    if tipo == 'T':
        if not valor:
            return b'\0' * 8
        dia = (valor.date() - datetime.date(1970, 1, 1)).days + JULIANO_1970
        ms = (valor.hour * 3600 + valor.minute * 60 + valor.second) * 1000
        return struct.pack('<ii', dia, ms)
    if tipo == 'L':
        return (b'T' if valor is True else b'F' if valor is False else b'?')[:longitud].ljust(longitud)
    if tipo == 'N':
        return (('' if valor is None else str(valor)).rjust(longitud).encode('ascii'))[:longitud]
    return (('' if valor is None else str(valor)).encode('cp1252')).ljust(longitud)[:longitud]


TMP = tempfile.mkdtemp(prefix='publicador-')

print('=== El lector de .dbf\n')

CAMPOS = [('NOMBRE', 'C', 12, 0), ('IMPORTE', 'N', 8, 2), ('DIA', 'D', 8, 0),
          ('SI', 'L', 1, 0), ('CUANDO', 'T', 8, 0)]
REGISTROS = [
    {'NOMBRE': 'DONATACO', 'IMPORTE': 64.72, 'DIA': datetime.date(2026, 10, 23),
     'SI': True, 'CUANDO': datetime.datetime(2026, 10, 23, 14, 7)},
    {'NOMBRE': 'BORRADO', 'IMPORTE': 1, 'DIA': None, 'SI': False, 'CUANDO': None},
    {'NOMBRE': 'ÚLTIMO', 'IMPORTE': -3.5, 'DIA': datetime.date(2026, 1, 2),
     'SI': None, 'CUANDO': None},
]


def _tabla(**kw):
    ruta = escribir_dbf(os.path.join(TMP, f'p{len(os.listdir(TMP))}.dbf'), CAMPOS, REGISTROS, **kw)
    return dbf.Tabla(ruta)


def _cada_tipo():
    filas = list(_tabla().leer())
    assert len(filas) == 3, filas
    uno = filas[0]
    assert uno['NOMBRE'] == 'DONATACO', uno
    assert abs(uno['IMPORTE'] - 64.72) < 0.001, uno
    assert uno['DIA'] == datetime.date(2026, 10, 23), uno
    assert uno['SI'] is True, uno
    assert uno['CUANDO'] == datetime.datetime(2026, 10, 23, 14, 7), uno
    assert filas[2]['SI'] is None, 'un lógico en blanco no es False'
    assert filas[2]['DIA'] == datetime.date(2026, 1, 2)


def _no_se_cree_la_cabecera():
    # Esto es lo que hacía dbfread: fiarse de la cabecera y leer de menos.
    tabla = _tabla(mentir_en_la_cabecera=True)
    assert tabla.registros_cabecera == 0, 'la cabecera miente a propósito en esta prueba'
    assert tabla.registros == 3, f'tendría que contar 3 por tamaño, cuenta {tabla.registros}'
    assert len(list(tabla.leer())) == 3


def _borrados():
    filas = list(_tabla(borrados={1}).leer())
    assert len(filas) == 2, filas
    assert [f['NOMBRE'] for f in filas] == ['DONATACO', 'ÚLTIMO'], filas


def _cola():
    tabla = _tabla()
    assert [f['NOMBRE'] for f in tabla.cola(2)] == ['BORRADO', 'ÚLTIMO']
    assert len(list(tabla.cola(99))) == 3, 'pedir más de los que hay no se rompe'


def _solo_campos():
    fila = next(_tabla().leer(campos={'NOMBRE'}))
    assert set(fila) == {'NOMBRE'}, fila


comprobar('lee cada tipo de campo como lo que es', _cada_tipo)
comprobar('NO se cree el número de registros de la cabecera', _no_se_cree_la_cabecera)
comprobar('se salta los registros borrados', _borrados)
comprobar('la cola devuelve los últimos registros', _cola)
comprobar('pedir solo unos campos devuelve solo esos', _solo_campos)


# --------------------------------------------------------------------------
print('\n=== Las reglas de estado\n')

VIERNES = datetime.date(2026, 10, 23)


def pedido(**kw):
    base = {'WEBIDPED': 663273, 'FECHA': VIERNES, 'HORA': '07:56', 'ANULADO': False,
            'LIQUIDADO': 0, 'IDVENTA': 0, 'IDOFIVTA': 1, 'FORMA_P': '10', 'TOT_PEND': 0,
            'ULTMOD': datetime.datetime(2026, 10, 23, 14, 7)}
    base.update(kw)
    return base


def linea(estado, **kw):
    base = {'IDOFICINA': 1, 'IDREPARTO': 48161, 'IDOFIVTA': 1, 'IDVENTA': 500,
            'ESTADO': estado, 'ULTMOD': datetime.datetime(2026, 10, 22, 18, 0)}
    base.update(kw)
    return base


comprobar('anulado manda sobre todo lo demás', lambda: (
    _es(estado_del_pedido(pedido(ANULADO=True, LIQUIDADO=5, IDVENTA=500), linea(4), None), 'anulado')))

comprobar('entregado y liquidado del reparto son los dos entregado', lambda: (
    _es(estado_del_pedido(pedido(), linea(4), None), 'entregado'),
    _es(estado_del_pedido(pedido(), linea(5), None), 'entregado')))

comprobar('no entregado, quitado y devuelto', lambda: (
    _es(estado_del_pedido(pedido(), linea(7), None), 'no_entregado'),
    _es(estado_del_pedido(pedido(), linea(1), None), 'incidencia'),
    _es(estado_del_pedido(pedido(), linea(6), None), 'incidencia')))

def _en_reparto():
    for codigo in (2, 3):
        estado, fecha = estado_del_pedido(
            pedido(), linea(codigo), {'FECHA': datetime.date(2026, 10, 22)})
        assert estado == 'en_reparto', codigo
        assert fecha == datetime.date(2026, 10, 22), fecha


comprobar('reparto abierto: en_reparto con la fecha de carga', _en_reparto)


comprobar('un código de reparto que no conocemos NO se publica', lambda: (
    _es(estado_del_pedido(pedido(), linea(9), None), None)))

comprobar('LIQUIDADO=5 en el pedido es FACTURADO, no cobrado', lambda: (
    _es(estado_del_pedido(pedido(LIQUIDADO=5, IDVENTA=500), None, None), 'facturado')))

comprobar('liquidado sin venta todavía no está facturado', lambda: (
    _es(estado_del_pedido(pedido(LIQUIDADO=5, IDVENTA=0), None, None), 'recibido')))

comprobar('lo demás es recibido', lambda: (
    _es(estado_del_pedido(pedido(), None, None), 'recibido')))


print('\n=== Pagado no es entregado\n')

comprobar('solo la transferencia inmediata puede quedar pendiente', lambda: (
    _ok(pago_pendiente(pedido(FORMA_P='77', TOT_PEND=64.72)) is True),
    _ok(pago_pendiente(pedido(FORMA_P='77', TOT_PEND=0)) is False),
    _ok(pago_pendiente(pedido(FORMA_P='10', TOT_PEND=64.72)) is False,
        'un Bizum con saldo pendiente no es un pedido sin pagar'),
    _ok(pago_pendiente(pedido(FORMA_P=77, TOT_PEND=5)) is True, 'venga como número')))

comprobar('pagar no adelanta el estado', lambda: (
    _es(estado_del_pedido(pedido(FORMA_P='10', TOT_PEND=0), None, None), 'recibido')))


print('\n=== El cruce con los repartos\n')


def _ceros_no_cruzan():
    # LA TRAMPA: hay MUCHÍSIMAS líneas con IDVENTA=0, y un pedido recién hecho
    # también tiene IDVENTA=0. Cruzarlos le colgaría a un pedido de hoy el
    # reparto de otro, y el bot diría "entregado" de algo que no ha salido.
    lineas = lineas_por_venta([linea(4, IDVENTA=0, IDOFIVTA=0)])
    assert lineas == {}, lineas
    filas, _ = construir_filas([pedido(IDVENTA=0, IDOFIVTA=0)],
                               [linea(4, IDVENTA=0, IDOFIVTA=0)], [], hoy=VIERNES)
    assert filas[0]['estado'] == 'recibido', filas


comprobar('un pedido sin venta NO hereda el reparto de otro', _ceros_no_cruzan)


def _la_mas_reciente():
    lineas = lineas_por_venta([
        linea(2, ULTMOD=datetime.datetime(2026, 10, 20, 9, 0)),
        linea(4, ULTMOD=datetime.datetime(2026, 10, 22, 18, 0)),
    ])
    assert lineas[(1, 500)]['ESTADO'] == 4, 'manda la línea de ULTMOD más reciente'


comprobar('con varias líneas manda la más reciente', _la_mas_reciente)


print('\n=== La hora y el cambio de hora\n')

comprobar('la HORA se entiende venga como venga', lambda: (
    _ok(hora_a_hm('07:56') == (7, 56)),
    _ok(hora_a_hm('7:56:00') == (7, 56)),
    _ok(hora_a_hm('0756') == (7, 56)),
    _ok(hora_a_hm(756) == (7, 56)),
    _ok(hora_a_hm('') is None),
    _ok(hora_a_hm('a las nueve') is None),
    _ok(hora_a_hm('99:99') is None, 'una hora imposible no se cuela')))

comprobar('EN VERANO no se corre la hora (Canarias = UTC+1)', lambda: (
    _ok(instante_del_pedido(VIERNES, '07:56') == '2026-10-23T07:56:00+01:00',
        instante_del_pedido(VIERNES, '07:56'))))

comprobar('EN INVIERNO tampoco (Canarias = UTC)', lambda: (
    _ok(instante_del_pedido(datetime.date(2026, 10, 26), '07:56') == '2026-10-26T07:56:00+00:00',
        instante_del_pedido(datetime.date(2026, 10, 26), '07:56'))))

comprobar('una hora que no se entiende va a las 00:00, nunca inventada', lambda: (
    _ok(instante_del_pedido(VIERNES, 'ni idea').startswith('2026-10-23T00:00'))))


print('\n=== Los cinco pedidos reales del 25/10\n')

REPARTO_ABIERTO = {'IDOFICINA': 1, 'IDREPARTO': 48161, 'FECHA': datetime.date(2026, 10, 22),
                   'ESTADO': 2}
REPARTO_CERRADO = {'IDOFICINA': 1, 'IDREPARTO': 48000, 'FECHA': datetime.date(2026, 10, 15),
                   'ESTADO': 5}

PEDIDOS_REALES = [
    # 663273 Donataco: liquidado el viernes a las 14:07, sin reparto todavía.
    pedido(WEBIDPED=663273, LIQUIDADO=5, IDVENTA=500,
           ULTMOD=datetime.datetime(2026, 10, 23, 14, 7)),
    # 663617 Taller Elite Sur: no se facturó (anomalía real).
    pedido(WEBIDPED=663617, LIQUIDADO=0, IDVENTA=0),
    # 658813 Roberto Febles: pendiente de stock.
    pedido(WEBIDPED=658813, LIQUIDADO=0, IDVENTA=0, FECHA=datetime.date(2026, 10, 10)),
    # 661149 Shahrukh Khan: reparto 48161 del 22/10, aún sin cerrar.
    pedido(WEBIDPED=661149, LIQUIDADO=5, IDVENTA=611, FECHA=datetime.date(2026, 10, 20)),
    # 655760: entregado.
    pedido(WEBIDPED=655760, LIQUIDADO=5, IDVENTA=557, FECHA=datetime.date(2026, 10, 14)),
]
LINEAS_REALES = [
    linea(2, IDVENTA=611, IDREPARTO=48161),
    linea(4, IDVENTA=557, IDREPARTO=48000),
]


def _casos_reales():
    filas, _ = construir_filas(PEDIDOS_REALES, LINEAS_REALES,
                               [REPARTO_ABIERTO, REPARTO_CERRADO],
                               hoy=datetime.date(2026, 10, 25))
    por_numero = {f['pedido_web']: f for f in filas}
    esperado = {
        '663273': 'facturado',
        '663617': 'recibido',
        '658813': 'recibido',
        '661149': 'en_reparto',
        '655760': 'entregado',
    }
    for numero, estado in esperado.items():
        assert numero in por_numero, f'{numero} no sale'
        assert por_numero[numero]['estado'] == estado, \
            f'{numero}: esperaba {estado}, salió {por_numero[numero]["estado"]}'
    assert por_numero['661149']['fecha_reparto'] == '2026-10-22', por_numero['661149']
    assert por_numero['663273']['fecha_factura'] == '2026-10-23', por_numero['663273']


comprobar('los cinco salen con el estado que dijo GeminisWin', _casos_reales)


print('\n=== Lo que no se publica\n')

comprobar('un pedido que no es de la web se queda fuera', lambda: (
    _ok(pedido_web(pedido(WEBIDPED=0)) is None),
    _ok(pedido_web(pedido(WEBIDPED=None)) is None),
    _ok(pedido_web(pedido(WEBIDPED=663273)) == '663273')))


def _solo_60_dias():
    viejo = pedido(WEBIDPED=600000, FECHA=datetime.date(2026, 7, 1))
    filas, resumen = construir_filas([viejo, pedido()], [], [], hoy=datetime.date(2026, 10, 25))
    assert [f['pedido_web'] for f in filas] == ['663273'], filas
    assert resumen['web'] == 2 and resumen['en_plazo'] == 1, resumen


comprobar('solo los últimos 60 días', _solo_60_dias)


def _no_manda_actualizado():
    # Lo pone la base de datos con su trigger. Si lo mandáramos, un PC con la
    # hora mal puesta haría que el bot diera por fresco un dato viejo.
    filas, _ = construir_filas([pedido()], [], [], hoy=VIERNES)
    assert 'actualizado' not in filas[0], filas[0]
    assert set(filas[0]) == {'pedido_web', 'estado', 'fecha_hora_pedido',
                             'fecha_factura', 'fecha_reparto', 'pago_pendiente'}, filas[0]


comprobar('no se manda "actualizado"', _no_manda_actualizado)


def _codigo_raro_se_cuenta():
    filas, resumen = construir_filas([pedido(IDVENTA=500)], [linea(9)], [], hoy=VIERNES)
    assert filas == [], filas
    assert resumen['sin_estado'] == 1, resumen


comprobar('un código raro no se publica, pero se cuenta y se avisa', _codigo_raro_se_cuenta)


print('\n✔ Sin fallos' if fallos == 0 else f'\n✗ {fallos} fallos')
sys.exit(0 if fallos == 0 else 1)

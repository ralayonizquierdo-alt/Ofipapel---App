#!/usr/bin/env py
# EL PUBLICADOR: de GeminisWin a la tabla que lee el bot de WhatsApp.
#
#   py publicar_estado_pedidos.py                     publica
#   py publicar_estado_pedidos.py --seco              lo calcula todo y NO escribe
#   py publicar_estado_pedidos.py --comprobar 663273  enseña qué saldría de un pedido
#   py publicar_estado_pedidos.py --credenciales      guarda la contraseña en Windows
#
# Corre en el PC de Rober, contra G:\GW002024\ EN SOLO LECTURA. Nunca escribe
# en ningún .dbf: son las tablas de producción de Gestión.
#
# La contraseña de gestion@ofipapel.internal vive en el Administrador de
# credenciales de Windows (keyring), nunca en el código ni en un fichero. No se
# usa service_role en ningún sitio.

import argparse
import datetime
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import dbf                                  # noqa: E402
from filas import construir_filas           # noqa: E402

CARPETA_DATOS = os.environ.get('GEMINIS_DATOS', r'G:\GW002024')
CARPETA_SCRIPT = os.path.dirname(os.path.abspath(__file__))
LOG = os.environ.get('PUBLICADOR_LOG', os.path.join(CARPETA_SCRIPT, 'log.txt'))
LOG_MAXIMO = 2 * 1024 * 1024

SUPA_URL = 'https://agjmciudnnginqybnogh.supabase.co'
# Clave publishable: es PÚBLICA (la misma que ya está en Index.html) y no da
# acceso a esta tabla. Supabase la exige como cabecera en toda petición.
SUPA_ANON = 'sb_publishable_LaJCCCGsN2VIXFDFAxEb6g_eEZHh3j6'
CUENTA = 'gestion@ofipapel.internal'
SERVICIO_KEYRING = 'ofipapel-publicador-estado-pedidos'

DIAS = 60
COLA_PEDIDOS = 20000   # pedidos.dbf son ~260 MB y crece por el final
POR_TANDA = 200
TIEMPO_ESPERA = 30

CAMPOS_PEDIDOS = {'WEBIDPED', 'FECHA', 'HORA', 'ANULADO', 'LIQUIDADO',
                  'IDVENTA', 'IDOFIVTA', 'FORMA_P', 'TOT_PEND', 'FECHORALTA', 'ULTMOD'}
CAMPOS_REPARLIN = {'IDOFICINA', 'IDREPARTO', 'IDOFIVTA', 'IDVENTA', 'ESTADO', 'ULTMOD'}
CAMPOS_REPARTOS = {'IDOFICINA', 'IDREPARTO', 'FECHA', 'ESTADO'}


def apuntar(mensaje):
    linea = f'{datetime.datetime.now():%Y-%m-%d %H:%M:%S}  {mensaje}'
    print(linea)
    try:
        if os.path.exists(LOG) and os.path.getsize(LOG) > LOG_MAXIMO:
            os.replace(LOG, LOG + '.1')
        with open(LOG, 'a', encoding='utf-8') as f:
            f.write(linea + '\n')
    except OSError:
        pass  # que no se pueda escribir el registro no puede tumbar la pasada


# --------------------------------------------------------------------------
# Leer GeminisWin.
# --------------------------------------------------------------------------

def ruta(nombre):
    return os.path.join(CARPETA_DATOS, nombre)


def hay_unidad():
    return os.path.isdir(CARPETA_DATOS)


def leer_geminis():
    pedidos_tabla = dbf.Tabla(ruta('pedidos.dbf'))
    pedidos = list(pedidos_tabla.cola(COLA_PEDIDOS, campos=CAMPOS_PEDIDOS))
    reparlin = list(dbf.Tabla(ruta('reparlin.dbf')).leer(campos=CAMPOS_REPARLIN))
    repartos = list(dbf.Tabla(ruta('repartos.dbf')).leer(campos=CAMPOS_REPARTOS))
    apuntar(f'Leídos {len(pedidos)} pedidos (de {pedidos_tabla.registros} en la tabla), '
            f'{len(reparlin)} líneas de reparto y {len(repartos)} repartos.')
    return pedidos, reparlin, repartos


# --------------------------------------------------------------------------
# Supabase.
# --------------------------------------------------------------------------

def contrasena():
    de_entorno = os.environ.get('SUPABASE_GESTION_PASSWORD')
    if de_entorno:
        return de_entorno
    try:
        import keyring
    except ImportError:
        raise SystemExit('Falta keyring. Instálalo con: py -m pip install keyring')
    clave = keyring.get_password(SERVICIO_KEYRING, CUENTA)
    if not clave:
        raise SystemExit(
            'No hay contraseña guardada. Ejecuta una vez:\n'
            '  py publicar_estado_pedidos.py --credenciales'
        )
    return clave


def guardar_credenciales():
    import getpass
    import keyring
    clave = getpass.getpass(f'Contraseña de {CUENTA} (no se verá al escribirla): ')
    if not clave:
        raise SystemExit('No se ha escrito nada; no se guarda.')
    keyring.set_password(SERVICIO_KEYRING, CUENTA, clave)
    print('Guardada en el Administrador de credenciales de Windows.')


def _peticion(url, cuerpo, cabeceras):
    datos = json.dumps(cuerpo).encode('utf-8')
    pet = urllib.request.Request(url, data=datos, headers=cabeceras, method='POST')
    ultimo = None
    for intento in range(3):
        try:
            with urllib.request.urlopen(pet, timeout=TIEMPO_ESPERA) as r:
                return json.loads(r.read().decode('utf-8') or 'null')
        except urllib.error.HTTPError as err:
            detalle = err.read().decode('utf-8', errors='replace')[:300]
            raise RuntimeError(f'Supabase respondió {err.code}: {detalle}') from err
        except (urllib.error.URLError, TimeoutError, OSError) as err:
            ultimo = err
            time.sleep(2 ** intento)
    raise RuntimeError(f'No se pudo hablar con Supabase: {ultimo}')


def entrar():
    datos = _peticion(
        f'{SUPA_URL}/auth/v1/token?grant_type=password',
        {'email': CUENTA, 'password': contrasena()},
        {'apikey': SUPA_ANON, 'Content-Type': 'application/json'},
    )
    if not datos or not datos.get('access_token'):
        raise RuntimeError('Supabase no ha devuelto sesión (¿contraseña cambiada?)')
    return datos['access_token']


def subir(filas, token):
    """Se escribe por la función, no contra la tabla.

    publicar_estado_pedidos() comprueba por dentro quién llama. Y es la única
    forma que funciona: la cuenta del publicador no puede LEER la tabla —a
    propósito—, y sin lectura un upsert no resuelve el conflicto ni un UPDATE
    encuentra su fila. Escribiendo directamente daba de alta un pedido la
    primera vez y no podía volver a tocarlo nunca más.
    """
    escritos = 0
    for i in range(0, len(filas), POR_TANDA):
        tanda = filas[i:i + POR_TANDA]
        n = _peticion(
            f'{SUPA_URL}/rest/v1/rpc/publicar_estado_pedidos',
            {'p_filas': tanda},
            {'apikey': SUPA_ANON, 'Authorization': f'Bearer {token}',
             'Content-Type': 'application/json'},
        )
        escritos += int(n or 0)
    return escritos


# --------------------------------------------------------------------------

def resumir(resumen, filas):
    partes = ', '.join(f'{e}={n}' for e, n in sorted(resumen['por_estado'].items()))
    apuntar(f'{resumen["web"]} pedidos web en la cola, {resumen["en_plazo"]} de los últimos '
            f'{DIAS} días, {len(filas)} para publicar. {partes or "nada"}')
    if resumen['sin_estado']:
        apuntar(f'AVISO: {resumen["sin_estado"]} pedidos con un código de reparto que no '
                'conozco. No se publican; el bot contestará con WooCommerce.')
    if resumen['horas_raras']:
        apuntar(f'AVISO: {resumen["horas_raras"]} pedidos con una HORA que no entiendo; '
                'van con las 00:00.')


def principal():
    global CARPETA_DATOS
    p = argparse.ArgumentParser(description='Publica el estado real de los pedidos web.')
    p.add_argument('--seco', action='store_true', help='lo calcula todo y no escribe nada')
    p.add_argument('--credenciales', action='store_true', help='guarda la contraseña y sale')
    p.add_argument('--comprobar', nargs='+', metavar='Nº',
                   help='enseña qué saldría de esos pedidos y no escribe nada')
    p.add_argument('--datos', help=f'carpeta de los .dbf (ahora: {CARPETA_DATOS})')
    args = p.parse_args()

    if args.credenciales:
        guardar_credenciales()
        return 0

    if args.datos:
        CARPETA_DATOS = args.datos

    # El servidor apagado no es un fallo del publicador: se sale sin ruido y se
    # reintenta en la pasada siguiente. Si esto devolviera error, el Programador
    # de tareas lo marcaría en rojo cada noche.
    if not hay_unidad():
        apuntar(f'{CARPETA_DATOS} no está disponible (¿servidor apagado?). Lo dejo para la siguiente.')
        return 0

    pedidos, reparlin, repartos = leer_geminis()
    filas, resumen = construir_filas(pedidos, reparlin, repartos, dias=DIAS)

    if args.comprobar:
        quiero = {str(int(n)) for n in args.comprobar}
        encontrados = {f['pedido_web']: f for f in filas if f['pedido_web'] in quiero}
        for numero in args.comprobar:
            fila = encontrados.get(str(int(numero)))
            print(f'\n{numero}: ' + (json.dumps(fila, ensure_ascii=False, indent=2) if fila
                                     else 'no sale (fuera de los 60 días, sin estado, o no existe)'))
        return 0

    resumir(resumen, filas)

    if not filas:
        apuntar('ERROR: ni una fila publicable. No subo nada.')
        return 1

    if args.seco:
        apuntar('(--seco: no se ha escrito nada.)')
        return 0

    escritos = subir(filas, entrar())
    apuntar(f'Publicados {escritos} pedidos.')
    if escritos != len(filas):
        apuntar(f'ERROR: se mandaron {len(filas)} y se escribieron {escritos}.')
        return 1
    return 0


if __name__ == '__main__':
    try:
        sys.exit(principal())
    except SystemExit:
        raise
    except Exception as err:  # noqa: BLE001 — cualquier fallo tiene que quedar en el registro
        apuntar(f'ERROR: {err}')
        sys.exit(1)

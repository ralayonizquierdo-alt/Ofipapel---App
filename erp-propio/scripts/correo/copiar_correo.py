"""Copia a las carpetas de la oficina lo que E-milio ha cogido del correo (Rober, 28/11/2026).

Hoy: las TARIFAS de los proveedores, a la carpeta de red «Tarifas proveedores».
La nube no llega a la red de la oficina: este programa corre en un PC de la oficina (tarea programada de Windows, cada 15 min)
y llama a la función «correo-copias» del ERP.

Configuración: copiar_correo.json, junto a este fichero (NO se sube al repositorio):

    {
      "url": "https://sufxvpiwcncnyltrvoun.supabase.co/functions/v1/correo-copias",
      "clave": "…la clave de este PC…",
      "carpetas": {
        "tarifa": ["\\\\\\\\SERVIDOR\\\\Archivos Ofipapel\\\\Tarifas proveedores"]
      }
    }

Reglas:
- Solo escribe ficheros nuevos. Nunca borra ni sobrescribe: si ya existe uno con ese nombre y es distinto, lo guarda como
  «NOMBRE (2).xlsx».
- Un documento solo se da por copiado si llegó a TODAS sus carpetas. Si una no está (la red caída), se reintenta en la
  siguiente pasada.
- Solo usa la biblioteca estándar de Python 3.

Uso:  python copiar_correo.py            (una pasada)
      python copiar_correo.py --probar   (comprueba la clave y las carpetas, sin copiar nada)
"""

import hashlib
import json
import os
import sys
import urllib.request
from datetime import datetime

AQUI = os.path.dirname(os.path.abspath(__file__))
CONFIG = os.path.join(AQUI, 'copiar_correo.json')
REGISTRO = os.path.join(AQUI, 'copiar_correo.log')


def apunta(texto):
    linea = f'{datetime.now():%Y-%m-%d %H:%M:%S}  {texto}'
    print(linea)
    try:
        with open(REGISTRO, 'a', encoding='utf-8') as f:
            f.write(linea + '\n')
    except OSError:
        pass


def llamar(cfg, cuerpo):
    req = urllib.request.Request(
        cfg['url'],
        data=json.dumps(cuerpo).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'x-copias-clave': cfg['clave']},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode('utf-8'))
        except Exception:
            return {'ok': False, 'error': f'HTTP {e.code}'}


def descargar(url):
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read()


def huella(datos):
    return hashlib.md5(datos).hexdigest()


def guardar(carpeta, nombre, datos):
    """Guarda sin sobrescribir. Devuelve la ruta final (la que ya había si el contenido es el mismo)."""
    base, ext = os.path.splitext(nombre)
    n = 1
    while True:
        ruta = os.path.join(carpeta, nombre if n == 1 else f'{base} ({n}){ext}')
        if not os.path.exists(ruta):
            temporal = ruta + '.copiando'
            with open(temporal, 'wb') as f:
                f.write(datos)
            os.replace(temporal, ruta)
            return ruta
        with open(ruta, 'rb') as f:
            if huella(f.read()) == huella(datos):
                return ruta
        n += 1


def main():
    try:
        with open(CONFIG, encoding='utf-8') as f:
            cfg = json.load(f)
    except (OSError, ValueError) as e:
        apunta(f'No puedo leer {CONFIG}: {e}')
        return 1
    carpetas = cfg.get('carpetas') or {}

    if '--probar' in sys.argv:
        for tipo, lista in carpetas.items():
            for c in lista:
                apunta(f'{tipo}: {c} -> {"existe" if os.path.isdir(c) else "NO EXISTE o no se llega"}')
        r = llamar(cfg, {'pendientes': True})
        apunta(f'ERP: {"clave correcta" if r.get("ok") else r.get("error")}; pendientes de copiar: {len(r.get("documentos") or [])}')
        return 0 if r.get('ok') else 1

    r = llamar(cfg, {'pendientes': True})
    if not r.get('ok'):
        apunta(f'El ERP no da la lista: {r.get("error")}')
        return 1
    copiados = 0
    for d in r.get('documentos') or []:
        destinos = carpetas.get(d['tipo']) or []
        if not destinos:
            continue
        faltan = [c for c in destinos if not os.path.isdir(c)]
        if faltan:
            apunta(f'{d["nombre"]}: no llego a {", ".join(faltan)}; se reintenta luego.')
            continue
        try:
            datos = descargar(d['url'])
            rutas = [guardar(c, d['nombre'], datos) for c in destinos]
        except Exception as e:  # noqa: BLE001 - se apunta y se reintenta en la siguiente pasada
            apunta(f'{d["nombre"]}: no se ha podido copiar ({e}); se reintenta luego.')
            continue
        m = llamar(cfg, {'copiado': d['id'], 'rutas': rutas})
        if m.get('ok'):
            copiados += 1
            apunta(f'Copiado {d["nombre"]} -> {" | ".join(rutas)}')
        else:
            apunta(f'{d["nombre"]}: copiado, pero el ERP no lo ha apuntado ({m.get("error")}).')
    if copiados:
        apunta(f'{copiados} documentos copiados.')
    return 0


if __name__ == '__main__':
    sys.exit(main())

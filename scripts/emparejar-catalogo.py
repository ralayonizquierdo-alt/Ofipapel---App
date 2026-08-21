#!/usr/bin/env python3
"""Averigua cómo escribe el catálogo de ofipapel.net cada referencia de consumible.

    python3 scripts/emparejar-catalogo.py

Salida: netlify/functions/data/referencias-catalogo.json

EL PROBLEMA QUE RESUELVE

El Excel del proveedor da "TN248BK". El catálogo de la web escribe "TN-248". Y
el buscador de WordPress compara letra por letra, así que buscar "TN248" no
encuentra nada aunque el producto esté ahí. Lo mismo con "A4" contra "A-4", o
con "nº305" contra "305".

Hasta ahora el bot lo adivinaba: probaba varias formas (con guion, sin guion,
en singular...) a ver cuál colaba. Funciona a menudo, pero es adivinar, y cada
variante es una petición más a una web que ya va justa.

Este script quita la adivinanza: descarga el catálogo entero UNA vez, busca cada
referencia dentro de los nombres reales de los productos, y anota la forma
exacta en que aparece escrita. El bot ya no prueba: pregunta por lo que sabe que
existe.

CUÁNDO VOLVER A EJECUTARLO

- Cuando el proveedor mande un Excel nuevo y se regenere el índice de
  consumibles (scripts/generar-consumibles.py).
- Cuando entren familias de producto nuevas en la web.

No hace falta más: las referencias de consumible no cambian de nombre.

Tarda una media hora. Va despacio a propósito — la web ya nos bloqueó una vez
por ir deprisa, y esto no corre ninguna prisa.
"""

import collections
import json
import os
import re
import sys
import time
import unicodedata
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDICE = os.path.join(RAIZ, 'netlify', 'functions', 'data', 'consumibles-impresora.json')
SALIDA = os.path.join(RAIZ, 'netlify', 'functions', 'data', 'referencias-catalogo.json')

# Se usa la API pública de la tienda (no la privada) porque para esto solo hacen
# falta los nombres, y así el script se puede ejecutar sin las claves.
API = 'https://ofipapel.net/wp-json/wc/store/v1/products'
USER_AGENT = 'OfipapelWhatsAppBot/1.0 (+https://ofipapel.net; bot de atencion al cliente)'
POR_PAGINA = 100
ESPERA_ENTRE_PAGINAS = 1.5
REINTENTOS = 4


# --------------------------------------------------------------------------
# Descarga
# --------------------------------------------------------------------------

def pedir_pagina(pagina):
    url = f'{API}?per_page={POR_PAGINA}&page={pagina}&_fields=id,name'
    peticion = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
    with urllib.request.urlopen(peticion, timeout=60) as respuesta:
        cuerpo = respuesta.read().decode('utf-8', 'replace')

    # Si el cortafuegos del hosting nos corta, devuelve una página HTML con un
    # 200 — no un error. Ver WHATSAPP_SETUP.md, "Cuando ofipapel.net nos bloquea".
    if not cuerpo.lstrip().startswith('['):
        raise RuntimeError('la respuesta no es JSON (¿nos ha bloqueado el hosting?)')
    return json.loads(cuerpo)


def descargar_catalogo():
    productos, pagina, fallos = [], 1, 0
    while True:
        try:
            lote = pedir_pagina(pagina)
            fallos = 0
        except Exception as error:
            fallos += 1
            if fallos > REINTENTOS:
                raise SystemExit(f'Abandono en la página {pagina}: {error}')
            espera = 10 * fallos
            print(f'  página {pagina} falló ({error}); espero {espera}s', flush=True)
            time.sleep(espera)
            continue

        if not lote:
            return productos
        productos.extend(lote)
        if pagina == 1 or pagina % 10 == 0:
            print(f'  página {pagina}: {len(productos)} productos', flush=True)
        pagina += 1
        time.sleep(ESPERA_ENTRE_PAGINAS)


# --------------------------------------------------------------------------
# Emparejado
# --------------------------------------------------------------------------

def normalizar_con_mapa(texto):
    """Texto en mayúsculas y sin puntuación, más de dónde salió cada carácter.

    El mapa de posiciones es lo que permite recuperar después cómo estaba
    escrita la referencia en el nombre original ("TN-248") sabiendo dónde encaja
    la normalizada ("TN248")."""
    letras, posiciones = [], []
    base = unicodedata.normalize('NFD', str(texto or ''))
    for posicion, caracter in enumerate(base):
        if unicodedata.combining(caracter):
            continue
        mayuscula = caracter.upper()
        if mayuscula.isalnum():
            letras.append(mayuscula)
            posiciones.append(posicion)
    return ''.join(letras), posiciones, base


def normalizar(texto):
    return normalizar_con_mapa(texto)[0]


def forma_en_catalogo(nombre, referencia_normalizada):
    """Cómo aparece escrita esa referencia dentro del nombre del producto."""
    normalizado, posiciones, base = normalizar_con_mapa(nombre)
    donde = normalizado.find(referencia_normalizada)
    if donde < 0:
        return None
    inicio = posiciones[donde]
    fin = posiciones[donde + len(referencia_normalizada) - 1] + 1
    return unicodedata.normalize('NFC', base[inicio:fin])


# Mismos criterios que whatsapp-consumibles.js: los colores y las capacidades no
# distinguen un consumible de otro a efectos de buscarlo en el catálogo.
SUFIJO_DE_COLOR = re.compile(r'(BK|CL|VAL|CMY|[CMYK])$')
SUFIJO_DE_CAPACIDAD = re.compile(r'XX?L$')


def familia_de_referencia(referencia):
    base = SUFIJO_DE_CAPACIDAD.sub('', SUFIJO_DE_COLOR.sub('', str(referencia or '').upper()))
    return base or str(referencia or '').upper()


def familias_del_indice(indice):
    """Cada familia de referencia con las marcas de impresora que la usan."""
    familias = collections.defaultdict(set)
    for impresora in indice['impresoras']:
        for posicion in impresora['c']:
            referencia = indice['consumibles'][posicion].get('r')
            if referencia:
                familias[familia_de_referencia(referencia)].add(impresora['m'])
    return familias


def emparejar(catalogo, familias):
    nombres = [(producto, normalizar(producto['name'])) for producto in catalogo]
    encontradas, perdidas = {}, []

    for familia, marcas in sorted(familias.items()):
        referencia = normalizar(familia)
        # Menos de tres caracteres encaja con demasiadas cosas por casualidad.
        if len(referencia) < 3:
            continue

        marcas_normalizadas = {normalizar(marca)[:4] for marca in marcas}
        coincidencias = [
            producto
            for producto, nombre in nombres
            if referencia in nombre and any(marca in nombre for marca in marcas_normalizadas)
        ]

        if not coincidencias:
            perdidas.append({'familia': familia, 'marcas': sorted(marcas)})
            continue

        # Puede aparecer escrita de varias formas entre productos distintos; se
        # queda la más repetida, que es la del grueso del catálogo.
        formas = collections.Counter()
        for producto in coincidencias:
            forma = forma_en_catalogo(producto['name'], referencia)
            if forma:
                formas[forma] += 1

        encontradas[familia] = {
            'q': formas.most_common(1)[0][0] if formas else familia,
            'n': len(coincidencias),
            'compatibles': sum(1 for p in coincidencias if 'compatible' in p['name'].lower()),
        }

    return encontradas, perdidas


def main():
    with open(INDICE, encoding='utf-8') as fichero:
        indice = json.load(fichero)

    print('Descargando el catálogo de ofipapel.net (tarda ~30 min)...', flush=True)
    catalogo = descargar_catalogo()
    print(f'{len(catalogo)} productos descargados.\n', flush=True)

    familias = familias_del_indice(indice)
    encontradas, perdidas = emparejar(catalogo, familias)

    total = len(familias)
    print(f'{len(encontradas)} de {total} referencias encontradas en el catálogo '
          f'({100 * len(encontradas) / max(1, total):.0f}%)')
    con_compatible = sum(1 for v in encontradas.values() if v['compatibles'] > 0)
    print(f'{con_compatible} de ellas tienen versión compatible.')

    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, 'w', encoding='utf-8') as fichero:
        json.dump(
            {
                'generado': time.strftime('%Y-%m-%d'),
                'productos_revisados': len(catalogo),
                'referencias': {familia: datos['q'] for familia, datos in sorted(encontradas.items())},
            },
            fichero,
            ensure_ascii=False,
            separators=(',', ':'),
        )
    print(f'-> {SALIDA}')

    if perdidas:
        print(f'\n{len(perdidas)} referencias no aparecen en el catálogo. '
              'No es un fallo: son consumibles que el distribuidor tiene y la tienda no vende por web.')


if __name__ == '__main__':
    sys.exit(main())

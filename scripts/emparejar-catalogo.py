#!/usr/bin/env python3
"""Averigua cómo escribe el catálogo de ofipapel.net cada referencia de consumible.

    python3 scripts/emparejar-catalogo.py [catalogo-en-cache.json]

Si se le pasa un fichero, lo usa como catálogo si existe y lo escribe si no —
así se puede repetir el emparejado sin volver a descargar media hora.

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

def sin_acentos(texto):
    base = unicodedata.normalize('NFD', str(texto or ''))
    return ''.join(c for c in base if not unicodedata.combining(c)).upper()


# Lo que separa las partes de una referencia según quién la escriba: el
# proveedor pone "TN248", el catálogo "TN-248", y a veces "(Nº305)" o "604-XL".
SEPARADORES = r'[\s\-.,/()ºN°_]*'


def patron_de_referencia(referencia):
    """Regex que encuentra la referencia escrita como sea, pero como PALABRA.

    Buscar por trozos de texto sin más no vale, y se vio en las pruebas:
      - "120A" encajaba dentro de "OfficeJet Pro 8120 (Amarillo)".
      - "14A" encajaba dentro de "TAMBOR ... (314-A)".
      - "207X" encajaba dentro de "W207xA", que es otro producto.

    De ahí las dos condiciones:
      - Delante no puede haber letra ni dígito.
      - Detrás no puede haber un dígito. Letras sí: "TN-248XL" y "(603XL)" son
        la misma familia que "TN-248" y "603", solo que en tamaño grande.
    """
    partes = re.findall(r'[A-Z]+|[0-9]+', sin_acentos(referencia))
    if not partes:
        return None
    cuerpo = SEPARADORES.join(re.escape(parte) for parte in partes)
    return re.compile(rf'(?<![A-Z0-9]){cuerpo}(?![0-9])')


# Mismos criterios que whatsapp-consumibles.js: ni el color ni la capacidad
# distinguen un consumible de otro a la hora de buscarlo en el catálogo.
# TN248BK, TN248C y TN248XLM son todos "TN248"; 604 y 604XL son "604".
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
    nombres = [(producto, sin_acentos(producto['name'])) for producto in catalogo]
    encontradas, perdidas = {}, []

    for familia, marcas in sorted(familias.items()):
        # Menos de tres caracteres encaja con demasiadas cosas por casualidad.
        if len(re.sub(r'[^A-Z0-9]', '', familia.upper())) < 3:
            continue
        patron = patron_de_referencia(familia)
        if not patron:
            continue

        marcas_normalizadas = {sin_acentos(marca)[:4] for marca in marcas}
        coincidencias = []
        for producto, nombre in nombres:
            encaje = patron.search(nombre)
            if not encaje:
                continue
            # La marca tiene que estar en el nombre: sin esto, una referencia
            # corta de una marca acaba encontrando productos de otra.
            if not any(marca in nombre for marca in marcas_normalizadas):
                continue
            coincidencias.append((producto, encaje))

        if not coincidencias:
            perdidas.append({'familia': familia, 'marcas': sorted(marcas)})
            continue

        # La forma exacta se saca del nombre original, en la posición donde
        # encajó. Puede variar entre productos; se queda la más repetida.
        formas = collections.Counter(
            producto['name'][encaje.start():encaje.end()] for producto, encaje in coincidencias
        )
        encontradas[familia] = {
            'q': formas.most_common(1)[0][0],
            'n': len(coincidencias),
            'compatibles': sum(1 for p, _ in coincidencias if 'compatible' in p['name'].lower()),
        }

    return encontradas, perdidas


def main():
    with open(INDICE, encoding='utf-8') as fichero:
        indice = json.load(fichero)

    # Con un catálogo ya descargado se puede repetir el emparejado sin volver a
    # bajarlo, que es media hora y una carga innecesaria para la web.
    cache = sys.argv[1] if len(sys.argv) > 1 else None
    if cache and os.path.exists(cache):
        with open(cache, encoding='utf-8') as fichero:
            catalogo = json.load(fichero)
        print(f'Catálogo leído de {cache}: {len(catalogo)} productos.\n', flush=True)
    else:
        print('Descargando el catálogo de ofipapel.net (tarda ~30 min)...', flush=True)
        catalogo = descargar_catalogo()
        print(f'{len(catalogo)} productos descargados.\n', flush=True)
        if cache:
            with open(cache, 'w', encoding='utf-8') as fichero:
                json.dump(catalogo, fichero, ensure_ascii=False)

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

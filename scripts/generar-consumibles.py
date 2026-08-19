#!/usr/bin/env python3
"""Genera el índice "qué consumible lleva cada impresora" que usa el bot.

    python3 scripts/generar-consumibles.py Inf_Art_Rel.xlsx

Entrada: el Excel de relación equipo-consumible del distribuidor (columnas
Cod_Inforpor_Pad / Dsc_Padre / MarcaPad / Cod_Inforpor_Hijo / Dsc_Hijo /
Familia / Tipo_Rel). Salida: netlify/functions/data/consumibles-impresora.json.

Hay que volver a lanzarlo cada vez que el proveedor mande un Excel nuevo. Es lo
único manual de todo esto: el bot no consulta nada por red para los
consumibles.

Requiere openpyxl (pip install openpyxl). No forma parte de ningún build ni del
despliegue — se ejecuta a mano y se commitea el JSON resultante.

Tres cosas que hace y no son obvias:

1. Arregla el mojibake del Excel. Viene en UTF-8 leído como latin-1
   ("DepÃ³sito", "nÂº305"), así que se re-decodifica.
2. Saca la referencia COMERCIAL de la descripción. El código que trae el Excel
   (C13T05H24010, W2032A) es el del almacén y no lo conoce nadie; el que el
   cliente ve en la caja y el que usa la web (603XL, nº415A, TK-5490) está
   metido dentro del texto de la descripción.
3. Saca alias de modelo de la descripción del equipo, normalizados sin guiones
   ni espacios, para que "MFC-L2710DW" y "MFCL2710DW" sean lo mismo.
"""

import datetime
import json
import os
import re
import sys

RUIDO = set('''IMPRESORA IMPRESORAS MULTIFUNCION MULTIFUNCIONAL MULTIFUNCIÓN EQUIPO EQUIPOS
LASER LÁSER LED INKJET MONOCROMO COLOR CCOLOR ESCANER ESCÁNER ROTULADORA MAQUINA MÁQUINA
ETIQUETAS TICKETS SELLOS TRANSFERENCIA TERMICA TÉRMICA DIRECTA INDUSTRIAL SOBREMESA
PORTATIL PORTÁTIL PROFESIONAL DE DEL LA EL LOS LAS Y CON SIN PARA EN UN UNA
GRAN FORMATO A3 A4 EUR EMEA HV STD MFP SFP DESCATALOGADA DESCATALOGADO DESCONTINUADO
NUEVA SERIE INCLUYE INCLUIDO INCLUIDA TASA WEEE PPM PAGINAS BANDEJA WIFI BLUETOOTH
KIT MALETIN PILAS ULTIMAS UNIDADES NEGRO BLANCO AZUL SILVER BLACK BLUE HOGAR OFICINA
REQUIERE SOPORTE PEDESTAL ROLLO ROLLOS RECONOCIMIENTO CINTA'''.split())

# tokens que parecen modelo pero no lo son
FALSO = re.compile(r'^(A[34]|\d{1,3}PPM|\d+EN\d+|\d+X\d+|220240V|\d+MM|\d+CM|\d+MT|\d+M|\d+IN|\d+PAG\w*|\d+K|\d{1,3}W|V\d|USB\d?|CAT\d|\d+BIT)$')

def norm(s): return re.sub(r'[^A-Z0-9]', '', str(s or '').upper())

def limpia_nombre(dsc, marca):
    t = re.sub(r'\s*\(.*?\)\s*', ' ', dsc)                 # quita paréntesis
    t = re.sub(r'\*+[^*]*\*+', ' ', t)                      # quita ***descatalogado***
    t = re.sub(rf'^\s*(RICOH\s*-?\s*)?{re.escape(marca)}\s*[-–]?\s*', '', t, flags=re.I)
    return re.sub(r'\s+', ' ', t).strip(' -,')

def alias_de(dsc, ref, marca):
    nombre = limpia_nombre(dsc, marca)
    cand = []
    for tok in re.split(r'[\s,/]+', nombre):
        tok = tok.strip('.,()[]')
        base = norm(tok)
        if len(base) < 4 or base in RUIDO or FALSO.match(base): continue
        if not (re.search(r'\d', base) and re.search(r'[A-Z]', base)): continue
        if norm(marca).startswith(base[:4]): continue
        cand.append(base)
    # el código de fabricante, si parece modelo (letras+dígitos, sin # ni sufijos raros)
    nref = norm(ref)
    if re.search(r'\d', nref) and re.search(r'[A-Z]', nref) and 4 <= len(nref) <= 14 \
       and '#' not in str(ref) and not re.match(r'^(C1[13]|PA0|1[17]0|6A[GJ])', nref):
        cand.append(nref)
    # modelos que son solo número: 'DeskJet 4310', 'Smart Tank Plus 570'.
    # El número suelto no sirve como alias (demasiado ambiguo), así que se une
    # al nombre de la serie que lo precede: DESKJET4310, SMARTTANKPLUS570.
    palabras = [w for w in re.split(r'[\s,/]+', nombre) if w]
    for i, w in enumerate(palabras):
        num = norm(w)
        if not (num.isdigit() and 3 <= len(num) <= 4): continue
        mejor = None
        for cuantas in (1, 2, 3):
            if i - cuantas < 0: continue
            previas = [norm(x) for x in palabras[i - cuantas:i]]
            if any(not x.isalpha() or len(x) < 2 or x in RUIDO for x in previas): continue
            mejor = ''.join(previas) + num
        if mejor: cand.append(mejor)

    vistos, out = set(), []
    for c in cand:
        if c in vistos: continue
        vistos.add(c); out.append(c)
    return nombre, out


# Familias de consumible que una papelería atiende de verdad por WhatsApp.
# Fuera quedan gran formato, etiquetadoras industriales, escáneres de producción.
FAM_TIENDA = {
 'CONSUMIBLES LASER','CONSUMIBLES LASER BROTHER NUEVOS','CONSUMIBLES INKJET',
 'CONSUMIBLES WORKFORCE SX EPSON','CONSUMIBLES IMPRESORAS 1N','CONSUMIBLES LASER T70',
 'CONSUMIBLES LASER EXECUTIVE','CONSUMIBLES IMPRESORAS 1N T70','CONSUMIBLES LASER NFP',
 'CONSUMIBLES LASER ESP','CONSUMIBLES COPIADORAS','CONSUMIBLES WORKFORCE XXL EPSON',
 'CONSUMIBLES CONTRACTUALES HP','CINTAS','CONSUMIBLES ETIQUETADORAS','CINTAS ROTULADORAS',
}

# Cada patrón saca la referencia COMERCIAL: la que el cliente ve en la caja y la
# que la web de Ofipapel usa en el nombre del producto. El código de fabricante
# (C13T05H24010, W2032A...) no lo conoce nadie fuera del almacén.
PAT = [
  re.compile(r'n[ºo°]\s?(\d{2,4}X{0,2}L?[A-Z]?)', re.I),                  # HP nº305, nº415A, nº302XL
  re.compile(r'(?<![A-Z0-9])(\d{2,4}X{1,2}L)(?![A-Z0-9])', re.I),         # Epson 603XL, 405XXL
  re.compile(r'(?<![A-Z0-9])((?:TK|MK|DK)-?\d{3,4}[A-Z]?)(?![A-Z0-9])', re.I),   # Kyocera
  re.compile(r'(?<![A-Z0-9])((?:PFI|PG|CL|CLI|GI|BCI|CRG)-?\d{2,4}[A-Z]{0,2})(?![A-Z0-9])', re.I),  # Canon
  re.compile(r'(?<![A-Z0-9])((?:TN|DR|LC|TL|CTL|DL|PC)-?\d{2,4}[A-Z]{0,3})(?![A-Z0-9])', re.I),     # Brother/Pantum
  re.compile(r'(?<![A-Z0-9])(\d{2,3}[AX])(?![A-Z0-9])'),                  # HP 658A, 212X
]

# Epson y HP escriben muchos cartuchos de tinta con el número a secas
# ("Singlepack Magenta 502 Ink", "Cartucho 308 Negro"). El número suelto solo se
# acepta en esas dos marcas y en artículos de tinta, descartando medidas.
PAT_EPSON = re.compile(r'(?<![A-Z0-9º-])(\d{2,4})(?!\s?(?:ml|mm|gr|pag|p\b|hojas))(?![A-Z0-9-])', re.I)

def norm(s): return re.sub(r'[^A-Z0-9]', '', str(s or '').upper())

def refs_de(dsc, ref_fab, marca=''):
    out, vistos = [], set()
    def add(t):
        t = str(t).strip()
        k = norm(t)
        if len(k) < 2 or k in vistos: return
        vistos.add(k); out.append(t)
    for p in PAT:
        for m in p.finditer(str(dsc)): add(m.group(1))
    tinta = re.search(r'cartucho|botella|tinta|singlepack|multipack', str(dsc), re.I)
    if str(marca).upper() in ('EPSON', 'HP') and tinta:
        for m in PAT_EPSON.finditer(str(dsc)):
            n = m.group(1)
            if 20 <= int(n) <= 9999: add(n)
    add(ref_fab)
    return out


# --------------------------------------------------------------------------
# Generación del fichero
# --------------------------------------------------------------------------

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA_POR_DEFECTO = os.path.join(RAIZ, 'netlify', 'functions', 'data', 'consumibles-impresora.json')


def arregla_mojibake(valor):
    if not isinstance(valor, str):
        return valor
    try:
        return valor.encode('latin-1').decode('utf-8')
    except (UnicodeEncodeError, UnicodeDecodeError):
        return valor


def limpia_consumible(dsc, marca):
    texto = re.sub(r'\s+', ' ', str(dsc)).strip()
    return re.sub(rf'^{re.escape(str(marca))}\s+', '', texto, flags=re.I)


def generar(ruta_xlsx, ruta_salida):
    import openpyxl

    hoja = openpyxl.load_workbook(ruta_xlsx, read_only=True, data_only=True).worksheets[0]

    consumibles, idx_consumible = [], {}
    impresoras, idx_impresora = [], {}

    for fila in hoja.iter_rows(min_row=2, values_only=True):
        if not fila or fila[0] is None or arregla_mojibake(fila[12]) != 'Consumibles':
            continue

        familia_hijo = arregla_mojibake(fila[11])
        if familia_hijo not in FAM_TIENDA:
            continue

        equipo_id, equipo_ref = fila[0], arregla_mojibake(fila[1])
        equipo_dsc, equipo_marca = arregla_mojibake(fila[2]), arregla_mojibake(fila[4])
        hijo_id, hijo_ref = fila[6], arregla_mojibake(fila[7])
        hijo_dsc, hijo_marca = arregla_mojibake(fila[8]), arregla_mojibake(fila[10])

        if hijo_id not in idx_consumible:
            referencias = refs_de(hijo_dsc, hijo_ref, hijo_marca)
            idx_consumible[hijo_id] = len(consumibles)
            consumibles.append({
                'd': limpia_consumible(hijo_dsc, hijo_marca),
                'r': referencias[0] if referencias else str(hijo_ref),  # la comercial
                'f': str(hijo_ref),                                     # la del proveedor
            })

        if equipo_id not in idx_impresora:
            nombre, alias = alias_de(equipo_dsc, equipo_ref, equipo_marca)
            if not alias:
                continue                      # sin alias no hay forma de reconocerla
            idx_impresora[equipo_id] = len(impresoras)
            impresoras.append({'m': equipo_marca, 'n': nombre, 'a': alias, 'c': []})

        if equipo_id in idx_impresora:
            lista = impresoras[idx_impresora[equipo_id]]['c']
            posicion = idx_consumible[hijo_id]
            if posicion not in lista:
                lista.append(posicion)

    impresoras = [i for i in impresoras if i['c']]

    # Un consumible al que ya no apunta ninguna impresora sobra: se descarta y se
    # renumeran los índices para no arrastrar huecos en el JSON.
    usados = sorted({p for imp in impresoras for p in imp['c']})
    renumerado = {viejo: nuevo for nuevo, viejo in enumerate(usados)}
    consumibles = [consumibles[p] for p in usados]
    for imp in impresoras:
        imp['c'] = [renumerado[p] for p in imp['c']]

    os.makedirs(os.path.dirname(ruta_salida), exist_ok=True)
    with open(ruta_salida, 'w', encoding='utf-8') as fichero:
        json.dump({
            'generado': datetime.date.today().isoformat(),
            'origen': os.path.basename(ruta_xlsx),
            'impresoras': impresoras,
            'consumibles': consumibles,
        }, fichero, ensure_ascii=False, separators=(',', ':'))

    return len(impresoras), len(consumibles)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    salida = sys.argv[2] if len(sys.argv) > 2 else SALIDA_POR_DEFECTO
    n_impresoras, n_consumibles = generar(sys.argv[1], salida)
    print(f'{n_impresoras} impresoras y {n_consumibles} consumibles -> {salida}')

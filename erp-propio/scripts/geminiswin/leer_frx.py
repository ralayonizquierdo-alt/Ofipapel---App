"""Lee informes de Visual FoxPro (.FRX/.FRT y .F2X/.F2T de FoxPro 2.x) y los vuelca a JSON."""
import json, os, struct, sys

TIPOS = {1: 'informe', 5: 'texto', 6: 'linea', 7: 'recuadro', 8: 'campo', 9: 'banda',
         17: 'imagen', 18: 'variable', 23: 'fuente', 25: 'entorno_datos', 26: 'cursor', 27: 'relacion'}
BANDAS = {0: 'titulo', 1: 'cabecera_pagina', 2: 'cabecera_columna', 3: 'cabecera_grupo', 4: 'detalle',
          5: 'pie_grupo', 6: 'pie_columna', 7: 'pie_pagina', 8: 'resumen'}
TOTALES = {0: None, 1: 'cuenta', 2: 'suma', 3: 'media', 4: 'minimo', 5: 'maximo', 6: 'desv', 7: 'varianza'}


def txt(b):
    return b.decode('cp1252', 'replace').replace('\x00', '').strip()


def leer_memo(fpt, ptr):
    if not fpt or ptr <= 0:
        return ''
    bloque = struct.unpack('>H', fpt[6:8])[0] or 512
    pos = ptr * bloque
    if pos + 8 > len(fpt):
        return ''
    largo = struct.unpack('>I', fpt[pos + 4:pos + 8])[0]
    return txt(fpt[pos + 8:pos + 8 + largo])


def leer_tabla(ruta_dbf, ruta_fpt):
    d = open(ruta_dbf, 'rb').read()
    fpt = open(ruta_fpt, 'rb').read() if ruta_fpt and os.path.exists(ruta_fpt) else b''
    nreg, lcab, lreg = struct.unpack('<IHH', d[4:12])
    campos, i, off = [], 32, 1
    while d[i] != 0x0D:
        nombre = d[i:i + 11].split(b'\0')[0].decode('ascii', 'replace')
        tipo, largo = chr(d[i + 11]), d[i + 16]
        campos.append((nombre, tipo, off, largo))
        off += largo
        i += 32
    filas = []
    for r in range(nreg):
        base = lcab + r * lreg
        reg = d[base:base + lreg]
        if not reg or reg[0:1] == b'*':
            continue
        fila = {}
        for nombre, tipo, o, l in campos:
            v = reg[o:o + l]
            if tipo == 'M':
                if l == 4:
                    ptr = struct.unpack('<I', v)[0]
                else:
                    s = txt(v)
                    ptr = int(s) if s.isdigit() else 0
                fila[nombre] = leer_memo(fpt, ptr)
            elif tipo == 'N':
                s = txt(v)
                try:
                    fila[nombre] = float(s) if '.' in s else int(s)
                except ValueError:
                    fila[nombre] = None
            elif tipo == 'L':
                fila[nombre] = txt(v).upper() in ('T', 'Y')
            else:
                fila[nombre] = txt(v)
        filas.append(fila)
    return filas


def informe(ruta_dbf, ruta_fpt):
    filas = leer_tabla(ruta_dbf, ruta_fpt)
    # FoxPro 2.x guarda una copia por plataforma: nos quedamos con la de Windows si la hay
    plataformas = {f.get('PLATFORM', '').upper() for f in filas}
    if 'WINDOWS' in plataformas:
        filas = [f for f in filas if f.get('PLATFORM', '').upper() == 'WINDOWS']
    out = {'bandas': [], 'objetos': [], 'variables': [], 'datos': [], 'cabecera': {}}
    bandas = []
    for f in filas:
        t = f.get('OBJTYPE')
        tipo = TIPOS.get(t, str(t))
        if t == 1:
            # EXPR lleva la configuración de la impresora (ORIENTATION, PAPERSIZE…); TAG/TAG2 son binarios
            out['cabecera'] = {'impresora': f.get('EXPR', '')}
        elif t == 9:
            b = {'banda': BANDAS.get(f.get('OBJCODE'), f.get('OBJCODE')), 'vpos': f.get('VPOS'), 'alto': f.get('HEIGHT')}
            if f.get('EXPR'):
                b['agrupa_por'] = f['EXPR']
            if f.get('PAGEBREAK'):
                b['salto_pagina'] = True
            bandas.append(b)
        elif t == 18:
            out['variables'].append({k: v for k, v in {
                'nombre': f.get('NAME'), 'valor': f.get('EXPR'), 'inicial': f.get('TAG'),
                'calculo': TOTALES.get(f.get('TOTALTYPE')), 'reinicio': f.get('RESETTOTAL')}.items() if v})
        elif t in (25, 26, 27):
            out['datos'].append({k: v for k, v in {'tipo': tipo, 'nombre': f.get('NAME'), 'expr': f.get('EXPR'),
                                                  'tag': f.get('TAG')[:400] if f.get('TAG') else ''}.items() if v})
        elif t in (5, 8, 6, 7, 17):
            o = {'tipo': tipo, 'vpos': f.get('VPOS'), 'hpos': f.get('HPOS'), 'ancho': f.get('WIDTH'), 'alto': f.get('HEIGHT')}
            if f.get('EXPR'):
                o['texto' if t == 5 else 'expr'] = f['EXPR']
            if f.get('PICTURE'):
                o['formato'] = f['PICTURE']
            if t == 8 and TOTALES.get(f.get('TOTALTYPE')):
                o['total'] = TOTALES.get(f.get('TOTALTYPE'))
            if f.get('SUPEXPR'):
                o['imprimir_si'] = f['SUPEXPR']
            if f.get('FONTFACE'):
                o['fuente'] = f'{f["FONTFACE"]} {f.get("FONTSIZE")}' + (' negrita' if (f.get('FONTSTYLE') or 0) & 1 else '')
            out['objetos'].append({k: v for k, v in o.items() if v not in (None, '')})
    # Las bandas van apiladas en el orden del fichero; entre una y otra el diseñador deja la barra
    # del nombre de la banda debajo de cada una (0,2083 pulgadas = 2083,333 unidades). Cada objeto va a la banda en la que cae.
    BARRA = 2083.333 if any((f.get('PLATFORM') or '').upper() == 'WINDOWS' for f in filas) else 1
    arriba = 0.0
    for b in bandas:
        b['desde'] = round(arriba, 3)
        b['hasta'] = round(arriba + (b['alto'] or 0), 3)
        arriba = b['hasta'] + BARRA
        b.pop('vpos', None)
    for o in out['objetos']:
        v = o.get('vpos') or 0
        dentro = [b for b in bandas if b['desde'] - BARRA <= v]
        o['banda'] = dentro[-1]['banda'] if dentro else (bandas[0]['banda'] if bandas else None)
    out['bandas'] = bandas
    out['objetos'].sort(key=lambda o: (o.get('vpos') or 0, o.get('hpos') or 0))
    return out


if __name__ == '__main__':
    raiz, salida = sys.argv[1], sys.argv[2]
    total, errores = 0, []
    resultado = []
    for carpeta, _, ficheros in os.walk(raiz):
        for fich in sorted(ficheros):
            base, ext = os.path.splitext(fich)
            if ext.lower() not in ('.frx', '.f2x'):
                continue
            memo_ext = '.frt' if ext.lower() == '.frx' else '.f2t'
            memo = next((os.path.join(carpeta, m) for m in ficheros if m.lower() == (base + memo_ext).lower()), None)
            rel = os.path.relpath(os.path.join(carpeta, fich), raiz).replace('\\', '/')
            try:
                inf = informe(os.path.join(carpeta, fich), memo)
                inf.update({'fichero': rel, 'nombre': base, 'carpeta': os.path.dirname(rel) or '.',
                            'formato': 'foxpro2' if ext.lower() == '.f2x' else 'vfp', 'sin_memo': memo is None})
                resultado.append(inf)
                total += 1
            except Exception as e:  # noqa: BLE001
                errores.append(f'{rel}: {e}')
    json.dump(resultado, open(salida, 'w', encoding='utf-8'), ensure_ascii=False)
    print(total, 'informes leídos;', len(errores), 'errores')
    for e in errores[:20]:
        print(' ', e)

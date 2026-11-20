"""Puente de reparto GeminisWin → app de repartidores (tarea 35). TEMPORAL, hasta usar el ERP propio.

Qué hace en cada pasada (pensado para lanzarse cada 5 minutos con el Programador de tareas):
  1. Pregunta al servidor qué rutas hay que traer (parámetro «reparto.puente_gw_rutas» del ERP).
  2. Lee, SOLO LECTURA, los ficheros de GeminisWin: REPARTOS, REPARLIN, VENTAS y FACTURAS.
  3. Manda los repartos abiertos («Generado») de esas rutas, con sus líneas, a la app.
  4. Si el ERP lo pide (parámetro «reparto.puente_gw_ventas»), manda también las VENTAS NUEVAS (con la ruta y
     la dirección del cliente o de su sucursal) y vuelve a leer las ventas que el ERP le dice que vigile: así el
     ERP puede generar los repartos y la Caja sabe qué está ya cobrado en GeminisWin (18/11/2026).

Uso:
  python puente_reparto.py            una pasada: leer y enviar
  python puente_reparto.py --prueba   leer y enseñar un resumen SIN enviar nada (sin nombres)
  python puente_reparto.py --ping     comprobar la clave y ver las rutas elegidas
  python puente_reparto.py --partes   bajar el «parte» de cada reparto (lo marcado en la app) a la carpeta partes\\

Junto a este fichero:
  puente_reparto.json    configuración (se crea sola la primera vez con los valores por defecto)
  puente_reparto.clave   la clave del puente (una línea). NO va en el repositorio ni se enseña.
  puente_reparto.estado  memoria entre pasadas (dónde está cada venta en el fichero). Se puede borrar.
  puente_reparto.log     registro de cada pasada.

Reglas que NO se tocan:
  · Los ficheros de GeminisWin se abren en binario, solo lectura y compartidos. Nunca se escribe en
    ellos, no se usan los .CDX ni los .FPT, y no se instala nada en el servidor.
  · Solo usa la biblioteca estándar de Python (no hay nada que instalar).
  · Los registros borrados (primer byte «*») y los que salen a medias se ignoran.
"""
import datetime as dt
import json
import os
import struct
import sys
import urllib.error
import urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
POR_DEFECTO = {
    # Ruta de red completa, no la letra G: — desde el Programador de tareas la letra puede no existir.
    'carpeta': r'\\SERVER-OFIPAPEL\GEMINISW\GW002024',
    'url': 'https://sufxvpiwcncnyltrvoun.supabase.co/functions/v1/reparto-gw-ingesta',
    'dias': 6,                    # solo repartos generados en los últimos N días
    'cola_repartos': 3000,        # cuántos registros del final de REPARTOS se miran
    'cola_lineas': 25000,         # ídem REPARLIN (unos 4 meses de líneas)
    'max_busqueda_ventas': 250000,    # hasta dónde se busca hacia atrás una venta que no se conoce
    'max_busqueda_facturas': 80000,
    'estados_fuera': [1, 6, 8, 10],   # estados de línea que no se llevan a la app (ver LEEME de Cowork)
    'fecha_mas_dias': 1,          # REPARTOS.FECHA es el día en que se genera; se reparte al día siguiente…
    'salta_fin_de_semana': True,  # …salvo el del viernes, que queda para el lunes (Rober, 13/11/2026)
    'cola_ventas_nuevas': 4000,   # la primera vez, cuántas ventas del final de VENTAS se mandan (unas dos semanas)
    'max_busqueda_clientes': 40000,
    'ventas_por_envio': 400,
}


def ruta_local(nombre):
    return os.path.join(AQUI, nombre)


def registrar(texto):
    linea = f"{dt.datetime.now():%Y-%m-%d %H:%M:%S}  {texto}"
    print(linea)
    try:
        f = ruta_local('puente_reparto.log')
        if os.path.exists(f) and os.path.getsize(f) > 2_000_000:   # no crece sin fin
            os.replace(f, f + '.anterior')
        with open(f, 'a', encoding='utf-8') as h:
            h.write(linea + '\n')
    except OSError:
        pass


# ── Lectura de DBF de Visual FoxPro (sin escribir, sin índices, sin memos) ──────────────────────────
class Dbf:
    def __init__(self, fichero, campos, opcionales=()):
        """«campos» tienen que estar; los de «opcionales» se leen si el fichero los tiene."""
        campos = list(campos) + [c for c in opcionales if c not in campos]
        self.f = open(fichero, 'rb')            # en Windows: lectura compartida, no bloquea a nadie
        cab = self.f.read(32)
        self.n, self.lcab, self.lreg = struct.unpack('<IHH', cab[4:12])
        self.campos = {}
        pos = 1
        while True:
            d = self.f.read(32)
            if len(d) < 32 or d[0] == 0x0D:
                break
            nombre = d[:11].split(b'\0')[0].decode('ascii', 'replace')
            if nombre in campos:
                self.campos[nombre] = (pos, d[16], chr(d[11]), d[17])
            pos += d[16]
        faltan = [c for c in campos if c not in self.campos and c not in opcionales]
        if faltan:
            raise RuntimeError(f'{os.path.basename(fichero)}: no tiene los campos {faltan}')
        # El nº de registros de la cabecera puede ir por detrás de lo ya escrito: manda el tamaño real.
        self.n = max(0, min(self.n, (os.fstat(self.f.fileno()).st_size - self.lcab) // self.lreg))

    def cerrar(self):
        self.f.close()

    def _valor(self, reg, campo):
        pos, lon, tipo, _dec = self.campos[campo]
        b = reg[pos:pos + lon]
        if tipo == 'C':
            return b.decode('cp1252', 'replace').replace('\0', ' ').strip()
        if tipo in 'NF':
            t = b.decode('ascii', 'replace').strip()
            if not t or '*' in t:
                return None
            try:
                return float(t) if '.' in t else int(t)
            except ValueError:
                return None
        if tipo == 'D':
            t = b.decode('ascii', 'replace').strip()
            return f'{t[:4]}-{t[4:6]}-{t[6:8]}' if len(t) == 8 and t.isdigit() else None
        if tipo == 'I':
            return struct.unpack('<i', b)[0]
        if tipo == 'L':
            return b in (b'T', b't', b'Y', b'y')
        return None

    def registro(self, numero):
        """Un registro por su número (desde 0). None si está borrado o no se pudo leer entero."""
        if numero < 0 or numero >= self.n:
            return None
        self.f.seek(self.lcab + numero * self.lreg)
        reg = self.f.read(self.lreg)
        if len(reg) < self.lreg or reg[:1] == b'*':
            return None
        return {c: self._valor(reg, c) for c in self.campos}

    def hacia_atras(self, maximo, bloque=2000):
        """Recorre los últimos «maximo» registros, del más nuevo al más viejo: (numero, datos)."""
        fin = self.n
        tope = max(0, self.n - maximo)
        while fin > tope:
            ini = max(tope, fin - bloque)
            self.f.seek(self.lcab + ini * self.lreg)
            trozo = self.f.read((fin - ini) * self.lreg)
            for i in range((len(trozo) // self.lreg) - 1, -1, -1):
                reg = trozo[i * self.lreg:(i + 1) * self.lreg]
                if reg[:1] != b'*':
                    yield ini + i, {c: self._valor(reg, c) for c in self.campos}
            fin = ini

    def hacia_delante(self, desde, bloque=2000):
        """Recorre desde el registro «desde» hasta el final, del más viejo al más nuevo: (numero, datos)."""
        ini = max(0, desde)
        while ini < self.n:
            fin = min(self.n, ini + bloque)
            self.f.seek(self.lcab + ini * self.lreg)
            trozo = self.f.read((fin - ini) * self.lreg)
            for i in range(len(trozo) // self.lreg):
                reg = trozo[i * self.lreg:(i + 1) * self.lreg]
                if reg[:1] != b'*':
                    yield ini + i, {c: self._valor(reg, c) for c in self.campos}
            ini = fin


def buscar_por(dbf, claves, campos_clave, memoria, maximo):
    """Como buscar(), con una clave de uno o varios campos: {clave (tupla): datos}."""
    hallados, faltan = {}, set()
    for k in claves:
        pos = memoria.get('|'.join(str(x) for x in k))
        r = dbf.registro(pos) if isinstance(pos, int) else None
        if r and tuple(r.get(c) for c in campos_clave) == k:
            hallados[k] = r
        else:
            faltan.add(k)
    if faltan:
        for pos, r in dbf.hacia_atras(maximo):
            k = tuple(r.get(c) for c in campos_clave)
            if k in faltan:
                hallados[k] = r
                memoria['|'.join(str(x) for x in k)] = pos
                faltan.discard(k)
                if not faltan:
                    break
    return hallados


def buscar(dbf, claves, campo_ofi, campo_id, memoria, maximo):
    """Localiza registros por (oficina, id). Usa la memoria de posiciones y, para los que no conoce,
    busca desde el final hacia atrás. Devuelve {(ofi, id): datos} con los datos recién leídos."""
    hallados, faltan = {}, set()
    for k in claves:
        pos = memoria.get(f'{k[0]}|{k[1]}')
        r = dbf.registro(pos) if isinstance(pos, int) else None
        if r and r[campo_ofi] == k[0] and r[campo_id] == k[1]:
            hallados[k] = r
        else:
            faltan.add(k)
    if faltan:
        for pos, r in dbf.hacia_atras(maximo):
            k = (r[campo_ofi], r[campo_id])
            if k in faltan:
                hallados[k] = r
                memoria[f'{k[0]}|{k[1]}'] = pos
                faltan.discard(k)
                if not faltan:
                    break
    return hallados


def dia_de_reparto(fecha_iso, cfg):
    if not fecha_iso:
        return None
    d = dt.date.fromisoformat(fecha_iso) + dt.timedelta(days=int(cfg['fecha_mas_dias']))
    while cfg['salta_fin_de_semana'] and d.isoweekday() >= 6:
        d += dt.timedelta(days=1)
    return d.isoformat()


def leer(cfg, rutas, estado):
    carpeta = cfg['carpeta']
    desde = (dt.date.today() - dt.timedelta(days=int(cfg['dias']))).isoformat()
    seguidos = set(estado.get('abiertos', []))        # repartos que mandamos abiertos: hay que avisar cuando se cierren
    fuera = set(cfg['estados_fuera'])

    reps = {}
    d = Dbf(os.path.join(carpeta, 'REPARTOS.DBF'), ['IDOFICINA', 'IDREPARTO', 'IDRUTA', 'FECHA', 'IDREPARTID', 'ESTADO'])
    for _pos, r in d.hacia_atras(int(cfg['cola_repartos'])):
        if not r['IDOFICINA'] or not r['IDREPARTO'] or r['IDRUTA'] not in rutas:
            continue
        clave = f"{r['IDOFICINA']}|{r['IDREPARTO']}"
        # Ya visto (hay un registro más nuevo del mismo reparto): manda el más nuevo, que es el que se recorre primero.
        if (r['IDOFICINA'], r['IDREPARTO']) in reps:
            continue
        abierto = r['ESTADO'] == 2 and (r['FECHA'] or '') >= desde
        if abierto or clave in seguidos:
            # Cerrado = cualquier estado que no sea «Generado» (2). Antes solo valía el 4, y un reparto que GeminisWin
            # cerró con otro código (20/11/2026: rutas 1 y 5 del jueves) seguía mandándose como abierto para siempre.
            reps[(r['IDOFICINA'], r['IDREPARTO'])] = {
                'oficina': r['IDOFICINA'], 'numero': r['IDREPARTO'], 'ruta': r['IDRUTA'], 'fecha': dia_de_reparto(r['FECHA'], cfg),
                'repartidor': r['IDREPARTID'], 'estado': 2 if r['ESTADO'] == 2 else 4, 'estado_gw': r['ESTADO'], 'lineas': []}
    d.cerrar()
    if not reps:
        return []

    d = Dbf(os.path.join(carpeta, 'REPARLIN.DBF'), ['IDOFICINA', 'IDREPARTO', 'N_ORDEN', 'IDOFIVTA', 'IDVENTA', 'CONTACTO', 'DIRECCION', 'CODPOSTAL',
                                                    'POBLACION', 'TLF_FIJO', 'TLF_MOVIL', 'DIREMAIL', 'ESTADO', 'OLDVTAREP', 'OLDVTAOFIR', 'OLDVTAIDRE'])
    vistas = set()
    for _pos, r in d.hacia_atras(int(cfg['cola_lineas'])):
        rep = reps.get((r['IDOFICINA'], r['IDREPARTO']))
        if rep is None or not r['IDOFIVTA'] or not r['IDVENTA'] or r['ESTADO'] is None:     # a medias: se releerá en la próxima pasada
            continue
        k = (rep['oficina'], rep['numero'], r['IDOFIVTA'], r['IDVENTA'])
        if k in vistas or r['ESTADO'] in fuera:
            continue
        vistas.add(k)
        rep['lineas'].append({
            'ofi_venta': r['IDOFIVTA'], 'venta': r['IDVENTA'], 'orden': r['N_ORDEN'], 'contacto': r['CONTACTO'], 'direccion': r['DIRECCION'],
            'cp': r['CODPOSTAL'], 'poblacion': r['POBLACION'], 'tlf_fijo': r['TLF_FIJO'], 'tlf_movil': r['TLF_MOVIL'], 'email': r['DIREMAIL'],
            'estado': r['ESTADO'], 'viene_de': r['OLDVTAREP'], 'ant_oficina': r['OLDVTAOFIR'], 'ant_numero': r['OLDVTAIDRE'] or None})
    d.cerrar()

    lineas = [l for rep in reps.values() for l in rep['lineas']]
    d = Dbf(os.path.join(carpeta, 'VENTAS.DBF'), ['IDVENTA', 'IDOFICINA', 'FECHA', 'IDCLIENTE', 'NOMBRE', 'FORMAPAGO', 'T_FORMA', 'TOTAL',
                                                  'TOT_PAG', 'TOT_PEND', 'IDOFIFRA', 'IDFACTURA'])
    ventas = buscar(d, {(l['ofi_venta'], l['venta']) for l in lineas}, 'IDOFICINA', 'IDVENTA', estado.setdefault('ventas', {}), int(cfg['max_busqueda_ventas']))
    d.cerrar()
    d = Dbf(os.path.join(carpeta, 'FACTURAS.DBF'), ['IDOFICINA', 'IDFACTURA', 'N_FACTURA', 'DIG_CONTR'])
    facturas = buscar(d, {(v['IDOFIFRA'], v['IDFACTURA']) for v in ventas.values() if v['IDOFIFRA'] and v['IDFACTURA']},
                      'IDOFICINA', 'IDFACTURA', estado.setdefault('facturas', {}), int(cfg['max_busqueda_facturas']))
    d.cerrar()

    for l in lineas:
        v = ventas.get((l['ofi_venta'], l['venta']))
        if not v:
            continue
        f = facturas.get((v['IDOFIFRA'], v['IDFACTURA']))
        l.update({'cliente_codigo': v['IDCLIENTE'], 'nombre': v['NOMBRE'], 'fecha': v['FECHA'], 'total': v['TOTAL'], 'pagado': v['TOT_PAG'],
                  'pendiente': v['TOT_PEND'], 'forma_pago': v['FORMAPAGO'], 'forma_texto': v['T_FORMA'],
                  'factura': f"{f['N_FACTURA']} {f['DIG_CONTR']}".strip() if f and f['N_FACTURA'] else None})
    for rep in reps.values():
        rep['lineas'].sort(key=lambda x: (x['orden'] if x['orden'] is not None else 9999, x['venta']))
    return list(reps.values())


CAMPOS_VENTA = ['IDVENTA', 'IDOFICINA', 'FECHA', 'IDCLIENTE', 'NOMBRE', 'FORMAPAGO', 'T_FORMA', 'TOTAL', 'TOT_PAG', 'TOT_PEND',
                'IDOFIFRA', 'IDFACTURA']
OPCIONALES_VENTA = ['HORA', 'IDCLISUCUR', 'FECHA_PAGO', 'IDOFIPED', 'IDRUTA', 'REPARTO', 'IDOFIPREP', 'IDREPARTO']
DIRECCION = ['CONTACTO', 'DIRECCION', 'CODPOSTAL', 'POBLACION', 'TLF_FIJO', 'TLF_MOVIL', 'DIREMAIL', 'IDRUTA', 'N_ORDENRUT']


def leer_ventas(cfg, estado, vigilar):
    """Ventas nuevas (las del final de VENTAS desde la última pasada) y ventas vigiladas (las que pide el ERP),
    con la ruta y la dirección de su sucursal o, si no, de su cliente. Devuelve la lista para enviar."""
    carpeta = cfg['carpeta']
    memoria = estado.setdefault('ventas', {})
    d = Dbf(os.path.join(carpeta, 'VENTAS.DBF'), CAMPOS_VENTA, OPCIONALES_VENTA)
    desde = estado.get('ventas_n')
    desde = d.n - int(cfg['cola_ventas_nuevas']) if not isinstance(desde, int) else desde - 50   # un poco de solape: lo escrito a medias
    nuevas = {}
    for pos, r in d.hacia_delante(max(0, desde)):
        if r['IDOFICINA'] and r['IDVENTA']:
            k = (r['IDOFICINA'], r['IDVENTA'])
            nuevas[k] = r
            memoria[f'{k[0]}|{k[1]}'] = pos
    leidas_hasta = d.n
    claves = {(str(o), int(v)) for o, v in vigilar if o and v} - set(nuevas)
    vigiladas = buscar(d, claves, 'IDOFICINA', 'IDVENTA', memoria, int(cfg['max_busqueda_ventas']))
    d.cerrar()
    todas = [(r, True) for r in nuevas.values()] + [(r, False) for r in vigiladas.values()]
    if not todas:
        return [], leidas_hasta

    clientes = {}
    try:
        d = Dbf(os.path.join(carpeta, 'CLIENTES.DBF'), ['IDCLIENTE'], DIRECCION + ['ESGENERICO'])
        clientes = buscar_por(d, {(r['IDCLIENTE'],) for r, _ in todas if r['IDCLIENTE']}, ['IDCLIENTE'],
                              estado.setdefault('clientes', {}), int(cfg['max_busqueda_clientes']))
        d.cerrar()
    except (OSError, RuntimeError) as e:
        registrar(f'Aviso: no pude leer CLIENTES ({e}); las ventas van sin ruta ni dirección de la ficha.')
    sucursales = {}
    pares = {(r['IDCLIENTE'], r.get('IDCLISUCUR')) for r, _ in todas if r['IDCLIENTE'] and r.get('IDCLISUCUR')}
    if pares and os.path.exists(os.path.join(carpeta, 'CLISUCUR.DBF')):
        try:
            d = Dbf(os.path.join(carpeta, 'CLISUCUR.DBF'), ['IDCLIENTE'], DIRECCION + ['IDCLISUCUR', 'IDSUCURSAL'])
            campo = 'IDCLISUCUR' if 'IDCLISUCUR' in d.campos else 'IDSUCURSAL' if 'IDSUCURSAL' in d.campos else None
            if campo:
                sucursales = buscar_por(d, pares, ['IDCLIENTE', campo], estado.setdefault('sucursales', {}), 200000)
            d.cerrar()
        except (OSError, RuntimeError) as e:
            registrar(f'Aviso: no pude leer CLISUCUR ({e}); las ventas de sucursal van con la dirección del cliente.')

    facturas = {}
    pedir = {(r['IDOFIFRA'], r['IDFACTURA']) for r, _ in todas if r['IDOFIFRA'] and r['IDFACTURA']}
    if pedir:
        d = Dbf(os.path.join(carpeta, 'FACTURAS.DBF'), ['IDOFICINA', 'IDFACTURA', 'N_FACTURA', 'DIG_CONTR'])
        facturas = buscar(d, pedir, 'IDOFICINA', 'IDFACTURA', estado.setdefault('facturas', {}), int(cfg['max_busqueda_facturas']))
        d.cerrar()

    salida = []
    for r, es_nueva in todas:
        c = clientes.get((r['IDCLIENTE'],)) or {}
        s = sucursales.get((r['IDCLIENTE'], r.get('IDCLISUCUR'))) or {}
        dir_ = s if s.get('DIRECCION') else c        # la dirección de la sucursal si la tiene; si no, la del cliente
        f = facturas.get((r['IDOFIFRA'], r['IDFACTURA']))
        salida.append({
            'o': r['IDOFICINA'], 'v': r['IDVENTA'], 'f': r['FECHA'], 'h': r.get('HORA'), 'c': r['IDCLIENTE'], 's': r.get('IDCLISUCUR'),
            'n': r['NOMBRE'], 'fp': r['FORMAPAGO'], 'ft': r['T_FORMA'], 't': r['TOTAL'], 'pg': r['TOT_PAG'], 'pd': r['TOT_PEND'],
            'fpg': r.get('FECHA_PAGO'), 'fa': f"{f['N_FACTURA']} {f['DIG_CONTR']}".strip() if f and f['N_FACTURA'] else None,
            'op': r.get('IDOFIPED'), 'rv': r.get('IDRUTA'), 'rc': s.get('IDRUTA') or c.get('IDRUTA'), 'orr': s.get('N_ORDENRUT') or c.get('N_ORDENRUT'),
            'ge': c.get('ESGENERICO') if c else None, 'er': r.get('REPARTO'),
            'rp': f"{r.get('IDOFIPREP')}-{r.get('IDREPARTO')}" if r.get('IDREPARTO') else None,
            'ct': dir_.get('CONTACTO'), 'di': dir_.get('DIRECCION'), 'cp': dir_.get('CODPOSTAL'), 'po': dir_.get('POBLACION'),
            'tf': dir_.get('TLF_FIJO'), 'tm': dir_.get('TLF_MOVIL'), 'em': dir_.get('DIREMAIL'), 'nv': es_nueva})
    return salida, leidas_hasta


def llamar(cfg, clave, cuerpo):
    datos = json.dumps(cuerpo, ensure_ascii=False).encode('utf-8')
    pet = urllib.request.Request(cfg['url'], data=datos, method='POST',
                                 headers={'Content-Type': 'application/json; charset=utf-8', 'x-puente-clave': clave, 'User-Agent': 'puente-reparto'})
    try:
        with urllib.request.urlopen(pet, timeout=60) as r:
            return json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            return {'ok': False, 'error': json.loads(e.read().decode('utf-8')).get('error', str(e))}
        except Exception:
            return {'ok': False, 'error': f'HTTP {e.code}'}


def escribir_partes(partes):
    carpeta = ruta_local('partes')
    os.makedirs(carpeta, exist_ok=True)
    nombres = {4: 'ENTREGADO', 7: 'NO ENTREGADO'}
    for p in partes:
        base = os.path.join(carpeta, f"parte_{p['oficina']}_{p['numero']}")
        with open(base + '.json', 'w', encoding='utf-8') as h:
            json.dump(p, h, ensure_ascii=False, indent=1)
        with open(base + '.txt', 'w', encoding='utf-8') as h:
            h.write(f"PARTE DEL REPARTO {p['oficina']}-{p['numero']} · ruta {p['ruta']} · día {p['fecha']} · sacado {dt.datetime.now():%d/%m/%Y %H:%M}\n")
            h.write(f"Sin marcar todavía en la app: {p['pendientes']}\n\n")
            h.write('Venta          Factura        Poner en GeminisWin   Detalle\n')
            for l in p['lineas']:
                poner = nombres.get(l.get('estado_gw'), '(no tocar: sin marcar)')
                det = ' · '.join(str(x) for x in (l.get('motivo'), l.get('incidencia'), l.get('nota')) if x)
                if l.get('no_cobro'):
                    # Entregada pero sin cobrar: en GeminisWin va como ENTREGADO (sale del reparto); la cobra administración.
                    det = f"SIN COBRAR ({l['no_cobro']}): pasa a administración" + (' · ' + det if det else '')
                if l.get('contado'):
                    det = (det + ' · ' if det else '') + f"CONTADO total {l.get('total')} pagado {l.get('pagado')}"
                h.write(f"{l['ofi_venta']}-{l['venta']:<11} {str(l.get('factura') or ''):<14} {poner:<21} {det}\n")
    return carpeta


def principal():
    modo = sys.argv[1] if len(sys.argv) > 1 else ''
    fcfg = ruta_local('puente_reparto.json')
    cfg = dict(POR_DEFECTO)
    if os.path.exists(fcfg):
        with open(fcfg, encoding='utf-8') as h:
            cfg.update(json.load(h))
    else:
        with open(fcfg, 'w', encoding='utf-8') as h:
            json.dump(POR_DEFECTO, h, indent=1)
    with open(ruta_local('puente_reparto.clave'), encoding='utf-8') as h:
        clave = h.read().strip()

    # Una sola pasada a la vez: si la anterior sigue (red lenta), esta no hace nada.
    cerrojo = ruta_local('puente_reparto.cerrojo')
    if os.path.exists(cerrojo) and dt.datetime.now().timestamp() - os.path.getmtime(cerrojo) < 240:
        registrar('La pasada anterior sigue en marcha: esta se salta.')
        return 0
    with open(cerrojo, 'w') as h:
        h.write(str(os.getpid()))
    try:
        r = llamar(cfg, clave, {'ping': True})
        if not r.get('ok'):
            registrar(f"ERROR al hablar con el servidor: {r.get('error')}")
            return 2
        rutas = set(r.get('rutas') or [])
        if modo == '--ping':
            registrar(f'Clave correcta. Rutas elegidas en el ERP: {sorted(rutas) or "ninguna"}')
            return 0
        if modo == '--partes':
            r = llamar(cfg, clave, {'partes': True})
            if not r.get('ok'):
                registrar(f"ERROR al pedir los partes: {r.get('error')}")
                return 2
            registrar(f"{len(r['partes'])} parte(s) guardados en {escribir_partes(r['partes'])}")
            return 0
        ventas_on = r.get('ventas') is True
        vigilar = r.get('vigilar') or []
        if not rutas and not ventas_on:
            registrar('No hay ninguna ruta elegida en el ERP (parámetro reparto.puente_gw_rutas): no se envía nada.')
            return 0

        festado = ruta_local('puente_reparto.estado')
        estado = {}
        if os.path.exists(festado):
            try:
                with open(festado, encoding='utf-8') as h:
                    estado = json.load(h)
            except (OSError, ValueError):
                estado = {}
        fallo = 0

        # 1. Repartos abiertos de GeminisWin (los que todavía se generan allí).
        if rutas:
            reps = leer(cfg, rutas, estado)
            resumen = ', '.join(f"{x['oficina']}-{x['numero']} (ruta {x['ruta']}, {'abierto' if x['estado'] == 2 else 'CERRADO'} [estado GW {x.get('estado_gw')}], {len(x['lineas'])} líneas, "
                                f"{sum(1 for l in x['lineas'] if 'nombre' not in l)} sin venta)" for x in reps) or 'ningún reparto abierto'
            if modo == '--prueba':
                registrar(f'PRUEBA (no se envía nada): {resumen}')
            elif reps:
                r = llamar(cfg, clave, {'completo': True, 'repartos': reps})
                if not r.get('ok'):
                    registrar(f"ERROR al enviar: {r.get('error')} · {resumen}")
                    fallo = 2
                else:
                    registrar(f"Enviado: {resumen} → nuevas {r.get('lineas_nuevas')}, cambiadas {r.get('lineas_cambiadas')}, quitadas {r.get('lineas_quitadas')}"
                              + (f" · AVISOS: {r['avisos']}" if r.get('avisos') else ''))
            else:
                registrar('Nada que enviar: ningún reparto abierto en las rutas elegidas.')
            if not fallo and modo != '--prueba':
                estado['abiertos'] = [f"{x['oficina']}|{x['numero']}" for x in reps if x['estado'] == 2]

        # 2. Ventas nuevas y vigiladas (para generar repartos en el ERP y para la Caja).
        if ventas_on:
            ventas, hasta = leer_ventas(cfg, estado, vigilar)
            n_nuevas = sum(1 for v in ventas if v['nv'])
            if modo == '--prueba':
                registrar(f'PRUEBA ventas (no se envía nada): {n_nuevas} nuevas, {len(ventas) - n_nuevas} vigiladas de {len(vigilar)} pedidas, '
                          f"{sum(1 for v in ventas if v['rc'] or v['rv'])} con ruta")
            else:
                tam, ok = int(cfg['ventas_por_envio']), True
                cuenta = {'nuevas': 0, 'cambiadas': 0}
                for i in range(0, len(ventas), tam):
                    r = llamar(cfg, clave, {'ventas': ventas[i:i + tam]})
                    if not r.get('ok'):
                        registrar(f"ERROR al enviar ventas: {r.get('error')}")
                        ok, fallo = False, 2
                        break
                    cuenta['nuevas'] += r.get('nuevas') or 0
                    cuenta['cambiadas'] += r.get('cambiadas') or 0
                if ok:
                    estado['ventas_n'] = hasta        # solo si todo llegó: si no, la próxima pasada vuelve a mandarlas
                    if ventas:
                        registrar(f"Ventas: {n_nuevas} nuevas leídas y {len(ventas) - n_nuevas} vigiladas → {cuenta['nuevas']} altas, "
                                  f"{cuenta['cambiadas']} cambiadas en el ERP")

        if modo == '--prueba':
            return 0
        for m, tope in (('ventas', 60000), ('facturas', 20000), ('clientes', 20000), ('sucursales', 20000)):   # la memoria no crece sin fin
            if len(estado.get(m, {})) > tope:
                estado[m] = dict(list(estado[m].items())[-(tope // 2):])
        with open(festado + '.tmp', 'w', encoding='utf-8') as h:
            json.dump(estado, h)
        os.replace(festado + '.tmp', festado)
        return fallo
    except Exception as e:                                    # que quede escrito por qué falló
        registrar(f'ERROR: {type(e).__name__}: {e}')
        return 1
    finally:
        try:
            os.remove(cerrojo)
        except OSError:
            pass


if __name__ == '__main__':
    sys.exit(principal())

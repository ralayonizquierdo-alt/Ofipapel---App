"""Puente de reparto GeminisWin → app de repartidores (tarea 35). TEMPORAL, hasta usar el ERP propio.

Qué hace en cada pasada (pensado para lanzarse cada 5 minutos con el Programador de tareas):
  1. Pregunta al servidor qué rutas hay que traer (parámetro «reparto.puente_gw_rutas» del ERP).
  2. Lee, SOLO LECTURA, los ficheros de GeminisWin: REPARTOS, REPARLIN, VENTAS y FACTURAS.
  3. Manda los repartos abiertos («Generado») de esas rutas, con sus líneas, a la app.

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
    'carpeta': r'G:\GW002024',
    'url': 'https://sufxvpiwcncnyltrvoun.supabase.co/functions/v1/reparto-gw-ingesta',
    'dias': 6,                    # solo repartos generados en los últimos N días
    'cola_repartos': 3000,        # cuántos registros del final de REPARTOS se miran
    'cola_lineas': 25000,         # ídem REPARLIN (unos 4 meses de líneas)
    'max_busqueda_ventas': 250000,    # hasta dónde se busca hacia atrás una venta que no se conoce
    'max_busqueda_facturas': 80000,
    'estados_fuera': [1, 6, 8, 10],   # estados de línea que no se llevan a la app (ver LEEME de Cowork)
    'fecha_mas_dias': 1,          # REPARTOS.FECHA es el día en que se genera; se reparte al día siguiente
    'salta_domingo': True,
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
    def __init__(self, fichero, campos):
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
        faltan = [c for c in campos if c not in self.campos]
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
    if cfg['salta_domingo'] and d.isoweekday() == 7:
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
        abierto = r['ESTADO'] == 2 and (r['FECHA'] or '') >= desde
        if abierto or clave in seguidos:
            reps[(r['IDOFICINA'], r['IDREPARTO'])] = {
                'oficina': r['IDOFICINA'], 'numero': r['IDREPARTO'], 'ruta': r['IDRUTA'], 'fecha': dia_de_reparto(r['FECHA'], cfg),
                'repartidor': r['IDREPARTID'], 'estado': 4 if r['ESTADO'] == 4 else 2, 'lineas': []}
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
        if not rutas:
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
        reps = leer(cfg, rutas, estado)
        resumen = ', '.join(f"{x['oficina']}-{x['numero']} (ruta {x['ruta']}, {'abierto' if x['estado'] == 2 else 'CERRADO'}, {len(x['lineas'])} líneas, "
                            f"{sum(1 for l in x['lineas'] if 'nombre' not in l)} sin venta)" for x in reps) or 'ningún reparto abierto'
        if modo == '--prueba':
            registrar(f'PRUEBA (no se envía nada): {resumen}')
            return 0
        if reps:
            r = llamar(cfg, clave, {'completo': True, 'repartos': reps})
            if not r.get('ok'):
                registrar(f"ERROR al enviar: {r.get('error')} · {resumen}")
                return 2
            registrar(f"Enviado: {resumen} → nuevas {r.get('lineas_nuevas')}, cambiadas {r.get('lineas_cambiadas')}, quitadas {r.get('lineas_quitadas')}"
                      + (f" · AVISOS: {r['avisos']}" if r.get('avisos') else ''))
        else:
            registrar('Nada que enviar: ningún reparto abierto en las rutas elegidas.')
        estado['abiertos'] = [f"{x['oficina']}|{x['numero']}" for x in reps if x['estado'] == 2]
        for m in ('ventas', 'facturas'):                      # la memoria no crece sin fin
            if len(estado.get(m, {})) > 20000:
                estado[m] = dict(list(estado[m].items())[-10000:])
        with open(festado + '.tmp', 'w', encoding='utf-8') as h:
            json.dump(estado, h)
        os.replace(festado + '.tmp', festado)
        return 0
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

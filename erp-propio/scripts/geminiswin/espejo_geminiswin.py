"""Espejo de GeminisWin → ERP propio: maestros, pedidos, ventas, cobros y caja (docs/PLAN_ESPEJO_GEMINISWIN.md).

Qué hace en cada pasada (pensado para lanzarse cada pocos minutos con el Programador de tareas):
  1. Mira, SOLO LECTURA, los ficheros de maestros de GeminisWin (artículos, clientes, proveedores…).
  2. Si un fichero no ha cambiado desde la pasada anterior (mismo tamaño y fecha), no lo lee.
  3. Si ha cambiado, lo lee entero, compara cada registro con lo que mandó la última vez y envía al ERP
     solo los nuevos o cambiados.
  4. Pide al ERP que pase lo recibido a sus tablas.

Uso:
  python espejo_geminiswin.py            una pasada: leer y enviar lo que ha cambiado
  python espejo_geminiswin.py --medir    NO envía nada: escribe espejo_medida.txt con qué ficheros hay,
                                         cuántos registros tienen y qué campos (sin ningún dato)
  python espejo_geminiswin.py --ping     comprobar la clave y ver qué tablas admite el ERP
  python espejo_geminiswin.py --todo     como una pasada, pero leyendo todos los ficheros aunque no hayan cambiado
  python espejo_geminiswin.py --solo ARTICULO,CLIENTES    solo esas tablas

Junto a este fichero:
  espejo_geminiswin.json    configuración (se crea sola la primera vez con los valores por defecto)
  puente_reparto.clave      la clave del puente (la misma del puente de reparto). NO va en el repositorio.
  espejo_geminiswin.estado  memoria entre pasadas (huella de cada registro enviado). Si se borra, la
                            siguiente pasada lo vuelve a comparar todo: no pasa nada, solo tarda más.
  espejo_geminiswin.log     registro de cada pasada.

Reglas que NO se tocan:
  · Los ficheros de GeminisWin se abren en binario, solo lectura y compartidos. Nunca se escribe en ellos,
    no se usan los índices (.CDX) y no se instala nada en el servidor. Los .FPT (textos largos) solo se leen.
  · Solo usa la biblioteca estándar de Python (no hay nada que instalar).
  · Los registros borrados (primer byte «*») y los que salen a medias se ignoran.
  · Formato de lo que se envía, igual que el volcado que ya había en el ERP (carga_dbf): nombres de campo
    en MAYÚSCULAS; un campo vacío, 0 o falso NO se manda; fechas «AAAA-MM-DD».
"""
import datetime as dt
import hashlib
import json
import math
import os
import socket
import sqlite3
import struct
import sys
import urllib.error
import urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))

# Tabla del ERP (carga_dbf.tabla) → fichero de GeminisWin y campos que forman la clave.
# El orden es el de dependencias: primero lo que otros necesitan.
TABLAS = [
    ('PAISES', 'PAISES', ['CODIGO']),
    ('PROVINCIAS', 'PROVINCIAS', ['CODIGO']),
    ('FOMA', 'FOMA', ['FORMA_COD']),
    ('ALMACEN', 'ALMACEN', ['CODALMAC']),
    ('OFICINA', 'OFICINA', ['OFICINA']),
    ('ZONATERR', 'ZONATERR', ['ZONATERRIT']),
    ('RUTAS', 'RUTAS', ['IDRUTA']),
    ('RUTAZONA', 'RUTAZONA', ['IDRUTA', 'IDZONA']),
    ('REPARTIDOR', 'REPARTIDOR', ['IDREPARTID']),
    ('RUTAREPA', 'RUTAREPA', ['IDRUTA', 'IDREPARTID']),
    ('VENDEDOR', 'VENDEDOR', ['IDVENDEDOR']),
    ('TRANSPOR', 'TRANSPOR', ['CODIGO']),
    ('PLANTTAR', 'PLANTTAR', ['CODTAR']),
    ('FAMILIAS', 'FAMILIAS', ['COD_FAM']),
    ('MARCAS', 'MARCAS', ['MARCA']),
    ('PROVEEDO', 'PROVEEDO', ['CODIGO']),
    ('TIPOCLIE', 'TIPOCLIE', ['TIPOCLIENT']),
    ('CLIENTES', 'CLIENTES', ['IDCLIENTE']),
    ('ARTICULO', 'ARTICULO', ['COD_INTERN']),
    ('ARTBARRA', 'ARTBARRA', ['COD_INTERN', 'COD_BARRAS']),
    ('ARTDPROV', 'ARTDPROV', ['COD_PROV', 'COD_INTERN']),
    ('ARTPROV', 'ARTPROV', ['COD_PROV', 'COD_INTERN', 'COD_COMPRA']),
    ('ARTICALM', 'ARTICALM', ['CODALMAC', 'COD_INTERN']),
    ('CLIENART', 'CLIENART', ['IDCLIENTE', 'COD_INTERN']),
    # Pedidos a proveedor y peticiones de clientes (18/11/2026): para que el Gestor de Pedidos del ERP sepa lo que
    # ya está pedido en GeminisWin y lo que han pedido los clientes. Todos (espejo completo; 'ventana_dias' los
    # limitaría; RECIBIDO está vacío y no sirve para filtrar).
    ('PEDIDCAB', 'PEDIDCAB', ['IDOFICINA', 'NUMERO']),
    ('PEDIDLIN', 'PEDIDLIN', ['IDOFICINA', 'NUMERO', 'LINEA', 'COD_INTERN']),
    ('PETICION', 'PETICION', ['IDOFICINA', 'NUMERO']),
    ('PETIDETA', 'PETIDETA', ['IDOFICINA', 'NUMERO', 'IDOFICPED', 'NUMEROPED', 'NUMLINPED', 'FECHAHORA']),
    # Tanda 2 y lo que faltaba de la 3 (22/11/2026), con todo su histórico. Las tablas grandes se leen como dice
    # 'grandes' (lo reciente en cada pasada; enteras en el repaso de cada noche).
    ('CLISUCUR', 'CLISUCUR', ['IDCLIENTE', 'IDCLISUCUR']),
    ('VENTAS', 'VENTAS', ['IDOFICINA', 'IDVENTA']),
    ('VENTDETA', 'VENTDETA', ['IDOFICINA', 'IDVENTA', 'NUMLINEA']),
    ('FACTURAS', 'FACTURAS', ['IDOFICINA', 'IDFACTURA']),
    ('PAGOS', 'PAGOS', ['IDOFICINA', 'COD_PAGO', 'IDPAGO']),
    ('PAGOSGST', 'PAGOSGST', ['IDOFICINA', 'COD_PAGO', 'IDPAGO']),
    ('CAJA', 'CAJA', ['IDOFICINA', 'IDMOV']),
    ('CAJAAYC', 'CAJAAYC', ['IDOFICINA', 'N_EJERC']),
    ('PEDIDOS', 'PEDIDOS', ['IDOFICINA', 'IDPEDIDO']),
    ('PEDIDETA', 'PEDIDETA', ['IDOFICINA', 'IDPEDIDO', 'NUMLINEA']),
    ('FACTPROV', 'FACTPROV', ['IDOFICINA', 'IDFACTPROV']),
]

POR_DEFECTO = {
    # Rutas de red completas, no letras de unidad: desde el Programador de tareas la letra puede no existir.
    # Se busca cada fichero en estas carpetas, por orden.
    'carpetas': [r'\\SERVER-OFIPAPEL\GEMINISW\GW002024', r'\\SERVER-OFIPAPEL\GEMINISW'],
    'url': 'https://sufxvpiwcncnyltrvoun.supabase.co/functions/v1/espejo-gw-ingesta',
    'lote_filas': 3000,           # registros por envío, como mucho…
    'lote_bytes': 1200000,        # …y tope de tamaño de cada envío (manda el que se alcance antes)
    'cargar_cada': 4000,          # cada cuántos registros enviados se pide al ERP que los pase a sus tablas
    'max_registros': 600000,      # un maestro con más registros que esto no se lee (algo va mal)
    'ficheros': {},               # para corregir un nombre de fichero: {"PROVINCIAS": "PROVINCIAS"}
    'claves': {},                 # para corregir los campos de la clave: {"FOMA": ["FORMA_COD"]}
    # CLIENART (precios especiales por cliente y artículo) tiene 6,5 millones de registros: no se trae así.
    'saltar': [],                 # tablas que no se quieren traer
    # Pedidos a proveedor: solo los de los últimos N días, más los que siguen sin recibir y los que ya se habían
    # mandado alguna vez (para que el ERP se entere cuando se reciben). Las líneas siguen a su cabecera.
    'ventana_dias': {},           # p. ej. {"PEDIDCAB": 400}; vacío = todos los pedidos (espejo completo, 22/11/2026)
    # Espejo completo (Rober, 22/11/2026: «quiero ya un espejo completo»). Las tablas grandes (campo de fecha tipo D):
    #  · cada pasada (10 min) lee solo lo de los últimos 'vivo_dias' días, empezando por el primer registro de esa
    #    fecha (GeminisWin escribe al final): así no se lee entero un fichero de 1 GB cada 10 minutos;
    #  · una vez al día, de noche ('repaso_horas') o en domingo, el REPASO: se leen enteras, para traer todo el
    #    histórico la primera vez (se corta y sigue sola si no le da tiempo) y luego los cambios en registros viejos
    #    (una factura antigua que se cobra, por ejemplo).
    'grandes': {'VENTAS': 'FECHA', 'VENTDETA': 'FECHA', 'FACTURAS': 'FECH_FRA', 'PAGOS': 'FECHA', 'PAGOSGST': 'FECHA',
                'CAJA': 'FECHA', 'PEDIDOS': 'FECHA', 'PEDIDETA': 'FECHA'},
    'vivo_dias': 60,
    'repaso_horas': [21, 7],      # de 21:00 a 7:00…
    'repaso_domingo': True,       # …y todo el domingo
    'repaso_cada_horas': 20,
    # Precios especiales por cliente (CLIENART, 6,5 millones): solo los vigentes (FECHA_FIN vacía o de hoy en
    # adelante) y solo en horas de repaso.
    'vigentes': {'CLIENART': 'FECHA_FIN'},
    'solo_en_repaso': ['CLIENART'],
    'max_registros_tabla': {'VENTAS': 4000000, 'VENTDETA': 10000000, 'CAJA': 4000000, 'PEDIDOS': 2000000,
                            'PEDIDETA': 4000000, 'FACTURAS': 2000000, 'PAGOS': 2000000, 'CLIENART': 12000000},
}
CFG_VERSION = 3   # al subirla, la configuración del PC recupera los valores de por defecto de CFG_REPONER
CFG_REPONER = ['saltar', 'ventana_dias', 'grandes', 'vivo_dias', 'repaso_horas', 'repaso_domingo', 'repaso_cada_horas',
               'vigentes', 'solo_en_repaso', 'max_registros_tabla']


def ruta_local(nombre):
    return os.path.join(AQUI, nombre)


def registrar(texto):
    linea = f"{dt.datetime.now():%Y-%m-%d %H:%M:%S}  {texto}"
    print(linea)
    try:
        f = ruta_local('espejo_geminiswin.log')
        if os.path.exists(f) and os.path.getsize(f) > 2_000_000:
            os.replace(f, f + '.anterior')
        with open(f, 'a', encoding='utf-8') as h:
            h.write(linea + '\n')
    except OSError:
        pass


# ── Lectura de DBF de Visual FoxPro: todos los campos, sin escribir y sin índices ────────────────────
class Dbf:
    def __init__(self, fichero):
        self.fichero = fichero
        self.f = open(fichero, 'rb')            # en Windows: lectura compartida, no bloquea a nadie
        cab = self.f.read(32)
        self.version = cab[0]
        self.n, self.lcab, self.lreg = struct.unpack('<IHH', cab[4:12])
        self.campos = []                        # (nombre, posición, longitud, tipo, decimales)
        pos = 1
        while True:
            d = self.f.read(32)
            if len(d) < 32 or d[0] == 0x0D:
                break
            nombre = d[:11].split(b'\0')[0].decode('ascii', 'replace').upper()
            self.campos.append((nombre, pos, d[16], chr(d[11]), d[17]))
            pos += d[16]
        tam = os.fstat(self.f.fileno())
        self.tamano, self.fecha = tam.st_size, int(tam.st_mtime)
        # El nº de registros de la cabecera puede ir por detrás de lo ya escrito: manda el tamaño real.
        if self.lreg:
            self.n = max(0, min(self.n, (self.tamano - self.lcab) // self.lreg))
        self.memo = None
        self.bloque = 512
        if any(c[3] in 'MGW' for c in self.campos):
            for ext in ('.FPT', '.fpt', '.DBT', '.dbt'):
                fm = os.path.splitext(fichero)[0] + ext
                if os.path.exists(fm):
                    try:
                        self.memo = open(fm, 'rb')
                        cm = self.memo.read(8)
                        self.bloque = struct.unpack('>H', cm[6:8])[0] or 512
                    except (OSError, struct.error):
                        self.memo = None
                    break

    def cerrar(self):
        self.f.close()
        if self.memo:
            self.memo.close()

    def _memo(self, b):
        if not self.memo:
            return None
        if len(b) == 4:
            n = struct.unpack('<I', b)[0]
        else:
            t = b.decode('ascii', 'replace').strip()
            n = int(t) if t.isdigit() else 0
        if not n:
            return None
        try:
            self.memo.seek(n * self.bloque)
            cab = self.memo.read(8)
            tipo, lon = struct.unpack('>II', cab)
            if tipo != 1 or lon <= 0 or lon > 200000:      # solo texto; ni imágenes ni objetos
                return None
            return self.memo.read(lon).decode('cp1252', 'replace').replace('\0', ' ').strip() or None
        except (OSError, struct.error):
            return None

    def _valor(self, reg, campo):
        _nombre, pos, lon, tipo, dec = campo
        b = reg[pos:pos + lon]
        if tipo == 'C':
            return b.decode('cp1252', 'replace').replace('\0', ' ').strip()
        if tipo in 'NF':
            t = b.decode('ascii', 'replace').strip()
            if not t or '*' in t:
                return None
            try:
                v = float(t) if (dec or '.' in t) else int(t)
            except ValueError:
                return None
            return v if not isinstance(v, float) or math.isfinite(v) else None
        if tipo == 'D':
            t = b.decode('ascii', 'replace').strip()
            return f'{t[:4]}-{t[4:6]}-{t[6:8]}' if len(t) == 8 and t.isdigit() else None
        if tipo == 'T':                          # fecha y hora: día juliano + milisegundos
            if len(b) != 8:
                return None
            dia, ms = struct.unpack('<ii', b)
            if dia <= 0:
                return None
            try:
                d = dt.datetime.fromordinal(dia - 1721425) + dt.timedelta(milliseconds=ms)
                return d.replace(microsecond=0).isoformat()
            except (ValueError, OverflowError):
                return None
        if tipo == 'I':
            return struct.unpack('<i', b)[0] if len(b) == 4 else None
        if tipo == 'Y':                          # moneda: entero de 8 bytes con 4 decimales
            return struct.unpack('<q', b)[0] / 10000 if len(b) == 8 else None
        if tipo == 'B':                          # doble: algunos registros traen basura (NaN, infinito), que no es JSON
            if len(b) != 8:
                return None
            v = struct.unpack('<d', b)[0]
            return v if math.isfinite(v) else None
        if tipo == 'L':
            return b in (b'T', b't', b'Y', b'y')
        if tipo == 'M':
            return self._memo(b)
        return None                              # G, W, P y otros: no se traen

    def _campo_fecha(self, nombre):
        c = next((c for c in self.campos if c[0] == nombre and c[3] == 'D'), None)
        if c is None:
            raise ValueError(f'no tiene el campo de fecha {nombre}')
        return c[1], c[1] + c[2]

    def registros(self, bloque=2000, desde_reg=0, filtro=None, marca=None, vigente=None):
        """Todos los registros vivos, como diccionarios sin los campos vacíos, 0 o falsos. Los filtros miran los
        bytes del registro antes de leer el resto (así va rápido):
          desde_reg  empezar en ese número de registro;
          filtro     (campo de fecha tipo D, 'AAAA-MM-DD'): solo los de esa fecha o después;
          marca      (campo, 'AAAA-MM-DD'): no filtra; deja en self.primero el nº del primer registro con esa fecha
                     o posterior (None si ninguno);
          vigente    campo de fecha tipo D: se saltan los que la tienen y es anterior a hoy."""
        prefiltro = mfiltro = pvig = None
        self.primero = None
        if filtro:
            prefiltro = self._campo_fecha(filtro[0]) + (filtro[1].replace('-', '').encode('ascii'),)
        if marca:
            mfiltro = self._campo_fecha(marca[0]) + (marca[1].replace('-', '').encode('ascii'),)
        if vigente:
            pvig = self._campo_fecha(vigente) + (dt.date.today().strftime('%Y%m%d').encode('ascii'),)
        desde_reg = max(0, min(int(desde_reg or 0), self.n))
        self.f.seek(self.lcab + desde_reg * self.lreg)
        quedan = self.n - desde_reg
        n_reg = desde_reg
        while quedan > 0:
            cuantos = min(bloque, quedan)
            trozo = self.f.read(cuantos * self.lreg)
            for i in range(len(trozo) // self.lreg):
                reg = trozo[i * self.lreg:(i + 1) * self.lreg]
                n_reg += 1
                if reg[:1] == b'*':
                    continue
                if mfiltro and self.primero is None and reg[mfiltro[0]:mfiltro[1]] >= mfiltro[2]:
                    self.primero = n_reg - 1
                if prefiltro and reg[prefiltro[0]:prefiltro[1]] < prefiltro[2]:
                    continue                     # fecha anterior a la ventana, vacía o mal escrita
                if pvig:
                    fv = reg[pvig[0]:pvig[1]]
                    if fv.strip() and fv < pvig[2]:
                        continue                 # ya no está vigente
                d = {}
                for c in self.campos:
                    v = self._valor(reg, c)
                    if v is None or v == '' or v is False or (v == 0 and v is not True):
                        continue
                    d[c[0]] = v
                yield d
            if len(trozo) < cuantos * self.lreg:
                break
            quedan -= cuantos


def buscar_fichero(cfg, nombre):
    for carpeta in cfg['carpetas']:
        for n in (nombre + '.DBF', nombre + '.dbf', nombre.lower() + '.dbf'):
            f = os.path.join(carpeta, n)
            if os.path.exists(f):
                return f
    return None


def tablas_de(cfg, solo=None):
    out = []
    for tabla, fichero, clave in TABLAS:
        if tabla in cfg.get('saltar', []) or (solo and tabla not in solo):
            continue
        out.append((tabla, cfg.get('ficheros', {}).get(tabla, fichero), cfg.get('claves', {}).get(tabla, clave)))
    return out


def clave_de(d, campos):
    partes = []
    for c in campos:
        v = d.get(c, '')
        if isinstance(v, float) and v == int(v):
            v = int(v)
        partes.append(str(v))
    return '|'.join(partes)


def llamar(cfg, clave, cuerpo, espera=120):
    datos = json.dumps(cuerpo, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')
    pet = urllib.request.Request(cfg['url'], data=datos, method='POST',
                                 headers={'Content-Type': 'application/json; charset=utf-8', 'x-puente-clave': clave, 'User-Agent': 'espejo-geminiswin'})
    try:
        with urllib.request.urlopen(pet, timeout=espera) as r:
            return json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            return {'ok': False, 'error': corto(json.loads(e.read().decode('utf-8')).get('error', f'HTTP {e.code}'))}
        except (ValueError, OSError, AttributeError):
            return {'ok': False, 'error': f'el ERP contestó con el error HTTP {e.code}'}
    except (urllib.error.URLError, OSError, ValueError) as e:
        return {'ok': False, 'error': corto(f'Sin conexión con el ERP: {e}')}


def corto(texto):
    """Un error en una línea y sin páginas web dentro: si el servidor devuelve HTML, no se copia al registro."""
    t = ' '.join(str(texto).split())
    if '<' in t and '>' in t:
        t = t.split('<', 1)[0].strip() or 'el servidor devolvió una página de error'
    return t[:200]


# ── Memoria entre pasadas ────────────────────────────────────────────────────────────────────────
def abrir_estado():
    con = sqlite3.connect(ruta_local('espejo_geminiswin.estado'))
    con.execute('create table if not exists fichero (tabla text primary key, tamano integer, fecha integer)')
    con.execute('create table if not exists registro (tabla text, clave text, huella text, primary key (tabla, clave)) without rowid')
    # Tablas ya enviadas que el ERP todavía no ha podido pasar a sus tablas: se reintenta en la pasada siguiente.
    con.execute('create table if not exists pendiente (tabla text primary key)')
    # Tablas grandes: nº del primer registro de los últimos 'vivo_dias' días (para no releer el fichero entero en
    # cada pasada) y con qué fecha se calculó.
    con.execute('create table if not exists inicio (tabla text primary key, desde text, reg integer)')
    # Último repaso completo de cada tabla grande.
    con.execute('create table if not exists repaso (tabla text primary key, en text)')
    return con


def en_horas_de_repaso(cfg, ahora=None):
    ahora = ahora or dt.datetime.now()
    h_ini, h_fin = cfg.get('repaso_horas', [21, 7])
    if cfg.get('repaso_domingo', True) and ahora.weekday() == 6:
        return True
    return ahora.hour >= h_ini or ahora.hour < h_fin


def medir(cfg):
    lineas = [f'Espejo de GeminisWin: medida del {dt.datetime.now():%d/%m/%Y %H:%M} en {socket.gethostname()}', '',
              'No lleva ningún dato: solo nombres de fichero, tamaños, número de registros y nombres de campo.', '']
    for tabla, fichero, clave in tablas_de(cfg):
        f = buscar_fichero(cfg, fichero)
        if not f:
            lineas.append(f'{tabla}: NO ENCUENTRO {fichero}.DBF en {cfg["carpetas"]}')
            continue
        try:
            d = Dbf(f)
        except (OSError, struct.error) as e:
            lineas.append(f'{tabla}: no pude abrir {f}: {e}')
            continue
        nombres = [c[0] for c in d.campos]
        faltan = [c for c in clave if c not in nombres]
        lineas.append(f'{tabla}: {f} · {d.n} registros · {d.tamano // 1024} KB · registro de {d.lreg} bytes · {len(nombres)} campos'
                      f'{" · con textos largos" if d.memo else ""}'
                      f'{" · FALTAN CAMPOS DE LA CLAVE: " + ", ".join(faltan) if faltan else ""}')
        lineas.append('   ' + ' '.join(f'{c[0]}:{c[3]}{c[2]}' for c in d.campos))
        d.cerrar()
    # De paso, qué más hay en esas carpetas (para las tandas siguientes: ventas, stock, compras).
    for carpeta in cfg['carpetas']:
        try:
            otros = sorted((os.path.getsize(os.path.join(carpeta, n)), n) for n in os.listdir(carpeta) if n.upper().endswith('.DBF'))
        except OSError as e:
            lineas.append(f'\nNo pude listar {carpeta}: {e}')
            continue
        lineas.append(f'\nFicheros .DBF en {carpeta} ({len(otros)}), de mayor a menor:')
        for tam, n in reversed(otros):
            lineas.append(f'   {n}  {tam // 1024} KB')
    with open(ruta_local('espejo_medida.txt'), 'w', encoding='utf-8') as h:
        h.write('\n'.join(lineas) + '\n')
    print('\n'.join(lineas[:40]))
    print('\nEscrito en espejo_medida.txt')


def _pedido_dentro(reg, limite, conocidas):
    """Cabecera de pedido a proveedor que interesa: reciente (ventana_dias) o ya mandada antes.
    RECIBIDO no sirve: está vacío en todos los pedidos (Cowork, 22/11/2026), y con él entraban todos."""
    fecha = str(reg.get('FECHAHORA') or reg.get('FECHA_L') or '')[:10]
    return fecha >= limite or clave_de(reg, ['IDOFICINA', 'NUMERO']) in conocidas


def pedidos_dentro(cfg, con):
    """Claves IDOFICINA|NUMERO de las cabeceras de pedido a proveedor que se traen (para filtrar sus líneas)."""
    dias = cfg.get('ventana_dias', {}).get('PEDIDCAB')
    f = buscar_fichero(cfg, cfg.get('ficheros', {}).get('PEDIDCAB', 'PEDIDCAB'))
    if not dias or not f:
        return None
    limite = (dt.date.today() - dt.timedelta(days=int(dias))).isoformat()
    conocidas = {k for (k,) in con.execute("select clave from registro where tabla = 'PEDIDCAB'")}
    d = Dbf(f)
    try:
        return {clave_de(r, ['IDOFICINA', 'NUMERO']) for r in d.registros() if _pedido_dentro(r, limite, conocidas)}
    finally:
        d.cerrar()


def pasada(cfg, clave, todo=False, solo=None):
    con = abrir_estado()
    equipo = socket.gethostname()
    resumen = []
    for tabla, fichero, campos_clave in tablas_de(cfg, solo):
        f = buscar_fichero(cfg, fichero)
        if not f:
            resumen.append(f'{tabla}: no encuentro {fichero}.DBF')
            continue
        try:
            d = Dbf(f)
        except (OSError, struct.error) as e:
            resumen.append(f'{tabla}: no pude abrirlo ({e})')
            continue
        try:
            visto = con.execute('select tamano, fecha from fichero where tabla = ?', (tabla,)).fetchone()
            por_cargar = con.execute('select 1 from pendiente where tabla = ?', (tabla,)).fetchone() is not None
            campo_fecha = cfg.get('grandes', {}).get(tabla)
            horas_repaso = en_horas_de_repaso(cfg)
            if tabla in cfg.get('solo_en_repaso', []) and not horas_repaso and not todo:
                continue
            toca_repaso = False
            if campo_fecha:
                ult = con.execute('select en from repaso where tabla = ?', (tabla,)).fetchone()
                hace = (dt.datetime.now() - dt.datetime.fromisoformat(ult[0])).total_seconds() / 3600 if ult else 1e9
                toca_repaso = todo or (horas_repaso and hace >= cfg.get('repaso_cada_horas', 20))
            if not toca_repaso and not todo and not por_cargar and visto == (d.tamano, d.fecha):
                continue                                         # no ha cambiado: ni se lee
            nombres = [c[0] for c in d.campos]
            faltan = [c for c in campos_clave if c not in nombres]
            if faltan:
                resumen.append(f'{tabla}: le faltan los campos de la clave {faltan}')
                continue
            if d.n > cfg.get('max_registros_tabla', {}).get(tabla, cfg['max_registros']):
                resumen.append(f'{tabla}: {d.n} registros, más de los esperados: no se lee')
                continue
            desde_reg, filtro, marca, fila = 0, None, None, None
            if campo_fecha:
                vivo = (dt.date.today() - dt.timedelta(days=int(cfg.get('vivo_dias', 60)))).isoformat()
                marca = (campo_fecha, vivo)
                if not toca_repaso:
                    filtro = (campo_fecha, vivo)
                    fila = con.execute('select desde, reg from inicio where tabla = ?', (tabla,)).fetchone()
                    if fila:
                        desde_reg = max(0, fila[1] - 5000)  # un margen, por si se intercaló algo
            # Las huellas de lo ya enviado se consultan una a una (una tabla grande no cabe entera en memoria).
            busca = con.cursor()

            def huella_de(k):
                r = busca.execute('select huella from registro where tabla = ? and clave = ?', (tabla, k)).fetchone()
                return r[0] if r else None
            conocidas = {}
            # Ventana de los pedidos a proveedor (si se configura; por defecto se traen todos).
            dentro = None
            if tabla in ('PEDIDCAB', 'PEDIDLIN') and cfg.get('ventana_dias', {}).get('PEDIDCAB'):
                conocidas = dict(con.execute('select clave, huella from registro where tabla = ?', (tabla,)))
            if tabla == 'PEDIDCAB' and cfg.get('ventana_dias', {}).get('PEDIDCAB'):
                limite = (dt.date.today() - dt.timedelta(days=int(cfg['ventana_dias']['PEDIDCAB']))).isoformat()
                dentro = lambda r: _pedido_dentro(r, limite, conocidas)  # noqa: E731
            elif tabla == 'PEDIDLIN':
                cabeceras = pedidos_dentro(cfg, con)
                if cabeceras is not None:
                    dentro = lambda r: clave_de(r, ['IDOFICINA', 'NUMERO']) in cabeceras or clave_de(r, campos_clave) in conocidas  # noqa: E731
            # Se va enviando según se lee (un fichero grande no cabe entero en memoria) y, cada cierto número
            # de registros, se pide al ERP que los pase a sus tablas: así ninguna carga es larga.
            vistos = enviados = sin_cargar = 0
            lote, huellas, peso, fallo = [], [], 0, None

            def cargar():
                con.execute('insert or ignore into pendiente (tabla) values (?)', (tabla,))
                con.commit()
                # El ERP carga por tandas cortas y avisa si le queda más: se repite hasta que termina.
                for _ in range(2000):
                    r = llamar(cfg, clave, {'procesar': tabla, 'equipo': equipo}, espera=120)
                    if not r.get('ok'):
                        return corto(r.get('error', 'error desconocido'))
                    if not r.get('quedan'):
                        break
                con.execute('delete from pendiente where tabla = ?', (tabla,))
                con.commit()
                return None

            def enviar():
                r = llamar(cfg, clave, {'tabla': tabla, 'filas': lote, 'equipo': equipo})
                if not r.get('ok'):
                    return r.get('error', 'error desconocido')
                # La huella se guarda solo de lo que el ERP ha confirmado: si se corta, se reenvía el resto.
                con.executemany('insert or replace into registro (tabla, clave, huella) values (?, ?, ?)', huellas)
                con.execute('insert or ignore into pendiente (tabla) values (?)', (tabla,))
                con.commit()
                return None

            try:
                lector = d.registros(desde_reg=desde_reg, filtro=filtro, marca=marca,
                                     vigente=cfg.get('vigentes', {}).get(tabla))
            except ValueError as e:
                resumen.append(f'{tabla}: {e}')
                continue
            for reg in lector:
                if dentro is not None and not dentro(reg):
                    continue
                vistos += 1
                k = clave_de(reg, campos_clave)
                texto = json.dumps(reg, sort_keys=True, ensure_ascii=False)
                h = hashlib.md5(texto.encode('utf-8')).hexdigest()
                if huella_de(k) == h:
                    continue
                lote.append({'c': k, 'd': reg})
                huellas.append((tabla, k, h))
                peso += len(texto)
                if len(lote) >= cfg['lote_filas'] or peso >= cfg['lote_bytes']:
                    fallo = enviar()
                    if fallo:
                        break
                    enviados += len(lote)
                    sin_cargar += len(lote)
                    lote, huellas, peso = [], [], 0
                    if sin_cargar >= cfg['cargar_cada']:
                        fallo = cargar()
                        if fallo:
                            break
                        sin_cargar = 0
            if not fallo and lote:
                fallo = enviar()
                if not fallo:
                    enviados += len(lote)
            if not fallo and (enviados or por_cargar):
                fallo = cargar()
            if marca and not fallo and d.primero is not None and (desde_reg == 0 or not fila or d.primero < fila[1]):
                con.execute('insert or replace into inicio (tabla, desde, reg) values (?, ?, ?)', (tabla, marca[1], d.primero))
                con.commit()
            if toca_repaso and not fallo:
                con.execute('insert or replace into repaso (tabla, en) values (?, ?)', (tabla, dt.datetime.now().isoformat(timespec='seconds')))
                con.commit()
                resumen.append(f'{tabla}: repaso completo hecho ({vistos} registros)')
            if fallo:
                resumen.append(f'{tabla}: {enviados} enviados de {vistos} leídos; se cortó (sigue en la siguiente pasada): {fallo}')
                continue
            if enviados:
                resumen.append(f'{tabla}: {vistos} registros, {enviados} nuevos o cambiados')
            con.execute('insert or replace into fichero (tabla, tamano, fecha) values (?, ?, ?)', (tabla, d.tamano, d.fecha))
            con.commit()
        finally:
            d.cerrar()
    con.close()
    registrar('Espejo: ' + ('; '.join(resumen) if resumen else 'sin cambios'))


def principal():
    fcfg = ruta_local('espejo_geminiswin.json')
    cfg = dict(POR_DEFECTO)
    if os.path.exists(fcfg):
        try:
            with open(fcfg, encoding='utf-8') as h:
                del_pc = json.load(h)
            if del_pc.get('version', 0) < CFG_VERSION:
                # Configuración de una versión anterior: se reponen los valores nuevos por defecto (las rutas, la
                # url y lo demás que se haya cambiado a mano se respetan) y se guarda.
                for k in CFG_REPONER:
                    del_pc.pop(k, None)
                del_pc['version'] = CFG_VERSION
                guardar = dict(POR_DEFECTO)
                guardar.update(del_pc)
                with open(fcfg, 'w', encoding='utf-8') as h:
                    json.dump(guardar, h, indent=2, ensure_ascii=False)
                registrar(f'Configuración puesta al día a la versión {CFG_VERSION} (espejo completo).')
            cfg.update(del_pc)
        except (OSError, ValueError) as e:
            registrar(f'No pude leer espejo_geminiswin.json ({e}): uso los valores por defecto')
    else:
        with open(fcfg, 'w', encoding='utf-8') as h:
            json.dump(dict(POR_DEFECTO, version=CFG_VERSION), h, indent=2, ensure_ascii=False)

    args = sys.argv[1:]
    if '--medir' in args:
        return medir(cfg)

    fclave = ruta_local('puente_reparto.clave')
    if not os.path.exists(fclave):
        registrar('Falta puente_reparto.clave junto a este programa.')
        return 2
    with open(fclave, encoding='utf-8') as h:
        clave = h.read().strip()

    if '--ping' in args:
        r = llamar(cfg, clave, {'ping': True})
        print('Conexión y clave correctas. Tablas que admite el ERP: ' + ', '.join(r.get('tablas', [])) if r.get('ok') else 'ERROR: ' + str(r.get('error')))
        return 0 if r.get('ok') else 1

    solo = None
    if '--solo' in args and args.index('--solo') + 1 < len(args):
        solo = [t.strip().upper() for t in args[args.index('--solo') + 1].split(',') if t.strip()]

    # Que no se pisen dos pasadas: si la anterior sigue (primera carga, ficheros grandes), esta no entra.
    cerrojo = ruta_local('espejo_geminiswin.cerrojo')
    try:
        # El primer repaso completo (todo el histórico) puede durar horas: el cerrojo vale 12 horas.
        if os.path.exists(cerrojo) and dt.datetime.now().timestamp() - os.path.getmtime(cerrojo) < 12 * 3600:
            registrar('Otra pasada sigue en marcha: esta no entra.')
            return 0
        with open(cerrojo, 'w') as h:
            h.write(str(os.getpid()))
    except OSError:
        pass
    try:
        pasada(cfg, clave, todo='--todo' in args, solo=solo)
    except Exception as e:                                   # que un fallo no deje la tarea colgada sin rastro
        registrar(f'Espejo: fallo inesperado: {type(e).__name__}: {e}')
        return 1
    finally:
        try:
            os.remove(cerrojo)
        except OSError:
            pass
    return 0


if __name__ == '__main__':
    sys.exit(principal() or 0)

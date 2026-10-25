# LECTOR DE LOS .DBF DE GEMINISWIN.
#
# Escrito a mano con `struct` y no con dbfread A PROPÓSITO: dbfread leyó DE
# MENOS en ventas.dbf (comprobado contra GeminisWin). Un lector que se deja
# registros por el camino aquí no da un error — da un pedido que "no existe" y
# un cliente al que el bot le contesta con WooCommerce sin que nadie se entere.
#
# Dos decisiones que vienen de eso:
#
#   1. El número de registros NO se cree el de la cabecera: se calcula con el
#      tamaño real del fichero, (tamaño − cabecera) // longitud_registro. La
#      cabecera de un DBF que se escribe a todas horas se queda corta.
#   2. Se puede leer solo la cola (`desde_el_final`): pedidos.dbf son ~260 MB en
#      una unidad de red, y los pedidos nuevos se añaden al final.
#
# SOLO LECTURA. Este módulo abre los ficheros en 'rb' y nunca escribe: son las
# tablas de producción de Gestión.

import datetime
import struct

# El día juliano 2440588 es el 1 de enero de 1970, que es de donde cuelga todo
# lo demás.
JULIANO_1970 = 2440588

TERMINADOR_CAMPOS = 0x0D
BORRADO = b'*'


class Campo:
    __slots__ = ('nombre', 'tipo', 'longitud', 'decimales', 'inicio')

    def __init__(self, nombre, tipo, longitud, decimales, inicio):
        self.nombre = nombre
        self.tipo = tipo
        self.longitud = longitud
        self.decimales = decimales
        self.inicio = inicio

    def __repr__(self):
        return f'Campo({self.nombre!r}, {self.tipo!r}, {self.longitud})'


def _texto(crudo):
    # cp1252 con errors='replace': un byte raro en una descripción no puede
    # tumbar una pasada entera.
    return crudo.decode('cp1252', errors='replace').strip()


def _fecha(crudo):
    t = crudo.decode('ascii', errors='replace').strip()
    if len(t) != 8 or not t.isdigit():
        return None
    try:
        return datetime.date(int(t[0:4]), int(t[4:6]), int(t[6:8]))
    except ValueError:
        return None


def _fecha_hora(crudo):
    # Tipo 'T': dos enteros de 4 bytes, little-endian — día juliano y
    # milisegundos desde medianoche.
    if len(crudo) != 8:
        return None
    dia, ms = struct.unpack('<ii', crudo)
    if dia == 0:
        return None
    try:
        base = datetime.date(1970, 1, 1) + datetime.timedelta(days=dia - JULIANO_1970)
        return datetime.datetime.combine(base, datetime.time()) + datetime.timedelta(milliseconds=ms)
    except (ValueError, OverflowError):
        return None


def _numero(crudo, decimales):
    t = crudo.decode('ascii', errors='replace').strip()
    if not t or t in ('.', '-'):
        return None
    try:
        return float(t) if decimales else int(t)
    except ValueError:
        try:
            return float(t)
        except ValueError:
            return None


def _logico(crudo):
    c = crudo.decode('ascii', errors='replace').strip().upper()
    if c in ('T', 'Y'):
        return True
    if c in ('F', 'N'):
        return False
    return None  # '?' o en blanco: no se sabe, y no es lo mismo que False.


def _valor(campo, crudo):
    if campo.tipo == 'D':
        return _fecha(crudo)
    if campo.tipo == 'T':
        return _fecha_hora(crudo)
    if campo.tipo == 'N' or campo.tipo == 'F':
        return _numero(crudo, campo.decimales)
    if campo.tipo == 'L':
        return _logico(crudo)
    # 'C' y cualquier otro (incluidos los memo 'M', que no usamos) van como
    # texto: nunca se revienta por un tipo que no conozcamos.
    return _texto(crudo)


class Tabla:
    """Un .dbf abierto en solo lectura."""

    def __init__(self, ruta):
        self.ruta = str(ruta)
        with open(self.ruta, 'rb') as f:
            cabecera = f.read(32)
            if len(cabecera) < 32:
                raise ValueError(f'{self.ruta}: cabecera incompleta')
            self.registros_cabecera = struct.unpack('<I', cabecera[4:8])[0]
            self.longitud_cabecera = struct.unpack('<H', cabecera[8:10])[0]
            self.longitud_registro = struct.unpack('<H', cabecera[10:12])[0]

            if self.longitud_registro <= 0 or self.longitud_cabecera <= 32:
                raise ValueError(f'{self.ruta}: cabecera con medidas imposibles')

            self.campos = []
            inicio = 1  # el byte 0 de cada registro es la marca de borrado
            f.seek(32)
            while True:
                desc = f.read(32)
                if not desc or desc[0] == TERMINADOR_CAMPOS or len(desc) < 32:
                    break
                nombre = desc[0:11].split(b'\0')[0].decode('cp1252', errors='replace').strip().upper()
                tipo = chr(desc[11])
                longitud = desc[16]
                decimales = desc[17]
                self.campos.append(Campo(nombre, tipo, longitud, decimales, inicio))
                inicio += longitud

        import os
        tam = os.path.getsize(self.ruta)
        # EL NÚMERO QUE VALE: el que sale del tamaño real del fichero.
        self.registros = max(0, (tam - self.longitud_cabecera) // self.longitud_registro)
        self.por_nombre = {c.nombre: c for c in self.campos}

    def __len__(self):
        return self.registros

    def leer(self, desde=0, campos=None):
        """Devuelve los registros vivos desde la posición `desde`.

        `campos` limita qué columnas se descodifican — en una tabla de 260 MB
        descodificar las cuarenta y pico columnas de cada registro para usar
        seis es la diferencia entre segundos y minutos por una unidad de red.
        """
        quiero = [c for c in self.campos if campos is None or c.nombre in campos]
        desde = max(0, min(desde, self.registros))

        with open(self.ruta, 'rb') as f:
            f.seek(self.longitud_cabecera + desde * self.longitud_registro)
            # De 4 en 4 MB: ni una lectura por registro (lentísima por red) ni
            # el fichero entero en memoria.
            por_tanda = max(1, (4 * 1024 * 1024) // self.longitud_registro)
            quedan = self.registros - desde
            while quedan > 0:
                cuantos = min(por_tanda, quedan)
                bloque = f.read(cuantos * self.longitud_registro)
                if not bloque:
                    return
                for i in range(len(bloque) // self.longitud_registro):
                    crudo = bloque[i * self.longitud_registro:(i + 1) * self.longitud_registro]
                    if crudo[0:1] == BORRADO:
                        continue
                    yield {c.nombre: _valor(c, crudo[c.inicio:c.inicio + c.longitud]) for c in quiero}
                quedan -= cuantos

    def cola(self, cuantos, campos=None):
        """Los últimos `cuantos` registros. Para pedidos.dbf, que crece por el final."""
        return self.leer(desde=max(0, self.registros - cuantos), campos=campos)

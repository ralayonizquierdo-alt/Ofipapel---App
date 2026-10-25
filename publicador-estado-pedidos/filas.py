# DE LAS TRES TABLAS A LAS FILAS QUE SE SUBEN.
#
# El pedido no sabe en qué estado está: hay que cruzarlo con sus líneas de
# reparto y, de ahí, con el reparto. Todo esto es función pura — se le pasan
# listas de diccionarios y devuelve las filas, sin tocar disco ni red.

import datetime

from estados import (
    clave, entero, estado_del_pedido, fecha_de, fecha_factura, pago_pendiente, pedido_web,
)

ZONA = 'Atlantic/Canary'


def _zona():
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
    try:
        return ZoneInfo(ZONA)
    except ZoneInfoNotFoundError as err:  # Windows no trae base de zonas horarias
        raise RuntimeError(
            'Falta la base de datos de zonas horarias. En Windows: py -m pip install tzdata'
        ) from err


def hora_a_hm(valor):
    """La HORA del pedido, venga como venga. Devuelve (h, m) o None.

    No se inventa una hora: si no se entiende, se devuelve None y el pedido se
    publica con la hora a las 00:00, que es lo prudente — la hora solo sirve
    para saber si entró antes de las 13:00, y a las 00:00 siempre entró antes.
    """
    if valor is None:
        return None
    if isinstance(valor, datetime.time):
        return valor.hour, valor.minute
    if isinstance(valor, datetime.datetime):
        return valor.hour, valor.minute

    if isinstance(valor, (int, float)) and not isinstance(valor, bool):
        texto = str(int(valor))
    else:
        texto = str(valor).strip()
    if not texto:
        return None

    if ':' in texto:
        trozos = texto.split(':')
        try:
            h, m = int(trozos[0]), int(trozos[1])
        except (ValueError, IndexError):
            return None
    elif texto.isdigit() and len(texto) in (3, 4):
        h, m = int(texto[:-2]), int(texto[-2:])
    elif texto.isdigit() and len(texto) in (1, 2):
        h, m = int(texto), 0
    else:
        return None

    if 0 <= h <= 23 and 0 <= m <= 59:
        return h, m
    return None


def instante_del_pedido(fecha, hora):
    """FECHA + HORA, en hora de Canarias, como instante exacto en ISO.

    La zona importa: en verano Canarias va una hora por delante de UTC, y el
    bot decide con esta hora si el pedido entró antes de las 13:00. Mandarla
    como si fuera UTC correría la hora de corte media parte del año.
    """
    dia = fecha_de(fecha)
    if dia is None:
        return None
    hm = hora_a_hm(hora) or (0, 0)
    momento = datetime.datetime(dia.year, dia.month, dia.day, hm[0], hm[1], tzinfo=_zona())
    return momento.isoformat()


def _par(fila):
    """La clave que une pedidos con reparlin: (IDOFIVTA, IDVENTA)."""
    oficina = clave(fila.get('IDOFIVTA'))
    venta = entero(fila.get('IDVENTA'))
    # Un pedido sin venta tiene IDVENTA = 0, y hay MUCHAS líneas de reparto con
    # ceros: cruzar por (0, 0) le colgaría a un pedido recién hecho el reparto
    # de otro. Sin venta no hay cruce posible, y punto.
    if venta is None or venta <= 0 or oficina is None:
        return None
    return (oficina, venta)


def lineas_por_venta(reparlin):
    """Para cada venta, su línea de reparto más reciente (ULTMOD mayor)."""
    mejor = {}
    for linea in reparlin:
        par = _par(linea)
        if par is None:
            continue
        anterior = mejor.get(par)
        if anterior is None or _ultmod(linea) >= _ultmod(anterior):
            mejor[par] = linea
    return mejor


_MUY_ANTIGUO = datetime.datetime(1900, 1, 1)


def _ultmod(fila):
    v = fila.get('ULTMOD')
    if isinstance(v, datetime.datetime):
        return v
    if isinstance(v, datetime.date):
        return datetime.datetime(v.year, v.month, v.day)
    return _MUY_ANTIGUO


def repartos_por_id(repartos):
    return {
        (clave(r.get('IDOFICINA')), clave(r.get('IDREPARTO'))): r
        for r in repartos
    }


def construir_filas(pedidos, reparlin, repartos, dias=60, hoy=None):
    """Devuelve (filas, resumen). `filas` es lo que se sube tal cual."""
    hoy = hoy or datetime.date.today()
    desde = hoy - datetime.timedelta(days=dias)

    lineas = lineas_por_venta(reparlin)
    cabeceras = repartos_por_id(repartos)

    filas = []
    resumen = {
        'web': 0, 'en_plazo': 0, 'sin_estado': 0,
        'horas_raras': 0, 'por_estado': {},
    }

    for pedido in pedidos:
        numero = pedido_web(pedido)
        if numero is None:
            continue
        resumen['web'] += 1

        dia = fecha_de(pedido.get('FECHA'))
        if dia is None or dia < desde:
            continue
        resumen['en_plazo'] += 1

        par = _par(pedido)
        linea = lineas.get(par) if par else None
        reparto = None
        if linea is not None:
            reparto = cabeceras.get((clave(linea.get('IDOFICINA')), clave(linea.get('IDREPARTO'))))

        estado, fecha_reparto = estado_del_pedido(pedido, linea, reparto)
        if estado is None:
            resumen['sin_estado'] += 1
            continue

        if pedido.get('HORA') is not None and hora_a_hm(pedido.get('HORA')) is None:
            resumen['horas_raras'] += 1

        resumen['por_estado'][estado] = resumen['por_estado'].get(estado, 0) + 1
        filas.append({
            'pedido_web': numero,
            'estado': estado,
            'fecha_hora_pedido': instante_del_pedido(dia, pedido.get('HORA')),
            'fecha_factura': _iso(fecha_factura(pedido)),
            'fecha_reparto': _iso(fecha_de(fecha_reparto)),
            'pago_pendiente': pago_pendiente(pedido),
        })

    return filas, resumen


def _iso(dia):
    return dia.isoformat() if dia is not None else None

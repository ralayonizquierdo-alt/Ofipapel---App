# LAS REGLAS: DE LO QUE DICE GEMINISWIN A LO QUE ENTIENDE EL BOT.
#
# Todo lo que decide algo está aquí y es función pura, para poder probarlo sin
# la unidad G:, sin DBF y sin Supabase (`py scripts/probar-publicador.py`).
#
# TRES TRAMPAS DE GEMINISWIN, Y LAS TRES ESTÁN AQUÍ ESCRITAS PORQUE SE OLVIDAN:
#
#   1. «Liquidado» significa DOS COSAS DISTINTAS. En el pedido quiere decir
#      convertido en venta (facturado). En el reparto quiere decir COBRADO por
#      el repartidor. Es la misma palabra para dos cosas que al cliente se le
#      cuentan al revés.
#
#   2. PAGADO NO ES ENTREGADO. Los pedidos web se pagan al hacerlos (Bizum,
#      contado web), así que casi todos están pagados desde el minuto uno. Lo
#      único que confirma una entrega es que David cierre el reparto.
#
#   3. El estado del pedido no está en el pedido: hay que ir a buscarlo a las
#      líneas de reparto, y de ahí al reparto.

ESTADOS_DEL_BOT = (
    'recibido', 'facturado', 'en_reparto',
    'entregado', 'no_entregado', 'incidencia', 'anulado',
)

# Los códigos de reparlin.ESTADO, tal y como los usa GeminisWin.
REPARTO_ENTREGADO = 4
REPARTO_LIQUIDADO = 5      # cobrado por el repartidor: entregado, y además cobrado
REPARTO_NO_ENTREGADO = 7   # pasa al siguiente reparto
REPARTO_QUITADO = 1        # anulado / quitado del reparto
REPARTO_DEVUELTO = 6
REPARTO_ABIERTO = (2, 3)   # el reparto todavía está en la calle

# pedidos.LIQUIDADO = 5 → el pedido se convirtió en venta.
PEDIDO_CONVERTIDO_EN_VENTA = 5

# Solo con transferencia inmediata puede quedar un pedido web sin pagar.
FORMA_PAGO_TRANSFERENCIA = '77'


def clave(valor):
    """Compara IDVENTA/IDOFIVTA vengan como vengan (número o texto con ceros)."""
    if valor is None:
        return None
    if isinstance(valor, bool):
        return None
    if isinstance(valor, (int, float)):
        return int(valor)
    t = str(valor).strip()
    if not t:
        return None
    try:
        return int(t)
    except ValueError:
        return t


def entero(valor):
    v = clave(valor)
    return v if isinstance(v, int) else None


def estado_del_pedido(pedido, linea_reparto, reparto):
    """Devuelve (estado, fecha_reparto) o (None, None) si no se sabe.

    (None, None) no es un error: ese pedido no se publica y el bot contesta con
    WooCommerce, igual que si no existiera. Es lo que se hace con un código de
    reparto que no conocemos — antes que enseñarle al cliente una suposición.
    """
    # 1. Anulado manda sobre todo lo demás.
    if pedido.get('ANULADO') is True:
        return 'anulado', None

    # 2. Si está en un reparto, el reparto manda.
    if linea_reparto is not None:
        estado = entero(linea_reparto.get('ESTADO'))
        if estado in (REPARTO_ENTREGADO, REPARTO_LIQUIDADO):
            return 'entregado', None
        if estado == REPARTO_NO_ENTREGADO:
            return 'no_entregado', None
        if estado in (REPARTO_QUITADO, REPARTO_DEVUELTO):
            return 'incidencia', None
        if estado in REPARTO_ABIERTO:
            return 'en_reparto', (reparto or {}).get('FECHA')
        return None, None  # código que no conocemos: no se publica

    # 3. Sin reparto, pero ya convertido en venta: facturado, sale en el
    #    siguiente reparto.
    if (entero(pedido.get('LIQUIDADO')) == PEDIDO_CONVERTIDO_EN_VENTA
            and (entero(pedido.get('IDVENTA')) or 0) > 0):
        return 'facturado', None

    # 4. Lo demás está recibido y en preparación.
    return 'recibido', None


def pago_pendiente(pedido):
    """Solo la transferencia inmediata puede dejar un pedido web sin pagar."""
    forma = pedido.get('FORMA_P')
    forma = str(int(forma)) if isinstance(forma, (int, float)) and not isinstance(forma, bool) \
        else str(forma or '').strip()
    if forma != FORMA_PAGO_TRANSFERENCIA:
        return False
    pendiente = pedido.get('TOT_PEND')
    try:
        return float(pendiente or 0) > 0
    except (TypeError, ValueError):
        return False


def pedido_web(pedido):
    """El nº de WooCommerce. Solo los mayores que cero son pedidos web."""
    n = entero(pedido.get('WEBIDPED'))
    if n is None or n <= 0:
        return None
    return str(n)


def fecha_de(valor):
    """Un campo 'D' o 'T' reducido a día."""
    if valor is None:
        return None
    return valor.date() if hasattr(valor, 'date') else valor


def fecha_factura(pedido):
    """La fecha en que se convirtió en venta.

    GeminisWin no guarda una «fecha de factura» en el pedido, así que se usa
    ULTMOD, que es cuando se tocó por última vez. Con LIQUIDADO=5 esa última
    vez es, en la práctica, la facturación. Es una aproximación y por eso NO se
    le enseña nunca al cliente: solo sirve para nuestras cuentas.
    """
    if entero(pedido.get('LIQUIDADO')) != PEDIDO_CONVERTIDO_EN_VENTA:
        return None
    return fecha_de(pedido.get('ULTMOD'))

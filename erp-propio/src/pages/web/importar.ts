import { supabase } from '../../lib/supabase'
import { registrarSincronizacion } from '../../lib/woocommerce'
import { totalesErp, type ConfigImportacion, type PedidoPropuesto } from '../../lib/webMapeo'

// Grabación en el ERP (nunca en la web) de un pedido web como pedido de cliente, con el
// mismo patrón que la ficha de pedidos: número con fn_siguiente_numero, cabecera en
// pedido_cliente y líneas en pedido_cliente_linea. Idempotente: el índice único sobre
// pedido_cliente.web_pedido_id impide duplicarlo aunque se pulse dos veces o desde dos puestos.

export type ResultadoImportacion = { ok: true; tienda: string; numero: number } | { ok: false; yaExistia: boolean; error: string }

export async function importarPedido(p: PedidoPropuesto, cfg: ConfigImportacion, empleado: string | null): Promise<ResultadoImportacion> {
  if (p.bloqueos.length) return { ok: false, yaExistia: false, error: p.bloqueos.join(' ') }
  if (!p.cliente) return { ok: false, yaExistia: false, error: 'Sin cliente.' }
  const tienda = cfg.tienda_terminal_codigo || '01'

  const { data: existe } = await supabase.from('pedido_cliente').select('tienda_terminal_codigo, numero').eq('web_pedido_id', p.webId).maybeSingle()
  if (existe) return { ok: false, yaExistia: true, error: `Ya importado como pedido ${existe.tienda_terminal_codigo}/${existe.numero}.` }

  const { data: numero, error: eNum } = await supabase.rpc('fn_siguiente_numero', { p_tienda: tienda, p_tipo_documento: 'pedido_cliente', p_serie: '' })
  if (eNum) return { ok: false, yaExistia: false, error: eNum.message }

  const t = totalesErp(p.lineas)
  const c = p.cliente
  const cab = {
    tienda_terminal_codigo: tienda,
    numero: numero as number,
    almacen_codigo: cfg.almacen_codigo,
    fecha: p.fecha || new Date().toISOString().slice(0, 10),
    hora: p.hora || null,
    web_pedido_id: p.webId,
    es_presupuesto: false,
    empleado_codigo: empleado,
    cliente_codigo: c.codigo,
    nombre_cliente: p.nombre_cliente,
    nif_cliente: p.nif_cliente,
    vendedor_codigo: c.vendedor_codigo ?? null,
    forma_pago_codigo: c.forma_pago_codigo ?? null,
    tipo_credito: c.tipo_credito ?? null,
    ruta_codigo: c.ruta_codigo ?? null,
    tarifa_nivel: c.tarifa_nivel_defecto ?? null,
    descuento_pie_pct: 0,
    igic_pie_pct: 0,
    subtotal: t.subtotal,
    total_descuento_pie: 0,
    subtotal_2: t.subtotal,
    total_igic_pie: t.igic,
    total: t.total,
    total_pendiente: t.total,
    observaciones: p.observaciones,
  }
  const { error: eCab } = await supabase.from('pedido_cliente').insert(cab)
  if (eCab) {
    const dup = eCab.code === '23505'
    await registrarSincronizacion({ operacion: 'importar_pedido', recurso: 'orders', resultado: 'error', mensaje: eCab.message, web_pedido_id: p.webId })
    return { ok: false, yaExistia: dup, error: dup ? 'Ya importado (otro puesto se ha adelantado).' : eCab.message }
  }
  const filas = p.lineas.map((l, i) => ({
    tienda_terminal_codigo: tienda,
    numero: cab.numero,
    numero_linea: i + 1,
    almacen_codigo: cfg.almacen_codigo,
    fecha: cab.fecha,
    hora: cab.hora,
    articulo_codigo: l.articulo_codigo!,
    codigo_venta: l.codigo_venta,
    codigo_compra: l.codigo_compra,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    precio: l.precio,
    descuento_pct: l.descuento_pct,
    subtotal: t.porLinea[i].sub,
    igic_pct: l.igic_pct,
    total_igic: t.porLinea[i].igicLinea,
    total_base: t.porLinea[i].base,
    impuesto2_pct: l.impuesto2_pct,
    total_impuesto2: t.porLinea[i].canonLinea,
    garantia_meses: l.garantia_meses,
    observaciones: l.encontrado ? null : `Web: ${l.sku || '(sin SKU)'} ${l.nombreWeb}`,
  }))
  const { error: eLin } = await supabase.from('pedido_cliente_linea').insert(filas)
  if (eLin) {
    // Sin líneas el pedido no sirve: se deshace la cabecera para poder reintentar.
    await supabase.from('pedido_cliente').delete().eq('tienda_terminal_codigo', tienda).eq('numero', cab.numero)
    await registrarSincronizacion({ operacion: 'importar_pedido', recurso: 'orders', resultado: 'error', mensaje: `Líneas: ${eLin.message}`, web_pedido_id: p.webId })
    return { ok: false, yaExistia: false, error: `No se han podido grabar las líneas: ${eLin.message}` }
  }
  await registrarSincronizacion({
    operacion: 'importar_pedido',
    recurso: 'orders',
    resultado: p.avisos.length ? 'aviso' : 'ok',
    mensaje: p.avisos.length ? p.avisos.join(' ') : `Pedido web ${p.numeroWeb} importado`,
    registros: filas.length,
    web_pedido_id: p.webId,
    pedido_tienda_codigo: tienda,
    pedido_numero: cab.numero,
  })
  return { ok: true, tienda, numero: cab.numero }
}

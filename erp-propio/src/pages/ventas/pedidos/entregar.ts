import { supabase } from '../../../lib/supabase'

export interface PedidoParaEntregar {
  tienda_terminal_codigo: string
  numero: number
  almacen_codigo: string | null
  cliente_codigo: string
  cliente_sucursal_codigo: string | null
  nombre_cliente: string | null
  nif_cliente: string | null
  vendedor_codigo: string | null
  tarifa_nivel: number | null
  forma_pago_codigo: string | null
  tipo_credito: string | null
  empleado_codigo: string | null
  ruta_codigo: string | null
  subtotal: number | null
  descuento_pie_pct: number | null
  total_descuento_pie: number | null
  subtotal_2: number | null
  igic_pie_pct: number | null
  total_igic_pie: number | null
  total: number | null
}

/**
 * Entrega del pedido (en GeminisWin, «liquidar», LIQUIDADO = 5): crea la venta con sus líneas,
 * descuenta el stock del almacén del pedido con movimiento_stock y deja el pedido enlazado a la
 * venta. Devuelve el número de venta.
 */
export async function entregarPedido(p: PedidoParaEntregar): Promise<number> {
  const { data: lineas, error: lineasError } = await supabase
    .from('pedido_cliente_linea')
    .select('*')
    .eq('tienda_terminal_codigo', p.tienda_terminal_codigo)
    .eq('numero', p.numero)
    .order('numero_linea')
  if (lineasError) throw new Error(lineasError.message)

  const { data: numeroVenta, error: numeroError } = await supabase.rpc('fn_siguiente_numero', {
    p_tienda: p.tienda_terminal_codigo,
    p_tipo_documento: 'venta',
    p_serie: '',
  })
  if (numeroError) throw new Error(numeroError.message)

  const ahora = new Date()
  const total = Number(p.total ?? 0)
  const { error: ventaError } = await supabase.from('venta').insert({
    tienda_terminal_codigo: p.tienda_terminal_codigo,
    numero: numeroVenta,
    pedido_tienda_codigo: p.tienda_terminal_codigo,
    pedido_numero: p.numero,
    cliente_codigo: p.cliente_codigo,
    cliente_sucursal_codigo: p.cliente_sucursal_codigo,
    nombre_cliente: p.nombre_cliente,
    nif_cliente: p.nif_cliente,
    vendedor_codigo: p.vendedor_codigo,
    tarifa_nivel: p.tarifa_nivel,
    forma_pago_codigo: p.forma_pago_codigo,
    tipo_credito: p.tipo_credito,
    almacen_codigo: p.almacen_codigo,
    empleado_codigo: p.empleado_codigo,
    ruta_codigo: p.ruta_codigo,
    fecha: ahora.toISOString().slice(0, 10),
    hora: ahora.toTimeString().slice(0, 5),
    subtotal: p.subtotal,
    descuento_pie_pct: p.descuento_pie_pct,
    total_descuento_pie: p.total_descuento_pie,
    subtotal_2: p.subtotal_2,
    igic_pie_pct: p.igic_pie_pct,
    total_igic_pie: p.total_igic_pie,
    total,
    total_efectivo: 0,
    total_tarjeta: 0,
    total_pagado: 0,
    total_pendiente: total,
    // Se graba aplazada y se completa tras grabar las líneas: así se emite el registro VeriFactu
    aplazada: true,
  })
  if (ventaError) throw new Error(ventaError.message)

  const ls = lineas ?? []
  if (ls.length > 0) {
    const { error: ventaLineaError } = await supabase.from('venta_linea').insert(
      ls.map((l) => ({
        tienda_terminal_codigo: p.tienda_terminal_codigo,
        numero: numeroVenta,
        numero_linea: l.numero_linea,
        articulo_codigo: l.articulo_codigo,
        cantidad: l.cantidad,
        precio: l.precio,
      })),
    )
    if (ventaLineaError) throw new Error(ventaLineaError.message)
  }

  // Completar la venta = emitirla (el trigger de BD genera el registro VeriFactu)
  const { error: emitirError } = await supabase
    .from('venta')
    .update({ aplazada: false })
    .eq('tienda_terminal_codigo', p.tienda_terminal_codigo)
    .eq('numero', numeroVenta)
  if (emitirError) throw new Error(emitirError.message)

  if (ls.length > 0) {

    if (p.almacen_codigo) {
      const { error: stockError } = await supabase.from('movimiento_stock').insert(
        ls.map((l) => ({
          tipo_movimiento: 'venta',
          sentido: -1,
          almacen_codigo: p.almacen_codigo,
          articulo_codigo: l.articulo_codigo,
          cantidad: l.cantidad,
          documento_origen_tipo: 'venta',
          documento_origen_tienda_codigo: p.tienda_terminal_codigo,
          documento_origen_numero: numeroVenta,
          documento_origen_linea: l.numero_linea,
          tienda_terminal_codigo: p.tienda_terminal_codigo,
          empleado_codigo: p.empleado_codigo,
        })),
      )
      if (stockError) throw new Error(stockError.message)
    }
  }

  const { error: updateError } = await supabase
    .from('pedido_cliente')
    .update({
      entregado: true,
      liquidado: 5,
      venta_tienda_codigo: p.tienda_terminal_codigo,
      venta_numero: numeroVenta,
    })
    .eq('tienda_terminal_codigo', p.tienda_terminal_codigo)
    .eq('numero', p.numero)
  if (updateError) throw new Error(updateError.message)
  return numeroVenta as number
}

import { supabase } from '../../../lib/supabase'

// Lógica del pedido / albarán de proveedor (Compras → Pedidos a Proveedores de GeminisWin).

export interface CabeceraCompra {
  tienda_terminal_codigo: string
  numero: number | null
  fecha_hora: string | null
  proveedor_codigo: string
  almacen_codigo: string
  estado: string
  es_abono: boolean
  numero_factura_proveedor_externo: string | null
  fecha_solicitud: string | null
  fecha_prevista: string | null
  fecha_factura: string | null
  fecha_pago: string | null
  fecha_vencimiento_1: string | null
  fecha_recepcion: string | null
  transportista_codigo: string | null
  transporte_numero_factura: string | null
  transporte_factura_pagada: boolean
  transporte_forma_pago_codigo: string | null
  transporte_fecha_pago: string | null
  transporte_coste: number
  transporte_igic_pct: number
  forma_pago_codigo: string | null
  descuento_pie_pct: number
  igic_pie_pct: number
  gastos_proveedor: number
  gastos_proveedor_igic_pct: number
  otros_gastos: number
  recibido: boolean
  stock_movido: boolean
  pagado: boolean
  proveedor_pagado: boolean
  no_pasar_contabilidad: boolean
  observaciones: string | null
}

export const CAB_COMPRA_COLS =
  'tienda_terminal_codigo, numero, fecha_hora, proveedor_codigo, almacen_codigo, estado, es_abono, numero_factura_proveedor_externo, fecha_solicitud, fecha_prevista, fecha_factura, fecha_pago, fecha_vencimiento_1, fecha_recepcion, transportista_codigo, transporte_numero_factura, transporte_factura_pagada, transporte_forma_pago_codigo, transporte_fecha_pago, transporte_coste, transporte_igic_pct, forma_pago_codigo, descuento_pie_pct, igic_pie_pct, gastos_proveedor, gastos_proveedor_igic_pct, otros_gastos, recibido, stock_movido, pagado, proveedor_pagado, no_pasar_contabilidad, observaciones'

export interface LineaCompra {
  articulo_codigo: string
  codigo_compra: string | null
  descripcion: string | null
  bultos: number
  cajas: number
  cantidad: number
  unidades_por_caja: number
  cajas_por_bulto: number
  coste_anterior: number | null
  precio_compra: number
  descuento_pct: number
  igic_pct: number
  canon: number // por unidad
  bonificacion: number // unidades regaladas
}

export const LINEA_COMPRA_COLS =
  'linea, articulo_codigo, codigo_compra, descripcion, bultos, cajas, cantidad, unidades_por_caja, cajas_por_bulto, coste_anterior, precio_compra, descuento_pct, igic_pct, canon, bonificacion'

export const ESTADOS_COMPRA = [
  { v: 'pendiente', t: 'Pendiente' },
  { v: 'pendiente_confirmar', t: 'Pdte. Confirmar' },
  { v: 'confirmado', t: 'Confirmado' },
  { v: 'conformado', t: 'Conformado' },
  { v: 'pendiente_entrega', t: 'Pdte. Entrega' },
  { v: 'recepcionado', t: 'Recepcionado' },
  { v: 'liquidado', t: 'Liquidado' },
]

export function r3(n: number) {
  return Math.round(n * 1000) / 1000
}

export function r2(n: number) {
  return Math.round(n * 100) / 100
}

export function subLinea(l: LineaCompra) {
  return r3(l.cantidad * l.precio_compra * (1 - (l.descuento_pct || 0) / 100))
}

export function netoLinea(l: LineaCompra) {
  return r3(l.precio_compra * (1 - (l.descuento_pct || 0) / 100))
}

/** Importes del pie, en el mismo orden que la ficha de GeminisWin. */
export function calcularCompra(lineas: LineaCompra[], c: Pick<CabeceraCompra, 'descuento_pie_pct' | 'igic_pie_pct' | 'gastos_proveedor' | 'gastos_proveedor_igic_pct' | 'transporte_coste' | 'transporte_igic_pct' | 'otros_gastos'>) {
  const dtoPie = Number(c.descuento_pie_pct || 0)
  const igicPie = Number(c.igic_pie_pct || 0)
  let subtotal = 0
  let canon = 0
  let igicLineas = 0
  for (const l of lineas) {
    const sub = subLinea(l)
    subtotal += sub
    canon += (l.canon || 0) * l.cantidad
    igicLineas += (sub * (1 - dtoPie / 100) * (igicPie > 0 ? igicPie : l.igic_pct || 0)) / 100
  }
  subtotal = r2(subtotal)
  const totalDto = r2((subtotal * dtoPie) / 100)
  const base = r2(subtotal - totalDto)
  const gastos = Number(c.gastos_proveedor || 0)
  const igicGastos = r2((gastos * Number(c.gastos_proveedor_igic_pct || 0)) / 100)
  const baseConGastos = r2(base + gastos)
  const transporte = Number(c.transporte_coste || 0)
  const igicTransporte = r2((transporte * Number(c.transporte_igic_pct || 0)) / 100)
  const totalTransporte = r2(transporte + igicTransporte)
  canon = r2(canon)
  igicLineas = r2(igicLineas)
  const totalIgic = r2(igicLineas + igicGastos + igicTransporte)
  const total = r2(baseConGastos + canon + transporte + totalIgic)
  const aPagarProveedor = r2(total - totalTransporte)
  const otros = Number(c.otros_gastos || 0)
  const totalConOtros = r2(total + otros)
  return { subtotal, totalDto, base, gastos, igicGastos, baseConGastos, transporte, igicTransporte, totalTransporte, canon, igicLineas, totalIgic, total, aPagarProveedor, otros, totalConOtros }
}

/**
 * «Actualizado» de GeminisWin: entra el stock en el almacén del pedido y recalcula los costes
 * del artículo (y de ese proveedor) repartiendo en el coste los gastos adicionales y el
 * transporte en proporción al importe de cada línea.
 *   puro = precio de compra · neto = puro − dto. de línea · bruto = neto − dto. de pie ·
 *   líquido = (bruto × cantidad + gastos repartidos) / (cantidad + bonificación)
 *   PM compra = media ponderada con el stock existente.
 */
export async function actualizarCompra(cab: CabeceraCompra & { numero: number }, lineas: LineaCompra[], empleado: string | null) {
  if (cab.stock_movido) throw new Error('El pedido ya está actualizado.')
  if (!lineas.length) throw new Error('El pedido no tiene líneas.')
  const dtoPie = Number(cab.descuento_pie_pct || 0)
  const repartir = Number(cab.otros_gastos || 0) + Number(cab.transporte_coste || 0)
  const subs = lineas.map(subLinea)
  const totalSubs = subs.reduce((a, b) => a + b, 0)
  const sentido = cab.es_abono ? -1 : 1
  const hoy = new Date().toISOString().slice(0, 10)

  const calc = lineas.map((l, i) => {
    const unidades = l.cantidad + (l.bonificacion || 0)
    const puro = r3(l.precio_compra)
    const neto = netoLinea(l)
    const bruto = r3(neto * (1 - dtoPie / 100))
    const reparto = totalSubs > 0 ? (repartir * subs[i]) / totalSubs : 0
    const liquido = unidades > 0 ? r3((bruto * l.cantidad + reparto) / unidades) : bruto
    return { l, unidades, puro, neto, bruto, liquido }
  })

  // Stock previo (todos los almacenes) para el precio medio, antes de mover nada.
  const codigos = [...new Set(lineas.map((l) => l.articulo_codigo))]
  const [{ data: stocks }, { data: arts }] = await Promise.all([
    supabase.from('articulo_almacen_stock').select('articulo_codigo, cantidad_actual').in('articulo_codigo', codigos),
    supabase.from('articulo').select('codigo_interno, precio_medio_compra').in('codigo_interno', codigos),
  ])
  const stockPrevio = new Map<string, number>()
  for (const s of stocks ?? []) stockPrevio.set(s.articulo_codigo, (stockPrevio.get(s.articulo_codigo) ?? 0) + Number(s.cantidad_actual ?? 0))
  const pmPrevio = new Map((arts ?? []).map((a) => [a.codigo_interno as string, Number(a.precio_medio_compra ?? 0)]))

  const movimientos = calc
    .filter((c) => c.unidades > 0)
    .map((c, i) => ({
      tipo_movimiento: cab.es_abono ? 'devolucion_proveedor' : 'compra',
      sentido,
      almacen_codigo: cab.almacen_codigo,
      articulo_codigo: c.l.articulo_codigo,
      cantidad: c.unidades,
      costo_unitario: c.liquido,
      documento_origen_tipo: 'pedido_proveedor',
      documento_origen_tienda_codigo: cab.tienda_terminal_codigo,
      documento_origen_numero: cab.numero,
      documento_origen_linea: i + 1,
      tienda_terminal_codigo: cab.tienda_terminal_codigo,
      empleado_codigo: empleado,
    }))
  if (movimientos.length) {
    const { error } = await supabase.from('movimiento_stock').insert(movimientos)
    if (error) throw new Error(error.message)
  }

  // Costes: los abonos mueven stock pero no cambian los costes del artículo.
  if (!cab.es_abono) {
    const acumulado = new Map<string, number>()
    for (const c of calc) {
      const previo = (stockPrevio.get(c.l.articulo_codigo) ?? 0) + (acumulado.get(c.l.articulo_codigo) ?? 0)
      const pmAnt = pmPrevio.get(c.l.articulo_codigo) ?? 0
      const pm = previo > 0 && pmAnt > 0 ? r3((previo * pmAnt + c.unidades * c.liquido) / (previo + c.unidades)) : c.liquido
      pmPrevio.set(c.l.articulo_codigo, pm)
      acumulado.set(c.l.articulo_codigo, (acumulado.get(c.l.articulo_codigo) ?? 0) + c.unidades)
      const { error: e1 } = await supabase
        .from('articulo')
        .update({
          coste_puro: c.puro,
          coste_neto: c.neto,
          coste_bruto: c.bruto,
          precio_liquidado: c.liquido,
          precio_medio_compra: pm,
          ultima_compra_fecha: hoy,
          ultima_compra_tienda: cab.tienda_terminal_codigo,
          ultima_compra_numero: cab.numero,
          ultimo_descuento_compra_pct: c.l.descuento_pct || 0,
          ultima_bonificacion_compra: c.l.bonificacion || 0,
          ultimas_unidades_compradas: c.unidades,
        })
        .eq('codigo_interno', c.l.articulo_codigo)
      if (e1) throw new Error(e1.message)
      const { error: e2 } = await supabase.from('articulo_proveedor').upsert(
        {
          articulo_codigo: c.l.articulo_codigo,
          proveedor_codigo: cab.proveedor_codigo,
          codigo_compra: c.l.codigo_compra,
          coste_puro: c.puro,
          coste_neto: c.neto,
          coste_bruto: c.bruto,
          precio_medio_compra: c.liquido,
          ultimo_descuento_pct: c.l.descuento_pct || 0,
          ultima_bonificacion: c.l.bonificacion || 0,
          ultima_compra_tienda: cab.tienda_terminal_codigo,
          ultima_compra_numero: cab.numero,
          ultima_compra_fecha: hoy,
          ultimas_unidades_compradas: c.unidades,
        },
        { onConflict: 'articulo_codigo,proveedor_codigo' },
      )
      if (e2) throw new Error(e2.message)
    }
  }

  for (let i = 0; i < calc.length; i++) {
    const c = calc[i]
    const { error } = await supabase
      .from('pedido_proveedor_linea')
      .update({
        coste_neto: c.neto,
        precio_liquidado: c.liquido,
        precio_medio_compra: pmPrevio.get(c.l.articulo_codigo) ?? c.liquido,
        total_unidades: c.unidades,
        unidades_recibidas: c.l.cantidad,
        bonificacion_recibida: c.l.bonificacion || 0,
        recibido: true,
      })
      .eq('tienda_terminal_codigo', cab.tienda_terminal_codigo)
      .eq('numero', cab.numero)
      .eq('linea', i + 1)
    if (error) throw new Error(error.message)
  }

  const { error } = await supabase
    .from('pedido_proveedor')
    .update({ estado: 'recepcionado', recibido: true, stock_movido: true, fecha_recepcion: hoy })
    .eq('tienda_terminal_codigo', cab.tienda_terminal_codigo)
    .eq('numero', cab.numero)
  if (error) throw new Error(error.message)
}

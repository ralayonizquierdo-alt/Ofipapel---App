import { supabase } from '../../../lib/supabase'
import { ahoraTrabajo, fechaTrabajo } from '../../../lib/sesionTrabajo'

// Pagos de gastos, pagos a proveedores y a transportistas (PAGOSGST en GeminisWin).

export interface Pago {
  tienda_terminal_codigo: string
  codigo_pago: number | null
  fecha: string | null
  tipo_receptor: number | null // 1 proveedor · 2 transportista · 3 documento · 4 otro
  receptor_codigo: string | null
  receptor_nombre: string | null
  receptor_dni: string | null
  numero_factura_externa: string | null
  fecha_factura: string | null
  numero_documento_pago: string | null
  fecha_pago: string | null
  fecha_vencimiento: string | null
  cuota: number | null
  importe_pagado: number | null
  estado_pago: string | null
  cuenta_contable: string | null
  cuenta_contrapartida: string | null
  tipo_pago: string | null
  forma_pago_codigo: string | null
  es_efecto: boolean
  es_domiciliado: boolean
  concepto: string | null
  pedido_relacionado_tienda_codigo: string | null
  pedido_relacionado_numero: number | null
  factura_relacionada_tienda_codigo: string | null
  factura_relacionada_id: number | null
  movimiento_tienda_codigo: string | null
  movimiento_numero: number | null
  contabilizado: boolean
  activo: boolean
}

export const PAGO_COLS =
  'tienda_terminal_codigo, codigo_pago, fecha, tipo_receptor, receptor_codigo, receptor_nombre, receptor_dni, numero_factura_externa, fecha_factura, numero_documento_pago, fecha_pago, fecha_vencimiento, cuota, importe_pagado, estado_pago, cuenta_contable, cuenta_contrapartida, tipo_pago, forma_pago_codigo, es_efecto, es_domiciliado, concepto, pedido_relacionado_tienda_codigo, pedido_relacionado_numero, factura_relacionada_tienda_codigo, factura_relacionada_id, movimiento_tienda_codigo, movimiento_numero, contabilizado, activo'

export const ESTADOS_PAGO = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'pagado', label: 'Pagado' },
  { value: 'devuelto', label: 'Devuelto' },
  { value: 'anulado', label: 'Anulado' },
]

export const RECEPTORES = [
  { value: 1, label: 'Proveedor' },
  { value: 2, label: 'Transportista' },
  { value: 3, label: 'Documento' },
  { value: 4, label: 'Otro' },
]

export interface FormaPago {
  codigo: string
  descripcion: string
  tipo: number // 1 crédito · 2 efecto · 3 banco · 4 contado
  tipo_contado: number | null // 1 efectivo · 2 tarjeta · 3 cheque
  domiciliacion_bancaria: boolean
  generador_num_pagos: number | null
  cadencia_nivel0: number | null
  cadencia_nivel1: number | null
  cadencia_nivel2: number | null
  cadencia_nivel3: number | null
  cadencia_nivel4: number | null
  cadencia_nivel5: number | null
  cadencia_nivel6: number | null
}

export const FORMA_PAGO_COLS =
  'codigo, descripcion, tipo, tipo_contado, domiciliacion_bancaria, generador_num_pagos, cadencia_nivel0, cadencia_nivel1, cadencia_nivel2, cadencia_nivel3, cadencia_nivel4, cadencia_nivel5, cadencia_nivel6'

/** Clase de forma de pago para los filtros del Gestor de pagos. */
export type ClaseFp = 'credito' | 'efecto' | 'banco' | 'domiciliacion' | 'efectivo' | 'tarjeta' | 'cheque'

export function claseFormaPago(fp: FormaPago | undefined, tipoPagoTexto?: string | null): ClaseFp {
  if (fp) {
    if (fp.domiciliacion_bancaria) return 'domiciliacion'
    if (fp.tipo === 1) return 'credito'
    if (fp.tipo === 2) return 'efecto'
    if (fp.tipo === 3) return 'banco'
    if (fp.tipo_contado === 2) return 'tarjeta'
    if (fp.tipo_contado === 3) return 'cheque'
    return 'efectivo'
  }
  const t = (tipoPagoTexto ?? '').toLowerCase()
  if (t.includes('tarjeta')) return 'tarjeta'
  if (t.includes('cheque') || t.includes('talón')) return 'cheque'
  if (t.includes('transfer') || t.includes('banco')) return 'banco'
  return 'efectivo'
}

/** Fecha de trabajo (Utilidades → Cambio de Fecha), por defecto hoy. */
export function hoyISO() {
  return fechaTrabajo()
}

function horaActual() {
  const d = ahoraTrabajo()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function vacio(tienda: string): Pago {
  return {
    tienda_terminal_codigo: tienda,
    codigo_pago: null,
    fecha: hoyISO(),
    tipo_receptor: 1,
    receptor_codigo: null,
    receptor_nombre: null,
    receptor_dni: null,
    numero_factura_externa: null,
    fecha_factura: null,
    numero_documento_pago: null,
    fecha_pago: hoyISO(),
    fecha_vencimiento: null,
    cuota: null,
    importe_pagado: null,
    estado_pago: 'pagado',
    cuenta_contable: null,
    cuenta_contrapartida: null,
    tipo_pago: null,
    forma_pago_codigo: null,
    es_efecto: false,
    es_domiciliado: false,
    concepto: null,
    pedido_relacionado_tienda_codigo: null,
    pedido_relacionado_numero: null,
    factura_relacionada_tienda_codigo: null,
    factura_relacionada_id: null,
    movimiento_tienda_codigo: null,
    movimiento_numero: null,
    contabilizado: true,
    activo: true,
  }
}

/** Documento a pagar: pedido/albarán de proveedor o factura de proveedor. */
export interface DocPago {
  clase: 'pedido' | 'factura'
  tienda: string
  numero: number
  proveedor_codigo: string
  numero_factura: string | null
  fecha_factura: string | null
  fecha_vencimiento: string | null
  forma_pago_codigo: string | null
  total: number
  pagado: boolean
}

export async function cargarDoc(clase: 'pedido' | 'factura', tienda: string, numero: number): Promise<DocPago | null> {
  if (clase === 'pedido') {
    const { data } = await supabase
      .from('pedido_proveedor')
      .select('tienda_terminal_codigo, numero, proveedor_codigo, numero_factura_proveedor_externo, fecha_factura, fecha_vencimiento_1, forma_pago_codigo, total, total_a_pagar_proveedor, pagado')
      .eq('tienda_terminal_codigo', tienda)
      .eq('numero', numero)
      .maybeSingle()
    if (!data) return null
    return {
      clase,
      tienda: data.tienda_terminal_codigo,
      numero: Number(data.numero),
      proveedor_codigo: data.proveedor_codigo,
      numero_factura: data.numero_factura_proveedor_externo,
      fecha_factura: data.fecha_factura,
      fecha_vencimiento: data.fecha_vencimiento_1,
      forma_pago_codigo: data.forma_pago_codigo,
      total: Number(data.total_a_pagar_proveedor ?? data.total ?? 0),
      pagado: Boolean(data.pagado),
    }
  }
  const { data } = await supabase
    .from('factura_proveedor')
    .select('tienda_terminal_codigo, id, proveedor_codigo, numero_factura_externo, fecha_factura, fecha_vencimiento, forma_pago_codigo, total, total_a_pagar_proveedor, pagado')
    .eq('tienda_terminal_codigo', tienda)
    .eq('id', numero)
    .maybeSingle()
  if (!data) return null
  return {
    clase,
    tienda: data.tienda_terminal_codigo,
    numero: Number(data.id),
    proveedor_codigo: data.proveedor_codigo,
    numero_factura: data.numero_factura_externo,
    fecha_factura: data.fecha_factura,
    fecha_vencimiento: data.fecha_vencimiento,
    forma_pago_codigo: data.forma_pago_codigo,
    total: Number(data.total_a_pagar_proveedor ?? data.total ?? 0),
    pagado: Boolean(data.pagado),
  }
}

/** Suma de lo pagado (estado «pagado», activos) contra un documento. */
export async function totalPagadoDoc(clase: 'pedido' | 'factura', tienda: string, numero: number) {
  let q = supabase.from('pago_proveedor').select('importe_pagado, fecha_pago').eq('activo', true).eq('estado_pago', 'pagado')
  q =
    clase === 'pedido'
      ? q.eq('pedido_relacionado_tienda_codigo', tienda).eq('pedido_relacionado_numero', numero)
      : q.eq('factura_relacionada_tienda_codigo', tienda).eq('factura_relacionada_id', numero)
  const { data } = await q
  const filas = data ?? []
  const total = filas.reduce((s, r) => s + Number(r.importe_pagado ?? 0), 0)
  const ultima = filas.map((r) => r.fecha_pago as string | null).filter(Boolean).sort().pop() ?? null
  return { total: Math.round(total * 1000) / 1000, ultima }
}

/** Marca el pedido o la factura de proveedor como pagados (o pendientes) según lo cobrado. */
export async function actualizarEstadoDoc(clase: 'pedido' | 'factura', tienda: string, numero: number) {
  const doc = await cargarDoc(clase, tienda, numero)
  if (!doc) return
  const { total, ultima } = await totalPagadoDoc(clase, tienda, numero)
  const pagado = doc.total > 0 && total >= doc.total - 0.005
  if (clase === 'pedido') {
    await supabase
      .from('pedido_proveedor')
      .update({ pagado, fecha_pago: pagado ? ultima : null })
      .eq('tienda_terminal_codigo', tienda)
      .eq('numero', numero)
  } else {
    await supabase
      .from('factura_proveedor')
      .update({ pagado, fecha_pago: pagado ? ultima : null, total_pendiente: Math.max(0, Math.round((doc.total - total) * 1000) / 1000) })
      .eq('tienda_terminal_codigo', tienda)
      .eq('id', numero)
  }
}

async function siguiente(tienda: string, tipo: string) {
  const { data, error } = await supabase.rpc('fn_siguiente_numero', { p_tienda: tienda, p_tipo_documento: tipo, p_serie: '' })
  if (error) throw new Error(error.message)
  return Number(data)
}

/**
 * Guarda un pago. En alta asigna el número; si el pago está «pagado» con una forma de pago de
 * contado, genera (o ajusta) el movimiento de caja como gasto; después recalcula si el
 * pedido/factura de proveedor relacionado queda pagado.
 */
export async function guardarPago(p: Pago, fp: FormaPago | undefined, empleado: string | null, previo: Pago | null) {
  const datos = { ...p }
  delete (datos as Partial<Pago>).codigo_pago
  datos.tipo_pago = fp ? fp.descripcion : datos.tipo_pago
  datos.es_domiciliado = Boolean(fp?.domiciliacion_bancaria)
  datos.es_efecto = fp?.tipo === 2

  let codigo = p.codigo_pago
  if (codigo == null) {
    codigo = await siguiente(p.tienda_terminal_codigo, 'pago_proveedor')
    const { error } = await supabase.from('pago_proveedor').insert({ ...datos, codigo_pago: codigo })
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('pago_proveedor')
      .update(datos)
      .eq('tienda_terminal_codigo', p.tienda_terminal_codigo)
      .eq('codigo_pago', codigo)
    if (error) throw new Error(error.message)
  }

  const esContado = fp?.tipo === 4
  const importe = p.estado_pago === 'pagado' ? Number(p.importe_pagado ?? 0) : 0
  const concepto = p.concepto || `Pago Nº ${codigo} - ${p.receptor_nombre ?? ''}`.trim()
  if (p.movimiento_numero != null && p.movimiento_tienda_codigo) {
    // Ya tenía movimiento: se ajusta el gasto (0 si el pago deja de estar pagado o deja de ser contado).
    await supabase
      .from('movimiento_caja')
      .update({ gasto: esContado ? importe : 0, concepto })
      .eq('tienda_terminal_codigo', p.movimiento_tienda_codigo)
      .eq('numero', p.movimiento_numero)
  } else if (esContado && importe > 0) {
    const mov = await siguiente(p.tienda_terminal_codigo, 'caja')
    const { error } = await supabase.from('movimiento_caja').insert({
      tienda_terminal_codigo: p.tienda_terminal_codigo,
      numero: mov,
      fecha: p.fecha_pago ?? hoyISO(),
      hora: horaActual(),
      es_ingreso: false,
      gasto: importe,
      concepto,
      documento: 'pago_proveedor',
      tipo_movimiento: 'PAG',
      forma_pago_codigo: fp?.codigo ?? null,
      tipo_forma_pago: fp?.tipo ?? null,
      tipo_contado: fp?.tipo_contado ?? null,
      ajeno_tienda_codigo: p.tienda_terminal_codigo,
      ajeno_codigo: codigo,
      empleado_codigo: empleado,
    })
    if (error) throw new Error(error.message)
    await supabase
      .from('pago_proveedor')
      .update({ movimiento_tienda_codigo: p.tienda_terminal_codigo, movimiento_numero: mov })
      .eq('tienda_terminal_codigo', p.tienda_terminal_codigo)
      .eq('codigo_pago', codigo)
  }

  const docs = new Set<string>()
  for (const x of [p, previo]) {
    if (!x) continue
    if (x.pedido_relacionado_tienda_codigo && x.pedido_relacionado_numero != null)
      docs.add(`pedido|${x.pedido_relacionado_tienda_codigo}|${x.pedido_relacionado_numero}`)
    if (x.factura_relacionada_tienda_codigo && x.factura_relacionada_id != null)
      docs.add(`factura|${x.factura_relacionada_tienda_codigo}|${x.factura_relacionada_id}`)
  }
  for (const d of docs) {
    const [clase, t, n] = d.split('|')
    await actualizarEstadoDoc(clase as 'pedido' | 'factura', t, Number(n))
  }
  return codigo
}

/** Baja lógica del pago (activo = false) y anulación de su gasto de caja. */
export async function eliminarPago(p: Pago) {
  if (p.codigo_pago == null) return
  const { error } = await supabase
    .from('pago_proveedor')
    .update({ activo: false, estado_pago: 'anulado' })
    .eq('tienda_terminal_codigo', p.tienda_terminal_codigo)
    .eq('codigo_pago', p.codigo_pago)
  if (error) throw new Error(error.message)
  if (p.movimiento_numero != null && p.movimiento_tienda_codigo) {
    await supabase
      .from('movimiento_caja')
      .update({ gasto: 0, concepto: `ANULADO — ${p.concepto ?? `Pago Nº ${p.codigo_pago}`}` })
      .eq('tienda_terminal_codigo', p.movimiento_tienda_codigo)
      .eq('numero', p.movimiento_numero)
  }
  if (p.pedido_relacionado_tienda_codigo && p.pedido_relacionado_numero != null)
    await actualizarEstadoDoc('pedido', p.pedido_relacionado_tienda_codigo, p.pedido_relacionado_numero)
  if (p.factura_relacionada_tienda_codigo && p.factura_relacionada_id != null)
    await actualizarEstadoDoc('factura', p.factura_relacionada_tienda_codigo, p.factura_relacionada_id)
}

/**
 * Genera los vencimientos pendientes de un documento según su forma de pago (nº de pagos y
 * cadencias en días), descontando lo ya pagado. Devuelve cuántos pagos se han creado.
 */
export async function generarPagosDoc(doc: DocPago, fp: FormaPago | undefined, proveedorNombre: string | null) {
  const { total: yaPagado } = await totalPagadoDoc(doc.clase, doc.tienda, doc.numero)
  // Pendientes ya generados: no se duplican.
  let q = supabase.from('pago_proveedor').select('codigo_pago').eq('activo', true).eq('estado_pago', 'pendiente')
  q =
    doc.clase === 'pedido'
      ? q.eq('pedido_relacionado_tienda_codigo', doc.tienda).eq('pedido_relacionado_numero', doc.numero)
      : q.eq('factura_relacionada_tienda_codigo', doc.tienda).eq('factura_relacionada_id', doc.numero)
  const { data: pend } = await q
  if ((pend ?? []).length > 0) return 0
  const resto = Math.round((doc.total - yaPagado) * 1000) / 1000
  if (resto <= 0.005) return 0
  const n = Math.max(1, Number(fp?.generador_num_pagos ?? 1))
  const cad = [fp?.cadencia_nivel0, fp?.cadencia_nivel1, fp?.cadencia_nivel2, fp?.cadencia_nivel3, fp?.cadencia_nivel4, fp?.cadencia_nivel5, fp?.cadencia_nivel6]
  const base = doc.fecha_factura ?? hoyISO()
  const cuota = Math.round((resto / n) * 1000) / 1000
  let creados = 0
  for (let i = 0; i < n; i++) {
    const dias = Number(cad[i] ?? cad[0] ?? 0)
    const f = new Date(`${base}T00:00:00`)
    f.setDate(f.getDate() + dias)
    const venc = i === 0 && doc.fecha_vencimiento && !cad[0] ? doc.fecha_vencimiento : f.toISOString().slice(0, 10)
    const importe = i === n - 1 ? Math.round((resto - cuota * (n - 1)) * 1000) / 1000 : cuota
    const p: Pago = {
      ...vacio(doc.tienda),
      tipo_receptor: 1,
      receptor_codigo: doc.proveedor_codigo,
      receptor_nombre: proveedorNombre,
      numero_factura_externa: doc.numero_factura,
      fecha_factura: doc.fecha_factura,
      fecha_pago: null,
      fecha_vencimiento: venc,
      cuota: importe,
      importe_pagado: 0,
      estado_pago: 'pendiente',
      forma_pago_codigo: fp?.codigo ?? doc.forma_pago_codigo,
      concepto: `Vto. ${i + 1}/${n} ${doc.clase === 'pedido' ? 'Pedido' : 'Factura'} ${doc.tienda}-${doc.numero}`,
      pedido_relacionado_tienda_codigo: doc.clase === 'pedido' ? doc.tienda : null,
      pedido_relacionado_numero: doc.clase === 'pedido' ? doc.numero : null,
      factura_relacionada_tienda_codigo: doc.clase === 'factura' ? doc.tienda : null,
      factura_relacionada_id: doc.clase === 'factura' ? doc.numero : null,
    }
    await guardarPago(p, fp, null, null)
    creados++
  }
  return creados
}

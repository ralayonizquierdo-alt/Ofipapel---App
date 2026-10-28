import { supabase } from '../../../lib/supabase'

// Pagos de clientes, cobros (PAGOSCLI en GeminisWin → cobro_cliente). La lógica del cobro está en
// la base de datos: fn_cobro_cliente_cobrar, fn_cobro_cliente_anular y
// fn_cobro_generar_vencimientos (migración 20261028_cobros_clientes.sql). Aquí solo se llaman.

export interface Cobro {
  tienda_terminal_codigo: string
  codigo_pago: number | null
  cliente_codigo: string | null
  factura_tienda_codigo: string | null
  factura_numero: number | null
  numero_factura_externo: string | null
  id_pago: number | null
  fecha: string | null
  fecha_pago: string | null
  fecha_vencimiento: string | null
  cuota: number | null
  importe_cobrado: number | null
  estado_cobro: string | null
  cuenta_contable: string | null
  tipo_pago: string | null
  forma_pago_codigo: string | null
  es_efecto: boolean
  es_domiciliado: boolean
  concepto: string | null
  numero_documento_pago: string | null
  venta_relacionada_tienda_codigo: string | null
  venta_relacionada_numero: number | null
  movimiento_tienda_codigo: string | null
  movimiento_numero: number | null
  contabilizado: boolean
  activo: boolean
}

export const COBRO_COLS =
  'tienda_terminal_codigo, codigo_pago, cliente_codigo, factura_tienda_codigo, factura_numero, numero_factura_externo, id_pago, fecha, fecha_pago, fecha_vencimiento, cuota, importe_cobrado, estado_cobro, cuenta_contable, tipo_pago, forma_pago_codigo, es_efecto, es_domiciliado, concepto, numero_documento_pago, venta_relacionada_tienda_codigo, venta_relacionada_numero, movimiento_tienda_codigo, movimiento_numero, contabilizado, activo'

export const ESTADOS_COBRO = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'cobrado', label: 'Cobrado' },
  { value: 'anulado', label: 'Anulado' },
]

export function hoyISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const r3 = (x: number) => Math.round(x * 1000) / 1000

export function vacio(tienda: string): Cobro {
  return {
    tienda_terminal_codigo: tienda,
    codigo_pago: null,
    cliente_codigo: null,
    factura_tienda_codigo: null,
    factura_numero: null,
    numero_factura_externo: null,
    id_pago: null,
    fecha: hoyISO(),
    fecha_pago: hoyISO(),
    fecha_vencimiento: null,
    cuota: null,
    importe_cobrado: null,
    estado_cobro: 'cobrado',
    cuenta_contable: null,
    tipo_pago: null,
    forma_pago_codigo: null,
    es_efecto: false,
    es_domiciliado: false,
    concepto: null,
    numero_documento_pago: null,
    venta_relacionada_tienda_codigo: null,
    venta_relacionada_numero: null,
    movimiento_tienda_codigo: null,
    movimiento_numero: null,
    contabilizado: true,
    activo: true,
  }
}

/** Documento a cobrar: factura de cliente o venta (ticket/albarán) sin facturar. */
export interface DocCobro {
  clase: 'factura' | 'venta'
  tienda: string
  numero: number
  cliente_codigo: string | null
  nombre: string | null
  /** Nº de factura (serie-número) o «Venta TT-N». */
  ref: string
  fecha: string | null
  forma_pago_codigo: string | null
  total: number
  pagado: number
  pendiente: number
  anulada: boolean
}

export const FACTURA_COLS =
  'tienda_terminal_codigo, numero, serie, n_factura, cliente_codigo, nombre_cliente, fecha_factura, forma_pago_codigo, total, total_pagado, total_pendiente, fecha_pago, estado'
export const VENTA_COLS =
  'tienda_terminal_codigo, numero, cliente_codigo, nombre_cliente, fecha, forma_pago_codigo, total, total_pagado, total_pendiente, fecha_pago, factura_numero, anulada_en, aplazada'

export const refFactura = (r: { serie?: string | null; n_factura?: number | null; numero: number }) =>
  `${r.serie ?? ''}-${r.n_factura ?? r.numero}`

export function docDeFactura(r: Record<string, unknown>, anulada = false): DocCobro {
  const total = Number(r.total ?? 0)
  const pagado = Number(r.total_pagado ?? 0)
  return {
    clase: 'factura',
    tienda: String(r.tienda_terminal_codigo),
    numero: Number(r.numero),
    cliente_codigo: (r.cliente_codigo as string | null) ?? null,
    nombre: (r.nombre_cliente as string | null) ?? null,
    ref: refFactura(r as { serie: string | null; n_factura: number | null; numero: number }),
    fecha: (r.fecha_factura as string | null) ?? null,
    forma_pago_codigo: (r.forma_pago_codigo as string | null) ?? null,
    total,
    pagado,
    pendiente: r.total_pendiente != null ? Number(r.total_pendiente) : r3(total - pagado),
    anulada,
  }
}

export function docDeVenta(r: Record<string, unknown>): DocCobro {
  const total = Number(r.total ?? 0)
  const pagado = Number(r.total_pagado ?? 0)
  return {
    clase: 'venta',
    tienda: String(r.tienda_terminal_codigo),
    numero: Number(r.numero),
    cliente_codigo: (r.cliente_codigo as string | null) ?? null,
    nombre: (r.nombre_cliente as string | null) ?? null,
    ref: `Venta ${r.tienda_terminal_codigo}-${r.numero}`,
    fecha: (r.fecha as string | null) ?? null,
    forma_pago_codigo: (r.forma_pago_codigo as string | null) ?? null,
    total,
    pagado,
    pendiente: r.total_pendiente != null ? Number(r.total_pendiente) : Math.max(0, r3(total - pagado)),
    anulada: r.anulada_en != null,
  }
}

export async function cargarDoc(clase: 'factura' | 'venta', tienda: string, numero: number): Promise<DocCobro | null> {
  if (clase === 'factura') {
    const [{ data }, { data: anul }] = await Promise.all([
      supabase.from('factura').select(FACTURA_COLS).eq('tienda_terminal_codigo', tienda).eq('numero', numero).maybeSingle(),
      supabase.rpc('fn_factura_anulada', { p_tienda: tienda, p_numero: numero }),
    ])
    return data ? docDeFactura(data, Boolean(anul)) : null
  }
  const { data } = await supabase.from('venta').select(VENTA_COLS).eq('tienda_terminal_codigo', tienda).eq('numero', numero).maybeSingle()
  return data ? docDeVenta(data) : null
}

/** Clave «factura|TT|N» o «venta|TT|N» del documento de un cobro (null si es un cobro suelto). */
export function docKeyCobro(c: Pick<Cobro, 'factura_tienda_codigo' | 'factura_numero' | 'venta_relacionada_tienda_codigo' | 'venta_relacionada_numero'>) {
  if (c.factura_numero != null) return `factura|${c.factura_tienda_codigo}|${c.factura_numero}`
  if (c.venta_relacionada_numero != null) return `venta|${c.venta_relacionada_tienda_codigo}|${c.venta_relacionada_numero}`
  return null
}

export interface ParamsCobro {
  tienda: string
  clase: 'factura' | 'venta'
  docTienda: string
  docNumero: number
  importe: number
  fechaPago: string | null
  formaPago: string | null
  numeroDocumentoPago?: string | null
  concepto?: string | null
  cuentaContable?: string | null
  vencimiento?: { tienda: string; codigo: number } | null
}

/** Cobra (total o parcial) una factura o una venta. Devuelve los códigos de cobro afectados. */
export async function cobrar(p: ParamsCobro) {
  const { data, error } = await supabase.rpc('fn_cobro_cliente_cobrar', {
    p: {
      tienda: p.tienda,
      factura_t: p.clase === 'factura' ? p.docTienda : null,
      factura_n: p.clase === 'factura' ? p.docNumero : null,
      venta_t: p.clase === 'venta' ? p.docTienda : null,
      venta_n: p.clase === 'venta' ? p.docNumero : null,
      importe: p.importe,
      fecha_pago: p.fechaPago,
      forma_pago_codigo: p.formaPago,
      numero_documento_pago: p.numeroDocumentoPago ?? null,
      concepto: p.concepto ?? null,
      cuenta_contable: p.cuentaContable ?? null,
      vencimiento_t: p.vencimiento?.tienda ?? null,
      vencimiento_codigo: p.vencimiento?.codigo ?? null,
    },
  })
  if (error) throw new Error(error.message)
  return data as { tienda: string; codigos: number[]; movimiento: number | null; importe: number; pendiente: number }
}

export async function anularCobro(tienda: string, codigo: number, motivo: string | null) {
  const { data, error } = await supabase.rpc('fn_cobro_cliente_anular', { p_tienda: tienda, p_codigo: codigo, p_motivo: motivo })
  if (error) throw new Error(error.message)
  return data as { importe: number; movimiento_salida: number | null }
}

export async function generarVencimientos(tienda: string, numero: number) {
  const { data, error } = await supabase.rpc('fn_cobro_generar_vencimientos', { p_tienda: tienda, p_numero: numero })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}

/** Cambios que no tocan importes (concepto, nº de talón, cuenta, vencimiento de un pendiente…). */
export async function guardarDatosCobro(c: Cobro) {
  if (c.codigo_pago == null) return
  const datos: Partial<Cobro> = {
    concepto: c.concepto,
    numero_documento_pago: c.numero_documento_pago,
    cuenta_contable: c.cuenta_contable,
    contabilizado: c.contabilizado,
  }
  if (c.estado_cobro === 'pendiente') datos.fecha_vencimiento = c.fecha_vencimiento
  const { error } = await supabase
    .from('cobro_cliente')
    .update(datos)
    .eq('tienda_terminal_codigo', c.tienda_terminal_codigo)
    .eq('codigo_pago', c.codigo_pago)
  if (error) throw new Error(error.message)
}

/** Lee todas las filas de una consulta por páginas (el servidor corta en 1000 por petición). */
// El constructor de consultas de supabase-js no tiene un tipo cómodo de pasar: se deja abierto.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function todasLasFilas<T>(consulta: () => any, max = 20000): Promise<{ filas: T[]; error: string | null; cortado: boolean }> {
  const filas: T[] = []
  const paso = 1000
  for (let desde = 0; desde < max; desde += paso) {
    const { data, error } = await consulta().range(desde, desde + paso - 1)
    if (error) return { filas, error: error.message as string, cortado: false }
    filas.push(...((data ?? []) as T[]))
    if ((data ?? []).length < paso) return { filas, error: null, cortado: false }
  }
  return { filas, error: null, cortado: true }
}

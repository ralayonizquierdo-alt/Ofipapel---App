import { supabase } from '../../lib/supabase'
import { ahoraTrabajo, elegirTienda, fechaTrabajo, tiendaDeTrabajo } from '../../lib/sesionTrabajo'

// Menú Caja de GeminisWin: movimientos de caja (CAJA), aperturas y cierres (CAJACIER),
// entradas/salidas rápidas e informes de caja.

export interface MovimientoCaja {
  tienda_terminal_codigo: string
  numero: number | null
  fecha: string | null
  hora: string | null
  documento: string | null
  es_ingreso: boolean | null
  ingreso: number | null
  gasto: number | null
  concepto: string | null
  tipo_movimiento: string | null
  descripcion_tipo: string | null
  ajeno_tienda_codigo: string | null
  ajeno_codigo: number | null
  forma_pago_codigo: string | null
  tipo_contado: number | null
  tipo_forma_pago: number | null
  cliente_codigo: string | null
  empleado_codigo: string | null
  turno_tienda_codigo: string | null
  turno_numero: number | null
  activo: boolean
}

export const MOV_COLS =
  'tienda_terminal_codigo, numero, fecha, hora, documento, es_ingreso, ingreso, gasto, concepto, tipo_movimiento, descripcion_tipo, ajeno_tienda_codigo, ajeno_codigo, forma_pago_codigo, tipo_contado, tipo_forma_pago, cliente_codigo, empleado_codigo, turno_tienda_codigo, turno_numero, activo'

export interface CajaApertura {
  tienda_terminal_codigo: string
  ejercicio: number
  fecha_apertura: string
  fecha_cierre: string | null
  cerrado: boolean
  empleado_apertura_codigo: string | null
  empleado_cierre_codigo: string | null
  fondo_inicial: number | null
  total_ingreso: number | null
  total_gasto: number | null
  total_contado: number | null
  total_bancos: number | null
  total_efectos: number | null
  total_credito: number | null
  total_efectivo: number | null
  total_tarjeta: number | null
  total_cheque: number | null
  total_ejercicio: number | null
  total_arqueo: number | null
  sobrante: number | null
  total_a_retirar: number | null
  fondo_final: number | null
  gasto_bancos: number | null
  gasto_efectos: number | null
  gasto_credito: number | null
  gasto_contado: number | null
  gasto_efectivo: number | null
  gasto_tarjeta: number | null
  gasto_cheque: number | null
  efectos_pend_cobros_ejercicio: number | null
  efectos_pend_pagos_ejercicio: number | null
  efectos_pend_cobros_cierre: number | null
  efectos_pend_pagos_cierre: number | null
}

/** Resultado de fn_caja_totales (en vivo, mientras la caja está abierta). */
export interface TotalesCaja {
  movimientos: number
  ing_bancos: number
  ing_efectos: number
  ing_credito: number
  ing_contado: number
  ing_total: number
  gas_bancos: number
  gas_efectos: number
  gas_credito: number
  gas_contado: number
  gas_total: number
  ing_efectivo: number
  ing_tarjeta: number
  ing_cheque: number
  gas_efectivo: number
  gas_tarjeta: number
  gas_cheque: number
  ventas_credito: number
  efp_cobros_ejercicio: number
  efp_pagos_ejercicio: number
  efp_cobros_cierre: number
  efp_pagos_cierre: number
  fondo_inicial: number
  efectivo_teorico: number
}

/** Totales guardados en una caja cerrada, con la misma forma que los de fn_caja_totales. */
export function totalesGuardados(c: CajaApertura): TotalesCaja {
  const n = (v: number | null) => Number(v ?? 0)
  return {
    movimientos: 0,
    ing_bancos: n(c.total_bancos),
    ing_efectos: n(c.total_efectos),
    ing_credito: n(c.total_credito),
    ing_contado: n(c.total_contado),
    ing_total: n(c.total_ingreso),
    gas_bancos: n(c.gasto_bancos),
    gas_efectos: n(c.gasto_efectos),
    gas_credito: n(c.gasto_credito),
    gas_contado: n(c.gasto_contado),
    gas_total: n(c.total_gasto),
    ing_efectivo: n(c.total_efectivo),
    ing_tarjeta: n(c.total_tarjeta),
    ing_cheque: n(c.total_cheque),
    gas_efectivo: n(c.gasto_efectivo),
    gas_tarjeta: n(c.gasto_tarjeta),
    gas_cheque: n(c.gasto_cheque),
    ventas_credito: 0,
    efp_cobros_ejercicio: n(c.efectos_pend_cobros_ejercicio),
    efp_pagos_ejercicio: n(c.efectos_pend_pagos_ejercicio),
    efp_cobros_cierre: n(c.efectos_pend_cobros_cierre),
    efp_pagos_cierre: n(c.efectos_pend_pagos_cierre),
    fondo_inicial: n(c.fondo_inicial),
    efectivo_teorico: n(c.fondo_inicial) + n(c.total_efectivo) - n(c.gasto_efectivo),
  }
}

export async function totalesCaja(tienda: string, ejercicio: number): Promise<TotalesCaja> {
  const { data, error } = await supabase.rpc('fn_caja_totales', { p_tienda: tienda, p_ejercicio: ejercicio })
  if (error) throw new Error(error.message)
  const r = data as Record<string, unknown>
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v ?? 0)])) as unknown as TotalesCaja
}

/** Tipos de movimiento de caja (TIPOMOV de GeminisWin). */
export const TIPOS_MOV = [
  { codigo: 'VTA', descripcion: 'Ventas Contado', filtro: 'Ventas' },
  { codigo: 'PED', descripcion: 'Pedidos', filtro: 'Pedid.' },
  { codigo: 'COB', descripcion: 'Cobros', filtro: 'Cobros' },
  { codigo: 'PAG', descripcion: 'Pagos', filtro: 'Pagos' },
  { codigo: 'USU', descripcion: 'Usuario', filtro: 'Usuario' },
  { codigo: 'CIE', descripcion: 'Cierres', filtro: 'Cierres' },
] as const

export const descripcionTipo = (t: string | null) => TIPOS_MOV.find((x) => x.codigo === t)?.descripcion ?? ''

/** Documento que generó el movimiento (columna `documento` con la clave interna). */
export const DOCUMENTOS_INTERNOS: Record<string, string> = {
  venta: 'Venta',
  cobro: 'Cobro venta',
  pago_proveedor: 'Pago',
  pago: 'Pago',
}

export function textoDocumento(m: MovimientoCaja) {
  const d = m.documento ?? ''
  const nombre = DOCUMENTOS_INTERNOS[d]
  if (!nombre) return d
  return m.ajeno_codigo != null ? `${nombre} ${m.ajeno_tienda_codigo ?? m.tienda_terminal_codigo}-${m.ajeno_codigo}` : nombre
}

export function rutaDocumento(m: MovimientoCaja): string | null {
  if (m.ajeno_codigo == null) return null
  const t = encodeURIComponent(m.ajeno_tienda_codigo ?? m.tienda_terminal_codigo)
  if (m.documento === 'venta' || m.documento === 'cobro') return `/ventas/${t}/${m.ajeno_codigo}`
  if (m.documento === 'pago_proveedor' || m.documento === 'pago') return `/pagos-proveedor/${t}/${m.ajeno_codigo}`
  return null
}

export interface FormaPagoCaja {
  codigo: string
  descripcion: string
  tipo: number | null // 1 crédito · 2 efecto · 3 banco · 4 contado
  tipo_contado: number | null // 1 efectivo · 2 tarjeta · 3 cheque
}

export interface TiendaCaja {
  codigo: string
  descripcion: string | null
  fondo_caja_inicial: number | null
}

/** Tienda/terminal de este puesto (Utilidades → Cambio de Tienda; la misma que el TPV). */
export function tiendaPuesto(tiendas: { codigo: string }[]): string {
  return tiendaDeTrabajo(tiendas)
}

/** Cambia la tienda de trabajo del puesto (Utilidades → Cambio de Tienda hace lo mismo). */
export function recordarTiendaPuesto(t: string) {
  elegirTienda(t)
}

export async function cargarMaestrosCaja() {
  const [t, f, e] = await Promise.all([
    supabase.from('tienda_terminal').select('codigo, descripcion, fondo_caja_inicial').order('codigo'),
    supabase.from('forma_pago').select('codigo, descripcion, tipo, tipo_contado').order('codigo'),
    supabase.rpc('fn_empleado_actual'),
  ])
  return {
    tiendas: (t.data ?? []) as TiendaCaja[],
    formas: (f.data ?? []) as FormaPagoCaja[],
    empleado: (e.data as string | null) ?? null,
  }
}

export async function nombreEmpleado(codigo: string | null) {
  if (!codigo) return ''
  const { data } = await supabase.from('empleado').select('nombre').eq('codigo', codigo).maybeSingle()
  return (data?.nombre as string | undefined) ?? ''
}

export async function cajaAbiertaDe(tienda: string) {
  const { data } = await supabase
    .from('caja_apertura_cierre')
    .select('ejercicio')
    .eq('tienda_terminal_codigo', tienda)
    .eq('cerrado', false)
    .limit(1)
    .maybeSingle()
  return data ? Number(data.ejercicio) : null
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Fecha de trabajo (Utilidades → Cambio de Fecha), por defecto hoy. */
export function hoyISO() {
  return fechaTrabajo()
}

export function horaActual() {
  const d = ahoraTrabajo()
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

/** «dd/mm/aaaa hh:mm:ss» de un timestamp, o la máscara vacía de GeminisWin. */
export function fechaHoraGw(v: string | null | undefined) {
  if (!v) return '  /  /       :  :'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

export function fechaGw(v: string | null | undefined) {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v) : null
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

export const r3 = (n: number) => Math.round(n * 1000) / 1000

export function errorTexto(e: unknown) {
  const m = e instanceof Error ? e.message : String(e)
  if (m.includes('caja_apertura_cierre_una_abierta')) return 'Ya hay una caja abierta en esa tienda/terminal.'
  return m
}

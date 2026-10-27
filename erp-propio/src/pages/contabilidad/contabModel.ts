import { supabase } from '../../lib/supabase'
import { formatGw } from '../../components/gw'

// Contabilidad: tipos, utilidades de fecha/importe y exportación CSV comunes a todas las pantallas.

export interface Asiento {
  id: number
  ejercicio: number
  numero: number | null
  fecha: string
  concepto: string
  origen_tipo: string
  origen_tienda_codigo: string | null
  origen_numero: number | null
  origen_referencia: string | null
  estado: 'correcto' | 'error' | 'anulado'
  error: string | null
  editado_manual: boolean
  total_debe: number
  total_haber: number
  creado_en: string
}

export interface Apunte {
  id: number
  asiento_id: number
  linea: number
  cuenta: string | null
  debe: number
  haber: number
  concepto: string | null
  documento: string | null
  contrapartida: string | null
  nif: string | null
  tercero_nombre: string | null
  igic_tipo: number | null
  igic_base: number | null
  error: string | null
}

export interface CuentaContable {
  codigo: string
  descripcion: string
  nivel: number
  grupo: string
  tipo: string | null
  nif: string | null
  tercero_tipo: string | null
  tercero_codigo: string | null
  activa: boolean
  observaciones: string | null
}

/** Tipos de documento que generan asientos (valor = doc_tipo de asiento_documento). */
export const TIPOS_DOC: { value: string; label: string }[] = [
  { value: 'venta', label: 'Ventas de contado (tickets)' },
  { value: 'factura', label: 'Facturas a clientes (incl. mensual de albaranes)' },
  { value: 'factura_proveedor', label: 'Facturas de proveedor' },
  { value: 'cobro', label: 'Cobros de clientes' },
  { value: 'pago', label: 'Pagos (proveedores, transportistas, gastos)' },
  { value: 'caja', label: 'Movimientos de caja (entradas / salidas)' },
]

export const ORIGEN_LABEL: Record<string, string> = {
  venta: 'Tickets',
  factura: 'Factura',
  factura_anulacion: 'Anulación factura',
  factura_proveedor: 'Fra. proveedor',
  cobro: 'Cobro',
  pago: 'Pago',
  caja: 'Caja',
  manual: 'Manual',
}

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
export const eur = (n: number | null | undefined) => (n == null || Number(n) === 0 ? '' : formatGw(Number(n), 2))
export const eur0 = (n: number | null | undefined) => formatGw(Number(n ?? 0), 2)

const pad2 = (n: number) => String(n).padStart(2, '0')
export const isoDe = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
export const hoy = () => isoDe(new Date())
export const inicioAnio = (y = new Date().getFullYear()) => `${y}-01-01`
export const finAnio = (y = new Date().getFullYear()) => `${y}-12-31`
export const inicioMes = () => {
  const d = new Date()
  return isoDe(new Date(d.getFullYear(), d.getMonth(), 1))
}
export const fechaEs = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')

/** Trimestre → [desde, hasta]. */
export function rangoTrimestre(anio: number, t: number): [string, string] {
  const mIni = (t - 1) * 3
  return [isoDe(new Date(anio, mIni, 1)), isoDe(new Date(anio, mIni + 3, 0))]
}

// ---------------------------------------------------------------- CSV (Excel en español)

/** Número con coma decimal y sin separador de miles (lo que Excel en español lee como número). */
export const numCsv = (n: number | null | undefined) => (n == null ? '' : r2(Number(n)).toFixed(2).replace('.', ','))

function celda(v: unknown) {
  const s = v == null ? '' : String(v)
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Descarga un CSV separado por «;», con BOM UTF-8 y fin de línea CRLF: se abre con doble clic
 * en Excel (configuración española) con acentos y decimales correctos.
 */
export function descargarCsv(nombre: string, cabecera: string[], filas: unknown[][]) {
  const txt = [cabecera, ...filas].map((f) => f.map(celda).join(';')).join('\r\n') + '\r\n'
  const blob = new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

// ---------------------------------------------------------------- Lecturas comunes

/** Lee todas las filas de una consulta paginando de 1000 en 1000. */
export async function leerTodo<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta(desde, desde + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

export async function cargarAsientosConApuntes(desde: string, hasta: string, estados: string[]) {
  const asientos = await leerTodo<Asiento>((a, b) =>
    supabase
      .from('asiento')
      .select('*')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .in('estado', estados)
      .order('fecha')
      .order('numero', { nullsFirst: false })
      .order('id')
      .range(a, b),
  )
  const apuntes: Apunte[] = []
  for (let i = 0; i < asientos.length; i += 200) {
    const ids = asientos.slice(i, i + 200).map((x) => x.id)
    const parte = await leerTodo<Apunte>((a, b) => supabase.from('apunte').select('*').in('asiento_id', ids).order('asiento_id').order('linea').range(a, b))
    apuntes.push(...parte)
  }
  const porAsiento = new Map<number, Apunte[]>()
  for (const p of apuntes) {
    const l = porAsiento.get(p.asiento_id) ?? []
    l.push(p)
    porAsiento.set(p.asiento_id, l)
  }
  return { asientos, porAsiento }
}

export async function cargarDescripciones(codigos: string[]) {
  const unicos = [...new Set(codigos.filter(Boolean))]
  const m = new Map<string, { descripcion: string; nif: string | null }>()
  for (let i = 0; i < unicos.length; i += 300) {
    const { data } = await supabase.from('cuenta_contable').select('codigo, descripcion, nif').in('codigo', unicos.slice(i, i + 300))
    for (const c of data ?? []) m.set(c.codigo, { descripcion: c.descripcion, nif: c.nif })
  }
  return m
}

export interface LineaLibro {
  fecha: string
  documento: string
  tienda: string
  numero: number
  nif: string | null
  nombre: string | null
  tipo: number | null
  base: number
  cuota: number
  total: number
  clase: string
}

export async function cargarLibro(desde: string, hasta: string, libro: 'emitidas' | 'recibidas') {
  const { data, error } = await supabase.rpc('fn_contab_libro_igic', { p_desde: desde, p_hasta: hasta, p_libro: libro })
  if (error) throw new Error(error.message)
  return (data ?? []) as LineaLibro[]
}

/** Resumen por tipo de IGIC de un libro. */
export function resumenPorTipo(lineas: LineaLibro[]) {
  const m = new Map<string, { tipo: number | null; base: number; cuota: number; n: number }>()
  for (const l of lineas) {
    const k = String(l.tipo)
    const x = m.get(k) ?? { tipo: l.tipo, base: 0, cuota: 0, n: 0 }
    x.base = r2(x.base + Number(l.base))
    x.cuota = r2(x.cuota + Number(l.cuota))
    x.n += 1
    m.set(k, x)
  }
  return [...m.values()].sort((a, b) => (a.tipo ?? -1) - (b.tipo ?? -1))
}

export const pct = (t: number | null) => (t == null ? '¿?' : `${formatGw(t, t % 1 ? 1 : 0)} %`)

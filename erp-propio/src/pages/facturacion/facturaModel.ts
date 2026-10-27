import { supabase } from '../../lib/supabase'

// Facturas de clientes (Facturación → Facturas en GeminisWin). Una factura agrupa albaranes
// (ventas a crédito) de un cliente. Es INMUTABLE (VeriFactu): no se edita ni se borra; se
// anula (registro de anulación) o se rectifica (R1/R5). Los totales y el desglose por tipo de
// IGIC (factura_impuesto_tramo) se fijan al generarla (fn_facturar_albaranes).

export interface FacturaCliente {
  tienda_terminal_codigo: string
  numero: number
  serie: string
  n_factura: number
  cliente_codigo: string
  cliente_sucursal_codigo: string | null
  nombre_cliente: string | null
  nif_cliente: string | null
  vendedor_codigo: string | null
  empleado_codigo: string | null
  oficina_desde_codigo: string | null
  oficina_hasta_codigo: string | null
  fecha_desde: string | null
  fecha_hasta: string | null
  fecha_factura: string
  hora_factura: string | null
  estado: string | null
  subtotal: number | null
  descuento_pie_pct: number | null
  total_descuento: number | null
  total_base: number | null
  total_igic: number | null
  retencion_pct: number | null
  total_retencion: number | null
  otros_gastos: number | null
  total: number
  total_pagado: number | null
  total_pendiente: number | null
  fecha_pago: string | null
  dias_pago: number | null
  es_factura_global: boolean
  forma_pago_codigo: string | null
  observaciones: string | null
  tipo_factura: string
  factura_rectificada_tienda_codigo: string | null
  factura_rectificada_numero: number | null
  huella: string | null
  huella_anterior: string | null
  fecha_hora_huso_generacion_registro: string | null
  estado_envio_aeat: string
  codigo_error_aeat: string | null
  csv_aeat: string | null
  codigo_qr_contenido: string | null
  leyenda_verifactu: string | null
}

export const FACTURA_COLS =
  'tienda_terminal_codigo, numero, serie, n_factura, cliente_codigo, cliente_sucursal_codigo, nombre_cliente, nif_cliente, vendedor_codigo, empleado_codigo, oficina_desde_codigo, oficina_hasta_codigo, fecha_desde, fecha_hasta, fecha_factura, hora_factura, estado, subtotal, descuento_pie_pct, total_descuento, total_base, total_igic, retencion_pct, total_retencion, otros_gastos, total, total_pagado, total_pendiente, fecha_pago, dias_pago, es_factura_global, forma_pago_codigo, observaciones, tipo_factura, factura_rectificada_tienda_codigo, factura_rectificada_numero, huella, huella_anterior, fecha_hora_huso_generacion_registro, estado_envio_aeat, codigo_error_aeat, csv_aeat, codigo_qr_contenido, leyenda_verifactu'

export interface Tramo {
  tramo: number
  tipo_pct: number
  base_imponible: number
  cuota_igic: number
}

/** Albarán de la factura con su desglose por tipo de IGIC (como la rejilla de GeminisWin). */
export interface AlbaranFactura {
  tienda_terminal_codigo: string
  numero: number
  fecha: string
  hora: string | null
  subtotal: number
  total_descuento_pie: number
  subtotal_2: number
  total_igic_pie: number
  total: number
  total_pagado: number
  observaciones: string | null
  /** Base por tipo de IGIC (clave: tipo en %). */
  bases: Record<string, number>
  cuotas: Record<string, number>
}

export interface LineaAlbaran {
  tienda_terminal_codigo: string
  numero: number
  numero_linea: number
  articulo_codigo: string | null
  descripcion: string | null
  cantidad: number
  precio: number | null
  descuento_pct: number | null
  subtotal: number | null
  igic_pct: number | null
}

export interface CobroFactura {
  tienda_terminal_codigo: string
  codigo_pago: number
  tipo_pago: string | null
  cuota: number | null
  fecha_vencimiento: string | null
  estado_cobro: string | null
  importe_cobrado: number | null
  fecha_pago: string | null
  id_pago: number | null
  concepto: string | null
}

export interface RegistroVf {
  id: number
  tipo_registro: string
  num_serie_factura: string
  fecha_expedicion: string
  tipo_factura: string | null
  huella: string
  fecha_hora_huso_texto: string
  codigo_qr_contenido: string | null
  estado_envio_aeat: string
  motivo: string | null
}

/** Tipos de IGIC fijos de la rejilla de GeminisWin (Base 0 %, 3 %, 7 %, 15 %). */
export const TIPOS_FIJOS = [0, 3, 7, 15]

export const n = (v: number | string | null | undefined) => Number(v ?? 0)
export const r2 = (v: number) => Math.round(v * 100) / 100
export const clavePct = (p: number | string | null | undefined) => String(Number(p ?? 0))

export const numSerie = (f: Pick<FacturaCliente, 'serie' | 'n_factura'>) => (f.serie ? `${f.serie}-${f.n_factura}` : String(f.n_factura))

export function fechaEs(v: string | null | undefined) {
  if (!v) return ' / /'
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v)
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export const hoy = () => new Date().toLocaleDateString('sv-SE')

/** Desglose de un albarán (misma regla que fn_venta_desglose_igic en la base de datos). */
export function desgloseAlbaran(
  v: { descuento_pie_pct: number | null; igic_pie_pct: number | null; subtotal_2: number | null; total_igic_pie: number | null },
  lineas: LineaAlbaran[],
) {
  const factor = 1 - n(v.descuento_pie_pct) / 100
  const bases: Record<string, number> = {}
  const cuotas: Record<string, number> = {}
  if (lineas.length === 0) {
    const sub = n(v.subtotal_2)
    const pct = sub === 0 ? 0 : Math.round((n(v.total_igic_pie) / sub) * 1000) / 10
    bases[clavePct(pct)] = r2(sub)
    cuotas[clavePct(pct)] = r2(n(v.total_igic_pie))
    return { bases, cuotas }
  }
  const sumas: Record<string, number> = {}
  for (const l of lineas) {
    const k = clavePct(l.igic_pct)
    sumas[k] = (sumas[k] ?? 0) + n(l.subtotal)
  }
  for (const [k, s] of Object.entries(sumas)) {
    const b = r2(s * factor)
    bases[k] = b
    cuotas[k] = r2((b * (Number(k) + n(v.igic_pie_pct))) / 100)
  }
  return { bases, cuotas }
}

export async function cargarAlbaranesFactura(tienda: string, numero: number) {
  const { data: ventas } = await supabase
    .from('venta')
    .select('tienda_terminal_codigo, numero, fecha, hora, subtotal, descuento_pie_pct, total_descuento_pie, subtotal_2, igic_pie_pct, total_igic_pie, total, total_pagado, observaciones')
    .eq('factura_tienda_codigo', tienda)
    .eq('factura_numero', numero)
    .order('fecha')
    .order('numero')
  const vs = (ventas ?? []) as Record<string, unknown>[]
  if (vs.length === 0) return { albaranes: [] as AlbaranFactura[], lineas: [] as LineaAlbaran[] }
  const lineas = await cargarLineas(vs.map((v) => ({ t: v.tienda_terminal_codigo as string, n: Number(v.numero) })))
  const albaranes = vs.map((v) => {
    const ls = lineas.filter((l) => l.tienda_terminal_codigo === v.tienda_terminal_codigo && Number(l.numero) === Number(v.numero))
    const d = desgloseAlbaran(v as never, ls)
    return {
      tienda_terminal_codigo: v.tienda_terminal_codigo as string,
      numero: Number(v.numero),
      fecha: v.fecha as string,
      hora: (v.hora as string | null) ?? null,
      subtotal: n(v.subtotal as number),
      total_descuento_pie: n(v.total_descuento_pie as number),
      subtotal_2: n(v.subtotal_2 as number),
      total_igic_pie: n(v.total_igic_pie as number),
      total: n(v.total as number),
      total_pagado: n(v.total_pagado as number),
      observaciones: (v.observaciones as string | null) ?? null,
      ...d,
    }
  })
  return { albaranes, lineas }
}

export async function cargarLineas(claves: { t: string; n: number }[]) {
  const out: LineaAlbaran[] = []
  const porTienda = new Map<string, number[]>()
  for (const c of claves) porTienda.set(c.t, [...(porTienda.get(c.t) ?? []), c.n])
  for (const [t, nums] of porTienda) {
    for (let i = 0; i < nums.length; i += 150) {
      const { data } = await supabase
        .from('venta_linea')
        .select('tienda_terminal_codigo, numero, numero_linea, articulo_codigo, descripcion, cantidad, precio, descuento_pct, subtotal, igic_pct')
        .eq('tienda_terminal_codigo', t)
        .in('numero', nums.slice(i, i + 150))
        .order('numero')
        .order('numero_linea')
      out.push(...((data ?? []) as LineaAlbaran[]))
    }
  }
  return out
}

/** Cobros de la factura: los suyos y los de sus albaranes (entregas a cuenta). */
export async function cargarCobros(f: FacturaCliente, albaranes: AlbaranFactura[]) {
  const cols = 'tienda_terminal_codigo, codigo_pago, tipo_pago, cuota, fecha_vencimiento, estado_cobro, importe_cobrado, fecha_pago, id_pago, concepto'
  const [a, ...b] = await Promise.all([
    supabase.from('cobro_cliente').select(cols).eq('factura_tienda_codigo', f.tienda_terminal_codigo).eq('factura_numero', f.numero),
    ...albaranes.map((x) =>
      supabase.from('cobro_cliente').select(cols).eq('venta_relacionada_tienda_codigo', x.tienda_terminal_codigo).eq('venta_relacionada_numero', x.numero),
    ),
  ])
  const todos = [...((a.data ?? []) as CobroFactura[]), ...b.flatMap((r) => (r.data ?? []) as CobroFactura[])]
  const vistos = new Set<string>()
  return todos
    .filter((c) => {
      const k = `${c.tienda_terminal_codigo}-${c.codigo_pago}`
      if (vistos.has(k)) return false
      vistos.add(k)
      return true
    })
    .sort((x, y) => (x.fecha_vencimiento ?? x.fecha_pago ?? '').localeCompare(y.fecha_vencimiento ?? y.fecha_pago ?? ''))
}

export async function cargarRegistrosVf(tienda: string, numero: number) {
  const { data } = await supabase
    .from('registro_facturacion')
    .select('id, tipo_registro, num_serie_factura, fecha_expedicion, tipo_factura, huella, fecha_hora_huso_texto, codigo_qr_contenido, estado_envio_aeat, motivo')
    .eq('origen_tipo', 'factura')
    .eq('origen_tienda_codigo', tienda)
    .eq('origen_numero', numero)
    .order('id')
  const regs = (data ?? []) as RegistroVf[]
  return { alta: regs.find((r) => r.tipo_registro === 'alta') ?? null, anulacion: regs.find((r) => r.tipo_registro === 'anulacion') ?? null }
}

export const TITULO_TIPO: Record<string, string> = {
  F1: 'FACTURA',
  F2: 'FACTURA SIMPLIFICADA',
  F3: 'FACTURA EN SUSTITUCIÓN DE SIMPLIFICADAS',
  R1: 'FACTURA RECTIFICATIVA',
  R2: 'FACTURA RECTIFICATIVA',
  R3: 'FACTURA RECTIFICATIVA',
  R4: 'FACTURA RECTIFICATIVA',
  R5: 'FACTURA RECTIFICATIVA (SIMPLIFICADA)',
}

export const ESTADO_AEAT: Record<string, string> = {
  pendiente_envio: 'Pendiente de envío',
  enviado: 'Enviado',
  aceptado: 'Aceptado',
  aceptado_con_errores: 'Aceptado con errores',
  rechazado: 'Rechazado',
  no_aplica: 'No aplica',
}

/** Exporta filas a CSV (separador «;», decimales con coma, BOM para Excel). */
export function descargarCsv(nombre: string, cabecera: string[], filas: (string | number | null | undefined)[][]) {
  const celda = (v: string | number | null | undefined) => {
    if (v == null) return ''
    const s = typeof v === 'number' ? String(v).replace('.', ',') : v
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const texto = [cabecera, ...filas].map((f) => f.map(celda).join(';')).join('\r\n')
  const blob = new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

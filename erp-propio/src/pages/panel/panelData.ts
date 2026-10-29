import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

// Datos del Panel de Control. Todo sale de una sola llamada a fn_panel_control (SQL agregado,
// respeta RLS). El panel es OPERATIVO y lo ven todos los empleados: la función no devuelve
// importes, solo número de operaciones y unidades. Un panel económico para gerencia (ventas en €,
// márgenes, cobros) iría en otra función (p. ej. fn_panel_gerencia) y en otra pestaña visible
// solo para su grupo de acceso, cuando existan los permisos por grupo.

export type Periodo = 'hoy' | 'semana' | 'mes' | 'anio'

export const PERIODOS: { value: Periodo; label: string; comparado: string }[] = [
  { value: 'hoy', label: 'Hoy', comparado: 'mismo día de la semana pasada' },
  { value: 'semana', label: 'Esta semana', comparado: 'mismos días de la semana pasada' },
  { value: 'mes', label: 'Este mes', comparado: 'mismos días del mes pasado' },
  { value: 'anio', label: 'Este año', comparado: 'mismas fechas del año pasado' },
]

export interface Tienda {
  codigo: string
  descripcion: string | null
  tipo: string | null
}

export interface PanelData {
  meta: { hoy: string; desde: string; hasta: string; desde_ant: string; hasta_ant: string; generado: string }
  tiendas: Tienda[]
  kpi: { tickets: number; tickets_ant: number; devoluciones: number; unidades: number; pedidos_periodo: number }
  pedidos_hoy: { total: number; web: number; comercial: number; tienda: number }
  pendientes: { por_preparar: number; preparados: number; atrasados: number }
  reparaciones: { abiertas: number; atrasadas: number }
  web_sin_servir: number
  pedidos_web: { periodo: number; hoy: number; por_preparar: number; ultimo_fecha: string | null; ultimo_hora: string | null }
  reparto_hoy: { repartos: number; entregas: number; entregadas: number; pendientes: number; no_entregadas: number }
  repartos_hoy: {
    tienda: string
    numero: number
    ruta: string
    repartidor: string | null
    estado: number | null
    entregas: number
    entregadas: number
    pendientes: number
    no_entregadas: number
  }[]
  por_hora: { h: number; tickets: number; tickets_media: number; pedidos: number }[]
  origenes: { web: number; comercial: number; tienda: number }
  /** Pedidos de cliente por comercial (sin ventas de mostrador ni pedidos web). */
  vendedores: { codigo: string; nombre: string; pedidos: number; hoy: number }[]
  por_tienda: { codigo: string; descripcion: string; tipo: string | null; actual: number; anterior: number }[]
  ultimos_pedidos: {
    tienda: string
    numero: number
    fecha: string
    hora: string | null
    origen: 'web' | 'comercial' | 'tienda'
    reparacion: boolean
    cliente: string | null
    comercial: string | null
    estado: string
  }[]
  top_articulos: { codigo: string; descripcion: string | null; unidades: number; tickets: number }[]
  alertas: {
    stock_bajo: number
    stock_bajo_ej: { codigo: string; descripcion: string | null; almacen: string; actual: number | null; minimo: number }[]
    pp_pendientes: number
    pp_retrasados: number
    pp_sin_fecha_prevista: number
    cajas_antiguas: string[]
  }
}

// ---- Fechas en la zona horaria de Canarias -------------------------------------------------

export function hoyCanarias(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Atlantic/Canary', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

const toDate = (iso: string) => new Date(`${iso}T12:00:00Z`)
const toIso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (iso: string, n: number) => {
  const d = toDate(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return toIso(d)
}
/** Misma fecha desplazada n meses, ajustada al último día si el mes destino es más corto. */
const addMonths = (iso: string, n: number) => {
  const d = toDate(iso)
  const dia = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + n)
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(dia, ultimo))
  return toIso(d)
}

export function rangoPeriodo(p: Periodo, hoy: string) {
  switch (p) {
    case 'hoy':
      return { desde: hoy, hasta: hoy, desdeAnt: addDays(hoy, -7), hastaAnt: addDays(hoy, -7) }
    case 'semana': {
      const dow = (toDate(hoy).getUTCDay() + 6) % 7 // lunes = 0
      const lunes = addDays(hoy, -dow)
      return { desde: lunes, hasta: hoy, desdeAnt: addDays(lunes, -7), hastaAnt: addDays(hoy, -7) }
    }
    case 'mes': {
      const primero = `${hoy.slice(0, 8)}01`
      return { desde: primero, hasta: hoy, desdeAnt: addMonths(primero, -1), hastaAnt: addMonths(hoy, -1) }
    }
    case 'anio': {
      const primero = `${hoy.slice(0, 4)}-01-01`
      return { desde: primero, hasta: hoy, desdeAnt: addMonths(primero, -12), hastaAnt: addMonths(hoy, -12) }
    }
  }
}

// ---- Formato es-ES -------------------------------------------------------------------------

/** 1234,5 → «1.234,5». Agrupa también los miles de 4 cifras (Intl es-ES no lo hace). */
export function fmtNum(n: number | null | undefined, decimales = 0) {
  const v = Number(n ?? 0)
  const [ent, dec] = Math.abs(v).toFixed(decimales).split('.')
  const conPuntos = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${v < 0 ? '−' : ''}${conPuntos}${dec && Number(dec) !== 0 ? ',' + dec : ''}`
}

export function fmtFecha(iso: string | null | undefined) {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// ---- Carga con refresco automático ---------------------------------------------------------

export const REFRESCO_MS = 3 * 60 * 1000

export function usePanelData(tienda: string, periodo: Periodo) {
  const [data, setData] = useState<PanelData | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actualizado, setActualizado] = useState<Date | null>(null)
  const peticion = useRef(0)

  const cargar = useCallback(async () => {
    const id = ++peticion.current
    setCargando(true)
    const r = rangoPeriodo(periodo, hoyCanarias())
    const { data: res, error: err } = await supabase.rpc('fn_panel_control', {
      p_tienda: tienda || null,
      p_desde: r.desde,
      p_hasta: r.hasta,
      p_desde_ant: r.desdeAnt,
      p_hasta_ant: r.hastaAnt,
    })
    if (id !== peticion.current) return // llegó tarde: ya se pidió otra combinación
    setCargando(false)
    if (err) {
      setError(err.message)
      return
    }
    setError(null)
    setData(res as PanelData)
    setActualizado(new Date())
  }, [tienda, periodo])

  useEffect(() => {
    void cargar()
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void cargar()
    }, REFRESCO_MS)
    return () => clearInterval(t)
  }, [cargar])

  return { data, cargando, error, actualizado, recargar: cargar }
}

// ---- Tarjetas del día: presupuestos, compras y peticiones (fn_panel_dia) ---------------------

export interface SeguimientoFila {
  tienda: string
  numero: number
  cliente: string | null
  total: number | null
  estado: string
  proximo_contacto: string | null
  valido_hasta: string | null
  responsable: string | null
  mio: boolean
  caducado: boolean
  dias_retraso: number | null
}

export interface PanelDia {
  /** Presupuestos que hay que llamar hoy o ya vencidos, y caducados (fn_presupuestos_seguimiento). */
  seguimiento: { hoy: number; vencidos: number; caducados: number; mios: number; lista: SeguimientoFila[] }
  presupuestos: {
    total: number
    aceptados: number
    seguimiento: number
    pendientes: number
    lista: { tienda: string; numero: number; cliente: string | null; estado: string; operario: string | null }[]
  }
  compras: {
    actualizadas: number
    pendientes: number
    abonos: number
    lista: { tienda: string; numero: number; proveedor: string | null; albaran: string | null; factura: string | null; abono: boolean; tipo: string }[]
  }
  peticiones: {
    total: number
    por_operario: { operario: string | null; n: number }[]
    lista: { tienda: string; numero: number; operario: string | null; codigo_venta: string | null; descripcion: string | null; cantidad: number; estado: string | null }[]
  }
}

/** Datos del día para las tarjetas de presupuestos, compras y peticiones; se recargan con `vuelta`. */
export function usePanelDia(tienda: string, vuelta: unknown): PanelDia | null {
  const [dia, setDia] = useState<PanelDia | null>(null)
  useEffect(() => {
    let vivo = true
    Promise.all([
      supabase.rpc('fn_panel_dia', { p_tienda: tienda || null }),
      supabase.rpc('fn_presupuestos_seguimiento', { p_tienda: tienda || null }),
    ]).then(([a, b]) => {
      if (!vivo || !a.data) return
      setDia({ ...(a.data as Omit<PanelDia, 'seguimiento'>), seguimiento: (b.data as PanelDia['seguimiento']) ?? { hoy: 0, vencidos: 0, caducados: 0, mios: 0, lista: [] } })
    })
    return () => {
      vivo = false
    }
  }, [tienda, vuelta])
  return dia
}

export interface FamiliaTop {
  codigo: string
  descripcion: string | null
  unidades: number
  /** % sobre las ventas totales del periodo (por importe; el panel no enseña euros). */
  pct: number
}

/** Las 20 familias más vendidas del periodo (fn_panel_familias); se recargan con `vuelta`. */
export function usePanelFamilias(tienda: string, periodo: Periodo, vuelta: unknown): FamiliaTop[] | null {
  const [lista, setLista] = useState<FamiliaTop[] | null>(null)
  useEffect(() => {
    let vivo = true
    const r = rangoPeriodo(periodo, hoyCanarias())
    supabase.rpc('fn_panel_familias', { p_tienda: tienda || null, p_desde: r.desde, p_hasta: r.hasta }).then(({ data }) => {
      if (vivo) setLista((data as FamiliaTop[]) ?? [])
    })
    return () => {
      vivo = false
    }
  }, [tienda, periodo, vuelta])
  return lista
}

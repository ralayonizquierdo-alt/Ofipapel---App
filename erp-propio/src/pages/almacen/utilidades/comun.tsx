import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronFirst, ChevronLast, FileSpreadsheet, Play, Printer, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwInput, GwLookupButton, GwWindow, formatGw } from '../../../components/gw'
import { useListaOrdenada, type GwListaOrdenadaDef } from '../../../components/gw/GwListaOrdenada'

// Piezas comunes de las pantallas del menú Almacén de este bloque (Listados de artículos,
// Movimientos, Etiquetas, Creación rápida, Modificación en bloque, Plu's, Inventariar almacén,
// Puntos de restauración, Recalcular stock y Eliminación de artículos).

export interface Almacen {
  codigo: string
  nombre: string
}

export function useAlmacenes() {
  const [almacenes, setAlmacenes] = useState<Almacen[]>([])
  useEffect(() => {
    supabase
      .from('almacen')
      .select('codigo, nombre')
      .order('codigo')
      .then(({ data }) => setAlmacenes((data ?? []) as Almacen[]))
  }, [])
  return almacenes
}

export function useTiendas() {
  const [tiendas, setTiendas] = useState<{ codigo: string; almacen_codigo: string | null }[]>([])
  useEffect(() => {
    supabase
      .from('tienda_terminal')
      .select('codigo, almacen_codigo')
      .order('codigo')
      .then(({ data }) => setTiendas((data ?? []) as { codigo: string; almacen_codigo: string | null }[]))
  }, [])
  return tiendas
}

/** Mensaje de error de PostgREST/Supabase legible. */
export const msgError = (e: unknown) => (e as { message?: string })?.message ?? String(e)

export function fechaEs(iso: string | null | undefined, conHora = false) {
  if (!iso) return ''
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(d.getTime())) return ''
  const f = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return conHora ? `${f} ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : f
}

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

/** RPC de informe con un único parámetro jsonb (limite/desplazamiento dentro). */
export async function rpcPagina<T>(fn: string, p: Record<string, unknown>, desde: number, limite: number): Promise<T[]> {
  const { data, error } = await supabase.rpc(fn, { p: { ...p, limite, desplazamiento: desde } })
  if (error) throw error
  return (data ?? []) as T[]
}

/** Todas las filas de un informe, de 1000 en 1000 (para CSV e impresión). */
export async function rpcTodas<T>(fn: string, p: Record<string, unknown>, tope = 50000): Promise<T[]> {
  const out: T[] = []
  for (let desde = 0; desde < tope; desde += 1000) {
    const filas = await rpcPagina<T>(fn, p, desde, 1000)
    out.push(...filas)
    if (filas.length < 1000) break
  }
  return out
}

/** F4 cierra la ventana, como en los informes de GeminisWin. */
export function useF4(onCerrar: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'F4' && !e.altKey && !e.ctrlKey) {
        e.preventDefault()
        onCerrar()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onCerrar])
}

/** Paginador: «|‹ ‹ 1-200 de 3.415 › ›|». */
export function Paginador({ desde, pagina, total, onIr }: { desde: number; pagina: number; total: number; onIr: (desde: number) => void }) {
  const hasta = Math.min(desde + pagina, total)
  const b = 'gw-btn h-[24px] w-[32px] px-0'
  return (
    <div className="flex items-center gap-1 text-[14px]">
      <button type="button" className={b} disabled={desde === 0} onClick={() => onIr(0)} title="Primera página">
        <ChevronFirst size={14} />
      </button>
      <button type="button" className={b} disabled={desde === 0} onClick={() => onIr(Math.max(0, desde - pagina))} title="Página anterior">
        <Play size={10} className="rotate-180" fill="currentColor" />
      </button>
      <span className="min-w-[160px] text-center tabular-nums">
        {total ? `${(desde + 1).toLocaleString('es-ES')}-${hasta.toLocaleString('es-ES')} de ${total.toLocaleString('es-ES')}` : 'Sin registros'}
      </span>
      <button type="button" className={b} disabled={hasta >= total} onClick={() => onIr(desde + pagina)} title="Página siguiente">
        <Play size={10} fill="currentColor" />
      </button>
      <button type="button" className={b} disabled={hasta >= total} onClick={() => onIr(Math.max(0, Math.floor((total - 1) / pagina) * pagina))} title="Última página">
        <ChevronLast size={14} />
      </button>
    </div>
  )
}

/** Bloque que solo sale al imprimir (portal en <body>; regla .solo-impresion de index.css). */
export function Impresion({ children, ancho = '190mm' }: { children: ReactNode; ancho?: string }) {
  return createPortal(
    <div className="solo-impresion text-black" style={{ width: ancho, padding: '4mm' }}>
      {children}
    </div>,
    document.body,
  )
}

/** Monta el bloque de impresión, espera a que se pinte, imprime y lo quita. */
export function imprimirCon(set: (v: boolean) => void) {
  set(true)
  setTimeout(() => {
    window.print()
    set(false)
  }, 350)
}

/** Aviso de las pantallas sin captura de GeminisWin (pequeño, para no confundir a nadie). */
export function AvisoSinCaptura() {
  return (
    <span className="text-[11px] italic text-[#6d6d6d]" title="Pantalla hecha sin captura de GeminisWin: se ajustará cuando llegue la captura">
      Sin captura de GeminisWin · provisional
    </span>
  )
}

export const DEF_ARTICULOS: GwListaOrdenadaDef = {
  fuente: 'articulo',
  campo: 'codigo_interno',
  etiqueta: 'Código Interno',
  que: 'Artículos',
  columnas: [
    { key: 'codigo_interno', label: 'Código Interno', width: 130 },
    { key: 'descripcion', label: 'Descripción' },
  ],
}

/** Código de artículo con Ctrl+Intro (lista ordenada de artículos) y «···». */
export function CampoArticulo({
  value,
  onChange,
  disabled,
  lista,
  className = '',
  onIntro,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  lista: ReturnType<typeof useListaOrdenada>
  className?: string
  onIntro?: (v: string) => void
}) {
  const abrir = () => lista.abrir(DEF_ARTICULOS, { texto: value || null, onPick: (f) => onChange(String(f.codigo_interno)) })
  return (
    <span className="flex min-w-0">
      <GwInput
        className={className}
        disabled={disabled}
        value={value}
        title="Código de artículo"
        data-gw-ayuda="Ctrl+Intro: lista ordenada de artículos"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault()
            abrir()
          } else if (e.key === 'Enter') onIntro?.(value)
        }}
      />
      <GwLookupButton disabled={disabled} onClick={abrir} title="Lista de artículos (Ctrl+Intro)" />
    </span>
  )
}

/** Ruta de la ficha del documento que originó un movimiento de stock (o null). */
export function rutaDocumento(tipo: string | null, tienda: string | null, numero: number | null): string | null {
  if (!tipo || !tienda || numero == null) return null
  const t = encodeURIComponent(tienda)
  switch (tipo) {
    case 'venta':
      return `/ventas/${t}/${numero}`
    case 'pedido_proveedor':
      return `/pedidos-proveedor/${t}/${numero}`
    case 'traspaso_almacen':
      return `/traspasos/${t}/${numero}`
    case 'regularizacion_stock':
      return `/regularizacion-stock/${t}/${numero}`
    case 'inventario':
      return `/inventario/${t}/${numero}`
    case 'punto_restauracion_stock':
      return `/almacen/puntos-restauracion`
    default:
      return null
  }
}

export const NOMBRE_DOC: Record<string, string> = {
  venta: 'Venta',
  pedido_proveedor: 'Ped. Prov.',
  traspaso_almacen: 'Traspaso',
  regularizacion_stock: 'Regulariz.',
  inventario: 'Inventario',
  punto_restauracion_stock: 'Punto Rest.',
  carga_geminiswin: 'Carga GW',
}

// ───────────── Visor de informes (Pantalla / Examinar) ─────────────
export interface ColInforme<T> {
  k: string
  l: string
  w?: number
  /** Decimales: columna numérica alineada a la derecha. */
  d?: number
  v?: (r: T) => string | number | null | undefined
  /** Celda en pantalla (por defecto, el valor). */
  render?: (r: T) => ReactNode
}

function valorCol<T>(c: ColInforme<T>, r: T) {
  return c.v ? c.v(r) : ((r as Record<string, unknown>)[c.k] as string | number | null | undefined)
}

export function celdaTexto<T>(c: ColInforme<T>, r: T) {
  const v = valorCol(c, r)
  if (c.d != null) return v == null || v === '' ? '' : formatGw(Number(v), c.d)
  return v == null ? '' : String(v)
}

/** Tabla del informe en papel (impresión y vista «Pantalla»). */
export function TablaPapel<T>({ cols, filas, clave }: { cols: ColInforme<T>[]; filas: T[]; clave: (r: T, i: number) => string }) {
  return (
    <table className="w-full border-collapse text-[8.5pt]">
      <thead>
        <tr className="border-b border-black">
          {cols.map((c) => (
            <th key={c.k} className={`px-1 py-0.5 font-bold ${c.d != null ? 'text-right' : 'text-left'}`} style={c.w ? { width: c.w } : undefined}>
              {c.l}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((r, i) => (
          <tr key={clave(r, i)} className="border-b border-[#ddd]">
            {cols.map((c) => (
              <td key={c.k} className={`px-1 py-[1px] ${c.d != null ? 'text-right tabular-nums' : ''}`}>
                {celdaTexto(c, r)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Ventana de resultado de un informe. «pantalla» lo enseña como el papel del informe;
 * «examinar» como rejilla de GeminisWin (doble clic abre la ficha). Las dos piden al servidor
 * una página cada vez y exportan a CSV o imprimen el informe entero.
 */
export function VisorInforme<T>({
  titulo,
  subtitulo,
  modo,
  cols,
  cargar,
  todas,
  totales,
  clave,
  onAbrir,
  onCerrar,
  soloTotales,
  nombreCsv,
  pagina = 200,
}: {
  titulo: string
  subtitulo?: string
  modo: 'pantalla' | 'examinar'
  cols: ColInforme<T>[]
  cargar: (desde: number, limite: number) => Promise<T[]>
  todas: () => Promise<T[]>
  /** Línea de totales a partir de la primera fila (las funciones devuelven los totales en cada fila). */
  totales: (primera: T | undefined) => ReactNode
  clave: (r: T, i: number) => string
  onAbrir?: (r: T) => void
  onCerrar: () => void
  soloTotales?: boolean
  nombreCsv: string
  pagina?: number
}) {
  const [desde, setDesde] = useState(0)
  const [filas, setFilas] = useState<T[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sel, setSel] = useState(0)
  const [imprimir, setImprimir] = useState<T[] | null>(null)
  const total = Number((filas[0] as Record<string, unknown> | undefined)?.total_filas ?? 0)

  useEffect(() => {
    let vivo = true
    setCargando(true)
    cargar(desde, pagina)
      .then((f) => {
        if (!vivo) return
        setFilas(f)
        setSel(0)
        setError(null)
      })
      .catch((e) => vivo && setError(msgError(e)))
      .finally(() => vivo && setCargando(false))
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onCerrar])

  async function csv() {
    try {
      const t = await todas()
      descargarCsv(
        nombreCsv,
        cols.map((c) => c.l),
        t.map((r) => cols.map((c) => valorCol(c, r) ?? null)),
      )
    } catch (e) {
      setError(msgError(e))
    }
  }

  async function aImpresora() {
    try {
      const t = await todas()
      setImprimir(t)
      setTimeout(() => {
        window.print()
        setImprimir(null)
      }, 400)
    } catch (e) {
      setError(msgError(e))
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/20 pt-4">
      <GwWindow
        title={titulo}
        onClose={onCerrar}
        className="h-[calc(100vh-32px)] w-[1300px] max-w-[98vw] [&>div:last-child]:min-h-0 [&>div:last-child]:overflow-hidden"
      >
        <div className="flex h-full min-h-0 flex-col gap-1">
          <div className="flex flex-none items-center gap-2">
            <span className="text-[15px] font-bold">{titulo}</span>
            {subtitulo && <span className="truncate text-[13px] text-[#444]">{subtitulo}</span>}
            <span className="ml-auto">
              <Paginador desde={desde} pagina={pagina} total={total} onIr={setDesde} />
            </span>
          </div>
          <div className={`min-h-0 flex-1 overflow-auto border border-[var(--gw-border)] ${modo === 'pantalla' ? 'bg-[#9a9a9a] p-3' : 'bg-white'}`}>
            {cargando && <div className="p-3 text-[14px]">Procesando…</div>}
            {!cargando && soloTotales && <div className="bg-white p-3 text-[14px]">Sólo se ven los totales del informe.</div>}
            {!cargando && !soloTotales && modo === 'pantalla' && (
              <div className="mx-auto min-h-full w-[1180px] max-w-full bg-white p-4 shadow">
                <div className="mb-2 flex justify-between border-b-2 border-black pb-1 text-[11pt] font-bold">
                  <span>{titulo}</span>
                  <span className="text-[9pt] font-normal">{new Date().toLocaleString('es-ES')}</span>
                </div>
                <TablaPapel cols={cols} filas={filas} clave={clave} />
              </div>
            )}
            {!cargando && !soloTotales && modo === 'examinar' && (
              <table className="gw-grid">
                <thead className="sticky top-0 z-10">
                  <tr>
                    {cols.map((c) => (
                      <th key={c.k} className={c.d != null ? '!text-right' : ''} style={c.w ? { width: c.w, minWidth: c.w } : undefined}>
                        {c.l}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((r, i) => (
                    <tr
                      key={clave(r, i)}
                      className={i === sel ? 'gw-selected' : ''}
                      onClick={() => setSel(i)}
                      onDoubleClick={() => onAbrir?.(r)}
                      title={onAbrir ? 'Doble clic: abrir' : undefined}
                    >
                      {cols.map((c) => (
                        <td key={c.k} className={`whitespace-nowrap ${c.d != null ? 'text-right tabular-nums' : ''}`}>
                          {c.render ? c.render(r) : celdaTexto(c, r)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex flex-none items-center gap-2">
            <div className="min-w-0 flex-1 text-[14px]">{totales(filas[0])}</div>
            {error && <span className="text-[13px] text-[#c42b1c]">{error}</span>}
            <button type="button" className="gw-btn h-[32px] gap-1.5 text-[15px]" onClick={csv}>
              <FileSpreadsheet size={15} className="text-[#127a12]" /> CSV
            </button>
            <button type="button" className="gw-btn h-[32px] gap-1.5 text-[15px]" onClick={aImpresora}>
              <Printer size={15} /> Imprimir
            </button>
            <button type="button" className="gw-btn h-[32px] gap-1.5 text-[15px]" onClick={onCerrar}>
              <X size={15} strokeWidth={3} className="text-[#c42b1c]" /> Cerrar
            </button>
          </div>
        </div>
      </GwWindow>
      {imprimir && (
        <Impresion ancho="277mm">
          <div className="mb-1 flex justify-between text-[11pt] font-bold">
            <span>{titulo}</span>
            <span className="text-[9pt] font-normal">{subtitulo}</span>
          </div>
          <TablaPapel cols={cols} filas={imprimir} clave={clave} />
          <div className="mt-1 border-t border-black pt-1 text-[9pt]">{totales(imprimir[0])}</div>
        </Impresion>
      )}
    </div>,
    document.body,
  )
}

/** Imprime un informe entero sin abrir el visor (salida «Impresora» o «Doc. PDF»). */
export function ImpresionInforme<T>({
  titulo,
  subtitulo,
  cols,
  filas,
  totales,
  clave,
  soloTotales,
}: {
  titulo: string
  subtitulo?: string
  cols: ColInforme<T>[]
  filas: T[]
  totales: ReactNode
  clave: (r: T, i: number) => string
  soloTotales?: boolean
}) {
  return (
    <Impresion ancho="277mm">
      <style>{'@page { size: A4 landscape; margin: 8mm; }'}</style>
      <div className="mb-1 flex justify-between border-b-2 border-black text-[11pt] font-bold">
        <span>{titulo}</span>
        <span className="text-[9pt] font-normal">
          {subtitulo} · {new Date().toLocaleString('es-ES')}
        </span>
      </div>
      {!soloTotales && <TablaPapel cols={cols} filas={filas} clave={clave} />}
      <div className="mt-1 border-t border-black pt-1 text-[9pt]">{totales}</div>
    </Impresion>
  )
}

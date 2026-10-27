import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronFirst, ChevronLast, FileSpreadsheet, Monitor, Play, Printer, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwInput, GwLookupButton, GwRadio } from '../../../components/gw'
import { useListaOrdenada, type GwListaOrdenadaDef } from '../../../components/gw/GwListaOrdenada'

// Piezas comunes de las utilidades del menú Almacén hechas SIN CAPTURA de GeminisWin
// (Movimientos, Etiquetas, Creación rápida, Modificación en bloque, Puntos de restauración,
// Recalcular stock, Eliminación). Siguen el esquema de los informes de GeminisWin ya calcados
// (rangos Desde/Hasta o Cualquiera, salida Pantalla/Impresora/CSV, botones Procesar/Cerrar).
// Cuando lleguen las capturas se ajustan aquí y en cada pantalla.

export const ETQ = 'text-[17px]'

export const etq = (t: ReactNode) => <span className={ETQ}>{t}</span>

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
  const [tiendas, setTiendas] = useState<string[]>([])
  useEffect(() => {
    supabase
      .from('tienda_terminal')
      .select('codigo')
      .order('codigo')
      .then(({ data }) => setTiendas(((data ?? []) as { codigo: string }[]).map((t) => t.codigo)))
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

/** Llama a un RPC paginado (máx. 1000 filas por llamada) hasta traerlo todo (para CSV e impresión). */
export async function rpcTodo<T>(fn: string, args: Record<string, unknown>, tope = 50000): Promise<T[]> {
  const out: T[] = []
  for (let desde = 0; desde < tope; desde += 1000) {
    const { data, error } = await supabase.rpc(fn, { ...args, p_limite: 1000, p_desplazamiento: desde })
    if (error) throw error
    const filas = (data ?? []) as T[]
    out.push(...filas)
    if (filas.length < 1000) break
  }
  return out
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

/** Radios «Desde/Hasta · Cualquiera» de los informes de GeminisWin. */
export function RangoModo({ modo, set, name }: { modo: 'rango' | 'cualquiera'; set: (m: 'rango' | 'cualquiera') => void; name: string }) {
  return (
    <div className="flex w-[120px] flex-none flex-col gap-0.5 text-[15px]">
      <GwRadio name={name} label="Desde/Hasta" checked={modo === 'rango'} onChange={() => set('rango')} />
      <GwRadio name={name} label="Cualquiera" checked={modo === 'cualquiera'} onChange={() => set('cualquiera')} />
    </div>
  )
}

/**
 * Campo de código de artículo con Ctrl+Intro (lista ordenada de artículos, como en GeminisWin)
 * y botón «···». El dueño pinta `dialogo` de `useListaOrdenada` (lo recibe en `lista`).
 */
export function CampoArticulo({
  value,
  onChange,
  disabled,
  lista,
  className = '!w-[130px]',
  title = 'Código de artículo',
  onIntro,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  lista: ReturnType<typeof useListaOrdenada>
  className?: string
  title?: string
  onIntro?: (v: string) => void
}) {
  const abrir = () => lista.abrir(DEF_ARTICULOS, { texto: value || null, onPick: (f) => onChange(String(f.codigo_interno)) })
  return (
    <span className="flex">
      <GwInput
        className={className}
        disabled={disabled}
        value={value}
        title={title}
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

/** Barra de salida de los informes: Pantalla · Impresora · CSV · Procesar · Cerrar. */
export function BarraInforme({
  procesando,
  onPantalla,
  onImpresora,
  onCsv,
  onCerrar,
  extra,
}: {
  procesando: boolean
  onPantalla: () => void
  onImpresora: () => void
  onCsv: () => void
  onCerrar: () => void
  extra?: ReactNode
}) {
  return (
    <div className="flex items-stretch gap-2">
      <div className="flex w-[180px] flex-none items-center border border-[var(--gw-border-light)] px-2 text-[15px] leading-tight">{extra ?? 'Pulse F4 para cerrar la ventana'}</div>
      <div className="grid flex-1 grid-cols-3 gap-0.5 border border-[var(--gw-border-light)] p-1">
        <button type="button" className="gw-btn h-[38px] gap-1.5 text-[16px]" onClick={onPantalla} disabled={procesando}>
          <Monitor size={15} /> Pantalla
        </button>
        <button type="button" className="gw-btn h-[38px] gap-1.5 text-[16px]" onClick={onImpresora} disabled={procesando}>
          <Printer size={15} /> Impresora
        </button>
        <button type="button" className="gw-btn h-[38px] gap-1.5 text-[16px]" onClick={onCsv} disabled={procesando}>
          <FileSpreadsheet size={15} className="text-[#127a12]" /> CSV
        </button>
      </div>
      <button type="button" className="gw-btn h-[46px] w-[160px] gap-1.5 text-[18px]" onClick={onPantalla} disabled={procesando}>
        <Check size={17} strokeWidth={3} className="text-[#127a12]" />
        {procesando ? 'Procesando…' : 'Procesar'}
      </button>
      <BotonCerrar onClick={onCerrar} />
    </div>
  )
}

export function BotonCerrar({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="gw-btn h-[46px] w-[160px] gap-1.5 text-[18px]" onClick={onClick}>
      <X size={17} strokeWidth={3} className="text-[#c42b1c]" />
      Cerrar
    </button>
  )
}

/** F4 cierra la ventana, como en los informes de GeminisWin. */
export function useF4(onCerrar: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'F4' && !e.altKey) {
        e.preventDefault()
        onCerrar()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onCerrar])
}

/** Paginador de rejilla: «‹‹ ‹ 1-200 de 3.415 › ››». */
export function Paginador({ desde, pagina, total, onIr }: { desde: number; pagina: number; total: number; onIr: (desde: number) => void }) {
  const hasta = Math.min(desde + pagina, total)
  const b = 'gw-btn h-[22px] w-[30px] px-0'
  return (
    <div className="flex items-center gap-1 text-[13px]">
      <button type="button" className={b} disabled={desde === 0} onClick={() => onIr(0)} title="Primera página">
        <ChevronFirst size={14} />
      </button>
      <button type="button" className={b} disabled={desde === 0} onClick={() => onIr(Math.max(0, desde - pagina))} title="Página anterior">
        <Play size={10} className="rotate-180" fill="currentColor" />
      </button>
      <span className="min-w-[150px] text-center tabular-nums">
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

/**
 * Bloque que solo sale al imprimir (portal en <body>). Las demás piezas de la página se ocultan
 * con la regla .solo-impresion de index.css; aquí se fija el ancho de A4 apaisado o vertical.
 */
export function Impresion({ children, ancho = '190mm' }: { children: ReactNode; ancho?: string }) {
  return createPortal(
    <div className="solo-impresion text-black" style={{ width: ancho, padding: '4mm' }}>
      {children}
    </div>,
    document.body,
  )
}

/** Imprime: monta el bloque de impresión, espera a que se pinte, llama a window.print y lo quita. */
export function imprimirCon(set: (v: boolean) => void) {
  set(true)
  setTimeout(() => {
    window.print()
    set(false)
  }, 350)
}

/** Aviso fijo de las pantallas sin captura (pequeño, en la esquina, para no confundir a nadie). */
export function AvisoSinCaptura() {
  return (
    <span className="text-[11px] italic text-[#6d6d6d]" title="Pantalla hecha sin captura de GeminisWin: se ajustará cuando llegue la captura">
      Sin captura de GeminisWin · provisional
    </span>
  )
}

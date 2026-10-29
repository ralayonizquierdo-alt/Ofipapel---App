import type { ReactNode } from 'react'
import { supabase } from '../../../lib/supabase'

// Piezas compartidas por Traspasos y Regularización de stock (pantallas de letra grande de GeminisWin).

export const BIG_LABEL = 'text-[15px] leading-[17px]'
export const BIG_INPUT = '!h-[26px] !text-[15px]'

export interface ArticuloStock {
  codigo_interno: string
  descripcion: string
  coste_puro: number | null
  coste_neto: number | null
  coste_bruto: number | null
  precio_liquidado: number | null
  unidades_por_caja: number | null
  cajas_por_bulto: number | null
}

const ART_COLS = 'codigo_interno, descripcion, coste_puro, coste_neto, coste_bruto, precio_liquidado, unidades_por_caja, cajas_por_bulto'

/** Busca un artículo como el TPV de GeminisWin: código interno, código de barras (principal o adicional) o código de venta. */
export async function resolverArticulo(codigo: string): Promise<ArticuloStock | null> {
  const c = codigo.trim()
  if (!c) return null
  const porCampo = async (campo: string) => {
    const { data } = await supabase.from('articulo').select(ART_COLS).eq(campo, c).limit(1)
    return ((data ?? [])[0] as ArticuloStock | undefined) ?? null
  }
  const directo = (await porCampo('codigo_interno')) ?? (await porCampo('codigo_barras_principal'))
  if (directo) return directo
  const { data: barra } = await supabase.from('articulo_codigo_barras').select('articulo_codigo').eq('codigo_barras', c).limit(1)
  const desdeBarra = (barra ?? [])[0]?.articulo_codigo as string | undefined
  if (desdeBarra) {
    const { data } = await supabase.from('articulo').select(ART_COLS).eq('codigo_interno', desdeBarra).maybeSingle()
    if (data) return data as ArticuloStock
  }
  return porCampo('codigo_venta')
}

export async function stockDe(articulo: string, almacen: string | null): Promise<number> {
  if (!articulo || !almacen) return 0
  const { data } = await supabase
    .from('articulo_almacen_stock')
    .select('cantidad_actual')
    .eq('articulo_codigo', articulo)
    .eq('almacen_codigo', almacen)
    .maybeSingle()
  return Number(data?.cantidad_actual ?? 0)
}

export async function empleadoActual(): Promise<{ codigo: string; nombre: string } | null> {
  const { data: codigo } = await supabase.rpc('fn_empleado_actual')
  if (!codigo) return null
  const { data } = await supabase.from('empleado').select('codigo, nombre').eq('codigo', codigo).maybeSingle()
  return (data as { codigo: string; nombre: string } | null) ?? null
}

export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const f = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const h = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return `${f} ${h}`
}

/** «2026-10-26T23:12» para un input datetime-local a partir de un ISO. */
export function aLocal(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date()
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** Botón de barra con icono encima y texto debajo (barra de Regularización de stock). */
export function BtnTexto({
  title,
  label,
  onClick,
  disabled,
  children,
  className = '',
}: {
  title?: string
  label?: string
  onClick?: () => void
  disabled?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      title={title ?? label}
      data-gw-estado={title ?? label}
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center gap-1 gw-boton-barra ${className}`}
    >
      {children}
      {label && <span className="text-[14px] leading-[15px] text-black [button:disabled_&]:text-[#a8a8a8]">{label}</span>}
    </button>
  )
}

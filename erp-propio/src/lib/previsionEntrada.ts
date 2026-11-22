import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Previsión de entrada de lo pedido a proveedor (fn_articulos_prevision_entrada): fecha del pedido en camino (ERP o
// GeminisWin) + plazo de entrega del proveedor. Para la ficha de artículo y las barras de ventas, pedidos y reparaciones.

export interface PrevisionEntrada {
  fecha: string
  unidades: number
  retrasado: boolean
}

const cache = new Map<string, { t: number; v: PrevisionEntrada | null }>()

export async function previsionEntrada(codigo: string): Promise<PrevisionEntrada | null> {
  const c = cache.get(codigo)
  if (c && Date.now() - c.t < 60_000) return c.v
  const { data } = await supabase.rpc('fn_articulos_prevision_entrada', { p_articulos: [codigo] })
  const f = ((data ?? []) as { fecha_prevista: string; unidades: number; retrasado: boolean }[])[0]
  const v = f?.fecha_prevista ? { fecha: f.fecha_prevista, unidades: Number(f.unidades ?? 0), retrasado: !!f.retrasado } : null
  cache.set(codigo, { t: Date.now(), v })
  return v
}

/** Previsión del artículo (null mientras carga o si no hay nada pedido). */
export function usePrevisionEntrada(codigo: string | null | undefined) {
  const [v, setV] = useState<{ codigo: string; p: PrevisionEntrada | null } | null>(null)
  useEffect(() => {
    if (!codigo) return
    let cancel = false
    void previsionEntrada(codigo).then((p) => !cancel && setV({ codigo, p }))
    return () => {
      cancel = true
    }
  }, [codigo])
  return codigo && v?.codigo === codigo ? v.p : null
}

/** «Prev: 24/11» (o «Prev: 31/08 retrasado») para las barras; vacío si no hay previsión. */
export function textoPrevision(p: PrevisionEntrada | null) {
  if (!p) return ''
  const [a, m, d] = p.fecha.split('-')
  return `Prev: ${d}/${m}/${a.slice(2)}${p.retrasado ? ' (retrasado)' : ''}`
}

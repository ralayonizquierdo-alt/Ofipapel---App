// Parámetros generales del programa (Archivo → Parámetros, tabla `parametro`). Se cargan una vez
// al entrar (UtilidadesHost) y se leen de forma síncrona desde los modelos de documento
// (ventaModel…) y las rejillas. Mientras no han llegado valen los de siempre (IGIC 7 %, precios
// con 3 decimales) o los últimos guardados en este navegador.
//
// Solo los administradores los modifican (lo impone la RLS de `parametro`).

import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { PARAMETROS_POR_CLAVE } from './catalogoParametros'

export interface Parametros {
  /** IGIC por defecto (%) de las líneas nuevas de venta y de los artículos nuevos. */
  igic_defecto_pct: number
  /** Decimales de los precios de las líneas (pedidos, ventas, ticket). */
  decimales_precio: number
  /** Moneda de la empresa, base de las cotizaciones. */
  moneda_empresa: string
}

export const PARAMETROS_DEFECTO: Parametros = { igic_defecto_pct: 7, decimales_precio: 3, moneda_empresa: 'EUR' }

const K_CACHE = 'erp.parametros'
let actual: Parametros = leerCache()
const oyentes = new Set<() => void>()

function leerCache(): Parametros {
  try {
    const j = JSON.parse(localStorage.getItem(K_CACHE) ?? 'null') as Partial<Parametros> | null
    return normalizar(j ?? {})
  } catch {
    return { ...PARAMETROS_DEFECTO }
  }
}

function normalizar(p: Partial<Record<keyof Parametros, unknown>>): Parametros {
  const n = (v: unknown, def: number, min: number, max: number) => {
    const x = Number(v)
    return v == null || v === '' || !Number.isFinite(x) ? def : Math.min(max, Math.max(min, x))
  }
  return {
    igic_defecto_pct: n(p.igic_defecto_pct, PARAMETROS_DEFECTO.igic_defecto_pct, 0, 100),
    decimales_precio: Math.round(n(p.decimales_precio, PARAMETROS_DEFECTO.decimales_precio, 0, 6)),
    moneda_empresa: typeof p.moneda_empresa === 'string' && p.moneda_empresa ? p.moneda_empresa : PARAMETROS_DEFECTO.moneda_empresa,
  }
}

function publicar(p: Parametros) {
  actual = p
  try {
    localStorage.setItem(K_CACHE, JSON.stringify(p))
  } catch {
    /* navegador sin almacenamiento: vale la memoria */
  }
  oyentes.forEach((f) => f())
}

// Todos los valores (catálogo en catalogoParametros.ts): los generales y los del empleado
// conectado, que mandan. Se guardan también en el navegador para que al entrar ya estén.
const K_VALORES = 'erp.parametros.valores'
let valores: { generales: Record<string, unknown>; mios: Record<string, unknown> } = leerValores()

function leerValores() {
  try {
    const v = JSON.parse(localStorage.getItem(K_VALORES) ?? 'null') as typeof valores | null
    if (v && typeof v === 'object' && v.generales && v.mios) return v
  } catch {
    /* sin caché */
  }
  return { generales: {}, mios: {} }
}

/** Lee la tabla `parametro` (y los del empleado conectado) y actualiza los valores en uso. */
export async function cargarParametros(): Promise<Parametros> {
  const [g, yo] = await Promise.all([supabase.from('parametro').select('clave, valor'), supabase.rpc('fn_empleado_actual')])
  if (g.error) return actual
  const crudo: Record<string, unknown> = {}
  for (const r of (g.data ?? []) as { clave: string; valor: unknown }[]) crudo[r.clave] = r.valor
  const mios: Record<string, unknown> = {}
  const codigo = typeof yo.data === 'string' ? yo.data : null
  if (codigo) {
    const { data } = await supabase.from('parametro_empleado').select('clave, valor').eq('empleado_codigo', codigo)
    for (const r of (data ?? []) as { clave: string; valor: unknown }[]) mios[r.clave] = r.valor
  }
  valores = { generales: crudo, mios }
  try {
    localStorage.setItem(K_VALORES, JSON.stringify(valores))
  } catch {
    /* sin almacenamiento */
  }
  publicar(normalizar({ ...crudo, ...mios }))
  return actual
}

/** Valor en uso de un parámetro del catálogo: el del empleado, el general o el de por defecto. */
export function valorParametro<T = unknown>(clave: string): T {
  if (clave in valores.mios) return valores.mios[clave] as T
  if (clave in valores.generales) return valores.generales[clave] as T
  return PARAMETROS_POR_CLAVE[clave]?.defecto as T
}

/** Lo mismo dentro de un componente: se repinta al cambiar los parámetros. */
export function useParametro<T = unknown>(clave: string): T {
  useParametros()
  return valorParametro<T>(clave)
}

export const parametros = (): Parametros => actual
export const igicDefecto = () => actual.igic_defecto_pct
export const decimalesPrecio = () => actual.decimales_precio

/** Parámetros en uso dentro de un componente (se repinta si cambian). */
export function useParametros(): Parametros {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f)
      return () => oyentes.delete(f)
    },
    () => actual,
  )
}

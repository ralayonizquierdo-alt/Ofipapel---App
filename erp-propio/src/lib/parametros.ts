// Parámetros generales del programa (Archivo → Parámetros, tabla `parametro`). Se cargan una vez
// al entrar (UtilidadesHost) y se leen de forma síncrona desde los modelos de documento
// (ventaModel…) y las rejillas. Mientras no han llegado valen los de siempre (IGIC 7 %, precios
// con 3 decimales) o los últimos guardados en este navegador.
//
// Solo los administradores los modifican (lo impone la RLS de `parametro`).

import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'

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

/** Lee la tabla `parametro` y actualiza los valores en uso. */
export async function cargarParametros(): Promise<Parametros> {
  const { data, error } = await supabase.from('parametro').select('clave, valor')
  if (error) return actual
  const crudo: Record<string, unknown> = {}
  for (const r of (data ?? []) as { clave: string; valor: unknown }[]) crudo[r.clave] = r.valor
  publicar(normalizar(crudo))
  return actual
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

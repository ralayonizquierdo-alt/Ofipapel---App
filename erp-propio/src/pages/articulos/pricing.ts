import type { Articulo, ArticuloPrecioNivel } from './types'

export const round3 = (n: number) => Math.round(n * 1000) / 1000
const round2 = (n: number) => Math.round(n * 100) / 100

const COSTE_POR_CODIGO: Record<number, keyof Articulo> = {
  0: 'coste_puro',
  1: 'coste_neto',
  2: 'coste_bruto',
  3: 'precio_liquidado',
}
const ORDEN_RESPALDO: (keyof Articulo)[] = ['precio_liquidado', 'coste_neto', 'coste_bruto', 'coste_puro']

/** Coste sobre el que se calculan los PVP (COSTTOCALC); si está vacío, el siguiente disponible. */
export function costeBase(a: Articulo): number | null {
  const preferido = COSTE_POR_CODIGO[a.coste_base_calculo ?? 3]
  const candidatos = [preferido, ...ORDEN_RESPALDO.filter((k) => k !== preferido)]
  for (const k of candidatos) {
    const v = a[k]
    if (v != null && Number(v) > 0) return Number(v)
  }
  return null
}

export const COSTE_FIELDS: (keyof Articulo)[] = ['coste_puro', 'coste_neto', 'coste_bruto', 'precio_liquidado', 'coste_base_calculo']

function pvpDeNivel(n: ArticuloPrecioNivel, base: number | null, general: number): number | null {
  if (n.incremento_pct == null) return null
  const m = Number(n.incremento_pct)
  if (n.modo_calculo === 'D') return n.nivel_tarifa === 0 ? null : round3(general * (1 - m / 100))
  if (base == null) return null
  return round3(base * (1 + m / 100))
}

function margenDePvp(n: ArticuloPrecioNivel, base: number | null, general: number): number | null {
  if (n.modo_calculo === 'D') return general > 0 ? round2((1 - n.pvp / general) * 100) : null
  return base ? round2((n.pvp / base - 1) * 100) : null
}

/** Recalcula todos los niveles con margen: primero la General y luego el resto. */
export function recalcularTodos(niveles: ArticuloPrecioNivel[], base: number | null): ArticuloPrecioNivel[] {
  const gen = niveles.find((n) => n.nivel_tarifa === 0)
  let general = gen?.pvp ?? 0
  if (gen) {
    const p = pvpDeNivel(gen, base, general)
    if (p != null) general = p
  }
  return niveles.map((n) => {
    if (n.nivel_tarifa === 0) return { ...n, pvp: general }
    const p = pvpDeNivel(n, base, general)
    return p == null ? n : { ...n, pvp: p }
  })
}

export type NivelPatch = Partial<Pick<ArticuloPrecioNivel, 'modo_calculo' | 'incremento_pct' | 'pvp' | 'permite_descuento_linea'>>

/**
 * Cambio en una fila de tarifas, como en GeminisWin: si se teclea el PVP se recalcula el
 * margen; si cambia el margen o el modo, el PVP. Si cambia la General, se arrastran las D.
 */
export function aplicarCambioNivel(
  niveles: ArticuloPrecioNivel[],
  nivel: number,
  patch: NivelPatch,
  base: number | null,
): ArticuloPrecioNivel[] {
  const generalAntes = niveles.find((n) => n.nivel_tarifa === 0)?.pvp ?? 0
  let next = niveles.map((n) => {
    if (n.nivel_tarifa !== nivel) return n
    const m = { ...n, ...patch }
    const general = nivel === 0 ? m.pvp : generalAntes
    if (patch.pvp !== undefined) return { ...m, incremento_pct: margenDePvp(m, base, general) }
    if (patch.incremento_pct !== undefined || patch.modo_calculo !== undefined) {
      const p = pvpDeNivel(m, base, general)
      return p == null ? m : { ...m, pvp: p }
    }
    return m
  })
  const generalDespues = next.find((n) => n.nivel_tarifa === 0)?.pvp ?? 0
  if (generalDespues !== generalAntes) {
    next = next.map((n) => {
      if (n.nivel_tarifa === 0 || n.modo_calculo !== 'D') return n
      const p = pvpDeNivel(n, base, generalDespues)
      return p == null ? n : { ...n, pvp: p }
    })
  }
  return next
}

/** % de margen real sobre el coste base, como la columna derecha de la ficha (125%, 68,75%). */
export function margenReal(pvp: number, base: number | null): string {
  if (!base || !pvp) return ''
  const v = round2((pvp / base - 1) * 100)
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(v)}%`
}

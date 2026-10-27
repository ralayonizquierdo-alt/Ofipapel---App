import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// Navegación de una ficha (primero · anterior · siguiente · último y «Registro X de N») pidiendo
// al servidor SOLO lo necesario: el vecino con gt/lt + limit 1, primero/último con order + limit 1,
// el total y la posición con count head:true. Nunca baja la tabla al navegador, así que vale igual
// con 600 clientes que con 60.000 artículos.
//
// El orden es una tupla de columnas (p. ej. ['descripcion', 'codigo_interno'] o
// ['tienda_terminal_codigo', 'numero']); la última debe hacer única la fila. «Después de» la
// fila actual se traduce a un filtro PostgREST: (c1 > v1) o (c1 = v1 y c2 > v2) o …

export type NavValor = string | number | null
export type NavDir = 'primero' | 'anterior' | 'siguiente' | 'ultimo'
// El constructor de consultas de supabase-js no tiene un tipo cómodo de pasar: se deja abierto.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NavFiltro = (q: any) => any

/** Valor entre comillas para los filtros or()/and() de PostgREST (comas, paréntesis, puntos…). */
const cita = (v: string | number) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

function cond(col: string, v: NavValor, op: 'gt' | 'lt' | 'eq' | 'gte' | 'lte', nulos: boolean): string | null {
  if (!nulos) return `${col}.${op}.${cita(v ?? '')}`
  // Con nulos: en orden ascendente Postgres los pone al final (son «los mayores»).
  if (op === 'eq') return v == null ? `${col}.is.null` : `${col}.eq.${cita(v)}`
  if (op === 'gt' || op === 'gte') return v == null ? (op === 'gte' ? `${col}.is.null` : null) : `or(${col}.${op}.${cita(v)},${col}.is.null)`
  return v == null ? (op === 'lte' ? null : `${col}.not.is.null`) : `${col}.${op}.${cita(v)}`
}

/**
 * Filtro (para `.or()`) de las filas cuya tupla `cols` va estrictamente después (`gt`) o antes
 * (`lt`) de `vals`. Devuelve null si no puede haber ninguna. `undefined` = sin restricción.
 */
export function filtroTupla(cols: string[], vals: NavValor[], op: 'gt' | 'lt', nulos = false): string | null {
  const ramas: string[] = []
  for (let i = 0; i < cols.length; i++) {
    const c = cond(cols[i], vals[i], op, nulos)
    if (c == null) continue
    const iguales = cols.slice(0, i).map((col, j) => cond(col, vals[j], 'eq', nulos) as string)
    ramas.push(iguales.length ? `and(${[...iguales, c].join(',')})` : c)
  }
  if (!ramas.length) return null
  const o = ramas.length === 1 ? ramas[0] : `or(${ramas.join(',')})`
  // Sin nulos, la cota de la primera columna (c1 >= v1 / c1 <= v1) deja usar el índice por rango.
  if (!nulos && cols.length > 1) return `and(${cond(cols[0], vals[0], op === 'gt' ? 'gte' : 'lte', false)},${o})`
  return o
}

export interface NavRegistro<R> {
  /** Número de registros (con el filtro), o null mientras se cuenta. */
  total: number | null
  /** Posición (1…total) del registro actual en el orden, o null si no hay registro actual. */
  posicion: number | null
  /** Pide al servidor el registro en esa dirección; null si no hay (ya en el borde). */
  ir: (dir: NavDir) => Promise<R | null>
  /** Vuelve a contar (tras un alta o una baja). */
  refrescar: () => void
}

export function useNavRegistro<R = Record<string, unknown>>({
  tabla,
  orden,
  actual,
  select,
  filtro,
  nulos = false,
}: {
  tabla: string
  /** Columnas del orden; la última hace única la fila. */
  orden: string[]
  /** Valores de esas columnas en el registro actual (null: no hay registro actual). */
  actual: NavValor[] | null
  /** Columnas que devuelve `ir` (por defecto, las del orden). */
  select?: string
  /** Restricciones fijas (es_reparacion = false…). Memorizarlo con useCallback. */
  filtro?: NavFiltro
  /** Alguna columna del orden admite nulos (más lento: no usa el índice por rango). */
  nulos?: boolean
}): NavRegistro<R> {
  const [total, setTotal] = useState<number | null>(null)
  const [posicion, setPosicion] = useState<number | null>(null)
  const [version, setVersion] = useState(0)
  const ordenClave = orden.join(',')
  const actualClave = actual ? JSON.stringify(actual) : ''
  const sel = select ?? ordenClave

  const base = useCallback(
    (cols: string, head = false) => {
      const q = supabase.from(tabla).select(cols, head ? { count: 'exact', head: true } : undefined)
      return filtro ? filtro(q) : q
    },
    [tabla, filtro],
  )

  useEffect(() => {
    let vivo = true
    base(orden[orden.length - 1], true).then(({ count }: { count: number | null }) => vivo && setTotal(count ?? 0))
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, ordenClave, version])

  useEffect(() => {
    const a = actualClave ? (JSON.parse(actualClave) as NavValor[]) : null
    if (!a) {
      setPosicion(null)
      return
    }
    let vivo = true
    const f = filtroTupla(orden, a, 'lt', nulos)
    if (f == null) {
      setPosicion(1)
      return
    }
    base(orden[orden.length - 1], true)
      .or(f)
      .then(({ count, error }: { count: number | null; error: unknown }) => vivo && setPosicion(error ? null : (count ?? 0) + 1))
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, ordenClave, actualClave, nulos, version])

  const ir = useCallback(
    async (dir: NavDir): Promise<R | null> => {
      const a = actualClave ? (JSON.parse(actualClave) as NavValor[]) : null
      const asc = dir === 'primero' || dir === 'siguiente'
      let q = base(sel)
      if (a && (dir === 'anterior' || dir === 'siguiente')) {
        const f = filtroTupla(orden, a, dir === 'siguiente' ? 'gt' : 'lt', nulos)
        if (f == null) return null
        q = q.or(f)
      }
      for (const c of orden) q = q.order(c, { ascending: asc })
      const { data } = await q.limit(1)
      return ((data as R[] | null) ?? [])[0] ?? null
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, sel, ordenClave, actualClave, nulos],
  )

  const refrescar = useCallback(() => setVersion((v) => v + 1), [])
  return { total, posicion, ir, refrescar }
}

/** «Registro X de N» para la línea de estado de las fichas ('' si aún no se sabe). */
export function textoRegistro(nav: { total: number | null; posicion: number | null }) {
  return nav.posicion != null && nav.total != null ? ` · Registro ${nav.posicion} de ${nav.total}` : ''
}

/**
 * Siguiente código numérico libre, preguntando al servidor por el mayor código de `digitos`
 * cifras (00002, 00625…) en lugar de bajar todos los códigos.
 */
export async function siguienteCodigoServidor(tabla: string, digitos: number, columna = 'codigo') {
  const { data } = await supabase
    .from(tabla)
    .select(columna)
    .filter(columna, 'match', `^[0-9]{${digitos}}$`)
    .order(columna, { ascending: false })
    .limit(1)
  const max = Number(((data as Record<string, string>[] | null) ?? [])[0]?.[columna] ?? 0)
  return String(max + 1).padStart(digitos, '0')
}

/** Dirección equivalente cuando la ficha se recorre en orden inverso (del más nuevo al más antiguo). */
export function navDir(d: NavDir, inverso: boolean): NavDir {
  if (!inverso) return d
  return ({ primero: 'ultimo', ultimo: 'primero', anterior: 'siguiente', siguiente: 'anterior' } as const)[d]
}

/** Posición (0…) en el orden mostrado, -1 si no se sabe; con `inverso`, contada desde el final. */
export function navIndice(nav: { total: number | null; posicion: number | null }, inverso = false) {
  if (nav.posicion == null) return -1
  return inverso ? (nav.total ?? nav.posicion) - nav.posicion : nav.posicion - 1
}

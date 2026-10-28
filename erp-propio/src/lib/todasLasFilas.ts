// Supabase (PostgREST) devuelve COMO MÁXIMO 1000 filas por consulta, aunque se pida
// `.limit(5000)`: el resto se pierde sin ningún error. Con los datos reales de GeminisWin
// (decenas de miles de artículos, miles de clientes y de ventas) eso deja gestores y listados
// a medias sin avisar.
//
// `todasLasFilas` pide la consulta en bloques de 1000 con `.range()` hasta agotarla o hasta un
// tope. La consulta se construye de nuevo para cada bloque (los constructores de supabase-js no
// se pueden reutilizar) y DEBE llevar un orden que haga única cada fila (p. ej. la clave
// primaria al final); si no, un bloque puede repetir o saltarse filas.
//
//   const r = await todasLasFilas<Pedido>(
//     () => supabase.from('pedido_cliente').select(COLS).eq('anulado', false).order('fecha').order('tienda_terminal_codigo').order('numero'),
//     { tope: 5000 },
//   )
//   if (r.cortado) setAviso(avisoTope(r.data.length))

export const BLOQUE_FILAS = 1000

/** Tope por defecto: suficiente para cualquier gestor razonable sin colgar el navegador. */
export const TOPE_FILAS = 20000

// El constructor de consultas de supabase-js no tiene un tipo cómodo de pasar: se deja abierto.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Consulta = any

export interface Filas<T> {
  data: T[]
  error: string | null
  /** Había más filas que el tope: `data` trae solo las primeras `tope`. */
  cortado: boolean
}

// Sin tipo explícito, las filas salen sin tipar, igual que un select normal de supabase-js.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function todasLasFilas<T = any>(consulta: () => Consulta, { tope = TOPE_FILAS }: { tope?: number } = {}): Promise<Filas<T>> {
  const out: T[] = []
  // Se pide una fila más que el tope para saber si la consulta se queda corta.
  for (let desde = 0; desde <= tope; desde += BLOQUE_FILAS) {
    const hasta = Math.min(desde + BLOQUE_FILAS, tope + 1) - 1
    const { data, error } = (await consulta().range(desde, hasta)) as { data: T[] | null; error: { message: string } | null }
    if (error) return { data: out, error: error.message, cortado: false }
    out.push(...(data ?? []))
    if (!data || data.length < hasta - desde + 1) break
  }
  const cortado = out.length > tope
  return { data: cortado ? out.slice(0, tope) : out, error: null, cortado }
}

/**
 * Filas de una consulta con `.in(columna, valores)` cuando `valores` puede ser largo: la parte en
 * trozos (una URL con miles de códigos no cabe) y pide cada trozo por bloques de 1000.
 *
 *   const { data } = await filasPorTrozos(codigos, (t) => supabase.from('articulo').select('codigo_interno, descripcion').in('codigo_interno', t).order('codigo_interno'))
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function filasPorTrozos<T = any, V = string | number>(valores: V[], consulta: (trozo: V[]) => Consulta, trozo = 200): Promise<{ data: T[]; error: string | null }> {
  const out: T[] = []
  for (let i = 0; i < valores.length; i += trozo) {
    const r = await todasLasFilas<T>(() => consulta(valores.slice(i, i + trozo)))
    if (r.error) return { data: out, error: r.error }
    out.push(...r.data)
  }
  return { data: out, error: null }
}

/** Aviso de los gestores cuando la consulta tiene más filas que las que se muestran (como GeminisWin). */
export function avisoTope(n: number) {
  return `Se muestran las primeras ${n.toLocaleString('es-ES')} filas; afina el filtro.`
}

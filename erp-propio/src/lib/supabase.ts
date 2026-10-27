import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY en el entorno')
}

export const supabase = createClient(url, publishableKey)

/**
 * Todas las filas de una tabla, de 1000 en 1000 (PostgREST corta cada respuesta
 * en 1000 filas: con los datos reales de GeminisWin hay más familias, marcas y
 * artículos que eso, y un select sin paginar se queda a medias sin avisar).
 */
export async function selectTodo<T>(tabla: string, columnas: string, orden: string): Promise<{ data: T[]; error: string | null }> {
  const out: T[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from(tabla).select(columnas).order(orden).range(desde, desde + 999)
    if (error) return { data: out, error: error.message }
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) return { data: out, error: null }
  }
}

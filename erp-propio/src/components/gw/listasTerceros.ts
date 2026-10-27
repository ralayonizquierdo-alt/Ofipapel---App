import { supabase } from '../../lib/supabase'
import { gwConCeros, type GwListaColumna, type GwListaOrdenadaDef } from './GwListaOrdenada'

// Piezas comunes de Clientes y Proveedores para la búsqueda desde los campos de la ficha
// (Código, Nombre, Razón Social, NIF) y la lista ordenada de Ctrl+Intro.

export type Tercero = 'cliente' | 'proveedor'

const ETIQUETAS: Record<string, string> = { codigo: 'Código', nombre: 'Nombre', razon_social: 'Razón Social', nif: 'Dni/Nif' }

export function defTercero(tabla: Tercero, campo: string): GwListaOrdenadaDef {
  const columnas: GwListaColumna[] = [
    { key: 'codigo', label: 'Código', width: 80 },
    { key: campo === 'razon_social' ? 'razon_social' : 'nombre', label: campo === 'razon_social' ? 'Razón Social' : 'Nombre' },
    { key: 'nif', label: 'NIF', width: 110 },
    ...(tabla === 'cliente' ? [{ key: 'poblacion', label: 'Población', width: 160 }] : []),
    { key: 'telefono', label: 'Teléfono', width: 120 },
  ]
  return {
    fuente: tabla,
    campo,
    etiqueta: ETIQUETAS[campo] ?? campo,
    que: tabla === 'cliente' ? 'Clientes' : 'Proveedores',
    omitirVacios: campo === 'nif' || campo === 'razon_social',
    columnas,
  }
}

/** Código escrito en el campo Código: por código (con ceros a la izquierda) y, si no, por NIF. */
export async function buscarTerceroPorCodigo(tabla: Tercero, texto: string): Promise<string | null> {
  const t = texto.trim()
  const porCodigo = await supabase.from(tabla).select('codigo').in('codigo', [t, gwConCeros(t)]).limit(1)
  if (porCodigo.data?.[0]) return porCodigo.data[0].codigo as string
  const nif = t.toUpperCase().replace(/[\s.-]/g, '')
  const porNif = await supabase.from(tabla).select('codigo').in('nif', [t, t.toUpperCase(), nif]).order('codigo').limit(1)
  return (porNif.data?.[0]?.codigo as string | undefined) ?? null
}

import { supabase } from '../../lib/supabase'
import { gwBuscarPorInicio, useListaOrdenada, type GwListaColumna, type GwListaOrdenadaDef } from './GwListaOrdenada'

/**
 * Búsqueda desde los campos Código y Nombre/Descripción de una ficha de maestro (Vendedores,
 * Técnicos, Repartidores, Zonas, Rutas, Transportistas…), como en Artículos o Clientes:
 *
 * - En consulta, escribir un código y pulsar Intro salta a ese registro (con los ceros de
 *   GeminisWin: «9» es el 009 si el código tiene 3 cifras); en el nombre, al primero que
 *   empieza así.
 * - Ctrl+Intro abre la lista ordenada por ese campo (RPC gw_lista_ordenada, por tramos).
 *
 * `busqueda('codigo' | 'nombre')` da los props para GwCampoBusqueda; pintar `dialogo`.
 * La fuente tiene que estar en la lista blanca de gw_lista_ordenada.
 */
export function useBusquedaFicha({
  fuente,
  campoNombre,
  etiquetaNombre = 'Nombre',
  que,
  titulo,
  digitos,
  consulta,
  actual,
  goTo,
  setError,
  columnasExtra = [],
}: {
  fuente: string
  campoNombre: string
  etiquetaNombre?: string
  /** Para los avisos: «No existe el vendedor 12». */
  que: string
  /** Para el título de la lista: «Vendedores ordenados por …». */
  titulo: string
  /** Cifras de los códigos numéricos (rellena con ceros lo tecleado). */
  digitos?: number
  consulta: boolean
  /** Código del registro que se está viendo (la lista se abre marcándolo). */
  actual: string | null
  goTo: (codigo: string) => void
  setError: (e: string | null) => void
  columnasExtra?: GwListaColumna[]
}) {
  const listaOrd = useListaOrdenada()

  const def = (campo: string): GwListaOrdenadaDef => ({
    fuente,
    campo,
    etiqueta: campo === 'codigo' ? 'Código' : etiquetaNombre,
    que: titulo,
    columnas: [{ key: 'codigo', label: 'Código', width: 90 }, { key: campoNombre, label: etiquetaNombre }, ...columnasExtra],
  })

  async function porCodigo(t: string) {
    const variantes = [t, t.toUpperCase()]
    if (digitos && /^\d+$/.test(t) && t.length < digitos) variantes.push(t.padStart(digitos, '0'))
    const { data } = await supabase.from(fuente).select('codigo').in('codigo', variantes).limit(1)
    const c = (data as { codigo: string }[] | null)?.[0]?.codigo
    if (c) return goTo(c)
    const f = await gwBuscarPorInicio(fuente, 'codigo', t)
    if (f) return goTo(String(f.codigo))
    setError(`No existe ${que} ${t}`)
  }

  function busqueda(cual: 'codigo' | 'nombre') {
    const campo = cual === 'codigo' ? 'codigo' : campoNombre
    return {
      onBuscar: async (t: string) => {
        setError(null)
        if (campo === 'codigo') return porCodigo(t)
        const f = await gwBuscarPorInicio(fuente, campo, t)
        if (f) goTo(String(f.codigo))
        else setError(`No existe ${que} que empiece por «${t}»`)
      },
      onLista: consulta
        ? (texto: string | null) => listaOrd.abrir(def(campo), { texto, ancla: actual || null, onPick: (f) => goTo(String(f.codigo)) })
        : undefined,
    }
  }

  return { busqueda, dialogo: listaOrd.dialogo }
}

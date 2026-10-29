// Colores de las pantallas (Archivo → Parámetros → Colores de pantallas). Cada opción del menú
// (o un menú o submenú entero) puede llevar un color de la PALETA; la ventana de esa pantalla toma
// su fondo suave y su barra de título. Una opción sin color propio toma el de su submenú o menú,
// y si ninguno tiene, la ventana se queda en el gris de siempre.
//
// Se guarda como parámetro general «apariencia.colores»: { [id del nodo]: clave de la paleta }.
// Id del nodo: la ruta de la opción («/clientes») o «menu:» + su camino («menu:Ventas › Listados»).
// Por defecto (mientras no se toque): los colores de las secciones de siempre (secciones.ts).

import { MENUS, type MenuEntry } from '../components/shell/menus'
import { seccionDe, type Seccion } from '../components/shell/secciones'

export interface ColorPaleta {
  clave: string
  nombre: string
  /** Fondo de la ventana. */
  fondo: string
  /** Degradado de la barra de título. */
  t1: string
  t2: string
  /** Color vivo (muestras e iconos). */
  vivo: string
}

export const PALETA: ColorPaleta[] = [
  { clave: 'clientes', nombre: 'Amarillo mantequilla', fondo: '#fdf3cf', t1: '#f7e08a', t2: '#efcf5e', vivo: '#c49a0a' },
  { clave: 'pedidos', nombre: 'Verde menta', fondo: '#dff3e4', t1: '#b5e3c1', t2: '#93d4a5', vivo: '#2e8b4f' },
  { clave: 'articulos', nombre: 'Verde claro', fondo: '#eaf6d6', t1: '#cfe9a6', t2: '#b9de82', vivo: '#6a9a1f' },
  { clave: 'ventas', nombre: 'Turquesa', fondo: '#d6f1f1', t1: '#a6dedd', t2: '#82cfcd', vivo: '#1a8a88' },
  { clave: 'cielo', nombre: 'Azul cielo', fondo: '#dcecf9', t1: '#b3d4f1', t2: '#93c1ea', vivo: '#2f7fc1' },
  { clave: 'compras', nombre: 'Azul', fondo: '#dfe7f5', t1: '#b9cbea', t2: '#9bb4e0', vivo: '#2b5ea8' },
  { clave: 'indigo', nombre: 'Índigo', fondo: '#e3e6f8', t1: '#c0c7ef', t2: '#a5afe6', vivo: '#4656b8' },
  { clave: 'pagos', nombre: 'Lavanda', fondo: '#ece4f7', t1: '#d2c2ee', t2: '#bba5e4', vivo: '#7e57c2' },
  { clave: 'rosa', nombre: 'Rosa', fondo: '#f9e3ee', t1: '#f0bcd6', t2: '#e79cc0', vivo: '#c2407e' },
  { clave: 'facturacion', nombre: 'Coral', fondo: '#fbe1dc', t1: '#f4b9ad', t2: '#ee9f8f', vivo: '#d0503a' },
  { clave: 'traspasos', nombre: 'Melocotón', fondo: '#fde7d2', t1: '#f8c99c', t2: '#f3b276', vivo: '#e07b1a' },
  { clave: 'arena', nombre: 'Arena', fondo: '#f1e4d8', t1: '#ddc0a3', t2: '#cfa985', vivo: '#9a6235' },
  { clave: 'caja', nombre: 'Gris perla', fondo: '#e8e8ee', t1: '#cdcdd8', t2: '#b6b6c6', vivo: '#5d6d7e' },
  { clave: 'oliva', nombre: 'Oliva', fondo: '#eef0d8', t1: '#d9ddaa', t2: '#c6cc85', vivo: '#7a8020' },
]

export const PALETA_POR_CLAVE: Record<string, ColorPaleta> = Object.fromEntries(PALETA.map((c) => [c.clave, c]))

export type MapaColores = Record<string, string>

export interface NodoMenu {
  id: string
  etiqueta: string
  nivel: number
  ruta: string | null
  /** Ids de los nodos que lo contienen, del más cercano al más lejano. */
  padres: string[]
  hijos: NodoMenu[]
}

const limpiar = (to: string) => to.split(/[?#]/)[0].replace(/\/nuevo$/, '')

/** Árbol del menú principal (Archivo, Edición, Clientes…) con sus opciones y submenús. */
export function arbolMenus(): NodoMenu[] {
  const vistos = new Set<string>()
  const recorrer = (entradas: MenuEntry[], camino: string[], padres: string[], nivel: number): NodoMenu[] => {
    const out: NodoMenu[] = []
    for (const e of entradas) {
      if (e === 'sep') continue
      const caminoE = [...camino, e.label]
      if (e.children?.length) {
        const id = `menu:${caminoE.join(' › ')}`
        out.push({ id, etiqueta: e.label, nivel, ruta: null, padres, hijos: recorrer(e.children, caminoE, [id, ...padres], nivel + 1) })
      } else if (e.to) {
        const ruta = limpiar(e.to)
        if (vistos.has(ruta)) continue
        vistos.add(ruta)
        out.push({ id: ruta, etiqueta: e.label, nivel, ruta, padres, hijos: [] })
      }
    }
    return out
  }
  return MENUS.map((m) => {
    const id = `menu:${m.label}`
    return { id, etiqueta: m.label, nivel: 0, ruta: null, padres: [], hijos: recorrer(m.items, [m.label], [id], 1) }
  }).filter((n) => n.hijos.length > 0)
}

let cacheArbol: NodoMenu[] | null = null
let cachePlano: NodoMenu[] | null = null
function plano(): NodoMenu[] {
  if (!cachePlano) {
    cacheArbol = arbolMenus()
    const out: NodoMenu[] = []
    const ir = (ns: NodoMenu[]) => ns.forEach((n) => (out.push(n), ir(n.hijos)))
    ir(cacheArbol)
    cachePlano = out
  }
  return cachePlano
}

/** Colores de partida: los de las secciones de siempre, puestos en cada opción de esas secciones. */
export function coloresPorDefecto(): MapaColores {
  const m: MapaColores = {}
  for (const n of plano()) {
    if (!n.ruta) continue
    const s: Seccion | null = seccionDe(n.ruta)
    if (s) m[n.id] = s
  }
  return m
}

/** Color de la pantalla abierta: el de su opción de menú o, si no tiene, el de su submenú o menú. */
export function colorDePantalla(pathname: string, mapa: MapaColores): ColorPaleta | null {
  const ruta = (pathname || '/').replace(/(.)\/+$/, '$1')
  let mejor: NodoMenu | null = null
  for (const n of plano()) {
    if (!n.ruta || n.ruta === '/') continue
    if ((ruta === n.ruta || ruta.startsWith(n.ruta + '/')) && (!mejor || n.ruta!.length > mejor.ruta!.length)) mejor = n
  }
  if (!mejor) return null
  for (const id of [mejor.id, ...mejor.padres]) {
    const c = mapa[id]
    if (c && PALETA_POR_CLAVE[c]) return PALETA_POR_CLAVE[c]
  }
  return null
}

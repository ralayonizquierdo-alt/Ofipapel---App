import { wc, type WcProducto } from '../../lib/woocommerce'
import { compararCatalogo, indexarArticulos, type DiferenciaCatalogo, type FamiliaCruce } from '../../lib/webMapeo'
import { cargarArticulos, cargarConfigWeb, cargarFamilias, cargarStock, type ArticuloWeb } from './comun'

export interface Catalogo {
  productos: WcProducto[]
  arts: ArticuloWeb[]
  familias: (FamiliaCruce & { web_publicada: boolean | null })[]
  stock: Map<string, number>
  difs: DiferenciaCatalogo[]
  truncado: boolean
  almacen: string | null
}

/** Trae todo el catálogo de la web (tope 3.000) y lo cruza con los artículos del ERP. */
export async function cargarCatalogo(almacen?: string | null): Promise<Catalogo> {
  const cfg = await cargarConfigWeb()
  const alm = almacen === undefined ? cfg.almacen_codigo : almacen
  const r = await wc.todos<WcProducto>('products', { status: 'any', orderby: 'id', order: 'asc' }, 30)
  const [{ arts, barras }, familias, stock] = await Promise.all([cargarArticulos(), cargarFamilias(), cargarStock(alm)])
  const ix = indexarArticulos(arts, barras)
  const fams = new Map(familias.map((f) => [f.codigo, f]))
  return { productos: r.data ?? [], arts, familias, stock, difs: compararCatalogo(r.data ?? [], arts, ix, stock, fams), truncado: !!r.truncado, almacen: alm }
}

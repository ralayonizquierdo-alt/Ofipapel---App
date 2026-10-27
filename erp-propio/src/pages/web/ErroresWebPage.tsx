import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DoorOpen, FileDown, Globe, RefreshCw } from 'lucide-react'
import { wc, type WcProducto } from '../../lib/woocommerce'
import { descargarCsv, normalizar } from '../../lib/webMapeo'
import { cargarArticulos, cargarConfigWeb, cargarStock, eur, Nota, Tabla, WebError, type ArticuloWeb, type Col } from './comun'

export interface ErrorWeb {
  clave: string
  origen: 'ERP' | 'Web'
  codigo: string
  descripcion: string
  error: string
  detalle: string
  articulo: string | null
}

const TIPOS = ['Sin imagen', 'Sin descripción web', 'Publicado sin stock', 'Sin precio', 'SKU duplicado', 'Sin SKU'] as const

/** Errores de los artículos marcados «publicar en web» en el ERP. */
export function erroresErp(arts: ArticuloWeb[], stock: Map<string, number>): ErrorWeb[] {
  const pub = arts.filter((a) => a.web_publicado && a.activo !== false)
  const out: ErrorWeb[] = []
  const add = (a: ArticuloWeb, error: string, detalle = '') =>
    out.push({ clave: `e${a.codigo_interno}${error}`, origen: 'ERP', codigo: a.codigo_interno, descripcion: a.web_descripcion || a.descripcion, error, detalle, articulo: a.codigo_interno })
  const sku = new Map<string, ArticuloWeb[]>()
  for (const a of pub) {
    if (!a.imagen_url && !a.web_sin_imagen) add(a, 'Sin imagen')
    if (!(a.web_descripcion ?? '').trim() && !(a.web_observaciones ?? '').trim() && !a.web_sin_observaciones) add(a, 'Sin descripción web', 'Ni descripción web ni texto largo')
    const s = stock.get(a.codigo_interno) ?? 0
    if (!a.sin_control_stock && s <= 0) add(a, 'Publicado sin stock', `Stock ${s}`)
    if (!(Number(a.pvp) > 0)) add(a, 'Sin precio', `PVP ${a.pvp ?? 'vacío'}`)
    const k = (a.codigo_venta || a.codigo_interno).trim().toUpperCase()
    sku.set(k, [...(sku.get(k) ?? []), a])
    const b = (a.codigo_barras_principal ?? '').trim()
    if (b) sku.set(`#${b}`, [...(sku.get(`#${b}`) ?? []), a])
  }
  for (const [k, lista] of sku) {
    if (lista.length < 2) continue
    for (const a of lista) add(a, 'SKU duplicado', `${k.startsWith('#') ? 'Código de barras' : 'Código de venta'} ${k.replace('#', '')} en ${lista.map((x) => x.codigo_interno).join(', ')}`)
  }
  return out
}

/** Errores de los productos tal como están en la web. */
export function erroresWeb(productos: WcProducto[]): ErrorWeb[] {
  const out: ErrorWeb[] = []
  const add = (p: WcProducto, error: string, detalle = '') =>
    out.push({ clave: `w${p.id}${error}`, origen: 'Web', codigo: p.sku || `id ${p.id}`, descripcion: p.name, error, detalle, articulo: null })
  const porSku = new Map<string, WcProducto[]>()
  for (const p of productos) {
    if (p.status && p.status !== 'publish') continue
    if (!p.images?.length) add(p, 'Sin imagen')
    if (!normalizar(p.description) && !normalizar(p.short_description)) add(p, 'Sin descripción web')
    if (p.stock_status === 'outofstock') add(p, 'Publicado sin stock', p.manage_stock ? `Stock ${p.stock_quantity ?? 0}` : 'Marcado «sin existencias»')
    if (p.type !== 'variable' && !(Number(p.price) > 0)) add(p, 'Sin precio', `Precio «${p.price ?? ''}»`)
    const k = (p.sku ?? '').trim().toUpperCase()
    if (!k && p.type !== 'variable') add(p, 'Sin SKU', 'No se puede cruzar con el ERP')
    if (k) porSku.set(k, [...(porSku.get(k) ?? []), p])
  }
  for (const [k, lista] of porSku) if (lista.length > 1) for (const p of lista) add(p, 'SKU duplicado', `SKU ${k} en ${lista.length} productos (ids ${lista.map((x) => x.id).join(', ')})`)
  return out
}

/** Web → Artículos con Errores Web. */
export function ErroresWebPage() {
  const navigate = useNavigate()
  const [erp, setErp] = useState<ErrorWeb[] | null>(null)
  const [web, setWeb] = useState<ErrorWeb[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [cargando, setCargando] = useState(false)
  const [tipo, setTipo] = useState('')
  const [origen, setOrigen] = useState('')
  const [sel, setSel] = useState(0)
  const [precios, setPrecios] = useState<Map<string, number | null>>(new Map())

  async function cargarErp() {
    setCargando(true)
    setError(null)
    try {
      const cfg = await cargarConfigWeb()
      const [{ arts }, stock] = await Promise.all([cargarArticulos(), cargarStock(cfg.almacen_codigo)])
      setPrecios(new Map(arts.map((a) => [a.codigo_interno, a.pvp])))
      setErp(erroresErp(arts, stock))
    } catch (e) {
      setError(e)
    }
    setCargando(false)
  }

  async function cargarWeb() {
    setCargando(true)
    setError(null)
    try {
      const r = await wc.todos<WcProducto>('products', { status: 'publish' }, 30)
      setWeb(erroresWeb(r.data ?? []))
    } catch (e) {
      setError(e)
    }
    setCargando(false)
  }

  useEffect(() => {
    cargarErp()
  }, [])

  const todos = useMemo(() => [...(erp ?? []), ...(web ?? [])], [erp, web])
  const filas = useMemo(() => todos.filter((e) => (!tipo || e.error === tipo) && (!origen || e.origen === origen)), [todos, tipo, origen])

  const cols: Col<ErrorWeb>[] = useMemo(
    () => [
      { key: 'origen', label: 'Origen', width: 60, value: (e) => e.origen },
      { key: 'codigo', label: 'Código / SKU', width: 130, value: (e) => e.codigo },
      { key: 'desc', label: 'Descripción', width: 360, value: (e) => e.descripcion },
      { key: 'error', label: 'Error', width: 165, value: (e) => e.error, cellStyle: () => ({ color: '#8a1c1c', fontWeight: 700 }) },
      { key: 'detalle', label: 'Detalle', width: 330, value: (e) => e.detalle },
      { key: 'pvp', label: 'PVP ERP', width: 80, align: 'right', value: (e) => (e.articulo ? precios.get(e.articulo) ?? null : null), render: (e) => (e.articulo ? eur(precios.get(e.articulo)) : '') },
    ],
    [precios],
  )

  const actual = filas[sel]

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-[13px]">
      <div className="flex flex-none flex-wrap items-center gap-2">
        <span className="gw-label">Error:</span>
        <select className="gw-input w-[190px]! flex-none" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos ({todos.length})</option>
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {t} ({todos.filter((e) => e.error === t).length})
            </option>
          ))}
        </select>
        <span className="gw-label">Origen:</span>
        <select className="gw-input w-[110px]! flex-none" value={origen} onChange={(e) => setOrigen(e.target.value)}>
          <option value="">ERP y web</option>
          <option value="ERP">ERP</option>
          <option value="Web">Web</option>
        </select>
        <button type="button" className="gw-btn" onClick={cargarErp} disabled={cargando}>
          <RefreshCw size={14} /> Revisar el ERP
        </button>
        <button type="button" className="gw-btn" onClick={cargarWeb} disabled={cargando}>
          <Globe size={14} /> {web ? 'Revisar la web otra vez' : 'Revisar también la web'}
        </button>
        <button
          type="button"
          className="gw-btn"
          disabled={!filas.length}
          onClick={() => descargarCsv(`articulos-errores-web-${new Date().toISOString().slice(0, 10)}.csv`, cols.map((c) => c.label), filas.map((e) => cols.map((c) => c.value(e))))}
        >
          <FileDown size={14} /> Exportar CSV
        </button>
      </div>
      <WebError error={error} />
      <Nota>
        ERP: artículos activos marcados «publicar en web» (sin imagen salvo «Web sin imagen», sin descripción web ni texto largo, sin stock en el almacén de la
        web, sin PVP, código de venta o de barras repetido). Web: productos publicados {web ? `(${web.length} errores)` : '(pulsa «Revisar también la web»)'}.
      </Nota>
      <Tabla rows={filas} cols={cols} rowKey={(e) => e.clave} sel={sel} onSel={setSel} vacio={erp ? 'Sin errores.' : 'Revisando…'} onOpen={(e) => e.articulo && navigate(`/articulos/${encodeURIComponent(e.articulo)}`)} />
      <div className="flex flex-none items-center gap-2">
        <button type="button" className="gw-btn" disabled={!actual?.articulo} onClick={() => actual?.articulo && navigate(`/articulos/${encodeURIComponent(actual.articulo)}`)}>
          Abrir artículo
        </button>
        <span className="text-[12px] text-[#555]">{filas.length} errores</span>
        <button type="button" className="gw-btn ml-auto" onClick={() => navigate('/')}>
          <DoorOpen size={14} /> Salir
        </button>
      </div>
    </div>
  )
}

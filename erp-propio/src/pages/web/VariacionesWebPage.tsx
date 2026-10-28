import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DoorOpen, FileDown, ListTree, RefreshCw } from 'lucide-react'
import { wc, type WcProducto, type WcVariacion } from '../../lib/woocommerce'
import { buscarPorSku, descargarCsv, indexarArticulos, type IndiceArticulos } from '../../lib/webMapeo'
import { BotonPendiente, cargarArticulos, cargarConfigWeb, cargarStock, DIF, ESTILO_FALTA, eur, Nota, Tabla, WebError, type ArticuloWeb, type Col } from './comun'

interface Erp {
  ix: IndiceArticulos
  porCodigo: Map<string, ArticuloWeb>
  stock: Map<string, number>
  almacen: string | null
}

interface FilaVar {
  v: WcVariacion
  a: ArticuloWeb | null
  stockErp: number | null
}

const atributos = (v: WcVariacion) => (v.attributes ?? []).map((x) => `${x.name}: ${x.option}`).join(' · ')
const stockWeb = (v: { manage_stock?: boolean | 'parent'; stock_quantity?: number | null; stock_status?: string }) =>
  v.manage_stock && v.stock_quantity != null ? String(v.stock_quantity) : v.stock_status === 'instock' ? 'En stock' : v.stock_status === 'outofstock' ? 'Agotado' : v.stock_status === 'onbackorder' ? 'Bajo pedido' : ''

/** Web → Variaciones: productos variables de la web y sus variaciones (atributos, SKU, precio, stock), con su artículo del ERP. */
export function VariacionesWebPage() {
  const navigate = useNavigate()
  const [productos, setProductos] = useState<WcProducto[] | null>(null)
  const [erp, setErp] = useState<Erp | null>(null)
  const [vars, setVars] = useState<Map<number, WcVariacion[]>>(new Map())
  const [error, setError] = useState<unknown>(null)
  const [errorVar, setErrorVar] = useState<unknown>(null)
  const [cargando, setCargando] = useState(false)
  const [leyendoTodas, setLeyendoTodas] = useState<string | null>(null)
  const [sel, setSel] = useState(0)
  const [selV, setSelV] = useState(0)

  async function cargar() {
    setCargando(true)
    setError(null)
    setVars(new Map())
    try {
      const cfg = await cargarConfigWeb()
      const [r, { arts, barras }, stock] = await Promise.all([
        wc.todos<WcProducto>('products', { type: 'variable', status: 'any', orderby: 'title', order: 'asc' }, 10),
        cargarArticulos(),
        cargarStock(cfg.almacen_codigo),
      ])
      setErp({ ix: indexarArticulos(arts, barras), porCodigo: new Map(arts.map((a) => [a.codigo_interno, a])), stock, almacen: cfg.almacen_codigo })
      setProductos(r.data ?? [])
    } catch (e) {
      setError(e)
      setProductos([])
    }
    setCargando(false)
  }
  useEffect(() => {
    cargar()
  }, [])

  const actual = productos?.[sel]
  // Variaciones del producto seleccionado: se leen al elegirlo y se guardan (caché de la ventana).
  useEffect(() => {
    if (!actual || vars.has(actual.id)) return
    let vivo = true
    setErrorVar(null)
    wc.todos<WcVariacion>(`products/${actual.id}/variations`, {}, 5)
      .then((r) => vivo && setVars((m) => new Map(m).set(actual.id, r.data ?? [])))
      .catch((e) => vivo && setErrorVar(e))
    return () => {
      vivo = false
    }
  }, [actual, vars])

  async function leerTodas() {
    if (!productos) return
    setErrorVar(null)
    const m = new Map(vars)
    try {
      for (let i = 0; i < productos.length; i++) {
        const p = productos[i]
        if (m.has(p.id)) continue
        setLeyendoTodas(`${i + 1} / ${productos.length}`)
        m.set(p.id, (await wc.todos<WcVariacion>(`products/${p.id}/variations`, {}, 5)).data ?? [])
      }
    } catch (e) {
      setErrorVar(e)
    }
    setVars(m)
    setLeyendoTodas(null)
  }

  function cruzar(p: WcProducto, v: WcVariacion): FilaVar {
    const h = erp ? buscarPorSku(erp.ix, v.sku, p.id, v.id) : null
    const a = h ? (erp!.porCodigo.get(h.articulo.codigo_interno) ?? null) : null
    return { v, a, stockErp: a ? (erp!.stock.get(a.codigo_interno) ?? 0) : null }
  }

  const sinErp = (p: WcProducto) => (vars.get(p.id) ?? []).filter((v) => !cruzar(p, v).a).length
  const colsP: Col<WcProducto>[] = [
    { key: 'sku', label: 'SKU', width: 100, value: (p) => p.sku ?? '' },
    { key: 'nombre', label: 'Producto variable', width: 300, value: (p) => p.name },
    { key: 'estado', label: 'Estado', width: 80, value: (p) => (p.status === 'publish' ? 'Publicado' : (p.status ?? '')) },
    { key: 'atr', label: 'Atributos', width: 330, value: (p) => (p.attributes ?? []).map((a) => `${a.name} (${a.options?.length ?? 0})`).join(' · ') },
    { key: 'nv', label: 'Variac.', width: 60, align: 'right', value: (p) => p.variations?.length ?? 0 },
    {
      key: 'sinerp',
      label: 'Sin artículo ERP',
      width: 110,
      align: 'right',
      value: (p) => (vars.has(p.id) ? sinErp(p) : null),
      render: (p) => (vars.has(p.id) ? String(sinErp(p)) : '—'),
      cellStyle: (p) => (vars.has(p.id) && sinErp(p) ? ESTILO_FALTA : undefined),
      title: 'Se calcula al leer las variaciones del producto',
    },
  ]
  const filasV: FilaVar[] = useMemo(() => (actual ? (vars.get(actual.id) ?? []).map((v) => cruzar(actual, v)) : []), [actual, vars, erp]) // eslint-disable-line react-hooks/exhaustive-deps
  const colsV: Col<FilaVar>[] = [
    { key: 'id', label: 'ID', width: 65, align: 'right', value: (f) => f.v.id },
    { key: 'atr', label: 'Atributos', width: 260, value: (f) => atributos(f.v) },
    { key: 'sku', label: 'SKU', width: 100, value: (f) => f.v.sku ?? '' },
    { key: 'precio', label: 'Precio web', width: 80, align: 'right', value: (f) => Number(f.v.regular_price || f.v.price || 0), render: (f) => eur(Number(f.v.regular_price || f.v.price || 0)) },
    { key: 'oferta', label: 'Oferta', width: 70, align: 'right', value: (f) => (f.v.sale_price ? Number(f.v.sale_price) : null), render: (f) => (f.v.sale_price ? eur(Number(f.v.sale_price)) : '') },
    { key: 'stock', label: 'Stock web', width: 85, align: 'right', value: (f) => stockWeb(f.v) },
    { key: 'art', label: 'Artículo ERP', width: 95, value: (f) => f.a?.codigo_interno ?? '', cellStyle: (f) => (f.a ? undefined : ESTILO_FALTA) },
    { key: 'pvp', label: 'PVP ERP', width: 75, align: 'right', value: (f) => (f.a?.pvp == null ? null : Number(f.a.pvp)), render: (f) => eur(f.a?.pvp) },
    {
      key: 'se',
      label: 'Stock ERP',
      width: 75,
      align: 'right',
      value: (f) => f.stockErp,
      cellStyle: (f) => (f.v.manage_stock === true && f.stockErp != null && f.v.stock_quantity != null && f.stockErp !== f.v.stock_quantity ? DIF : undefined),
    },
  ]
  const actualV = filasV[selV]

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-[13px]">
      <div className="flex flex-none flex-wrap items-center gap-2">
        <button type="button" className="gw-btn" onClick={cargar} disabled={cargando}>
          <RefreshCw size={14} /> {cargando ? 'Leyendo la web…' : 'Actualizar'}
        </button>
        <button type="button" className="gw-btn" onClick={leerTodas} disabled={!productos?.length || !!leyendoTodas}>
          <ListTree size={14} /> {leyendoTodas ? `Leyendo variaciones ${leyendoTodas}…` : 'Leer todas las variaciones'}
        </button>
        <button
          type="button"
          className="gw-btn"
          disabled={!vars.size}
          onClick={() => {
            const filas = (productos ?? []).flatMap((p) => (vars.get(p.id) ?? []).map((v) => ({ p, f: cruzar(p, v) })))
            descargarCsv(
              'variaciones-web.csv',
              ['Producto', ...colsV.map((c) => c.label)],
              filas.map(({ p, f }) => [p.name, ...colsV.map((c) => c.value(f))]),
            )
          }}
        >
          <FileDown size={14} /> CSV de lo leído
        </button>
        {productos && <span className="text-[12px] text-[#555]">{productos.length} {productos.length === 1 ? 'producto variable' : 'productos variables'}{erp?.almacen ? ` · stock ERP del almacén ${erp.almacen}` : ''}</span>}
      </div>
      <WebError error={error} />
      <Nota>
        Las variaciones de cada producto se leen al seleccionarlo (y quedan guardadas mientras la ventana esté abierta). Cada variación se cruza con el ERP por SKU o
        por su código web.
      </Nota>
      <Tabla rows={productos ?? []} cols={colsP} rowKey={(p) => String(p.id)} sel={sel} onSel={(i) => (setSel(i), setSelV(0))} vacio={error ? 'Sin datos de la web.' : productos ? 'No hay productos variables en la web.' : 'Cargando…'} />
      <WebError error={errorVar} />
      <div className="flex min-h-0 flex-1 flex-col gap-1">
        <span className="gw-label flex-none">{actual ? `Variaciones de «${actual.name}»:` : 'Variaciones:'}</span>
        <Tabla
          rows={filasV}
          cols={colsV}
          rowKey={(f) => String(f.v.id)}
          sel={selV}
          onSel={setSelV}
          vacio={!actual ? 'Selecciona un producto.' : vars.has(actual.id) ? 'Sin variaciones.' : 'Cargando…'}
          onOpen={(f) => f.a && navigate(`/articulos/${encodeURIComponent(f.a.codigo_interno)}`)}
        />
      </div>
      <div className="flex flex-none items-center gap-2">
        <button type="button" className="gw-btn" disabled={!actualV?.a} onClick={() => actualV?.a && navigate(`/articulos/${encodeURIComponent(actualV.a.codigo_interno)}`)}>
          Abrir artículo
        </button>
        <BotonPendiente>Crear o modificar variaciones en la web</BotonPendiente>
        <button type="button" className="gw-btn ml-auto" onClick={() => navigate('/')}>
          <DoorOpen size={14} /> Salir
        </button>
      </div>
    </div>
  )
}

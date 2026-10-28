import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DoorOpen, FileDown, RefreshCw } from 'lucide-react'
import type { WcProducto } from '../../lib/woocommerce'
import { buscarPorSku, descargarCsv, indexarArticulos } from '../../lib/webMapeo'
import { BotonPendiente, ESTILO_FALTA, Nota, Tabla, WebError, type ArticuloWeb, type Col } from './comun'
import { cargarCatalogo, type Catalogo } from './catalogo'

interface Fila {
  p: WcProducto
  a: ArticuloWeb | null
  upsells: number[]
  cross: number[]
  problemas: number
}

interface FilaRel {
  clave: string
  tipo: string
  id: number
  p: WcProducto | undefined
  a: ArticuloWeb | null
  aviso: string
}

/** Web → Productos Relacionados: ventas dirigidas (upsells) y ventas cruzadas (cross-sells) de cada producto (solo lectura). */
export function RelacionadosWebPage() {
  const navigate = useNavigate()
  const [cat, setCat] = useState<Catalogo | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [cargando, setCargando] = useState(false)
  const [soloCon, setSoloCon] = useState(true)
  const [sel, setSel] = useState(0)
  const [selR, setSelR] = useState(0)

  async function cargar() {
    setCargando(true)
    setError(null)
    try {
      setCat(await cargarCatalogo())
    } catch (e) {
      setError(e)
    }
    setCargando(false)
  }
  useEffect(() => {
    cargar()
  }, [])

  const { porId, artDe } = useMemo(() => {
    const porId = new Map((cat?.productos ?? []).map((p) => [p.id, p]))
    const ix = indexarArticulos(cat?.arts ?? [])
    const porCodigo = new Map((cat?.arts ?? []).map((a) => [a.codigo_interno, a]))
    const artDe = (p: WcProducto) => {
      const h = buscarPorSku(ix, p.sku, p.id)
      return h ? (porCodigo.get(h.articulo.codigo_interno) ?? null) : null
    }
    return { porId, artDe }
  }, [cat])

  const avisoDe = (id: number) => {
    const r = porId.get(id)
    if (!r) return 'No está en el catálogo leído'
    if (r.status && r.status !== 'publish') return 'No publicado'
    if (r.stock_status === 'outofstock') return 'Agotado'
    return ''
  }

  const filas: Fila[] = useMemo(() => {
    const out: Fila[] = []
    for (const p of cat?.productos ?? []) {
      const upsells = p.upsell_ids ?? []
      const cross = p.cross_sell_ids ?? []
      if (soloCon && !upsells.length && !cross.length) continue
      out.push({ p, a: artDe(p), upsells, cross, problemas: [...upsells, ...cross].filter((id) => avisoDe(id)).length })
    }
    return out
  }, [cat, soloCon, artDe]) // eslint-disable-line react-hooks/exhaustive-deps

  const nombres = (ids: number[]) => ids.map((id) => porId.get(id)?.name ?? `#${id}`).join(' · ')
  const cols: Col<Fila>[] = [
    { key: 'sku', label: 'SKU', width: 100, value: (f) => f.p.sku ?? '' },
    { key: 'art', label: 'Artículo', width: 90, value: (f) => f.a?.codigo_interno ?? '' },
    { key: 'nombre', label: 'Producto', width: 250, value: (f) => f.p.name },
    { key: 'nu', label: 'Dirigidas', width: 65, align: 'right', value: (f) => f.upsells.length, title: 'Ventas dirigidas (upsells): se ofrecen en la ficha del producto' },
    { key: 'nc', label: 'Cruzadas', width: 65, align: 'right', value: (f) => f.cross.length, title: 'Ventas cruzadas (cross-sells): se ofrecen en el carrito' },
    { key: 'prob', label: 'Con aviso', width: 70, align: 'right', value: (f) => f.problemas, render: (f) => (f.problemas ? String(f.problemas) : ''), cellStyle: (f) => (f.problemas ? ESTILO_FALTA : undefined) },
    { key: 'lu', label: 'Ventas dirigidas', width: 260, value: (f) => nombres(f.upsells) },
    { key: 'lc', label: 'Ventas cruzadas', width: 260, value: (f) => nombres(f.cross) },
  ]
  const actual = filas[sel]
  const filasR: FilaRel[] = actual
    ? [
        ...actual.upsells.map((id) => ({ clave: `u${id}`, tipo: 'Venta dirigida', id })),
        ...actual.cross.map((id) => ({ clave: `c${id}`, tipo: 'Venta cruzada', id })),
      ].map((r) => {
        const p = porId.get(r.id)
        return { ...r, p, a: p ? artDe(p) : null, aviso: avisoDe(r.id) }
      })
    : []
  const colsR: Col<FilaRel>[] = [
    { key: 'tipo', label: 'Tipo', width: 110, value: (r) => r.tipo },
    { key: 'id', label: 'ID web', width: 65, align: 'right', value: (r) => r.id },
    { key: 'sku', label: 'SKU', width: 100, value: (r) => r.p?.sku ?? '' },
    { key: 'nombre', label: 'Producto relacionado', width: 300, value: (r) => r.p?.name ?? '' },
    { key: 'art', label: 'Artículo ERP', width: 95, value: (r) => r.a?.codigo_interno ?? '' },
    { key: 'aviso', label: 'Aviso', width: 190, value: (r) => r.aviso, cellStyle: (r) => (r.aviso ? ESTILO_FALTA : undefined) },
  ]
  const actualR = filasR[selR]

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-[13px]">
      <div className="flex flex-none flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={soloCon} onChange={(e) => setSoloCon(e.target.checked)} /> Solo productos con relacionados
        </label>
        <button type="button" className="gw-btn" onClick={cargar} disabled={cargando}>
          <RefreshCw size={14} /> {cargando ? 'Leyendo la web…' : 'Actualizar'}
        </button>
        <button type="button" className="gw-btn" disabled={!filas.length} onClick={() => descargarCsv('relacionados-web.csv', cols.map((c) => c.label), filas.map((r) => cols.map((c) => c.value(r))))}>
          <FileDown size={14} /> Exportar CSV
        </button>
      </div>
      <WebError error={error} />
      <Nota>
        Ventas dirigidas (se ofrecen en la ficha del producto) y ventas cruzadas (en el carrito). «Con aviso»: relacionados no publicados, agotados o que ya no
        están en el catálogo.
      </Nota>
      <Tabla rows={filas} cols={cols} rowKey={(f) => String(f.p.id)} sel={sel} onSel={(i) => (setSel(i), setSelR(0))} vacio={cat ? 'Ningún producto tiene relacionados.' : error ? 'Sin datos de la web.' : 'Cargando…'} />
      <div className="flex h-[170px] flex-none flex-col gap-1">
        <span className="gw-label">{actual ? `Relacionados de «${actual.p.name}»:` : 'Relacionados:'}</span>
        <Tabla rows={filasR} cols={colsR} rowKey={(r) => r.clave} sel={selR} onSel={setSelR} vacio={actual ? 'Sin relacionados.' : 'Selecciona un producto.'} className="min-h-0!" onOpen={(r) => r.a && navigate(`/articulos/${encodeURIComponent(r.a.codigo_interno)}`)} />
      </div>
      <div className="flex flex-none items-center gap-2">
        <button type="button" className="gw-btn" disabled={!actual?.a} onClick={() => actual?.a && navigate(`/articulos/${encodeURIComponent(actual.a.codigo_interno)}`)}>
          Abrir artículo
        </button>
        <button type="button" className="gw-btn" disabled={!actualR?.a} onClick={() => actualR?.a && navigate(`/articulos/${encodeURIComponent(actualR.a.codigo_interno)}`)}>
          Abrir relacionado
        </button>
        <BotonPendiente>Guardar relacionados en la web</BotonPendiente>
        <button type="button" className="gw-btn ml-auto" onClick={() => navigate('/')}>
          <DoorOpen size={14} /> Salir
        </button>
      </div>
    </div>
  )
}

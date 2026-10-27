import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DoorOpen, FileDown, RefreshCw } from 'lucide-react'
import { buscarPorSku, descargarCsv, indexarArticulos, r2 } from '../../lib/webMapeo'
import { fechaEs } from '../ventas/gestores/comun'
import { BotonPendiente, DIF, eur, Nota, Tabla, WebError, type Col } from './comun'
import { cargarCatalogo, type Catalogo } from './catalogo'

interface Fila {
  clave: string
  sku: string
  articulo: string
  nombre: string
  regularWeb: number | null
  ofertaWeb: number | null
  ofertaWebDesde: string | null
  ofertaWebHasta: string | null
  pvp: number | null
  pvpIgic: number | null
  ofertaErp: number | null
  ofertaErpDesde: string | null
  ofertaErpHasta: string | null
  difPrecio: boolean
  difOferta: boolean
}

const n = (v: string | undefined | null) => (v ? Number(v) : null)

/** Web → Precios Web: compara precio y ofertas con fecha de la web con los del ERP (solo lectura). */
export function PreciosWebPage() {
  const navigate = useNavigate()
  const [cat, setCat] = useState<Catalogo | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [cargando, setCargando] = useState(false)
  const [soloDif, setSoloDif] = useState(true)
  const [sel, setSel] = useState(0)

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

  const filas: Fila[] = useMemo(() => {
    if (!cat) return []
    const ix = indexarArticulos(cat.arts)
    const porCodigo = new Map(cat.arts.map((a) => [a.codigo_interno, a]))
    const out: Fila[] = []
    for (const p of cat.productos) {
      const h = buscarPorSku(ix, p.sku, p.id)
      if (!h) continue
      const a = porCodigo.get(h.articulo.codigo_interno)!
      const pvp = a.pvp == null ? null : Number(a.pvp)
      const pvpIgic = pvp == null ? null : r2(pvp * (1 + Number(a.igic_pct ?? 0) / 100))
      const regular = n(p.regular_price)
      const oferta = n(p.sale_price)
      const ofErp = a.precio_oferta == null || !Number(a.precio_oferta) ? null : Number(a.precio_oferta)
      const ofErpIgic = ofErp == null ? null : r2(ofErp * (1 + Number(a.igic_pct ?? 0) / 100))
      const igual = (x: number | null, y: number | null, z: number | null) => x == null || (y != null && Math.abs(x - y) < 0.01) || (z != null && Math.abs(x - z) < 0.01)
      out.push({
        clave: `${p.id}`,
        sku: p.sku ?? '',
        articulo: a.codigo_interno,
        nombre: p.name,
        regularWeb: regular,
        ofertaWeb: oferta,
        ofertaWebDesde: p.date_on_sale_from ?? null,
        ofertaWebHasta: p.date_on_sale_to ?? null,
        pvp,
        pvpIgic,
        ofertaErp: ofErp,
        ofertaErpDesde: a.oferta_fecha_desde,
        ofertaErpHasta: a.oferta_fecha_hasta,
        difPrecio: !igual(regular, pvp, pvpIgic),
        difOferta: (oferta == null) !== (ofErp == null) || !igual(oferta, ofErp, ofErpIgic) || (oferta != null && (p.date_on_sale_to ?? '').slice(0, 10) !== (a.oferta_fecha_hasta ?? '')),
      })
    }
    return soloDif ? out.filter((f) => f.difPrecio || f.difOferta) : out
  }, [cat, soloDif])

  const cols: Col<Fila>[] = [
    { key: 'sku', label: 'SKU', width: 100, value: (f) => f.sku },
    { key: 'art', label: 'Artículo', width: 95, value: (f) => f.articulo },
    { key: 'nombre', label: 'Producto', width: 250, value: (f) => f.nombre },
    { key: 'rw', label: 'Precio web', width: 80, align: 'right', value: (f) => f.regularWeb, render: (f) => eur(f.regularWeb), cellStyle: (f) => (f.difPrecio ? DIF : undefined) },
    { key: 'pvp', label: 'PVP ERP', width: 75, align: 'right', value: (f) => f.pvp, render: (f) => eur(f.pvp) },
    { key: 'pvpi', label: 'PVP+IGIC', width: 78, align: 'right', value: (f) => f.pvpIgic, render: (f) => eur(f.pvpIgic) },
    { key: 'ow', label: 'Oferta web', width: 80, align: 'right', value: (f) => f.ofertaWeb, render: (f) => eur(f.ofertaWeb), cellStyle: (f) => (f.difOferta ? DIF : undefined) },
    { key: 'owf', label: 'Oferta web hasta', width: 110, value: (f) => f.ofertaWebHasta, render: (f) => fechaEs(f.ofertaWebHasta) },
    { key: 'oe', label: 'Oferta ERP', width: 80, align: 'right', value: (f) => f.ofertaErp, render: (f) => eur(f.ofertaErp), cellStyle: (f) => (f.difOferta ? DIF : undefined) },
    { key: 'oed', label: 'Oferta ERP desde', width: 110, value: (f) => f.ofertaErpDesde, render: (f) => fechaEs(f.ofertaErpDesde) },
    { key: 'oeh', label: 'Oferta ERP hasta', width: 110, value: (f) => f.ofertaErpHasta, render: (f) => fechaEs(f.ofertaErpHasta) },
  ]
  const actual = filas[sel]

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-[13px]">
      <div className="flex flex-none flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={soloDif} onChange={(e) => setSoloDif(e.target.checked)} /> Solo con diferencias
        </label>
        <button type="button" className="gw-btn" onClick={cargar} disabled={cargando}>
          <RefreshCw size={14} /> {cargando ? 'Comparando…' : 'Comparar de nuevo'}
        </button>
        <button
          type="button"
          className="gw-btn"
          disabled={!filas.length}
          onClick={() => descargarCsv('precios-web.csv', cols.map((c) => c.label), filas.map((r) => cols.map((c) => c.value(r))))}
        >
          <FileDown size={14} /> Exportar CSV
        </button>
      </div>
      <WebError error={error} />
      <Nota>
        Precio regular y oferta con fechas de la web frente al PVP y la oferta del artículo en el ERP (se da por bueno si coincide con o sin IGIC). La tarifa
        web propia y los precios por cliente salen de la ficha de cada artículo/cliente; aquí solo se comparan.
      </Nota>
      <Tabla rows={filas} cols={cols} rowKey={(f) => f.clave} sel={sel} onSel={setSel} vacio={cat ? 'Sin diferencias de precio.' : 'Cargando…'} onOpen={(f) => navigate(`/articulos/${encodeURIComponent(f.articulo)}`)} />
      <div className="flex flex-none items-center gap-2">
        <button type="button" className="gw-btn" disabled={!actual} onClick={() => actual && navigate(`/articulos/${encodeURIComponent(actual.articulo)}`)}>
          Abrir artículo
        </button>
        <BotonPendiente>Enviar precios a la web</BotonPendiente>
        <button type="button" className="gw-btn ml-auto" onClick={() => navigate('/')}>
          <DoorOpen size={14} /> Salir
        </button>
      </div>
    </div>
  )
}

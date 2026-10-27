import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DoorOpen, FileDown, RefreshCw } from 'lucide-react'
import { descargarCsv } from '../../lib/webMapeo'
import { BotonPendiente, DIF, eur, Nota, Tabla, WebError, type ArticuloWeb, type Col } from './comun'
import { cargarCatalogo, type Catalogo } from './catalogo'

interface Fila {
  a: ArticuloWeb
  sku: string
  nombre: string
  precio: number | null
  stock: number
  categoria: string
  faltas: string[]
}

/** Web → Publicar Artículos en la Web: VISTA PREVIA de lo que se crearía en la web (no se envía nada). */
export function PublicarArticulosWebPage() {
  const navigate = useNavigate()
  const [cat, setCat] = useState<Catalogo | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [cargando, setCargando] = useState(false)
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
    const porCodigo = new Map(cat.arts.map((a) => [a.codigo_interno, a]))
    return cat.difs
      .filter((d) => d.tipo === 'solo_erp' && d.articulo)
      .map((d) => {
        const a = porCodigo.get(d.articulo!)!
        const faltas = [!a.imagen_url && 'imagen', !(a.web_descripcion || a.web_observaciones) && 'descripción web', !(Number(a.pvp) > 0) && 'precio', !d.familiaErp && 'categoría'].filter(Boolean) as string[]
        return { a, sku: d.sku, nombre: d.nombreErp, precio: d.pvpErpIgic, stock: d.stockErp ?? 0, categoria: d.familiaErp, faltas }
      })
  }, [cat])

  const cols: Col<Fila>[] = [
    { key: 'sku', label: 'SKU que se enviaría', width: 130, value: (f) => f.sku },
    { key: 'art', label: 'Artículo', width: 95, value: (f) => f.a.codigo_interno },
    { key: 'nombre', label: 'Nombre en la web', width: 300, value: (f) => f.nombre },
    { key: 'precio', label: 'Precio (IGIC incl.)', width: 115, align: 'right', value: (f) => f.precio, render: (f) => eur(f.precio) },
    { key: 'stock', label: 'Stock', width: 65, align: 'right', value: (f) => f.stock },
    { key: 'cat', label: 'Categoría', width: 170, value: (f) => f.categoria },
    { key: 'img', label: 'Imagen', width: 60, value: (f) => (f.a.imagen_url ? 'Sí' : 'No') },
    { key: 'faltas', label: 'Le falta', width: 220, value: (f) => f.faltas.join(', '), cellStyle: (f) => (f.faltas.length ? DIF : undefined) },
  ]
  const actual = filas[sel]

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-[13px]">
      <div className="flex flex-none flex-wrap items-center gap-2">
        <button type="button" className="gw-btn" onClick={cargar} disabled={cargando}>
          <RefreshCw size={14} /> {cargando ? 'Comparando…' : 'Actualizar'}
        </button>
        <button type="button" className="gw-btn" disabled={!filas.length} onClick={() => descargarCsv('articulos-a-publicar.csv', cols.map((c) => c.label), filas.map((r) => cols.map((c) => c.value(r))))}>
          <FileDown size={14} /> Exportar CSV
        </button>
        <Nota>Vista previa: artículos marcados «publicar en web» en el ERP que no existen en la tienda, con los datos que se le mandarían.</Nota>
      </div>
      <WebError error={error} />
      <Tabla rows={filas} cols={cols} rowKey={(f) => f.a.codigo_interno} sel={sel} onSel={setSel} vacio={cat ? 'No hay artículos pendientes de publicar.' : 'Cargando…'} onOpen={(f) => navigate(`/articulos/${encodeURIComponent(f.a.codigo_interno)}`)} />
      {actual && (
        <div className="max-h-[90px] flex-none overflow-auto whitespace-pre-wrap border border-[var(--gw-border-light)] bg-white p-1 text-[12px]">
          <b>Descripción que se enviaría:</b> {actual.a.web_observaciones || actual.a.web_descripcion || actual.a.observaciones || '(vacía)'}
        </div>
      )}
      <div className="flex flex-none items-center gap-2">
        <button type="button" className="gw-btn" disabled={!actual} onClick={() => actual && navigate(`/articulos/${encodeURIComponent(actual.a.codigo_interno)}`)}>
          Abrir artículo
        </button>
        <BotonPendiente>Publicar en la web</BotonPendiente>
        <button type="button" className="gw-btn ml-auto" onClick={() => navigate('/')}>
          <DoorOpen size={14} /> Salir
        </button>
      </div>
    </div>
  )
}

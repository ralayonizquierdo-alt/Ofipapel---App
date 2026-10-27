import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DoorOpen, FileDown, RefreshCw } from 'lucide-react'
import { descargarCsv, type DiferenciaCatalogo } from '../../lib/webMapeo'
import { BotonPendiente, DIF, eur, Nota, Tabla, WebError, type Col } from './comun'
import { cargarCatalogo, type Catalogo } from './catalogo'

const VISTAS = [
  { key: 'dif', label: 'Con alguna diferencia' },
  { key: 'precio', label: 'Diferencia de precio' },
  { key: 'stock', label: 'Diferencia de stock' },
  { key: 'desc', label: 'Diferencia de descripción' },
  { key: 'img', label: 'Diferencia de imagen' },
  { key: 'cat', label: 'Diferencia de categoría' },
  { key: 'solo_erp', label: 'Publicados en el ERP y no en la web' },
  { key: 'solo_web', label: 'En la web y no en el ERP' },
  { key: 'todo', label: 'Todo' },
] as const

function pasa(d: DiferenciaCatalogo, v: string) {
  switch (v) {
    case 'dif':
      return d.tipo !== 'ambos' || d.difPrecio || d.difStock || d.difDescripcion || d.difImagen || d.difCategoria
    case 'precio':
      return d.difPrecio
    case 'stock':
      return d.difStock
    case 'desc':
      return d.difDescripcion
    case 'img':
      return d.difImagen
    case 'cat':
      return d.difCategoria
    case 'solo_erp':
    case 'solo_web':
      return d.tipo === v
    default:
      return true
  }
}

const TIPO = { ambos: 'En los dos', solo_erp: 'Solo ERP', solo_web: 'Solo web' }

/** Web → Sincronizar Catálogo, en modo COMPARACIÓN: no envía nada a la web. */
export function SincronizarCatalogoPage() {
  const navigate = useNavigate()
  const [cat, setCat] = useState<Catalogo | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [cargando, setCargando] = useState(false)
  const [vista, setVista] = useState<string>('dif')
  const [todosAlm, setTodosAlm] = useState(false)
  const [texto, setTexto] = useState('')
  const [sel, setSel] = useState(0)

  async function cargar(todos = todosAlm) {
    setCargando(true)
    setError(null)
    try {
      setCat(await cargarCatalogo(todos ? null : undefined))
    } catch (e) {
      setError(e)
    }
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filas = useMemo(() => {
    const t = texto.trim().toLowerCase()
    return (cat?.difs ?? []).filter(
      (d) => pasa(d, vista) && (!t || `${d.sku} ${d.articulo ?? ''} ${d.nombreWeb} ${d.nombreErp}`.toLowerCase().includes(t)),
    )
  }, [cat, vista, texto])

  const cuenta = (v: string) => (cat?.difs ?? []).filter((d) => pasa(d, v)).length

  const cols: Col<DiferenciaCatalogo>[] = useMemo(
    () => [
      { key: 'tipo', label: 'Dónde', width: 80, value: (d) => TIPO[d.tipo], cellStyle: (d) => (d.tipo !== 'ambos' ? DIF : undefined) },
      { key: 'sku', label: 'SKU web', width: 105, value: (d) => d.sku },
      { key: 'art', label: 'Artículo', width: 95, value: (d) => d.articulo },
      { key: 'nweb', label: 'Nombre en la web', width: 210, value: (d) => d.nombreWeb, cellStyle: (d) => (d.difDescripcion ? DIF : undefined) },
      { key: 'nerp', label: 'Descripción ERP', width: 210, value: (d) => d.nombreErp, cellStyle: (d) => (d.difDescripcion ? DIF : undefined) },
      { key: 'pweb', label: 'Precio web', width: 78, align: 'right', value: (d) => d.precioWeb, render: (d) => eur(d.precioWeb), cellStyle: (d) => (d.difPrecio ? DIF : undefined) },
      { key: 'perp', label: 'PVP ERP', width: 72, align: 'right', value: (d) => d.pvpErp, render: (d) => eur(d.pvpErp) },
      { key: 'perpi', label: 'PVP+IGIC', width: 75, align: 'right', value: (d) => d.pvpErpIgic, render: (d) => eur(d.pvpErpIgic) },
      { key: 'sweb', label: 'Stock web', width: 70, align: 'right', value: (d) => d.stockWeb, render: (d) => (d.stockWeb == null ? 'no ctrl.' : d.stockWeb), cellStyle: (d) => (d.difStock ? DIF : undefined) },
      { key: 'serp', label: 'Stock ERP', width: 70, align: 'right', value: (d) => d.stockErp, cellStyle: (d) => (d.difStock ? DIF : undefined) },
      { key: 'img', label: 'Imagen W/E', width: 72, align: 'center', value: (d) => `${d.imagenWeb ? 'Sí' : 'No'}/${d.imagenErp ? 'Sí' : 'No'}`, cellStyle: (d) => (d.difImagen ? DIF : undefined) },
      { key: 'cweb', label: 'Categoría web', width: 150, value: (d) => d.categoriaWeb, cellStyle: (d) => (d.difCategoria ? DIF : undefined) },
      { key: 'ferp', label: 'Familia ERP', width: 150, value: (d) => d.familiaErp, cellStyle: (d) => (d.difCategoria ? DIF : undefined) },
      { key: 'est', label: 'Estado web', width: 75, value: (d) => d.estadoWeb },
    ],
    [],
  )

  function exportar() {
    descargarCsv(
      `comparacion-catalogo-${new Date().toISOString().slice(0, 10)}.csv`,
      cols.map((c) => c.label),
      filas.map((d) => cols.map((c) => c.value(d))),
    )
  }

  const actual = filas[sel]

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-[13px]">
      <div className="flex flex-none flex-wrap items-center gap-2">
        <span className="gw-label">Ver:</span>
        <select className="gw-input w-[290px]! flex-none" value={vista} onChange={(e) => {
            setVista(e.target.value)
            setSel(0)
          }}>
          {VISTAS.map((v) => (
            <option key={v.key} value={v.key}>
              {v.label}
              {cat ? ` (${cuenta(v.key)})` : ''}
            </option>
          ))}
        </select>
        <span className="gw-label">Buscar:</span>
        <input className="gw-input w-[180px]! flex-none" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="SKU, código o nombre" />
        <label className="flex items-center gap-1" title="Stock del ERP: el almacén de la web (Configuración) o la suma de todos">
          <input
            type="checkbox"
            checked={todosAlm}
            onChange={(e) => {
              setTodosAlm(e.target.checked)
              cargar(e.target.checked)
            }}
          />{' '}
          Stock de todos los almacenes
        </label>
        <button type="button" className="gw-btn" onClick={() => cargar()} disabled={cargando}>
          <RefreshCw size={14} /> {cargando ? 'Comparando…' : 'Comparar de nuevo'}
        </button>
        <button type="button" className="gw-btn" onClick={exportar} disabled={!filas.length}>
          <FileDown size={14} /> Exportar CSV
        </button>
      </div>
      <WebError error={error} />
      {cat && (
        <Nota>
          {cat.productos.length} productos en la web · {cat.arts.filter((a) => a.web_publicado).length} artículos marcados «publicar en web» en el ERP · stock
          ERP del {cat.almacen ? `almacén ${cat.almacen}` : 'total de almacenes'}. Se cruza por SKU = código interno, código de venta o código de barras (o el
          código web del artículo). El precio se da por bueno si coincide con el PVP o con el PVP con IGIC.
          {cat.truncado ? ' Atención: la web tiene más de 3.000 productos y solo se han comparado los primeros.' : ''}
        </Nota>
      )}
      <Tabla rows={filas} cols={cols} rowKey={(d) => d.clave} sel={sel} onSel={setSel} vacio={cat ? 'Sin diferencias en esta vista.' : 'Cargando…'} onOpen={(d) => d.articulo && navigate(`/articulos/${encodeURIComponent(d.articulo)}`)} />
      <div className="flex flex-none flex-wrap items-center gap-2">
        <button type="button" className="gw-btn" disabled={!actual?.articulo} onClick={() => actual?.articulo && navigate(`/articulos/${encodeURIComponent(actual.articulo)}`)}>
          Abrir artículo
        </button>
        <BotonPendiente>Enviar cambios a la web</BotonPendiente>
        <span className="text-[12px] text-[#555]">{filas.length} filas</span>
        <button type="button" className="gw-btn ml-auto" onClick={() => navigate('/')}>
          <DoorOpen size={14} /> Salir
        </button>
      </div>
    </div>
  )
}

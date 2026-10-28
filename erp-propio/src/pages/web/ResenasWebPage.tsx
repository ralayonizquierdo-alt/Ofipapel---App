import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DoorOpen, FileDown, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { wc, wcDesde, wcHasta, type WcResena } from '../../lib/woocommerce'
import { descargarCsv } from '../../lib/webMapeo'
import { BotonPendiente, ESTILO_FALTA, fechaHoraEs, filtroWebInicial, FiltroFechas, Nota, Tabla, WebError, type Col } from './comun'
import { quitarHtml } from './textos'

const ESTADOS: Record<string, string> = { approved: 'Aprobada', hold: 'Pendiente', spam: 'Spam', unspam: 'Spam', trash: 'Papelera', untrash: 'Papelera' }
const estrellas = (n: number) => '★'.repeat(Math.max(0, Math.min(5, n))) + '☆'.repeat(Math.max(0, 5 - Math.max(0, Math.min(5, n))))

/** Artículos del ERP enlazados por su código web (web_id_link) con los productos reseñados. */
async function articulosPorWebId(ids: number[]) {
  const m = new Map<number, string>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from('articulo').select('codigo_interno, web_id_link').in('web_id_link', ids.slice(i, i + 200))
    if (error) throw new Error(error.message)
    for (const a of data ?? []) m.set(Number(a.web_id_link), a.codigo_interno as string)
  }
  return m
}

/** Web → Reseñas de Productos (consulta). */
export function ResenasWebPage() {
  const navigate = useNavigate()
  const [filtro, setFiltro] = useState(() => filtroWebInicial('Este año'))
  const [estado, setEstado] = useState('all')
  const [minimo, setMinimo] = useState(0)
  const [datos, setDatos] = useState<{ resenas: WcResena[]; arts: Map<number, string> } | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [cargando, setCargando] = useState(false)
  const [sel, setSel] = useState(0)

  async function buscar() {
    setCargando(true)
    setError(null)
    try {
      const r = await wc.todos<WcResena>('products/reviews', { status: estado, after: wcDesde(filtro.desde), before: wcHasta(filtro.hasta), orderby: 'date_gmt', order: 'desc' }, 10)
      const resenas = r.data ?? []
      setDatos({ resenas, arts: await articulosPorWebId([...new Set(resenas.map((x) => x.product_id))]) })
    } catch (e) {
      setError(e)
    }
    setCargando(false)
  }
  useEffect(() => {
    buscar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filas = useMemo(() => (datos?.resenas ?? []).filter((r) => !minimo || (minimo > 0 ? r.rating >= minimo : r.rating <= -minimo)), [datos, minimo])
  const media = filas.length ? filas.reduce((s, r) => s + Number(r.rating || 0), 0) / filas.length : null
  const cols: Col<WcResena>[] = [
    { key: 'fecha', label: 'Fecha', width: 115, value: (r) => r.date_created, render: (r) => fechaHoraEs(r.date_created) },
    { key: 'prod', label: 'Producto', width: 230, value: (r) => r.product_name ?? `#${r.product_id}` },
    { key: 'art', label: 'Artículo ERP', width: 90, value: (r) => datos?.arts.get(r.product_id) ?? '' },
    { key: 'val', label: 'Valoración', width: 85, value: (r) => r.rating, render: (r) => <span className="text-[#b07d00]">{estrellas(r.rating)}</span>, cellStyle: (r) => (r.rating <= 2 ? ESTILO_FALTA : undefined) },
    { key: 'autor', label: 'Autor', width: 140, value: (r) => r.reviewer },
    { key: 'ver', label: 'Compra verif.', width: 85, value: (r) => (r.verified ? 'Sí' : '') },
    { key: 'est', label: 'Estado', width: 80, value: (r) => ESTADOS[r.status] ?? r.status },
    { key: 'texto', label: 'Reseña', width: 330, value: (r) => quitarHtml(r.review) },
  ]
  const actual = filas[sel]
  const artActual = actual ? datos?.arts.get(actual.product_id) : undefined

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-[13px]">
      <FiltroFechas filtro={filtro} onChange={setFiltro} conEstado={false}>
        <span className="gw-label">Estado:</span>
        <select className="gw-input w-[120px]! flex-none" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="all">Todas</option>
          <option value="approved">Aprobadas</option>
          <option value="hold">Pendientes</option>
          <option value="spam">Spam</option>
        </select>
        <button type="button" className="gw-btn" onClick={buscar} disabled={cargando}>
          <Search size={14} /> {cargando ? 'Leyendo la web…' : 'Buscar'}
        </button>
      </FiltroFechas>
      <div className="flex flex-none flex-wrap items-center gap-2">
        <span className="gw-label">Valoración:</span>
        <select className="gw-input w-[150px]! flex-none" value={minimo} onChange={(e) => setMinimo(Number(e.target.value))}>
          <option value={0}>Todas</option>
          <option value={4}>4 o más estrellas</option>
          <option value={-2}>2 o menos estrellas</option>
        </select>
        <button type="button" className="gw-btn" disabled={!filas.length} onClick={() => descargarCsv('resenas-web.csv', cols.map((c) => c.label), filas.map((r) => cols.map((c) => c.value(r))))}>
          <FileDown size={14} /> CSV
        </button>
        {media != null && (
          <span className="text-[12px] text-[#555]">
            {filas.length} reseñas · media {media.toLocaleString('es-ES', { maximumFractionDigits: 2 })} estrellas
          </span>
        )}
      </div>
      <WebError error={error} />
      <Nota>Reseñas de los productos de la tienda online. Las de 2 estrellas o menos salen marcadas. Aprobarlas o contestarlas se hace en la web.</Nota>
      <Tabla rows={filas} cols={cols} rowKey={(r) => String(r.id)} sel={sel} onSel={setSel} vacio={datos ? 'Sin reseñas en el periodo.' : error ? 'Sin datos de la web.' : 'Cargando…'} onOpen={(r) => datos?.arts.get(r.product_id) && navigate(`/articulos/${encodeURIComponent(datos.arts.get(r.product_id)!)}`)} />
      <div className="h-[110px] flex-none overflow-auto border border-[var(--gw-border)] bg-white p-1.5 text-[12px] whitespace-pre-wrap">
        {actual ? (
          <>
            <b>
              {actual.reviewer} sobre «{actual.product_name ?? `#${actual.product_id}`}» — {estrellas(actual.rating)}
            </b>
            <div className="mt-1">{quitarHtml(actual.review)}</div>
          </>
        ) : (
          <i>Selecciona una reseña.</i>
        )}
      </div>
      <div className="flex flex-none items-center gap-2">
        <button type="button" className="gw-btn" disabled={!artActual} onClick={() => artActual && navigate(`/articulos/${encodeURIComponent(artActual)}`)}>
          Abrir artículo
        </button>
        <BotonPendiente>Aprobar o contestar en la web</BotonPendiente>
        <button type="button" className="gw-btn ml-auto" onClick={() => navigate('/')}>
          <DoorOpen size={14} /> Salir
        </button>
      </div>
    </div>
  )
}

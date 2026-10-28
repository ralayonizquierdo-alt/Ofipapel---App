import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DoorOpen, FileDown, RefreshCw } from 'lucide-react'
import type { WcProducto } from '../../lib/woocommerce'
import { buscarPorSku, descargarCsv, indexarArticulos, normalizar } from '../../lib/webMapeo'
import { BotonPendiente, ESTILO_FALTA, Nota, Tabla, WebError, type ArticuloWeb, type Col } from './comun'
import { cargarCatalogo, type Catalogo } from './catalogo'
import { quitarHtml, seoDe } from './textos'

interface Fila {
  p: WcProducto
  a: ArticuloWeb | null
  imagenes: number
  corta: string
  larga: string
  seoTitulo: string
  seoDesc: string
  seoPlugin: string
  avisos: string[]
}

function avisosDe(p: WcProducto, a: ArticuloWeb | null, corta: string, larga: string, seo: { titulo: string; descripcion: string }): string[] {
  const out: string[] = []
  const imgs = p.images?.length ?? 0
  if (!imgs) out.push(a?.imagen_url ? 'Imagen en el ERP y no en la web' : 'Sin imagen')
  if (!corta) out.push('Sin descripción corta')
  if (!larga) out.push('Sin descripción larga')
  if (!seo.titulo && !seo.descripcion) out.push('Sin SEO propio')
  if (!a) out.push('Sin artículo en el ERP')
  else {
    const nombreErp = a.web_descripcion || a.descripcion
    if (nombreErp && normalizar(nombreErp) !== normalizar(p.name)) out.push('Nombre distinto al del ERP')
    const obsErp = quitarHtml(a.web_observaciones)
    if (obsErp && normalizar(obsErp) !== normalizar(larga) && normalizar(obsErp) !== normalizar(corta)) out.push('Texto web del ERP distinto')
  }
  return out
}

/** Web → Imágenes y Textos Web: imágenes, descripciones y SEO de cada producto frente al ERP (solo lectura). */
export function ImagenesTextosWebPage() {
  const navigate = useNavigate()
  const [cat, setCat] = useState<Catalogo | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [cargando, setCargando] = useState(false)
  const [soloAvisos, setSoloAvisos] = useState(true)
  const [aviso, setAviso] = useState('')
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

  const todas: Fila[] = useMemo(() => {
    if (!cat) return []
    const ix = indexarArticulos(cat.arts)
    const porCodigo = new Map(cat.arts.map((a) => [a.codigo_interno, a]))
    return cat.productos.map((p) => {
      const h = buscarPorSku(ix, p.sku, p.id)
      const a = h ? (porCodigo.get(h.articulo.codigo_interno) ?? null) : null
      const corta = quitarHtml(p.short_description)
      const larga = quitarHtml(p.description)
      const seo = seoDe(p.meta_data)
      return { p, a, imagenes: p.images?.length ?? 0, corta, larga, seoTitulo: seo.titulo, seoDesc: seo.descripcion, seoPlugin: seo.plugin, avisos: avisosDe(p, a, corta, larga, seo) }
    })
  }, [cat])
  const tiposAviso = useMemo(() => [...new Set(todas.flatMap((f) => f.avisos))].sort(), [todas])
  const filas = useMemo(() => todas.filter((f) => (!soloAvisos || f.avisos.length) && (!aviso || f.avisos.includes(aviso))), [todas, soloAvisos, aviso])

  const cols: Col<Fila>[] = [
    { key: 'sku', label: 'SKU', width: 100, value: (f) => f.p.sku ?? '' },
    { key: 'art', label: 'Artículo', width: 90, value: (f) => f.a?.codigo_interno ?? '', cellStyle: (f) => (f.a ? undefined : ESTILO_FALTA) },
    { key: 'nombre', label: 'Producto web', width: 250, value: (f) => f.p.name },
    { key: 'img', label: 'Imág.', width: 50, align: 'right', value: (f) => f.imagenes, cellStyle: (f) => (f.imagenes ? undefined : ESTILO_FALTA) },
    { key: 'imge', label: 'Imagen ERP', width: 80, value: (f) => (!f.a ? '' : f.a.imagen_url ? 'Sí' : f.a.web_sin_imagen ? 'Marcado sin' : 'No') },
    { key: 'corta', label: 'Desc. corta', width: 80, align: 'right', value: (f) => f.corta.length, render: (f) => (f.corta ? `${f.corta.length} car.` : ''), cellStyle: (f) => (f.corta ? undefined : ESTILO_FALTA) },
    { key: 'larga', label: 'Desc. larga', width: 80, align: 'right', value: (f) => f.larga.length, render: (f) => (f.larga ? `${f.larga.length} car.` : ''), cellStyle: (f) => (f.larga ? undefined : ESTILO_FALTA) },
    { key: 'seo', label: 'SEO', width: 75, value: (f) => f.seoPlugin, cellStyle: (f) => (f.seoPlugin ? undefined : ESTILO_FALTA) },
    { key: 'avisos', label: 'Avisos', width: 330, value: (f) => f.avisos.join(' · ') },
  ]
  const actual = filas[sel]

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-[13px]">
      <div className="flex flex-none flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={soloAvisos} onChange={(e) => setSoloAvisos(e.target.checked)} /> Solo con avisos
        </label>
        <span className="gw-label">Aviso:</span>
        <select className="gw-input w-[230px]! flex-none" value={aviso} onChange={(e) => setAviso(e.target.value)}>
          <option value="">Todos</option>
          {tiposAviso.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <button type="button" className="gw-btn" onClick={cargar} disabled={cargando}>
          <RefreshCw size={14} /> {cargando ? 'Leyendo la web…' : 'Comparar de nuevo'}
        </button>
        <button type="button" className="gw-btn" disabled={!filas.length} onClick={() => descargarCsv('imagenes-textos-web.csv', cols.map((c) => c.label), filas.map((r) => cols.map((c) => c.value(r))))}>
          <FileDown size={14} /> Exportar CSV
        </button>
        {cat && <span className="text-[12px] text-[#555]">{cat.productos.length} productos leídos{cat.truncado ? ' (catálogo cortado en 3.000)' : ''}</span>}
      </div>
      <WebError error={error} />
      <Nota>
        Imágenes, descripción corta y larga y SEO (Yoast, Rank Math, AIOSEO o SEOPress) de cada producto de la web, frente a la descripción web, la imagen y las
        observaciones web del artículo en el ERP.
      </Nota>
      <Tabla rows={filas} cols={cols} rowKey={(f) => String(f.p.id)} sel={sel} onSel={setSel} vacio={cat ? 'Sin productos con avisos.' : error ? 'Sin datos de la web.' : 'Cargando…'} onOpen={(f) => f.a && navigate(`/articulos/${encodeURIComponent(f.a.codigo_interno)}`)} />
      <div className="grid h-[180px] flex-none grid-cols-2 gap-2">
        <div className="flex min-h-0 flex-col border border-[var(--gw-border)] bg-white p-1.5">
          <div className="gw-label flex-none">En la web {actual ? `(${actual.imagenes} imágenes)` : ''}</div>
          <div className="min-h-0 flex-1 overflow-auto text-[12px] whitespace-pre-wrap">
            {actual ? (
              <>
                <b>{actual.p.name}</b>
                {actual.seoTitulo && <div className="text-[#1d3a8a]">SEO título: {actual.seoTitulo}</div>}
                {actual.seoDesc && <div className="text-[#1d3a8a]">SEO descripción: {actual.seoDesc}</div>}
                <div className="mt-1 text-[#444]">{actual.corta || <i>Sin descripción corta.</i>}</div>
                <div className="mt-1">{actual.larga || <i>Sin descripción larga.</i>}</div>
                {(actual.p.images ?? []).map((i) => (
                  <div key={i.src} className="truncate text-[11px] text-[#666]">
                    {i.src}
                  </div>
                ))}
              </>
            ) : (
              <i>Selecciona un producto.</i>
            )}
          </div>
        </div>
        <div className="flex min-h-0 flex-col border border-[var(--gw-border)] bg-white p-1.5">
          <div className="gw-label flex-none">En el ERP {actual?.a ? `(${actual.a.codigo_interno})` : ''}</div>
          <div className="min-h-0 flex-1 overflow-auto text-[12px] whitespace-pre-wrap">
            {actual?.a ? (
              <>
                <b>{actual.a.web_descripcion || actual.a.descripcion}</b>
                <div className="mt-1">{quitarHtml(actual.a.web_observaciones) || <i>Sin observaciones web.</i>}</div>
                {actual.a.imagen_url && <div className="truncate text-[11px] text-[#666]">{actual.a.imagen_url}</div>}
              </>
            ) : (
              <i>{actual ? 'El producto no está enlazado con ningún artículo del ERP (ni por SKU ni por código web).' : ''}</i>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-none items-center gap-2">
        <button type="button" className="gw-btn" disabled={!actual?.a} onClick={() => actual?.a && navigate(`/articulos/${encodeURIComponent(actual.a.codigo_interno)}`)}>
          Abrir artículo
        </button>
        <BotonPendiente>Enviar imágenes y textos a la web</BotonPendiente>
        <button type="button" className="gw-btn ml-auto" onClick={() => navigate('/')}>
          <DoorOpen size={14} /> Salir
        </button>
      </div>
    </div>
  )
}

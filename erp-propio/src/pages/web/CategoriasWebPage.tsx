import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DoorOpen, FileDown, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { wc, type WcCategoria } from '../../lib/woocommerce'
import { descargarCsv, normalizar } from '../../lib/webMapeo'
import { BotonPendiente, DIF, Nota, Tabla, WebError, type Col } from './comun'

interface Familia {
  codigo: string
  descripcion: string | null
  web_descripcion: string | null
  web_codigo: string | null
  web_publicada: boolean | null
}

interface Fila {
  clave: string
  familia: string
  descripcion: string
  nombreWeb: string
  publicada: boolean | null
  articulos: number
  categoria: WcCategoria | null
  via: string
  estado: string
}

/** Correspondencia familia del ERP → categoría de la web, por código web (id/slug) o por nombre. */
export function cruzarCategorias(familias: Familia[], cats: WcCategoria[], articulosPorFamilia: Map<string, number>): Fila[] {
  const porId = new Map(cats.map((c) => [String(c.id), c]))
  const porSlug = new Map(cats.map((c) => [c.slug, c]))
  const porNombre = new Map(cats.map((c) => [normalizar(c.name), c]))
  const usadas = new Set<number>()
  const out: Fila[] = familias.map((f) => {
    const wcod = (f.web_codigo ?? '').trim()
    let categoria: WcCategoria | null = null
    let via = ''
    if (wcod && (porId.get(wcod) || porSlug.get(wcod))) {
      categoria = porId.get(wcod) ?? porSlug.get(wcod)!
      via = 'código web'
    } else {
      const c = porNombre.get(normalizar(f.web_descripcion || f.descripcion))
      if (c) {
        categoria = c
        via = 'nombre'
      }
    }
    if (categoria) usadas.add(categoria.id)
    const n = articulosPorFamilia.get(f.codigo) ?? 0
    return {
      clave: `f${f.codigo}`,
      familia: f.codigo,
      descripcion: f.descripcion ?? '',
      nombreWeb: f.web_descripcion ?? '',
      publicada: f.web_publicada,
      articulos: n,
      categoria,
      via,
      estado: categoria ? 'Enlazada' : f.web_publicada || n > 0 ? 'Sin categoría en la web' : 'No se publica',
    }
  })
  for (const c of cats)
    if (!usadas.has(c.id))
      out.push({ clave: `c${c.id}`, familia: '', descripcion: '', nombreWeb: '', publicada: null, articulos: 0, categoria: c, via: '', estado: 'Categoría web sin familia' })
  return out
}

/** Web → Categorías Web: familias del ERP frente a las categorías de WooCommerce (comparación). */
export function CategoriasWebPage() {
  const navigate = useNavigate()
  const [filasTodas, setFilas] = useState<Fila[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [cargando, setCargando] = useState(false)
  const [estado, setEstado] = useState('')
  const [sel, setSel] = useState(0)

  async function cargar() {
    setCargando(true)
    setError(null)
    try {
      const { data: fams, error: e1 } = await supabase.from('familia').select('codigo, descripcion, web_descripcion, web_codigo, web_publicada').order('codigo')
      if (e1) throw new Error(e1.message)
      const { data: arts } = await supabase.from('articulo').select('familia_codigo').eq('web_publicado', true).limit(50000)
      const cuenta = new Map<string, number>()
      for (const a of arts ?? []) if (a.familia_codigo) cuenta.set(a.familia_codigo, (cuenta.get(a.familia_codigo) ?? 0) + 1)
      let cats: WcCategoria[] = []
      try {
        cats = (await wc.todos<WcCategoria>('products/categories', { hide_empty: false }, 10)).data ?? []
      } catch (e) {
        setError(e)
      }
      setFilas(cruzarCategorias((fams ?? []) as Familia[], cats, cuenta))
    } catch (e) {
      setError(e)
    }
    setCargando(false)
  }
  useEffect(() => {
    cargar()
  }, [])

  const filas = useMemo(() => (filasTodas ?? []).filter((f) => !estado || f.estado === estado), [filasTodas, estado])
  const cols: Col<Fila>[] = [
    { key: 'fam', label: 'Familia', width: 80, value: (f) => f.familia },
    { key: 'desc', label: 'Descripción', width: 220, value: (f) => f.descripcion },
    { key: 'nweb', label: 'Nombre web (ERP)', width: 180, value: (f) => f.nombreWeb },
    { key: 'pub', label: 'Publicada', width: 70, value: (f) => (f.publicada == null ? '' : f.publicada ? 'Sí' : 'No') },
    { key: 'arts', label: 'Art. publ.', width: 70, align: 'right', value: (f) => f.articulos },
    { key: 'cat', label: 'Categoría en la web', width: 200, value: (f) => f.categoria?.name ?? '' },
    { key: 'cid', label: 'Id web', width: 60, align: 'right', value: (f) => f.categoria?.id ?? null },
    { key: 'cn', label: 'Productos web', width: 90, align: 'right', value: (f) => f.categoria?.count ?? null },
    { key: 'via', label: 'Enlazada por', width: 90, value: (f) => f.via },
    { key: 'estado', label: 'Estado', width: 170, value: (f) => f.estado, cellStyle: (f) => (f.estado === 'Enlazada' || f.estado === 'No se publica' ? undefined : DIF) },
  ]
  const estados = ['Enlazada', 'Sin categoría en la web', 'Categoría web sin familia', 'No se publica']
  const actual = filas[sel]

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-[13px]">
      <div className="flex flex-none flex-wrap items-center gap-2">
        <span className="gw-label">Estado:</span>
        <select className="gw-input w-[230px]! flex-none" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos ({filasTodas?.length ?? 0})</option>
          {estados.map((s) => (
            <option key={s} value={s}>
              {s} ({(filasTodas ?? []).filter((f) => f.estado === s).length})
            </option>
          ))}
        </select>
        <button type="button" className="gw-btn" onClick={cargar} disabled={cargando}>
          <RefreshCw size={14} /> Comparar de nuevo
        </button>
        <button type="button" className="gw-btn" disabled={!filas.length} onClick={() => descargarCsv('categorias-web.csv', cols.map((c) => c.label), filas.map((r) => cols.map((c) => c.value(r))))}>
          <FileDown size={14} /> Exportar CSV
        </button>
      </div>
      <WebError error={error} />
      <Nota>Se enlaza por el «código web» de la familia (id o slug de la categoría) y, si no lo tiene, por el nombre web o la descripción.</Nota>
      <Tabla rows={filas} cols={cols} rowKey={(f) => f.clave} sel={sel} onSel={setSel} vacio={filasTodas ? 'Sin filas.' : 'Cargando…'} onOpen={(f) => f.familia && navigate(`/familias/${encodeURIComponent(f.familia)}`)} />
      <div className="flex flex-none items-center gap-2">
        <button type="button" className="gw-btn" disabled={!actual?.familia} onClick={() => actual?.familia && navigate(`/familias/${encodeURIComponent(actual.familia)}`)}>
          Abrir familia
        </button>
        <BotonPendiente>Crear categorías en la web</BotonPendiente>
        <button type="button" className="gw-btn ml-auto" onClick={() => navigate('/')}>
          <DoorOpen size={14} /> Salir
        </button>
      </div>
    </div>
  )
}

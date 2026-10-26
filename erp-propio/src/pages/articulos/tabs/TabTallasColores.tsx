import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpRight, Binoculars, Check, FilePen, FilePlus2, Trash2, Wand2, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwInput, GwLookupButton, GwSelect, GwWindow, formatGw } from '../../../components/gw'
import { FilasVacias } from '../../../components/gw/GwGridParts'
import type { ArticuloTallaColorConfig, ArticuloVariante } from '../types'

interface Maestro {
  id: number
  descripcion: string
}
interface Almacen {
  codigo: string
  nombre: string
}
interface FilaEdit {
  id?: number
  talla_id: string
  color_id: string
  codigo_variante: string
}

const emptyConfig = (codigo: string): ArticuloTallaColorConfig => ({
  articulo_codigo: codigo,
  tope_maximo: null,
  tope_minimo: null,
  salto: null,
  num_colores: null,
  num_tallas: null,
  rango_alfabetico: false,
  no_incluir_color: false,
  no_incluir_talla: false,
  pvp_es_padre: false,
  codigo_compra_es_padre: false,
  crear_hijos_al_vender: 0,
})

function MiniBtn({ title, onClick, disabled, children }: { title: string; onClick?: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="flex h-[22px] w-[48px] items-center justify-center border-r border-[var(--gw-border-light)] text-[#1d3a8a] last:border-r-0 hover:bg-[#e5f1fb] disabled:text-[#9a9a9a] disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

export function TabTallasColores({ articuloCodigo, editing = true }: { articuloCodigo: string; editing?: boolean }) {
  const navigate = useNavigate()
  const [config, setConfig] = useState<ArticuloTallaColorConfig>(emptyConfig(articuloCodigo))
  const [variantes, setVariantes] = useState<ArticuloVariante[]>([])
  const [tallas, setTallas] = useState<Maestro[]>([])
  const [colores, setColores] = useState<Maestro[]>([])
  const [almacenes, setAlmacenes] = useState<Almacen[]>([])
  const [almacen, setAlmacen] = useState('')
  const [stock, setStock] = useState<Record<string, number>>({})
  const [padre, setPadre] = useState<string | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const [edit, setEdit] = useState<FilaEdit | null>(null)
  const [generador, setGenerador] = useState(false)
  const [selTallas, setSelTallas] = useState<number[]>([])
  const [selColores, setSelColores] = useState<number[]>([])
  const [buscarAlmacen, setBuscarAlmacen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadVariantes() {
    const { data } = await supabase
      .from('articulo_variante')
      .select('id, articulo_codigo, talla_id, talla_descripcion, color_id, color_descripcion, codigo_variante')
      .eq('articulo_codigo', articuloCodigo)
      .order('talla_descripcion')
      .order('color_descripcion')
    setVariantes((data ?? []) as ArticuloVariante[])
  }

  useEffect(() => {
    Promise.all([
      supabase.from('articulo_talla_color_config').select('*').eq('articulo_codigo', articuloCodigo).maybeSingle(),
      supabase.from('talla').select('id, descripcion').order('id'),
      supabase.from('color').select('id, descripcion').order('descripcion'),
      supabase.from('almacen').select('codigo, nombre').order('codigo'),
      supabase.from('articulo_variante').select('articulo_codigo').eq('codigo_variante', articuloCodigo).limit(1).maybeSingle(),
    ]).then(([c, t, co, al, pa]) => {
      setConfig(c.data ? ({ ...emptyConfig(articuloCodigo), ...c.data } as ArticuloTallaColorConfig) : emptyConfig(articuloCodigo))
      setTallas(t.data ?? [])
      setColores(co.data ?? [])
      setAlmacenes(al.data ?? [])
      setPadre((pa.data?.articulo_codigo as string | undefined) ?? null)
    })
    loadVariantes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articuloCodigo])

  useEffect(() => {
    const codigos = variantes.map((v) => v.codigo_variante).filter((c): c is string => !!c)
    if (codigos.length === 0) return setStock({})
    let q = supabase.from('articulo_almacen_stock').select('articulo_codigo, cantidad_actual').in('articulo_codigo', codigos)
    if (almacen) q = q.eq('almacen_codigo', almacen)
    q.then(({ data }) => {
      const map: Record<string, number> = {}
      for (const s of data ?? []) map[s.articulo_codigo] = (map[s.articulo_codigo] ?? 0) + Number(s.cantidad_actual)
      setStock(map)
    })
  }, [variantes, almacen])

  async function guardarConfig(patch: Partial<ArticuloTallaColorConfig>) {
    const next = { ...config, ...patch }
    setConfig(next)
    setError(null)
    const { error: err } = await supabase.from('articulo_talla_color_config').upsert(next, { onConflict: 'articulo_codigo' })
    if (err) setError(err.message)
  }

  async function aceptarFila() {
    if (!edit) return
    setError(null)
    const talla = tallas.find((t) => t.id === Number(edit.talla_id))
    const color = colores.find((c) => c.id === Number(edit.color_id))
    if (!talla && !color) return setError('Elige al menos una talla o un color.')
    const payload = {
      articulo_codigo: articuloCodigo,
      talla_id: talla?.id ?? null,
      talla_descripcion: talla?.descripcion ?? null,
      color_id: color?.id ?? null,
      color_descripcion: color?.descripcion ?? null,
      codigo_variante: edit.codigo_variante.trim() || null,
    }
    const { error: err } =
      edit.id != null
        ? await supabase.from('articulo_variante').update(payload).eq('id', edit.id)
        : await supabase.from('articulo_variante').insert(payload)
    if (err) return setError(err.message)
    setEdit(null)
    loadVariantes()
  }

  async function borrar() {
    const v = variantes.find((x) => x.id === sel)
    if (!v?.id) return
    if (!confirm(`¿Borrar la variante ${v.talla_descripcion ?? ''} ${v.color_descripcion ?? ''}?`)) return
    const { error: err } = await supabase.from('articulo_variante').delete().eq('id', v.id)
    if (err) return setError(err.message)
    setSel(null)
    loadVariantes()
  }

  async function generar() {
    setError(null)
    const tallasUsar: (Maestro | null)[] = config.no_incluir_talla || selTallas.length === 0 ? [null] : tallas.filter((t) => selTallas.includes(t.id))
    const coloresUsar: (Maestro | null)[] = config.no_incluir_color || selColores.length === 0 ? [null] : colores.filter((c) => selColores.includes(c.id))
    const existentes = new Set(variantes.map((v) => `${v.talla_id ?? ''}|${v.color_id ?? ''}`))
    const nuevas = []
    for (const t of tallasUsar) {
      for (const c of coloresUsar) {
        if (!t && !c) continue
        if (existentes.has(`${t?.id ?? ''}|${c?.id ?? ''}`)) continue
        nuevas.push({
          articulo_codigo: articuloCodigo,
          talla_id: t?.id ?? null,
          talla_descripcion: t?.descripcion ?? null,
          color_id: c?.id ?? null,
          color_descripcion: c?.descripcion ?? null,
          codigo_variante: null,
        })
      }
    }
    if (nuevas.length === 0) return setError('No hay combinaciones nuevas: selecciona tallas y/o colores que aún no existan.')
    const { error: err } = await supabase.from('articulo_variante').insert(nuevas)
    if (err) return setError(err.message)
    setSelTallas([])
    setSelColores([])
    setGenerador(false)
    await loadVariantes()
  }

  const nTallas = new Set(variantes.map((v) => v.talla_id).filter((x) => x != null)).size
  const nColores = new Set(variantes.map((v) => v.color_id).filter((x) => x != null)).size
  const almacenNombre = almacenes.find((a) => a.codigo === almacen)?.nombre ?? ''
  const toggle = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  const dis = !editing

  const filaEdit = (e: FilaEdit) => (
    <tr key={e.id ?? 'nueva'}>
      <td>
        <GwInput autoFocus value={e.codigo_variante} onChange={(ev) => setEdit({ ...e, codigo_variante: ev.target.value })} />
      </td>
      <td>
        <GwSelect value={e.talla_id} onChange={(ev) => setEdit({ ...e, talla_id: ev.target.value })}>
          <option value="">—</option>
          {tallas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.descripcion}
            </option>
          ))}
        </GwSelect>
      </td>
      <td>
        <GwSelect value={e.color_id} onChange={(ev) => setEdit({ ...e, color_id: ev.target.value })}>
          <option value="">—</option>
          {colores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.descripcion}
            </option>
          ))}
        </GwSelect>
      </td>
      <td />
    </tr>
  )

  return (
    <div className="flex min-h-[250px] gap-3" title="TALLAS_M / TALLAS_D">
      <div className="flex w-[510px] flex-none flex-col">
        <div className="flex-1 overflow-y-auto border border-[var(--gw-border)] bg-white">
          <table className="gw-grid text-[12px]">
            <thead className="sticky top-0">
              <tr>
                <th style={{ width: 175 }}>Código</th>
                <th className="!text-center" style={{ width: 108 }}>Talla</th>
                <th className="!text-center" style={{ width: 116 }}>Color</th>
                <th>Almacen</th>
              </tr>
            </thead>
            <tbody>
              {variantes.map((v) =>
                edit && edit.id === v.id ? (
                  filaEdit(edit)
                ) : (
                  <tr key={v.id} className={sel === v.id ? 'gw-selected' : ''} onClick={() => !edit && setSel(v.id ?? null)}>
                    <td>{v.codigo_variante ?? ''}</td>
                    <td className="text-center">{v.talla_descripcion ?? ''}</td>
                    <td className="text-center">{v.color_descripcion ?? ''}</td>
                    <td className="text-right tabular-nums">
                      {v.codigo_variante && stock[v.codigo_variante] != null ? formatGw(stock[v.codigo_variante], 3) : ''}
                    </td>
                  </tr>
                ),
              )}
              {edit && edit.id == null && filaEdit(edit)}
              <FilasVacias cols={4} ocupadas={variantes.length + (edit && edit.id == null ? 1 : 0)} total={8} />
            </tbody>
          </table>
        </div>
        <div className="mt-0.5 flex items-center gap-4">
          <div className="flex border border-[var(--gw-border)]">
            {edit ? (
              <>
                <MiniBtn title="Aceptar" onClick={aceptarFila}>
                  <Check size={14} strokeWidth={3} className="text-[#127a12]" />
                </MiniBtn>
                <MiniBtn title="Cancelar" onClick={() => setEdit(null)}>
                  <X size={14} strokeWidth={3} className="text-[#c42b1c]" />
                </MiniBtn>
              </>
            ) : (
              <>
                <MiniBtn title="Añadir línea" disabled={dis} onClick={() => setEdit({ talla_id: '', color_id: '', codigo_variante: '' })}>
                  <FilePlus2 size={13} />
                </MiniBtn>
                <MiniBtn
                  title="Modificar línea"
                  disabled={dis || sel == null}
                  onClick={() => {
                    const v = variantes.find((x) => x.id === sel)
                    if (v) setEdit({ id: v.id, talla_id: v.talla_id != null ? String(v.talla_id) : '', color_id: v.color_id != null ? String(v.color_id) : '', codigo_variante: v.codigo_variante ?? '' })
                  }}
                >
                  <FilePen size={13} />
                </MiniBtn>
                <MiniBtn title="Borrar línea" disabled={dis || sel == null} onClick={borrar}>
                  <Trash2 size={13} />
                </MiniBtn>
              </>
            )}
            <MiniBtn title="Buscar" disabled>
              <Binoculars size={13} />
            </MiniBtn>
          </div>
          <span className="text-[12px] text-[#1a4fd0]">Nº Items: {variantes.length}</span>
          <span className="text-[12px] text-[#1a4fd0]">Nº Tallas: {nTallas || ''}</span>
          <span className="text-[12px] text-[#1a4fd0]">Nº Colores: {nColores || ''}</span>
        </div>
        {error && <span className="text-[12px] text-[#a4262c]">{error}</span>}
      </div>

      <div className="flex w-[270px] flex-none flex-col gap-2">
        <fieldset className="gw-group">
          <legend className="text-[12px]">Ver el Stock del almacen:</legend>
          <div className="flex gap-0.5">
            <GwSelect className="!w-[56px]" value={almacen} onChange={(e) => setAlmacen(e.target.value)}>
              <option value="">—</option>
              {almacenes.map((a) => (
                <option key={a.codigo} value={a.codigo}>
                  {a.codigo}
                </option>
              ))}
            </GwSelect>
            <GwInput readOnly value={almacenNombre} />
            <GwLookupButton onClick={() => setBuscarAlmacen(true)} title="Buscar almacén" />
          </div>
        </fieldset>
        <GwCheck
          label="Siempre se utilizarán los PVPs del Artículo Padre"
          checked={config.pvp_es_padre}
          onChange={(v) => guardarConfig({ pvp_es_padre: v })}
          disabled={dis}
          className="text-[12px]"
        />
        <button type="button" className="gw-btn !h-[40px] w-[206px]" disabled={dis} onClick={() => setGenerador(true)}>
          <Wand2 size={14} />
          <span>
            <span className="underline decoration-1 underline-offset-2">G</span>enerar tallas y colores
          </span>
        </button>
        <button
          type="button"
          className="gw-btn w-[150px] whitespace-nowrap"
          disabled={!padre}
          title={padre ? `Abrir ${padre}` : 'Este artículo no es hijo de ningún otro'}
          onClick={() => padre && navigate(`/articulos/${encodeURIComponent(padre)}`)}
        >
          <ArrowUpRight size={13} /> Ir al Artículo Padre
        </button>
        <div className="flex flex-col">
          <span className="gw-label text-[12px]">Crear Artic. Hijos al Vender:</span>
          <GwSelect
            className="!w-[172px]"
            title="Confirmar los valores con Luis"
            value={config.crear_hijos_al_vender}
            onChange={(e) => guardarConfig({ crear_hijos_al_vender: Number(e.target.value) })}
            disabled={dis}
          >
            <option value={0}>Deshabilitado</option>
            <option value={1}>Preguntar al vender</option>
            <option value={2}>Crear automáticamente</option>
          </GwSelect>
        </div>
      </div>

      {buscarAlmacen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-24">
          <GwWindow title="Almacenes" onClose={() => setBuscarAlmacen(false)} className="w-[420px]">
            <table className="gw-grid">
              <tbody>
                {almacenes.map((a) => (
                  <tr
                    key={a.codigo}
                    className="cursor-default hover:bg-[#e5f1fb]"
                    onDoubleClick={() => {
                      setAlmacen(a.codigo)
                      setBuscarAlmacen(false)
                    }}
                  >
                    <td style={{ width: 60 }}>{a.codigo}</td>
                    <td>{a.nombre}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GwWindow>
        </div>
      )}

      {generador && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-20">
          <GwWindow title="Generar tallas y colores" onClose={() => setGenerador(false)} className="w-[560px]">
            <div className="flex flex-col gap-1.5">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { titulo: 'Tallas', items: tallas, marcados: selTallas, set: setSelTallas, off: config.no_incluir_talla },
                  { titulo: 'Colores', items: colores, marcados: selColores, set: setSelColores, off: config.no_incluir_color },
                ].map((l) => (
                  <div key={l.titulo} className="flex flex-col">
                    <span className="gw-label">{l.titulo}</span>
                    <div className={`h-[150px] overflow-y-auto border border-[var(--gw-border)] bg-white px-1 ${l.off ? 'opacity-50' : ''}`}>
                      {l.items.length === 0 && <span className="text-[#6d6d6d]">Sin {l.titulo.toLowerCase()} en el maestro.</span>}
                      {l.items.map((it) => (
                        <GwCheck key={it.id} label={it.descripcion} checked={l.marcados.includes(it.id)} disabled={l.off} onChange={() => l.set(toggle(l.marcados, it.id))} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-x-2">
                <GwCheck label="No incluir talla" checked={config.no_incluir_talla} onChange={(v) => guardarConfig({ no_incluir_talla: v })} />
                <GwCheck label="No incluir color" checked={config.no_incluir_color} onChange={(v) => guardarConfig({ no_incluir_color: v })} />
                <GwCheck label="Rango alfabético" checked={config.rango_alfabetico} onChange={(v) => guardarConfig({ rango_alfabetico: v })} />
                <GwCheck label="Los hijos usan el código de compra del padre" checked={config.codigo_compra_es_padre} onChange={(v) => guardarConfig({ codigo_compra_es_padre: v })} />
              </div>
              <div className="flex justify-end gap-1.5">
                <button type="button" className="gw-btn" onClick={generar}>
                  Generar
                </button>
                <button type="button" className="gw-btn" onClick={() => setGenerador(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          </GwWindow>
        </div>
      )}
    </div>
  )
}

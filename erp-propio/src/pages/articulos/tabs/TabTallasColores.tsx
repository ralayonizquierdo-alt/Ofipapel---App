import { useEffect, useState } from 'react'
import { Check, Plus, Save, Trash2, Wand2, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwGroup, GwInput, GwNumber, GwSelect, formatGw } from '../../../components/gw'
import type { ArticuloTallaColorConfig, ArticuloVariante } from '../types'

interface Maestro {
  id: number
  descripcion: string
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
})

export function TabTallasColores({ articuloCodigo }: { articuloCodigo: string }) {
  const [config, setConfig] = useState<ArticuloTallaColorConfig>(emptyConfig(articuloCodigo))
  const [variantes, setVariantes] = useState<ArticuloVariante[]>([])
  const [tallas, setTallas] = useState<Maestro[]>([])
  const [colores, setColores] = useState<Maestro[]>([])
  const [stockPorCodigo, setStockPorCodigo] = useState<Record<string, number>>({})
  const [selTallas, setSelTallas] = useState<number[]>([])
  const [selColores, setSelColores] = useState<number[]>([])
  const [adding, setAdding] = useState(false)
  const [sel, setSel] = useState<number | null>(null)
  const [nueva, setNueva] = useState<{ talla_id: string; color_id: string; codigo_variante: string }>({ talla_id: '', color_id: '', codigo_variante: '' })
  const [error, setError] = useState<string | null>(null)
  const [savingConfig, setSavingConfig] = useState(false)

  async function loadVariantes() {
    const { data } = await supabase
      .from('articulo_variante')
      .select('id, articulo_codigo, talla_id, talla_descripcion, color_id, color_descripcion, codigo_variante')
      .eq('articulo_codigo', articuloCodigo)
      .order('talla_descripcion')
      .order('color_descripcion')
    const rows = (data ?? []) as ArticuloVariante[]
    setVariantes(rows)
    const codigos = rows.map((r) => r.codigo_variante).filter((c): c is string => !!c)
    if (codigos.length === 0) {
      setStockPorCodigo({})
      return
    }
    const { data: stock } = await supabase
      .from('articulo_almacen_stock')
      .select('articulo_codigo, cantidad_actual')
      .in('articulo_codigo', codigos)
    const map: Record<string, number> = {}
    for (const s of stock ?? []) map[s.articulo_codigo] = (map[s.articulo_codigo] ?? 0) + Number(s.cantidad_actual)
    setStockPorCodigo(map)
  }

  useEffect(() => {
    Promise.all([
      supabase.from('articulo_talla_color_config').select('*').eq('articulo_codigo', articuloCodigo).maybeSingle(),
      supabase.from('talla').select('id, descripcion').order('id'),
      supabase.from('color').select('id, descripcion').order('descripcion'),
    ]).then(([c, t, co]) => {
      if (c.data) setConfig(c.data as ArticuloTallaColorConfig)
      setTallas(t.data ?? [])
      setColores(co.data ?? [])
    })
    loadVariantes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articuloCodigo])

  async function saveConfig() {
    setSavingConfig(true)
    setError(null)
    const { error: err } = await supabase.from('articulo_talla_color_config').upsert(config, { onConflict: 'articulo_codigo' })
    setSavingConfig(false)
    if (err) setError(err.message)
  }

  async function addVariante() {
    setError(null)
    const talla = tallas.find((t) => t.id === Number(nueva.talla_id))
    const color = colores.find((c) => c.id === Number(nueva.color_id))
    if (!talla && !color) {
      setError('Elige al menos una talla o un color.')
      return
    }
    const { error: err } = await supabase.from('articulo_variante').insert({
      articulo_codigo: articuloCodigo,
      talla_id: talla?.id ?? null,
      talla_descripcion: talla?.descripcion ?? null,
      color_id: color?.id ?? null,
      color_descripcion: color?.descripcion ?? null,
      codigo_variante: nueva.codigo_variante || null,
    })
    if (err) {
      setError(err.message)
      return
    }
    setNueva({ talla_id: '', color_id: '', codigo_variante: '' })
    setAdding(false)
    loadVariantes()
  }

  async function updateCodigo(v: ArticuloVariante, codigo: string) {
    if (!v.id) return
    const { error: err } = await supabase.from('articulo_variante').update({ codigo_variante: codigo || null }).eq('id', v.id)
    if (err) setError(err.message)
    else loadVariantes()
  }

  async function deleteVariante() {
    const v = variantes.find((x) => x.id === sel)
    if (!v?.id) return
    if (!confirm(`¿Borrar la variante ${v.talla_descripcion ?? ''} ${v.color_descripcion ?? ''}?`)) return
    const { error: err } = await supabase.from('articulo_variante').delete().eq('id', v.id)
    if (err) setError(err.message)
    else {
      setSel(null)
      loadVariantes()
    }
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
        const key = `${t?.id ?? ''}|${c?.id ?? ''}`
        if (existentes.has(key)) continue
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
    if (nuevas.length === 0) {
      setError('No hay combinaciones nuevas: selecciona tallas y/o colores que aún no existan.')
      return
    }
    const { error: err } = await supabase.from('articulo_variante').insert(nuevas)
    if (err) {
      setError(err.message)
      return
    }
    setSelTallas([])
    setSelColores([])
    loadVariantes()
  }

  const toggleSel = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const lista = (titulo: string, items: Maestro[], marcados: number[], set: (v: number[]) => void, off: boolean) => (
    <div className="flex min-w-0 flex-col">
      <span className="gw-label">{titulo}</span>
      <div className={`h-[120px] overflow-y-auto border border-[var(--gw-border)] bg-white px-1 ${off ? 'opacity-50' : ''}`}>
        {items.length === 0 && <span className="text-[#6d6d6d]">Sin {titulo.toLowerCase()} en el maestro.</span>}
        {items.map((it) => (
          <GwCheck key={it.id} label={it.descripcion} checked={marcados.includes(it.id)} disabled={off} onChange={() => set(toggleSel(marcados, it.id))} />
        ))}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-1.5" title="TALLAS_M / TALLAS_D">
      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{error}</div>}
      <div className="grid grid-cols-[300px_minmax(0,1fr)] gap-2">
        <GwGroup title="Definición de Tallas y Colores">
          <div className="flex flex-col gap-1">
            <div className="grid grid-cols-[1fr_90px] items-center gap-x-2 gap-y-1">
              <span className="gw-label">Nº de Tallas:</span>
              <GwNumber value={config.num_tallas} decimals={0} onChange={(v) => setConfig({ ...config, num_tallas: v })} />
              <span className="gw-label">Nº de Colores:</span>
              <GwNumber value={config.num_colores} decimals={0} onChange={(v) => setConfig({ ...config, num_colores: v })} />
            </div>
            <GwCheck label="Rango alfabético" checked={config.rango_alfabetico} onChange={(v) => setConfig({ ...config, rango_alfabetico: v })} />
            <GwCheck label="No incluir talla" checked={config.no_incluir_talla} onChange={(v) => setConfig({ ...config, no_incluir_talla: v })} />
            <GwCheck label="No incluir color" checked={config.no_incluir_color} onChange={(v) => setConfig({ ...config, no_incluir_color: v })} />
            <GwCheck label="Pvp del padre" checked={config.pvp_es_padre} onChange={(v) => setConfig({ ...config, pvp_es_padre: v })} />
            <GwCheck
              label="Código de compra del padre"
              checked={config.codigo_compra_es_padre}
              onChange={(v) => setConfig({ ...config, codigo_compra_es_padre: v })}
            />
            <div className="mt-1">
              <button type="button" className="gw-btn" onClick={saveConfig} disabled={savingConfig}>
                <Save size={14} /> {savingConfig ? 'Guardando…' : 'Guardar definición'}
              </button>
            </div>
          </div>
        </GwGroup>
        <GwGroup title="Generar Tallas y Colores">
          <div className="grid grid-cols-2 gap-2">
            {lista('Tallas', tallas, selTallas, setSelTallas, config.no_incluir_talla)}
            {lista('Colores', colores, selColores, setSelColores, config.no_incluir_color)}
          </div>
          <div className="mt-1.5">
            <button type="button" className="gw-btn" onClick={generar} disabled={tallas.length === 0 && colores.length === 0}>
              <Wand2 size={14} /> Generar tallas y colores
            </button>
          </div>
        </GwGroup>
      </div>

      <div className="flex gap-1">
        <button
          type="button"
          className="gw-btn"
          disabled={adding}
          onClick={() => {
            setError(null)
            setAdding(true)
          }}
        >
          <Plus size={14} /> Añadir línea
        </button>
        <button type="button" className="gw-btn" disabled={sel == null || adding} onClick={deleteVariante}>
          <Trash2 size={14} /> Borrar línea
        </button>
      </div>
      <table className="gw-grid">
        <thead>
          <tr>
            <th style={{ width: 180 }}>Talla</th>
            <th style={{ width: 180 }}>Color</th>
            <th>Código del Artículo Hijo</th>
            <th className="text-right" style={{ width: 110 }}>Stock</th>
          </tr>
        </thead>
        <tbody>
          {variantes.length === 0 && !adding && (
            <tr>
              <td colSpan={4} className="text-center text-[#6d6d6d]">Sin artículos hijos.</td>
            </tr>
          )}
          {variantes.map((v) => (
            <tr key={v.id} className={sel === v.id ? 'gw-selected' : ''} onClick={() => setSel(v.id ?? null)}>
              <td>{v.talla_descripcion ?? ''}</td>
              <td>{v.color_descripcion ?? ''}</td>
              <td>
                <GwInput
                  key={v.codigo_variante ?? ''}
                  className="text-black"
                  defaultValue={v.codigo_variante ?? ''}
                  onBlur={(e) => e.target.value !== (v.codigo_variante ?? '') && updateCodigo(v, e.target.value)}
                />
              </td>
              <td className="text-right tabular-nums">
                {v.codigo_variante && stockPorCodigo[v.codigo_variante] != null ? formatGw(stockPorCodigo[v.codigo_variante], 3) : ''}
              </td>
            </tr>
          ))}
          {adding && (
            <tr>
              <td>
                <GwSelect autoFocus value={nueva.talla_id} onChange={(e) => setNueva({ ...nueva, talla_id: e.target.value })}>
                  <option value="">—</option>
                  {tallas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.descripcion}
                    </option>
                  ))}
                </GwSelect>
              </td>
              <td>
                <GwSelect value={nueva.color_id} onChange={(e) => setNueva({ ...nueva, color_id: e.target.value })}>
                  <option value="">—</option>
                  {colores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.descripcion}
                    </option>
                  ))}
                </GwSelect>
              </td>
              <td>
                <GwInput value={nueva.codigo_variante} onChange={(e) => setNueva({ ...nueva, codigo_variante: e.target.value })} />
              </td>
              <td>
                <div className="flex justify-end gap-1">
                  <button type="button" className="gw-btn px-1.5" title="Aceptar" onClick={addVariante}>
                    <Check size={14} className="text-[#127a12]" />
                  </button>
                  <button type="button" className="gw-btn px-1.5" title="Cancelar" onClick={() => setAdding(false)}>
                    <X size={14} className="text-[#c42b1c]" />
                  </button>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

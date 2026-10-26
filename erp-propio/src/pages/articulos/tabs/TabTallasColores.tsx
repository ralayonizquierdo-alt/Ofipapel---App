import { useEffect, useState } from 'react'
import { Plus, Trash2, Save, Wand2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { FormField, TextInput, SelectInput } from '../../../components/FormField'
import { Toggle } from '../../../components/Toggle'
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
    loadVariantes()
  }

  async function updateCodigo(v: ArticuloVariante, codigo: string) {
    if (!v.id) return
    const { error: err } = await supabase.from('articulo_variante').update({ codigo_variante: codigo || null }).eq('id', v.id)
    if (err) setError(err.message)
    else loadVariantes()
  }

  async function deleteVariante(v: ArticuloVariante) {
    if (!v.id) return
    if (!confirm(`¿Borrar la variante ${v.talla_descripcion ?? ''} ${v.color_descripcion ?? ''}?`)) return
    const { error: err } = await supabase.from('articulo_variante').delete().eq('id', v.id)
    if (err) setError(err.message)
    else loadVariantes()
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
  const num = (v: string) => (v === '' ? null : Number(v))
  const chip = (on: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs font-medium ${on ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`

  return (
    <div className="flex flex-col gap-5">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Definición de tallas y colores</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Nº de tallas" hint="NUMTALLAS">
            <TextInput type="number" value={config.num_tallas ?? ''} onChange={(e) => setConfig({ ...config, num_tallas: num(e.target.value) })} />
          </FormField>
          <FormField label="Nº de colores" hint="COLORES">
            <TextInput type="number" value={config.num_colores ?? ''} onChange={(e) => setConfig({ ...config, num_colores: num(e.target.value) })} />
          </FormField>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Toggle label="Rango alfabético (RANGOALFA)" checked={config.rango_alfabetico} onChange={(v) => setConfig({ ...config, rango_alfabetico: v })} />
          <Toggle label="No incluir talla (NOINCTAL)" checked={config.no_incluir_talla} onChange={(v) => setConfig({ ...config, no_incluir_talla: v })} />
          <Toggle label="No incluir color (NOINCCOL)" checked={config.no_incluir_color} onChange={(v) => setConfig({ ...config, no_incluir_color: v })} />
          <Toggle label="Los hijos usan el PVP del padre (PVPPADRE)" checked={config.pvp_es_padre} onChange={(v) => setConfig({ ...config, pvp_es_padre: v })} />
          <Toggle
            label="Los hijos usan el código de compra del padre (CODCOMPRPD)"
            checked={config.codigo_compra_es_padre}
            onChange={(v) => setConfig({ ...config, codigo_compra_es_padre: v })}
          />
        </div>
        <div>
          <button
            type="button"
            onClick={saveConfig}
            disabled={savingConfig}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Save size={14} /> {savingConfig ? 'Guardando…' : 'Guardar definición'}
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Generar tallas y colores</h3>
        {tallas.length === 0 && colores.length === 0 ? (
          <p className="text-sm text-slate-400">No hay tallas ni colores dados de alta en los maestros (tablas talla y color).</p>
        ) : (
          <>
            {!config.no_incluir_talla && tallas.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <span className="mr-1 self-center text-xs text-slate-500">Tallas:</span>
                {tallas.map((t) => (
                  <button key={t.id} type="button" className={chip(selTallas.includes(t.id))} onClick={() => setSelTallas(toggleSel(selTallas, t.id))}>
                    {t.descripcion}
                  </button>
                ))}
              </div>
            )}
            {!config.no_incluir_color && colores.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <span className="mr-1 self-center text-xs text-slate-500">Colores:</span>
                {colores.map((c) => (
                  <button key={c.id} type="button" className={chip(selColores.includes(c.id))} onClick={() => setSelColores(toggleSel(selColores, c.id))}>
                    {c.descripcion}
                  </button>
                ))}
              </div>
            )}
            <div>
              <button
                type="button"
                onClick={generar}
                className="flex items-center gap-1.5 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
              >
                <Wand2 size={14} /> Generar tallas y colores
              </button>
            </div>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Artículos hijos (variantes)</h3>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Talla</th>
                <th className="px-3 py-2">Color</th>
                <th className="px-3 py-2">Código del hijo</th>
                <th className="px-3 py-2 text-right">Stock</th>
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {variantes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-slate-400">Sin variantes.</td>
                </tr>
              )}
              {variantes.map((v) => (
                <tr key={v.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-1.5">{v.talla_descripcion ?? '—'}</td>
                  <td className="px-3 py-1.5">{v.color_descripcion ?? '—'}</td>
                  <td className="px-3 py-1.5">
                    <TextInput
                      className="w-40 py-1"
                      defaultValue={v.codigo_variante ?? ''}
                      onBlur={(e) => e.target.value !== (v.codigo_variante ?? '') && updateCodigo(v, e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {v.codigo_variante && stockPorCodigo[v.codigo_variante] != null ? stockPorCodigo[v.codigo_variante].toFixed(3) : '—'}
                  </td>
                  <td className="px-3 py-1.5">
                    <button type="button" onClick={() => deleteVariante(v)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Borrar línea">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td className="px-3 py-1.5">
                  <SelectInput className="py-1" value={nueva.talla_id} onChange={(e) => setNueva({ ...nueva, talla_id: e.target.value })}>
                    <option value="">—</option>
                    {tallas.map((t) => (
                      <option key={t.id} value={t.id}>{t.descripcion}</option>
                    ))}
                  </SelectInput>
                </td>
                <td className="px-3 py-1.5">
                  <SelectInput className="py-1" value={nueva.color_id} onChange={(e) => setNueva({ ...nueva, color_id: e.target.value })}>
                    <option value="">—</option>
                    {colores.map((c) => (
                      <option key={c.id} value={c.id}>{c.descripcion}</option>
                    ))}
                  </SelectInput>
                </td>
                <td className="px-3 py-1.5">
                  <TextInput className="w-40 py-1" value={nueva.codigo_variante} onChange={(e) => setNueva({ ...nueva, codigo_variante: e.target.value })} />
                </td>
                <td colSpan={2} className="px-3 py-1.5 text-right">
                  <button type="button" onClick={addVariante} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">
                    <Plus size={14} /> Añadir
                  </button>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Save, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { TextInput, SelectInput } from '../../../components/FormField'
import { Toggle } from '../../../components/Toggle'
import { NIVELES_TARIFA, type ArticuloUnidadVenta } from '../types'

const TIPOS_CALCULO = [
  { value: 0, label: 'Proporcional' },
  { value: 1, label: '% sobre el anterior' },
  { value: 2, label: 'PVP fijo' },
  { value: 3, label: 'Tarifas de la ficha' },
]

type Draft = Omit<ArticuloUnidadVenta, 'precios'>

const num = (v: string) => (v === '' ? null : Number(v))
const th = 'px-2 py-2 text-left font-semibold'
const td = 'px-2 py-1.5'
const miniBtn =
  'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-30'

export function TabUnidadesVenta({ articuloCodigo }: { articuloCodigo: string }) {
  const [rows, setRows] = useState<Draft[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editing, setEditing] = useState<Draft | null>(null)
  const [precios, setPrecios] = useState<Record<number, string>>({})
  const [preciosDirty, setPreciosDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const { data, error: err } = await supabase
      .from('articulo_unidad_venta')
      .select('id, articulo_codigo, descripcion, factor_conversion, tipo_calculo_precio, incremento_pct, no_vender')
      .eq('articulo_codigo', articuloCodigo)
      .order('id')
    if (err) setError(err.message)
    setRows(data ?? [])
  }

  async function loadPrecios(id: number) {
    const { data } = await supabase
      .from('articulo_unidad_venta_precio_nivel')
      .select('nivel_tarifa, pvp')
      .eq('articulo_unidad_venta_id', id)
    const map: Record<number, string> = {}
    for (const r of data ?? []) map[r.nivel_tarifa] = String(r.pvp)
    setPrecios(map)
    setPreciosDirty(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articuloCodigo])

  useEffect(() => {
    if (selectedId != null) loadPrecios(selectedId)
    else setPrecios({})
  }, [selectedId])

  function startNew() {
    setEditing({
      articulo_codigo: articuloCodigo,
      descripcion: '',
      factor_conversion: 1,
      tipo_calculo_precio: 0,
      incremento_pct: null,
      no_vender: false,
    })
  }

  async function saveRow() {
    if (!editing) return
    setError(null)
    if (!editing.descripcion.trim()) {
      setError('La unidad necesita una descripción (p. ej. Unidad, Caja).')
      return
    }
    const payload = {
      articulo_codigo: articuloCodigo,
      descripcion: editing.descripcion,
      factor_conversion: editing.factor_conversion,
      tipo_calculo_precio: editing.tipo_calculo_precio,
      incremento_pct: editing.incremento_pct,
      no_vender: editing.no_vender,
    }
    const { error: err } =
      editing.id != null
        ? await supabase.from('articulo_unidad_venta').update(payload).eq('id', editing.id)
        : await supabase.from('articulo_unidad_venta').insert(payload)
    if (err) {
      setError(err.message)
      return
    }
    setEditing(null)
    load()
  }

  async function deleteRow(row: Draft) {
    if (row.id == null) return
    if (!confirm(`¿Borrar la unidad de venta «${row.descripcion}» y sus precios?`)) return
    await supabase.from('articulo_unidad_venta_precio_nivel').delete().eq('articulo_unidad_venta_id', row.id)
    const { error: err } = await supabase.from('articulo_unidad_venta').delete().eq('id', row.id)
    if (err) {
      setError(err.message)
      return
    }
    if (selectedId === row.id) setSelectedId(null)
    load()
  }

  async function savePrecios() {
    if (selectedId == null) return
    setError(null)
    const upserts = NIVELES_TARIFA.filter((n) => precios[n.nivel] !== undefined && precios[n.nivel] !== '').map((n) => ({
      articulo_unidad_venta_id: selectedId,
      nivel_tarifa: n.nivel,
      pvp: Number(precios[n.nivel]),
    }))
    const vacios = NIVELES_TARIFA.filter((n) => precios[n.nivel] === '').map((n) => n.nivel)
    if (upserts.length) {
      const { error: err } = await supabase
        .from('articulo_unidad_venta_precio_nivel')
        .upsert(upserts, { onConflict: 'articulo_unidad_venta_id,nivel_tarifa' })
      if (err) {
        setError(err.message)
        return
      }
    }
    if (vacios.length) {
      await supabase
        .from('articulo_unidad_venta_precio_nivel')
        .delete()
        .eq('articulo_unidad_venta_id', selectedId)
        .in('nivel_tarifa', vacios)
    }
    loadPrecios(selectedId)
  }

  const selected = rows.find((r) => r.id === selectedId)

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-slate-500">
        Unidad de stock y unidades de venta (p. ej. unidad y caja), cada una con su forma de cálculo del PVP y sus 7
        precios. Tablas ARTUNDVT.
      </p>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1">
          <span className="mr-auto text-xs font-semibold uppercase tracking-wide text-slate-500">Unidades de venta</span>
          <button type="button" className={miniBtn} onClick={startNew} disabled={!!editing}>
            <Plus size={14} /> Añadir línea
          </button>
          <button
            type="button"
            className={miniBtn}
            disabled={!selected || !!editing}
            onClick={() => selected && setEditing({ ...selected })}
          >
            <Pencil size={14} /> Modificar
          </button>
          <button
            type="button"
            className={`${miniBtn} hover:bg-red-50 hover:text-red-600`}
            disabled={!selected || !!editing}
            onClick={() => selected && deleteRow(selected)}
          >
            <Trash2 size={14} /> Borrar línea
          </button>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className={th}>Descripción</th>
              <th className={th}>Unidades (factor)</th>
              <th className={th}>Cálculo del PVP</th>
              <th className={th}>Incremento %</th>
              <th className={th}>No vender</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !editing && (
              <tr>
                <td colSpan={6} className="px-2 py-4 text-center text-slate-400">
                  Sin unidades de venta: se vende solo por la unidad de stock.
                </td>
              </tr>
            )}
            {rows.map((r) =>
              editing && editing.id === r.id ? (
                <EditRow key={r.id} draft={editing} setDraft={setEditing} onSave={saveRow} onCancel={() => setEditing(null)} />
              ) : (
                <tr
                  key={r.id}
                  onClick={() => setSelectedId(r.id ?? null)}
                  className={`cursor-pointer border-b border-slate-100 last:border-0 ${
                    selectedId === r.id ? 'bg-indigo-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <td className={td}>{r.descripcion}</td>
                  <td className={td}>{r.factor_conversion}</td>
                  <td className={td}>{TIPOS_CALCULO.find((t) => t.value === r.tipo_calculo_precio)?.label ?? '—'}</td>
                  <td className={td}>{r.incremento_pct ?? '—'}</td>
                  <td className={td}>{r.no_vender ? 'Sí' : 'No'}</td>
                  <td className={td} />
                </tr>
              ),
            )}
            {editing && editing.id == null && (
              <EditRow draft={editing} setDraft={setEditing} onSave={saveRow} onCancel={() => setEditing(null)} />
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1">
            <span className="mr-auto text-xs font-semibold uppercase tracking-wide text-slate-500">
              Precios de «{selected.descripcion}» por tarifa
            </span>
            <button type="button" className={miniBtn} disabled={!preciosDirty} onClick={savePrecios}>
              <Save size={14} /> Guardar precios
            </button>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                {NIVELES_TARIFA.map((n) => (
                  <th key={n.nivel} className={th}>
                    {n.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {NIVELES_TARIFA.map((n) => (
                  <td key={n.nivel} className={td}>
                    <TextInput
                      type="number"
                      step="0.001"
                      className="w-full py-1 text-xs"
                      value={precios[n.nivel] ?? ''}
                      onChange={(e) => {
                        setPrecios((p) => ({ ...p, [n.nivel]: e.target.value }))
                        setPreciosDirty(true)
                      }}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function EditRow({
  draft,
  setDraft,
  onSave,
  onCancel,
}: {
  draft: Draft
  setDraft: (d: Draft) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <tr className="border-b border-slate-100 bg-amber-50/40">
      <td className={td}>
        <TextInput
          className="w-full py-1 text-xs"
          value={draft.descripcion}
          onChange={(e) => setDraft({ ...draft, descripcion: e.target.value })}
          autoFocus
        />
      </td>
      <td className={td}>
        <TextInput
          type="number"
          step="0.001"
          className="w-24 py-1 text-xs"
          value={draft.factor_conversion}
          onChange={(e) => setDraft({ ...draft, factor_conversion: Number(e.target.value || 0) })}
        />
      </td>
      <td className={td}>
        <SelectInput
          className="py-1 text-xs"
          value={draft.tipo_calculo_precio ?? ''}
          onChange={(e) => setDraft({ ...draft, tipo_calculo_precio: num(e.target.value) })}
        >
          {TIPOS_CALCULO.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </SelectInput>
      </td>
      <td className={td}>
        <TextInput
          type="number"
          step="0.01"
          className="w-20 py-1 text-xs"
          value={draft.incremento_pct ?? ''}
          onChange={(e) => setDraft({ ...draft, incremento_pct: num(e.target.value) })}
        />
      </td>
      <td className={td}>
        <Toggle label="" checked={draft.no_vender} onChange={(v) => setDraft({ ...draft, no_vender: v })} />
      </td>
      <td className={`${td} whitespace-nowrap`}>
        <button type="button" className={miniBtn} onClick={onSave}>
          <Save size={14} />
        </button>
        <button type="button" className={miniBtn} onClick={onCancel}>
          <X size={14} />
        </button>
      </td>
    </tr>
  )
}

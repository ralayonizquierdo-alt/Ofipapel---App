import { useEffect, useState } from 'react'
import { Check, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwGroup, GwInput, GwNumber, GwSelect, formatGw } from '../../../components/gw'
import { NIVELES_TARIFA, type ArticuloUnidadVenta } from '../types'

const TIPOS_CALCULO = [
  { value: 0, label: 'Proporcional' },
  { value: 1, label: '% sobre el anterior' },
  { value: 2, label: 'Pvp fijo' },
  { value: 3, label: 'Tarifas de la ficha' },
]

type Draft = Omit<ArticuloUnidadVenta, 'precios'>

export function TabUnidadesVenta({ articuloCodigo }: { articuloCodigo: string }) {
  const [rows, setRows] = useState<Draft[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editing, setEditing] = useState<Draft | null>(null)
  const [precios, setPrecios] = useState<Record<number, number | null>>({})
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
    const map: Record<number, number | null> = {}
    for (const r of data ?? []) map[r.nivel_tarifa] = Number(r.pvp)
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
    setError(null)
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
    const upserts = NIVELES_TARIFA.filter((n) => precios[n.nivel] != null).map((n) => ({
      articulo_unidad_venta_id: selectedId,
      nivel_tarifa: n.nivel,
      pvp: Number(precios[n.nivel]),
    }))
    const vacios = NIVELES_TARIFA.filter((n) => n.nivel in precios && precios[n.nivel] == null).map((n) => n.nivel)
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

  const editRow = (d: Draft) => (
    <tr key={d.id ?? 'nueva'}>
      <td>
        <GwInput autoFocus value={d.descripcion} onChange={(e) => setEditing({ ...d, descripcion: e.target.value })} />
      </td>
      <td>
        <GwNumber value={d.factor_conversion} decimals={3} onChange={(v) => setEditing({ ...d, factor_conversion: v ?? 0 })} />
      </td>
      <td>
        <GwSelect
          value={d.tipo_calculo_precio ?? ''}
          onChange={(e) => setEditing({ ...d, tipo_calculo_precio: e.target.value === '' ? null : Number(e.target.value) })}
        >
          {TIPOS_CALCULO.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </GwSelect>
      </td>
      <td>
        <GwNumber value={d.incremento_pct} decimals={2} onChange={(v) => setEditing({ ...d, incremento_pct: v })} />
      </td>
      <td>
        <div className="flex items-center gap-1">
          <GwCheck label="" checked={d.no_vender} onChange={(v) => setEditing({ ...d, no_vender: v })} />
          <button type="button" className="gw-btn ml-auto px-1.5" title="Aceptar" onClick={saveRow}>
            <Check size={14} className="text-[#127a12]" />
          </button>
          <button type="button" className="gw-btn px-1.5" title="Cancelar" onClick={() => setEditing(null)}>
            <X size={14} className="text-[#c42b1c]" />
          </button>
        </div>
      </td>
    </tr>
  )

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-2" title="ARTUNDVT">
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-1">
          <button type="button" className="gw-btn" onClick={startNew} disabled={!!editing}>
            <Plus size={14} /> Añadir línea
          </button>
          <button
            type="button"
            className="gw-btn"
            disabled={!selected || !!editing}
            onClick={() => {
              setError(null)
              if (selected) setEditing({ ...selected })
            }}
          >
            <Pencil size={14} /> Modificar línea
          </button>
          <button type="button" className="gw-btn" disabled={!selected || !!editing} onClick={() => selected && deleteRow(selected)}>
            <Trash2 size={14} /> Borrar línea
          </button>
        </div>
        {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{error}</div>}
        <table className="gw-grid">
          <thead>
            <tr>
              <th>Unidad de Venta</th>
              <th className="text-right" style={{ width: 110 }}>Unidades</th>
              <th style={{ width: 170 }}>Cálculo del Pvp</th>
              <th className="text-right" style={{ width: 90 }}>% Incr.</th>
              <th style={{ width: 120 }}>No vender</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !editing && (
              <tr>
                <td colSpan={5} className="text-center text-[#6d6d6d]">Sin unidades de venta.</td>
              </tr>
            )}
            {rows.map((r) =>
              editing && editing.id === r.id ? (
                editRow(editing)
              ) : (
                <tr key={r.id} className={selectedId === r.id ? 'gw-selected' : ''} onClick={() => !editing && setSelectedId(r.id ?? null)}>
                  <td>{r.descripcion}</td>
                  <td className="text-right tabular-nums">{formatGw(r.factor_conversion, 3)}</td>
                  <td>{TIPOS_CALCULO.find((t) => t.value === r.tipo_calculo_precio)?.label ?? ''}</td>
                  <td className="text-right tabular-nums">{formatGw(r.incremento_pct, 2)}</td>
                  <td>{r.no_vender ? 'Sí' : 'No'}</td>
                </tr>
              ),
            )}
            {editing && editing.id == null && editRow(editing)}
          </tbody>
        </table>
      </div>

      <GwGroup title={selected ? `Pvps de «${selected.descripcion}»` : 'Pvps'}>
        <div className="grid grid-cols-[1fr_120px] items-center gap-x-2 gap-y-1">
          {NIVELES_TARIFA.map((n) => (
            <div key={n.nivel} className="contents">
              <span className="gw-label">{n.nombre}:</span>
              <GwNumber
                value={precios[n.nivel] ?? null}
                decimals={3}
                disabled={!selected}
                onChange={(v) => {
                  setPrecios((p) => ({ ...p, [n.nivel]: v }))
                  setPreciosDirty(true)
                }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-end">
          <button type="button" className="gw-btn" disabled={!selected || !preciosDirty} onClick={savePrecios}>
            <Save size={14} /> Guardar Pvps
          </button>
        </div>
      </GwGroup>
    </div>
  )
}

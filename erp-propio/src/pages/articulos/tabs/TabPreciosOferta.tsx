import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Plus, Pencil, Trash2, Save, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { TextInput, SelectInput } from '../../../components/FormField'
import { Toggle } from '../../../components/Toggle'
import { NIVELES_TARIFA, type ArticuloOferta, type ArticuloTarifaCantidad } from '../types'

const num = (v: string) => (v === '' ? null : Number(v))
const str = (v: string) => (v === '' ? null : v)
const th = 'px-2 py-2 text-left font-semibold'
const td = 'px-2 py-1.5'
const inp = 'w-full py-1 text-xs'
const miniBtn =
  'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-30'

const TIPOS_OFERTA = [
  { value: 0, label: 'Descuento' },
  { value: 1, label: 'Regalo' },
]

interface NivelDraft {
  pvp: string
  incremento_pct: string
  modo_calculo: string
  permite_descuento_linea: boolean
}

function periodo(fd: string | null, hd: string | null, fh: string | null, hh: string | null) {
  if (!fd && !fh) return '—'
  return `${fd ?? '…'} ${hd ?? ''} → ${fh ?? '…'} ${hh ?? ''}`.trim()
}

function GridBar({
  title,
  onAdd,
  onEdit,
  onDelete,
  canEdit,
  busy,
  extra,
}: {
  title: string
  onAdd: () => void
  onEdit: () => void
  onDelete: () => void
  canEdit: boolean
  busy: boolean
  extra?: ReactNode
}) {
  return (
    <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1">
      <span className="mr-auto text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</span>
      {extra}
      <button type="button" className={miniBtn} onClick={onAdd} disabled={busy}>
        <Plus size={14} /> Añadir línea
      </button>
      <button type="button" className={miniBtn} onClick={onEdit} disabled={!canEdit || busy}>
        <Pencil size={14} /> Modificar
      </button>
      <button
        type="button"
        className={`${miniBtn} hover:bg-red-50 hover:text-red-600`}
        onClick={onDelete}
        disabled={!canEdit || busy}
      >
        <Trash2 size={14} /> Borrar línea
      </button>
    </div>
  )
}

function RowActions({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  return (
    <td className={`${td} whitespace-nowrap`}>
      <button type="button" className={miniBtn} onClick={onSave}>
        <Save size={14} />
      </button>
      <button type="button" className={miniBtn} onClick={onCancel}>
        <X size={14} />
      </button>
    </td>
  )
}

export function TabPreciosOferta({ articuloCodigo }: { articuloCodigo: string }) {
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-slate-500">
        Ofertas por fecha, hora y cantidad mínima (con su precio en cada tarifa) y ofertas con regalos y descuentos.
        Tablas ARTTARIF y ARTOFERT.
      </p>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <OfertasCantidad articuloCodigo={articuloCodigo} setError={setError} />
      <OfertasRegalo articuloCodigo={articuloCodigo} setError={setError} />
    </div>
  )
}

function OfertasCantidad({
  articuloCodigo,
  setError,
}: {
  articuloCodigo: string
  setError: (e: string | null) => void
}) {
  const [rows, setRows] = useState<ArticuloTarifaCantidad[]>([])
  const [almacenes, setAlmacenes] = useState<{ codigo: string; nombre: string }[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editing, setEditing] = useState<ArticuloTarifaCantidad | null>(null)
  const [niveles, setNiveles] = useState<Record<number, NivelDraft>>({})
  const [nivelesDirty, setNivelesDirty] = useState(false)

  async function load() {
    const { data, error } = await supabase
      .from('articulo_tarifa_cantidad')
      .select(
        'id, articulo_codigo, cantidad_desde, descripcion_oferta, fecha_desde, hora_desde, fecha_hasta, hora_hasta, stock_minimo_oferta, almacen_oferta_codigo, es_un_pvp_para_toda_la_oferta',
      )
      .eq('articulo_codigo', articuloCodigo)
      .order('cantidad_desde')
    if (error) setError(error.message)
    setRows(data ?? [])
  }

  async function loadNiveles(id: number) {
    const { data } = await supabase
      .from('articulo_tarifa_cantidad_nivel')
      .select('nivel_tarifa, pvp, incremento_pct, modo_calculo, permite_descuento_linea')
      .eq('articulo_tarifa_cantidad_id', id)
    const map: Record<number, NivelDraft> = {}
    for (const r of data ?? []) {
      map[r.nivel_tarifa] = {
        pvp: String(r.pvp),
        incremento_pct: r.incremento_pct == null ? '' : String(r.incremento_pct),
        modo_calculo: r.modo_calculo ?? 'P',
        permite_descuento_linea: r.permite_descuento_linea,
      }
    }
    setNiveles(map)
    setNivelesDirty(false)
  }

  useEffect(() => {
    load()
    supabase
      .from('almacen')
      .select('codigo, nombre')
      .order('codigo')
      .then(({ data }) => setAlmacenes(data ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articuloCodigo])

  useEffect(() => {
    if (selectedId != null) loadNiveles(selectedId)
    else setNiveles({})
  }, [selectedId])

  async function saveRow() {
    if (!editing) return
    setError(null)
    const payload = {
      articulo_codigo: articuloCodigo,
      cantidad_desde: editing.cantidad_desde,
      descripcion_oferta: editing.descripcion_oferta,
      fecha_desde: editing.fecha_desde,
      hora_desde: editing.hora_desde,
      fecha_hasta: editing.fecha_hasta,
      hora_hasta: editing.hora_hasta,
      stock_minimo_oferta: editing.stock_minimo_oferta,
      almacen_oferta_codigo: editing.almacen_oferta_codigo,
      es_un_pvp_para_toda_la_oferta: editing.es_un_pvp_para_toda_la_oferta,
    }
    const { error } =
      editing.id != null
        ? await supabase.from('articulo_tarifa_cantidad').update(payload).eq('id', editing.id)
        : await supabase.from('articulo_tarifa_cantidad').insert(payload)
    if (error) {
      setError(error.message)
      return
    }
    setEditing(null)
    load()
  }

  async function deleteSelected() {
    const row = rows.find((r) => r.id === selectedId)
    if (!row || row.id == null) return
    if (!confirm(`¿Borrar la oferta desde ${row.cantidad_desde} unidades y sus precios por tarifa?`)) return
    await supabase.from('articulo_tarifa_cantidad_nivel').delete().eq('articulo_tarifa_cantidad_id', row.id)
    const { error } = await supabase.from('articulo_tarifa_cantidad').delete().eq('id', row.id)
    if (error) {
      setError(error.message)
      return
    }
    setSelectedId(null)
    load()
  }

  async function saveNiveles() {
    if (selectedId == null) return
    setError(null)
    const conPvp = NIVELES_TARIFA.filter((n) => niveles[n.nivel]?.pvp)
    const sinPvp = NIVELES_TARIFA.filter((n) => niveles[n.nivel] && !niveles[n.nivel].pvp).map((n) => n.nivel)
    if (conPvp.length) {
      const { error } = await supabase.from('articulo_tarifa_cantidad_nivel').upsert(
        conPvp.map((n) => ({
          articulo_tarifa_cantidad_id: selectedId,
          nivel_tarifa: n.nivel,
          pvp: Number(niveles[n.nivel].pvp),
          incremento_pct: num(niveles[n.nivel].incremento_pct),
          modo_calculo: niveles[n.nivel].modo_calculo || null,
          permite_descuento_linea: niveles[n.nivel].permite_descuento_linea,
        })),
        { onConflict: 'articulo_tarifa_cantidad_id,nivel_tarifa' },
      )
      if (error) {
        setError(error.message)
        return
      }
    }
    if (sinPvp.length) {
      await supabase
        .from('articulo_tarifa_cantidad_nivel')
        .delete()
        .eq('articulo_tarifa_cantidad_id', selectedId)
        .in('nivel_tarifa', sinPvp)
    }
    loadNiveles(selectedId)
  }

  function setNivel(nivel: number, patch: Partial<NivelDraft>) {
    setNiveles((m) => ({
      ...m,
      [nivel]: { ...(m[nivel] ?? { pvp: '', incremento_pct: '', modo_calculo: 'P', permite_descuento_linea: true }), ...patch },
    }))
    setNivelesDirty(true)
  }

  const selected = rows.find((r) => r.id === selectedId)

  const editRow = (d: ArticuloTarifaCantidad) => (
    <tr className="border-b border-slate-100 bg-amber-50/40">
      <td className={td}>
        <TextInput
          type="number"
          step="0.001"
          className={inp}
          value={d.cantidad_desde}
          onChange={(e) => setEditing({ ...d, cantidad_desde: Number(e.target.value || 0) })}
          autoFocus
        />
      </td>
      <td className={td}>
        <TextInput
          className={inp}
          value={d.descripcion_oferta ?? ''}
          onChange={(e) => setEditing({ ...d, descripcion_oferta: str(e.target.value) })}
        />
      </td>
      <td className={td}>
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            <TextInput type="date" className={inp} value={d.fecha_desde ?? ''} onChange={(e) => setEditing({ ...d, fecha_desde: str(e.target.value) })} />
            <TextInput type="time" className="w-20 py-1 text-xs" value={d.hora_desde ?? ''} onChange={(e) => setEditing({ ...d, hora_desde: str(e.target.value) })} />
          </div>
          <div className="flex gap-1">
            <TextInput type="date" className={inp} value={d.fecha_hasta ?? ''} onChange={(e) => setEditing({ ...d, fecha_hasta: str(e.target.value) })} />
            <TextInput type="time" className="w-20 py-1 text-xs" value={d.hora_hasta ?? ''} onChange={(e) => setEditing({ ...d, hora_hasta: str(e.target.value) })} />
          </div>
        </div>
      </td>
      <td className={td}>
        <TextInput
          type="number"
          step="0.001"
          className={inp}
          value={d.stock_minimo_oferta ?? ''}
          onChange={(e) => setEditing({ ...d, stock_minimo_oferta: num(e.target.value) })}
        />
      </td>
      <td className={td}>
        <SelectInput
          className={inp}
          value={d.almacen_oferta_codigo ?? ''}
          onChange={(e) => setEditing({ ...d, almacen_oferta_codigo: str(e.target.value) })}
        >
          <option value="">Todos</option>
          {almacenes.map((a) => (
            <option key={a.codigo} value={a.codigo}>
              {a.codigo} — {a.nombre}
            </option>
          ))}
        </SelectInput>
      </td>
      <td className={td}>
        <Toggle
          label=""
          checked={d.es_un_pvp_para_toda_la_oferta}
          onChange={(v) => setEditing({ ...d, es_un_pvp_para_toda_la_oferta: v })}
        />
      </td>
      <RowActions onSave={saveRow} onCancel={() => setEditing(null)} />
    </tr>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <GridBar
          title="Ofertas por fecha, hora y cantidad"
          busy={!!editing}
          canEdit={!!selected}
          onAdd={() =>
            setEditing({
              articulo_codigo: articuloCodigo,
              cantidad_desde: 1,
              descripcion_oferta: null,
              fecha_desde: null,
              hora_desde: null,
              fecha_hasta: null,
              hora_hasta: null,
              stock_minimo_oferta: null,
              almacen_oferta_codigo: null,
              es_un_pvp_para_toda_la_oferta: false,
            })
          }
          onEdit={() => selected && setEditing({ ...selected })}
          onDelete={deleteSelected}
        />
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className={th}>Desde cantidad</th>
              <th className={th}>Descripción</th>
              <th className={th}>Periodo</th>
              <th className={th}>Stock de oferta</th>
              <th className={th}>Almacén</th>
              <th className={th}>Mismo PVP todas las tarifas</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !editing && (
              <tr>
                <td colSpan={7} className="px-2 py-4 text-center text-slate-400">
                  Sin ofertas por cantidad.
                </td>
              </tr>
            )}
            {rows.map((r) =>
              editing && editing.id === r.id ? (
                <Fragment key={r.id}>{editRow(editing)}</Fragment>
              ) : (
                <tr
                  key={r.id}
                  onClick={() => setSelectedId(r.id ?? null)}
                  className={`cursor-pointer border-b border-slate-100 last:border-0 ${
                    selectedId === r.id ? 'bg-indigo-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <td className={td}>{r.cantidad_desde}</td>
                  <td className={td}>{r.descripcion_oferta ?? '—'}</td>
                  <td className={td}>{periodo(r.fecha_desde, r.hora_desde, r.fecha_hasta, r.hora_hasta)}</td>
                  <td className={td}>{r.stock_minimo_oferta ?? '—'}</td>
                  <td className={td}>{r.almacen_oferta_codigo ?? 'Todos'}</td>
                  <td className={td}>{r.es_un_pvp_para_toda_la_oferta ? 'Sí' : 'No'}</td>
                  <td className={td} />
                </tr>
              ),
            )}
            {editing && editing.id == null && editRow(editing)}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1">
            <span className="mr-auto text-xs font-semibold uppercase tracking-wide text-slate-500">
              Precio por tarifa desde {selected.cantidad_desde} unidades
            </span>
            <button type="button" className={miniBtn} disabled={!nivelesDirty} onClick={saveNiveles}>
              <Save size={14} /> Guardar precios
            </button>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className={th}>Tarifa</th>
                <th className={th}>Modo</th>
                <th className={th}>Incremento %</th>
                <th className={th}>PVP</th>
                <th className={th}>Permite dto. en línea</th>
              </tr>
            </thead>
            <tbody>
              {NIVELES_TARIFA.map((n) => {
                const v = niveles[n.nivel]
                return (
                  <tr key={n.nivel} className="border-b border-slate-100 last:border-0">
                    <td className={`${td} font-medium text-slate-700`}>{n.nombre}</td>
                    <td className={td}>
                      <SelectInput
                        className="py-1 text-xs"
                        value={v?.modo_calculo ?? 'P'}
                        onChange={(e) => setNivel(n.nivel, { modo_calculo: e.target.value })}
                      >
                        <option value="P">P — % sobre coste</option>
                        <option value="D">D — % dto. sobre General</option>
                      </SelectInput>
                    </td>
                    <td className={td}>
                      <TextInput
                        type="number"
                        step="0.01"
                        className="w-24 py-1 text-xs"
                        value={v?.incremento_pct ?? ''}
                        onChange={(e) => setNivel(n.nivel, { incremento_pct: e.target.value })}
                      />
                    </td>
                    <td className={td}>
                      <TextInput
                        type="number"
                        step="0.001"
                        className="w-28 py-1 text-xs"
                        value={v?.pvp ?? ''}
                        onChange={(e) => setNivel(n.nivel, { pvp: e.target.value })}
                      />
                    </td>
                    <td className={td}>
                      <Toggle
                        label=""
                        checked={v?.permite_descuento_linea ?? true}
                        onChange={(val) => setNivel(n.nivel, { permite_descuento_linea: val })}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function OfertasRegalo({
  articuloCodigo,
  setError,
}: {
  articuloCodigo: string
  setError: (e: string | null) => void
}) {
  const [rows, setRows] = useState<ArticuloOferta[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editing, setEditing] = useState<ArticuloOferta | null>(null)

  async function load() {
    const { data, error } = await supabase
      .from('articulo_oferta')
      .select(
        'id, articulo_codigo, tipo_oferta, descripcion, fecha_desde, hora_desde, fecha_hasta, hora_hasta, cada_x_cantidad, articulo_regalo_codigo, cantidad_oferta, descuento_pct, pvp_fijo',
      )
      .eq('articulo_codigo', articuloCodigo)
      .order('id')
    if (error) setError(error.message)
    setRows(data ?? [])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articuloCodigo])

  async function saveRow() {
    if (!editing) return
    setError(null)
    const payload = {
      articulo_codigo: articuloCodigo,
      tipo_oferta: editing.tipo_oferta,
      descripcion: editing.descripcion,
      fecha_desde: editing.fecha_desde,
      hora_desde: editing.hora_desde,
      fecha_hasta: editing.fecha_hasta,
      hora_hasta: editing.hora_hasta,
      cada_x_cantidad: editing.cada_x_cantidad,
      articulo_regalo_codigo: editing.articulo_regalo_codigo,
      cantidad_oferta: editing.cantidad_oferta,
      descuento_pct: editing.descuento_pct,
      pvp_fijo: editing.pvp_fijo,
    }
    const { error } =
      editing.id != null
        ? await supabase.from('articulo_oferta').update(payload).eq('id', editing.id)
        : await supabase.from('articulo_oferta').insert(payload)
    if (error) {
      setError(error.message)
      return
    }
    setEditing(null)
    load()
  }

  async function deleteSelected() {
    const row = rows.find((r) => r.id === selectedId)
    if (!row || row.id == null) return
    if (!confirm('¿Borrar esta oferta?')) return
    const { error } = await supabase.from('articulo_oferta').delete().eq('id', row.id)
    if (error) {
      setError(error.message)
      return
    }
    setSelectedId(null)
    load()
  }

  const selected = rows.find((r) => r.id === selectedId)

  const editRow = (d: ArticuloOferta) => (
    <tr className="border-b border-slate-100 bg-amber-50/40">
      <td className={td}>
        <SelectInput
          className={inp}
          value={d.tipo_oferta}
          onChange={(e) => setEditing({ ...d, tipo_oferta: Number(e.target.value) })}
        >
          {TIPOS_OFERTA.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </SelectInput>
      </td>
      <td className={td}>
        <TextInput className={inp} value={d.descripcion ?? ''} onChange={(e) => setEditing({ ...d, descripcion: str(e.target.value) })} autoFocus />
      </td>
      <td className={td}>
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            <TextInput type="date" className={inp} value={d.fecha_desde ?? ''} onChange={(e) => setEditing({ ...d, fecha_desde: str(e.target.value) })} />
            <TextInput type="time" className="w-20 py-1 text-xs" value={d.hora_desde ?? ''} onChange={(e) => setEditing({ ...d, hora_desde: str(e.target.value) })} />
          </div>
          <div className="flex gap-1">
            <TextInput type="date" className={inp} value={d.fecha_hasta ?? ''} onChange={(e) => setEditing({ ...d, fecha_hasta: str(e.target.value) })} />
            <TextInput type="time" className="w-20 py-1 text-xs" value={d.hora_hasta ?? ''} onChange={(e) => setEditing({ ...d, hora_hasta: str(e.target.value) })} />
          </div>
        </div>
      </td>
      <td className={td}>
        <TextInput type="number" step="0.001" className={inp} value={d.cada_x_cantidad ?? ''} onChange={(e) => setEditing({ ...d, cada_x_cantidad: num(e.target.value) })} />
      </td>
      <td className={td}>
        <TextInput
          className={inp}
          placeholder="Código interno"
          disabled={d.tipo_oferta !== 1}
          value={d.articulo_regalo_codigo ?? ''}
          onChange={(e) => setEditing({ ...d, articulo_regalo_codigo: str(e.target.value) })}
        />
      </td>
      <td className={td}>
        <TextInput type="number" step="0.001" className={inp} value={d.cantidad_oferta ?? ''} onChange={(e) => setEditing({ ...d, cantidad_oferta: num(e.target.value) })} />
      </td>
      <td className={td}>
        <TextInput type="number" step="0.01" className={inp} value={d.descuento_pct ?? ''} onChange={(e) => setEditing({ ...d, descuento_pct: num(e.target.value) })} />
      </td>
      <td className={td}>
        <TextInput type="number" step="0.001" className={inp} value={d.pvp_fijo ?? ''} onChange={(e) => setEditing({ ...d, pvp_fijo: num(e.target.value) })} />
      </td>
      <RowActions onSave={saveRow} onCancel={() => setEditing(null)} />
    </tr>
  )

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <GridBar
        title="Ofertas con regalos y descuentos"
        busy={!!editing}
        canEdit={!!selected}
        onAdd={() =>
          setEditing({
            articulo_codigo: articuloCodigo,
            tipo_oferta: 0,
            descripcion: null,
            fecha_desde: null,
            hora_desde: null,
            fecha_hasta: null,
            hora_hasta: null,
            cada_x_cantidad: null,
            articulo_regalo_codigo: null,
            cantidad_oferta: null,
            descuento_pct: null,
            pvp_fijo: null,
          })
        }
        onEdit={() => selected && setEditing({ ...selected })}
        onDelete={deleteSelected}
      />
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className={th}>Tipo</th>
            <th className={th}>Descripción</th>
            <th className={th}>Periodo</th>
            <th className={th}>Cada X uds.</th>
            <th className={th}>Artículo regalo</th>
            <th className={th}>Cant. oferta</th>
            <th className={th}>Dto. %</th>
            <th className={th}>PVP fijo</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && !editing && (
            <tr>
              <td colSpan={9} className="px-2 py-4 text-center text-slate-400">
                Sin ofertas con regalo o descuento.
              </td>
            </tr>
          )}
          {rows.map((r) =>
            editing && editing.id === r.id ? (
              <Fragment key={r.id}>{editRow(editing)}</Fragment>
            ) : (
              <tr
                key={r.id}
                onClick={() => setSelectedId(r.id ?? null)}
                className={`cursor-pointer border-b border-slate-100 last:border-0 ${
                  selectedId === r.id ? 'bg-indigo-50' : 'hover:bg-slate-50'
                }`}
              >
                <td className={td}>{TIPOS_OFERTA.find((t) => t.value === r.tipo_oferta)?.label ?? r.tipo_oferta}</td>
                <td className={td}>{r.descripcion ?? '—'}</td>
                <td className={td}>{periodo(r.fecha_desde, r.hora_desde, r.fecha_hasta, r.hora_hasta)}</td>
                <td className={td}>{r.cada_x_cantidad ?? '—'}</td>
                <td className={td}>{r.articulo_regalo_codigo ?? '—'}</td>
                <td className={td}>{r.cantidad_oferta ?? '—'}</td>
                <td className={td}>{r.descuento_pct ?? '—'}</td>
                <td className={td}>{r.pvp_fijo ?? '—'}</td>
                <td className={td} />
              </tr>
            ),
          )}
          {editing && editing.id == null && editRow(editing)}
        </tbody>
      </table>
    </div>
  )
}

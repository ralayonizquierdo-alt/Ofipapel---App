import { useEffect, useState } from 'react'
import { Check, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwGroup, GwInput, GwNumber, GwSelect, formatGw } from '../../../components/gw'
import { NIVELES_TARIFA, type ArticuloOferta, type ArticuloTarifaCantidad } from '../types'

const str = (v: string) => (v === '' ? null : v)

const TIPOS_OFERTA = [
  { value: 0, label: 'Descuento' },
  { value: 1, label: 'Regalo' },
]

interface NivelDraft {
  pvp: number | null
  incremento_pct: number | null
  modo_calculo: string
  permite_descuento_linea: boolean
}

function fecha(v: string | null) {
  if (!v) return '  /  /'
  const [y, m, d] = v.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function periodo(fd: string | null, hd: string | null, fh: string | null, hh: string | null) {
  if (!fd && !fh) return ''
  return `${fecha(fd)} ${hd ?? ''} - ${fecha(fh)} ${hh ?? ''}`.trim()
}

function GridBar({
  onAdd,
  onEdit,
  onDelete,
  canEdit,
  busy,
  onSave,
  onCancel,
}: {
  onAdd: () => void
  onEdit: () => void
  onDelete: () => void
  canEdit: boolean
  busy: boolean
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="mb-1 flex gap-1">
      <button type="button" className="gw-btn" onClick={onAdd} disabled={busy}>
        <Plus size={14} /> Añadir línea
      </button>
      <button type="button" className="gw-btn" onClick={onEdit} disabled={!canEdit || busy}>
        <Pencil size={14} /> Modificar línea
      </button>
      <button type="button" className="gw-btn" onClick={onDelete} disabled={!canEdit || busy}>
        <Trash2 size={14} /> Borrar línea
      </button>
      {busy && (
        <>
          <button type="button" className="gw-btn ml-3" onClick={onSave}>
            <Check size={14} className="text-[#127a12]" /> Aceptar
          </button>
          <button type="button" className="gw-btn" onClick={onCancel}>
            <X size={14} className="text-[#c42b1c]" /> Cancelar
          </button>
        </>
      )}
    </div>
  )
}

function Periodo({
  fd,
  hd,
  fh,
  hh,
  onChange,
}: {
  fd: string | null
  hd: string | null
  fh: string | null
  hh: string | null
  onChange: (p: { fecha_desde?: string | null; hora_desde?: string | null; fecha_hasta?: string | null; hora_hasta?: string | null }) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <GwInput type="date" className="w-[128px]" value={fd ?? ''} onChange={(e) => onChange({ fecha_desde: str(e.target.value) })} />
      <GwInput type="time" className="w-[72px]" value={hd ?? ''} onChange={(e) => onChange({ hora_desde: str(e.target.value) })} />
      <span>-</span>
      <GwInput type="date" className="w-[128px]" value={fh ?? ''} onChange={(e) => onChange({ fecha_hasta: str(e.target.value) })} />
      <GwInput type="time" className="w-[72px]" value={hh ?? ''} onChange={(e) => onChange({ hora_hasta: str(e.target.value) })} />
    </div>
  )
}

export function TabPreciosOferta({ articuloCodigo }: { articuloCodigo: string }) {
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-1.5" title="ARTTARIF / ARTOFERT">
      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{error}</div>}
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
        pvp: r.pvp == null ? null : Number(r.pvp),
        incremento_pct: r.incremento_pct == null ? null : Number(r.incremento_pct),
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
    const conPvp = NIVELES_TARIFA.filter((n) => niveles[n.nivel]?.pvp != null)
    const sinPvp = NIVELES_TARIFA.filter((n) => niveles[n.nivel] && niveles[n.nivel].pvp == null).map((n) => n.nivel)
    if (conPvp.length) {
      const { error } = await supabase.from('articulo_tarifa_cantidad_nivel').upsert(
        conPvp.map((n) => ({
          articulo_tarifa_cantidad_id: selectedId,
          nivel_tarifa: n.nivel,
          pvp: Number(niveles[n.nivel].pvp),
          incremento_pct: niveles[n.nivel].incremento_pct,
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
      [nivel]: { ...(m[nivel] ?? { pvp: null, incremento_pct: null, modo_calculo: 'P', permite_descuento_linea: true }), ...patch },
    }))
    setNivelesDirty(true)
  }

  const selected = rows.find((r) => r.id === selectedId)

  const editRow = (d: ArticuloTarifaCantidad) => (
    <tr key={d.id ?? 'nueva'}>
      <td>
        <GwNumber value={d.cantidad_desde} decimals={3} onChange={(v) => setEditing({ ...d, cantidad_desde: v ?? 0 })} />
      </td>
      <td>
        <GwInput autoFocus value={d.descripcion_oferta ?? ''} onChange={(e) => setEditing({ ...d, descripcion_oferta: str(e.target.value) })} />
      </td>
      <td>
        <Periodo fd={d.fecha_desde} hd={d.hora_desde} fh={d.fecha_hasta} hh={d.hora_hasta} onChange={(p) => setEditing({ ...d, ...p })} />
      </td>
      <td>
        <GwNumber value={d.stock_minimo_oferta} decimals={3} onChange={(v) => setEditing({ ...d, stock_minimo_oferta: v })} />
      </td>
      <td>
        <GwSelect value={d.almacen_oferta_codigo ?? ''} onChange={(e) => setEditing({ ...d, almacen_oferta_codigo: str(e.target.value) })}>
          <option value="">Todos</option>
          {almacenes.map((a) => (
            <option key={a.codigo} value={a.codigo}>
              {a.codigo} {a.nombre}
            </option>
          ))}
        </GwSelect>
      </td>
      <td className="text-center">
        <GwCheck label="" checked={d.es_un_pvp_para_toda_la_oferta} onChange={(v) => setEditing({ ...d, es_un_pvp_para_toda_la_oferta: v })} />
      </td>
    </tr>
  )

  return (
    <GwGroup title="Ofertas por Fecha, Hora y Cantidad">
      <GridBar
        busy={!!editing}
        canEdit={!!selected}
        onAdd={() => {
          setError(null)
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
        }}
        onEdit={() => {
          setError(null)
          if (selected) setEditing({ ...selected })
        }}
        onDelete={deleteSelected}
        onSave={saveRow}
        onCancel={() => setEditing(null)}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_330px] gap-2">
        <table className="gw-grid self-start">
          <thead>
            <tr>
              <th className="text-right" style={{ width: 95 }}>Desde Cant.</th>
              <th>Descripción</th>
              <th style={{ width: 230 }}>Periodo</th>
              <th className="text-right" style={{ width: 95 }}>Stock Oferta</th>
              <th style={{ width: 90 }}>Almacén</th>
              <th style={{ width: 70 }}>Un Pvp</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !editing && (
              <tr>
                <td colSpan={6} className="text-center text-[#6d6d6d]">Sin ofertas por cantidad.</td>
              </tr>
            )}
            {rows.map((r) =>
              editing && editing.id === r.id ? (
                editRow(editing)
              ) : (
                <tr key={r.id} className={selectedId === r.id ? 'gw-selected' : ''} onClick={() => !editing && setSelectedId(r.id ?? null)}>
                  <td className="text-right tabular-nums">{formatGw(r.cantidad_desde, 3)}</td>
                  <td>{r.descripcion_oferta ?? ''}</td>
                  <td>{periodo(r.fecha_desde, r.hora_desde, r.fecha_hasta, r.hora_hasta)}</td>
                  <td className="text-right tabular-nums">{formatGw(r.stock_minimo_oferta, 3)}</td>
                  <td>{r.almacen_oferta_codigo ?? 'Todos'}</td>
                  <td>{r.es_un_pvp_para_toda_la_oferta ? 'Sí' : 'No'}</td>
                </tr>
              ),
            )}
            {editing && editing.id == null && editRow(editing)}
          </tbody>
        </table>

        <div className="flex flex-col gap-1">
          <span className="gw-label">{selected ? `Pvps desde ${formatGw(selected.cantidad_desde, 3)} unidades` : 'Pvps'}</span>
          <div className="grid grid-cols-[92px_44px_44px_62px_1fr] items-center gap-x-1 gap-y-[3px]">
            {NIVELES_TARIFA.map((n) => {
              const v = niveles[n.nivel]
              const dis = !selected
              return (
                <div key={n.nivel} className="contents">
                  <span className="gw-label truncate">{n.nombre}:</span>
                  <GwSelect
                    disabled={dis}
                    value={v?.modo_calculo ?? 'P'}
                    onChange={(e) => setNivel(n.nivel, { modo_calculo: e.target.value })}
                    title="P = % sobre coste · D = % de descuento sobre la General"
                  >
                    <option value="P">P</option>
                    <option value="D">D</option>
                  </GwSelect>
                  <GwSelect
                    disabled={dis}
                    value={(v?.permite_descuento_linea ?? true) ? 'S' : 'N'}
                    onChange={(e) => setNivel(n.nivel, { permite_descuento_linea: e.target.value === 'S' })}
                    title="VERDTO"
                  >
                    <option value="N">N</option>
                    <option value="S">S</option>
                  </GwSelect>
                  <GwNumber disabled={dis} value={v?.incremento_pct ?? null} decimals={2} onChange={(x) => setNivel(n.nivel, { incremento_pct: x })} />
                  <GwNumber disabled={dis} value={v?.pvp ?? null} decimals={3} onChange={(x) => setNivel(n.nivel, { pvp: x })} />
                </div>
              )
            })}
          </div>
          <div className="flex justify-end">
            <button type="button" className="gw-btn" disabled={!selected || !nivelesDirty} onClick={saveNiveles}>
              <Save size={14} /> Guardar Pvps
            </button>
          </div>
        </div>
      </div>
    </GwGroup>
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
    <tr key={d.id ?? 'nueva'}>
      <td>
        <GwSelect value={d.tipo_oferta} onChange={(e) => setEditing({ ...d, tipo_oferta: Number(e.target.value) })}>
          {TIPOS_OFERTA.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </GwSelect>
      </td>
      <td>
        <GwInput autoFocus value={d.descripcion ?? ''} onChange={(e) => setEditing({ ...d, descripcion: str(e.target.value) })} />
      </td>
      <td>
        <Periodo fd={d.fecha_desde} hd={d.hora_desde} fh={d.fecha_hasta} hh={d.hora_hasta} onChange={(p) => setEditing({ ...d, ...p })} />
      </td>
      <td>
        <GwNumber value={d.cada_x_cantidad} decimals={3} onChange={(v) => setEditing({ ...d, cada_x_cantidad: v })} />
      </td>
      <td>
        <GwInput
          disabled={d.tipo_oferta !== 1}
          value={d.articulo_regalo_codigo ?? ''}
          onChange={(e) => setEditing({ ...d, articulo_regalo_codigo: str(e.target.value) })}
        />
      </td>
      <td>
        <GwNumber value={d.cantidad_oferta} decimals={3} onChange={(v) => setEditing({ ...d, cantidad_oferta: v })} />
      </td>
      <td>
        <GwNumber value={d.descuento_pct} decimals={2} onChange={(v) => setEditing({ ...d, descuento_pct: v })} />
      </td>
      <td>
        <GwNumber value={d.pvp_fijo} decimals={3} onChange={(v) => setEditing({ ...d, pvp_fijo: v })} />
      </td>
    </tr>
  )

  return (
    <GwGroup title="Ofertas con Regalos y Descuentos">
      <GridBar
        busy={!!editing}
        canEdit={!!selected}
        onAdd={() => {
          setError(null)
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
        }}
        onEdit={() => {
          setError(null)
          if (selected) setEditing({ ...selected })
        }}
        onDelete={deleteSelected}
        onSave={saveRow}
        onCancel={() => setEditing(null)}
      />
      <table className="gw-grid">
        <thead>
          <tr>
            <th style={{ width: 100 }}>Tipo</th>
            <th>Descripción</th>
            <th style={{ width: 230 }}>Periodo</th>
            <th className="text-right" style={{ width: 85 }}>Cada X uds.</th>
            <th style={{ width: 120 }}>Art. Regalo</th>
            <th className="text-right" style={{ width: 85 }}>Cant. Oferta</th>
            <th className="text-right" style={{ width: 70 }}>% Dto.</th>
            <th className="text-right" style={{ width: 85 }}>Pvp Fijo</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && !editing && (
            <tr>
              <td colSpan={8} className="text-center text-[#6d6d6d]">Sin ofertas con regalo o descuento.</td>
            </tr>
          )}
          {rows.map((r) =>
            editing && editing.id === r.id ? (
              editRow(editing)
            ) : (
              <tr key={r.id} className={selectedId === r.id ? 'gw-selected' : ''} onClick={() => !editing && setSelectedId(r.id ?? null)}>
                <td>{TIPOS_OFERTA.find((t) => t.value === r.tipo_oferta)?.label ?? r.tipo_oferta}</td>
                <td>{r.descripcion ?? ''}</td>
                <td>{periodo(r.fecha_desde, r.hora_desde, r.fecha_hasta, r.hora_hasta)}</td>
                <td className="text-right tabular-nums">{formatGw(r.cada_x_cantidad, 3)}</td>
                <td>{r.articulo_regalo_codigo ?? ''}</td>
                <td className="text-right tabular-nums">{formatGw(r.cantidad_oferta, 3)}</td>
                <td className="text-right tabular-nums">{formatGw(r.descuento_pct, 2)}</td>
                <td className="text-right tabular-nums">{formatGw(r.pvp_fijo, 3)}</td>
              </tr>
            ),
          )}
          {editing && editing.id == null && editRow(editing)}
        </tbody>
      </table>
    </GwGroup>
  )
}

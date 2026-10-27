import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Binoculars, Calculator, Check, FilePen, FilePlus2, Tags, Trash2, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwDate, GwInput, GwNumber, GwSelect, formatGw } from '../../../components/gw'
import { NIVELES_TARIFA, type ArticuloOferta, type ArticuloTarifaCantidad } from '../types'

const str = (v: string) => (v === '' ? null : v)
const round3 = (n: number) => Math.round(n * 1000) / 1000

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
type Niveles = Record<number, NivelDraft>

const nivelVacio = (nivel: number): NivelDraft => ({ pvp: null, incremento_pct: null, modo_calculo: nivel >= 4 ? 'D' : 'P', permite_descuento_linea: true })

function fecha(v: string | null) {
  if (!v) return ' / /'
  const [y, m, d] = v.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function MiniBar({
  editing,
  canEdit,
  disabled,
  onAdd,
  onEdit,
  onDelete,
  onSave,
  onCancel,
}: {
  editing: boolean
  canEdit: boolean
  disabled: boolean
  onAdd: () => void
  onEdit: () => void
  onDelete: () => void
  onSave: () => void
  onCancel: () => void
}) {
  const b = (title: string, on: () => void, dis: boolean, icon: ReactNode) => (
    <button
      type="button"
      title={title}
      onClick={on}
      disabled={dis}
      className="flex h-[22px] w-[46px] items-center justify-center border-r border-[var(--gw-border-light)] text-[#1d3a8a] last:border-r-0 hover:bg-[#e5f1fb] disabled:text-[#9a9a9a] disabled:hover:bg-transparent"
    >
      {icon}
    </button>
  )
  return (
    <div className="flex border border-[var(--gw-border)]">
      {editing ? (
        <>
          {b('Aceptar', onSave, false, <Check size={14} strokeWidth={3} className="text-[#127a12]" />)}
          {b('Cancelar', onCancel, false, <X size={14} strokeWidth={3} className="text-[#c42b1c]" />)}
        </>
      ) : (
        <>
          {b('Añadir línea', onAdd, disabled, <FilePlus2 size={13} />)}
          {b('Modificar línea', onEdit, disabled || !canEdit, <FilePen size={13} />)}
          {b('Borrar línea', onDelete, disabled || !canEdit, <Trash2 size={13} />)}
        </>
      )}
      {b('Buscar', () => undefined, true, <Binoculars size={13} />)}
    </div>
  )
}

const td = '!h-[18px] !py-0 text-[12px]'

export function TabPreciosOferta({
  articuloCodigo,
  editing = true,
  costeBase = null,
}: {
  articuloCodigo: string
  editing?: boolean
  costeBase?: number | null
}) {
  const [sub, setSub] = useState('cantidad')
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex min-h-[250px] flex-col" title="ARTTARIF / ARTOFERT">
      <div className="border border-[var(--gw-border)] p-1">
        {sub === 'cantidad' ? (
          <OfertasCantidad articuloCodigo={articuloCodigo} editingFicha={editing} costeBase={costeBase} setError={setError} />
        ) : (
          <OfertasRegalo articuloCodigo={articuloCodigo} editingFicha={editing} setError={setError} />
        )}
        {error && <div className="mt-0.5 text-[12px] text-[#a4262c]">{error}</div>}
      </div>
      <div className="flex">
        {[
          { key: 'cantidad', label: 'Ofertas por Fecha y a partir de una cantidad mínima' },
          { key: 'regalo', label: 'Ofertas por Fecha, Regalos y Descuentos' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setError(null)
              setSub(t.key)
            }}
            className={`-mt-px border border-[var(--gw-border)] px-2 text-[12px] ${
              sub === t.key ? 'z-10 h-[24px] border-t-transparent bg-[var(--gw-face)] font-bold' : 'h-[22px] bg-[#f6f6f6] hover:bg-[#e5f1fb]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function OfertasCantidad({
  articuloCodigo,
  editingFicha,
  costeBase,
  setError,
}: {
  articuloCodigo: string
  editingFicha: boolean
  costeBase: number | null
  setError: (e: string | null) => void
}) {
  const [rows, setRows] = useState<ArticuloTarifaCantidad[]>([])
  const [niveles, setNiveles] = useState<Record<number, Niveles>>({})
  const [almacenes, setAlmacenes] = useState<{ codigo: string; nombre: string }[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [edit, setEdit] = useState<{ fila: ArticuloTarifaCantidad; niveles: Niveles } | null>(null)

  async function load() {
    const { data, error } = await supabase
      .from('articulo_tarifa_cantidad')
      .select(
        'id, articulo_codigo, cantidad_desde, descripcion_oferta, fecha_desde, hora_desde, fecha_hasta, hora_hasta, stock_minimo_oferta, almacen_oferta_codigo, es_un_pvp_para_toda_la_oferta',
      )
      .eq('articulo_codigo', articuloCodigo)
      .order('cantidad_desde')
    if (error) setError(error.message)
    const lista = (data ?? []) as ArticuloTarifaCantidad[]
    setRows(lista)
    const ids = lista.map((r) => r.id).filter((x): x is number => x != null)
    if (ids.length === 0) return setNiveles({})
    const { data: nv } = await supabase
      .from('articulo_tarifa_cantidad_nivel')
      .select('articulo_tarifa_cantidad_id, nivel_tarifa, pvp, incremento_pct, modo_calculo, permite_descuento_linea')
      .in('articulo_tarifa_cantidad_id', ids)
    const map: Record<number, Niveles> = {}
    for (const r of nv ?? []) {
      map[r.articulo_tarifa_cantidad_id] ??= {}
      map[r.articulo_tarifa_cantidad_id][r.nivel_tarifa] = {
        pvp: r.pvp == null ? null : Number(r.pvp),
        incremento_pct: r.incremento_pct == null ? null : Number(r.incremento_pct),
        modo_calculo: r.modo_calculo ?? 'P',
        permite_descuento_linea: r.permite_descuento_linea,
      }
    }
    setNiveles(map)
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

  async function aceptar() {
    if (!edit) return
    setError(null)
    const d = edit.fila
    const payload = {
      articulo_codigo: articuloCodigo,
      cantidad_desde: d.cantidad_desde,
      descripcion_oferta: d.descripcion_oferta,
      fecha_desde: d.fecha_desde,
      hora_desde: d.hora_desde,
      fecha_hasta: d.fecha_hasta,
      hora_hasta: d.hora_hasta,
      stock_minimo_oferta: d.stock_minimo_oferta,
      almacen_oferta_codigo: d.almacen_oferta_codigo,
      es_un_pvp_para_toda_la_oferta: d.es_un_pvp_para_toda_la_oferta,
    }
    const res =
      d.id != null
        ? await supabase.from('articulo_tarifa_cantidad').update(payload).eq('id', d.id).select('id').single()
        : await supabase.from('articulo_tarifa_cantidad').insert(payload).select('id').single()
    if (res.error) return setError(res.error.message)
    const id = res.data.id as number
    const conPvp = NIVELES_TARIFA.filter((n) => edit.niveles[n.nivel]?.pvp != null)
    const sinPvp = NIVELES_TARIFA.filter((n) => edit.niveles[n.nivel] && edit.niveles[n.nivel].pvp == null).map((n) => n.nivel)
    if (conPvp.length) {
      const { error } = await supabase.from('articulo_tarifa_cantidad_nivel').upsert(
        conPvp.map((n) => ({
          articulo_tarifa_cantidad_id: id,
          nivel_tarifa: n.nivel,
          pvp: Number(edit.niveles[n.nivel].pvp),
          incremento_pct: edit.niveles[n.nivel].incremento_pct,
          modo_calculo: edit.niveles[n.nivel].modo_calculo || null,
          permite_descuento_linea: edit.niveles[n.nivel].permite_descuento_linea,
        })),
        { onConflict: 'articulo_tarifa_cantidad_id,nivel_tarifa' },
      )
      if (error) return setError(error.message)
    }
    if (sinPvp.length) {
      await supabase.from('articulo_tarifa_cantidad_nivel').delete().eq('articulo_tarifa_cantidad_id', id).in('nivel_tarifa', sinPvp)
    }
    setEdit(null)
    setSelectedId(id)
    load()
  }

  async function borrar() {
    const row = rows.find((r) => r.id === selectedId)
    if (!row || row.id == null) return
    if (!confirm(`¿Borrar la oferta desde ${formatGw(row.cantidad_desde, 3)} unidades y sus precios por tarifa?`)) return
    await supabase.from('articulo_tarifa_cantidad_nivel').delete().eq('articulo_tarifa_cantidad_id', row.id)
    const { error } = await supabase.from('articulo_tarifa_cantidad').delete().eq('id', row.id)
    if (error) return setError(error.message)
    setSelectedId(null)
    load()
  }

  function recalcular() {
    if (!edit) return
    const n = { ...edit.niveles }
    const gen = n[0] ?? nivelVacio(0)
    if (gen.incremento_pct != null && gen.modo_calculo !== 'D' && costeBase != null) n[0] = { ...gen, pvp: round3(costeBase * (1 + gen.incremento_pct / 100)) }
    const general = n[0]?.pvp ?? null
    for (const t of NIVELES_TARIFA) {
      if (t.nivel === 0) continue
      const v = n[t.nivel]
      if (!v || v.incremento_pct == null) continue
      if (v.modo_calculo === 'D' && general != null) n[t.nivel] = { ...v, pvp: round3(general * (1 - v.incremento_pct / 100)) }
      else if (v.modo_calculo !== 'D' && costeBase != null) n[t.nivel] = { ...v, pvp: round3(costeBase * (1 + v.incremento_pct / 100)) }
    }
    setEdit({ ...edit, niveles: n })
  }

  const setF = (patch: Partial<ArticuloTarifaCantidad>) => edit && setEdit({ ...edit, fila: { ...edit.fila, ...patch } })
  const setN = (nivel: number, patch: Partial<NivelDraft>) =>
    edit && setEdit({ ...edit, niveles: { ...edit.niveles, [nivel]: { ...(edit.niveles[nivel] ?? nivelVacio(nivel)), ...patch } } })

  const filaEdit = (d: ArticuloTarifaCantidad, nv: Niveles) => {
    const gen = nv[0] ?? nivelVacio(0)
    return (
      <tr key={d.id ?? 'nueva'}>
        <td>
          <GwInput autoFocus className="!h-[20px]" value={d.descripcion_oferta ?? ''} onChange={(e) => setF({ descripcion_oferta: str(e.target.value) })} />
        </td>
        <td>
          <GwDate className="!h-[20px]" value={d.fecha_desde} onChange={(v) => setF({ fecha_desde: v })} />
        </td>
        <td>
          <GwDate className="!h-[20px]" value={d.fecha_hasta} onChange={(v) => setF({ fecha_hasta: v })} />
        </td>
        <td>
          <GwInput type="time" className="!h-[20px]" value={d.hora_desde ?? ''} onChange={(e) => setF({ hora_desde: str(e.target.value) })} />
        </td>
        <td>
          <GwInput type="time" className="!h-[20px]" value={d.hora_hasta ?? ''} onChange={(e) => setF({ hora_hasta: str(e.target.value) })} />
        </td>
        <td>
          <GwSelect className="!h-[20px]" value={gen.modo_calculo} title="P = % sobre coste · D = % de descuento sobre la General" onChange={(e) => setN(0, { modo_calculo: e.target.value })}>
            <option value="P">P</option>
            <option value="D">D</option>
          </GwSelect>
        </td>
        <td>
          <GwSelect className="!h-[20px]" value={gen.permite_descuento_linea ? 'S' : 'N'} title="VERDTO" onChange={(e) => setN(0, { permite_descuento_linea: e.target.value === 'S' })}>
            <option value="N">N</option>
            <option value="S">S</option>
          </GwSelect>
        </td>
        <td>
          <GwNumber className="!h-[20px]" value={d.cantidad_desde} decimals={3} onChange={(v) => setF({ cantidad_desde: v ?? 0 })} />
        </td>
        {NIVELES_TARIFA.map((t) => (
          <Fragment key={t.nivel}>
            <td>
              <GwNumber className="!h-[20px]" value={nv[t.nivel]?.incremento_pct ?? null} decimals={2} onChange={(v) => setN(t.nivel, { incremento_pct: v })} />
            </td>
            <td>
              <GwNumber className="!h-[20px]" value={nv[t.nivel]?.pvp ?? null} decimals={3} onChange={(v) => setN(t.nivel, { pvp: v })} />
            </td>
          </Fragment>
        ))}
        <td>
          <GwNumber className="!h-[20px]" value={d.stock_minimo_oferta} decimals={3} onChange={(v) => setF({ stock_minimo_oferta: v })} />
        </td>
        <td>
          <GwSelect className="!h-[20px]" value={d.almacen_oferta_codigo ?? ''} onChange={(e) => setF({ almacen_oferta_codigo: str(e.target.value) })}>
            <option value="">Todos</option>
            {almacenes.map((a) => (
              <option key={a.codigo} value={a.codigo}>
                {a.codigo}
              </option>
            ))}
          </GwSelect>
        </td>
        <td className="text-center">
          <input type="checkbox" className="h-[13px] w-[13px] accent-[#0078d7]" checked={d.es_un_pvp_para_toda_la_oferta} onChange={(e) => setF({ es_un_pvp_para_toda_la_oferta: e.target.checked })} />
        </td>
      </tr>
    )
  }

  const selected = rows.find((r) => r.id === selectedId)

  return (
    <div className="flex h-[190px] flex-col gap-0.5">
      <fieldset className="gw-group flex min-h-0 flex-1 flex-col !pt-1">
        <legend className="text-[12px]">Precios de Oferta por cantidades y fechas</legend>
        <div className="min-h-0 flex-1 overflow-auto border border-[var(--gw-border)] bg-white">
          <table className="gw-grid w-max min-w-full text-[12px]">
            <thead className="sticky top-0 z-10">
              <tr>
                <th style={{ minWidth: 150 }}>Descripción</th>
                <th style={{ minWidth: 124 }}>Fec. Desde</th>
                <th style={{ minWidth: 124 }}>Fec. Hasta</th>
                <th style={{ minWidth: 100 }}>Hora Inic.</th>
                <th style={{ minWidth: 100 }}>Hora Fin</th>
                <th style={{ minWidth: 50 }}>Tipo</th>
                <th style={{ minWidth: 50 }}>Dto</th>
                <th style={{ minWidth: 72 }}>Cant. Mín.</th>
                {NIVELES_TARIFA.map((t) => (
                  <Fragment key={t.nivel}>
                    <th style={{ minWidth: 60 }}>%Incr.</th>
                    <th className="!text-right" style={{ minWidth: 86 }}>
                      {t.nombre}
                    </th>
                  </Fragment>
                ))}
                <th style={{ minWidth: 80 }}>Stock Oferta</th>
                <th style={{ minWidth: 64 }}>Almacén</th>
                <th style={{ minWidth: 52 }}>Un Pvp</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                if (edit && edit.fila.id === r.id) return filaEdit(edit.fila, edit.niveles)
                const nv = niveles[r.id ?? -1] ?? {}
                const gen = nv[0]
                return (
                  <tr key={r.id} className={selectedId === r.id ? 'gw-selected' : ''} onClick={() => !edit && setSelectedId(r.id ?? null)}>
                    <td className={td}>{r.descripcion_oferta ?? ''}</td>
                    <td className={td}>{fecha(r.fecha_desde)}</td>
                    <td className={td}>{fecha(r.fecha_hasta)}</td>
                    <td className={td}>{r.hora_desde ?? ''}</td>
                    <td className={td}>{r.hora_hasta ?? ''}</td>
                    <td className={td}>{gen?.modo_calculo ?? ''}</td>
                    <td className={td}>{gen ? (gen.permite_descuento_linea ? 'S' : 'N') : ''}</td>
                    <td className={`${td} text-right tabular-nums`}>{formatGw(r.cantidad_desde, 3)}</td>
                    {NIVELES_TARIFA.map((t) => (
                      <Fragment key={t.nivel}>
                        <td className={`${td} text-right tabular-nums`}>{formatGw(nv[t.nivel]?.incremento_pct, 2)}</td>
                        <td className={`${td} text-right tabular-nums`}>{formatGw(nv[t.nivel]?.pvp, 3)}</td>
                      </Fragment>
                    ))}
                    <td className={`${td} text-right tabular-nums`}>{formatGw(r.stock_minimo_oferta, 3)}</td>
                    <td className={td}>{r.almacen_oferta_codigo ?? 'Todos'}</td>
                    <td className={`${td} text-center`}>{r.es_un_pvp_para_toda_la_oferta ? 'Sí' : 'No'}</td>
                  </tr>
                )
              })}
              {edit && edit.fila.id == null && filaEdit(edit.fila, edit.niveles)}
            </tbody>
          </table>
        </div>
      </fieldset>
      <div className="flex items-center gap-2">
        <MiniBar
          editing={!!edit}
          canEdit={!!selected}
          disabled={!editingFicha}
          onAdd={() => {
            setError(null)
            setEdit({
              fila: {
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
              },
              niveles: {},
            })
          }}
          onEdit={() => {
            setError(null)
            if (selected) setEdit({ fila: { ...selected }, niveles: { ...(niveles[selected.id ?? -1] ?? {}) } })
          }}
          onDelete={borrar}
          onSave={aceptar}
          onCancel={() => setEdit(null)}
        />
        <span className="flex-1" />
        <button type="button" className="gw-btn whitespace-nowrap" disabled={!edit} onClick={recalcular} title="Recalcula los Pvps de la línea en edición a partir del coste y de los %">
          <Calculator size={13} /> Recalcular Pvps
        </button>
        <button type="button" className="gw-btn whitespace-nowrap" disabled title="Tarifas de oferta: aún no disponible en el ERP propio">
          <Tags size={13} /> Ir al Formulario de Tarifas
        </button>
      </div>
    </div>
  )
}

function OfertasRegalo({
  articuloCodigo,
  editingFicha,
  setError,
}: {
  articuloCodigo: string
  editingFicha: boolean
  setError: (e: string | null) => void
}) {
  const [rows, setRows] = useState<ArticuloOferta[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [edit, setEdit] = useState<ArticuloOferta | null>(null)

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

  async function aceptar() {
    if (!edit) return
    setError(null)
    const payload = {
      articulo_codigo: articuloCodigo,
      tipo_oferta: edit.tipo_oferta,
      descripcion: edit.descripcion,
      fecha_desde: edit.fecha_desde,
      hora_desde: edit.hora_desde,
      fecha_hasta: edit.fecha_hasta,
      hora_hasta: edit.hora_hasta,
      cada_x_cantidad: edit.cada_x_cantidad,
      articulo_regalo_codigo: edit.articulo_regalo_codigo,
      cantidad_oferta: edit.cantidad_oferta,
      descuento_pct: edit.descuento_pct,
      pvp_fijo: edit.pvp_fijo,
    }
    const { error } =
      edit.id != null
        ? await supabase.from('articulo_oferta').update(payload).eq('id', edit.id)
        : await supabase.from('articulo_oferta').insert(payload)
    if (error) return setError(error.message)
    setEdit(null)
    load()
  }

  async function borrar() {
    const row = rows.find((r) => r.id === selectedId)
    if (!row || row.id == null) return
    if (!confirm('¿Borrar esta oferta?')) return
    const { error } = await supabase.from('articulo_oferta').delete().eq('id', row.id)
    if (error) return setError(error.message)
    setSelectedId(null)
    load()
  }

  const set = (patch: Partial<ArticuloOferta>) => edit && setEdit({ ...edit, ...patch })

  const filaEdit = (d: ArticuloOferta) => (
    <tr key={d.id ?? 'nueva'}>
      <td>
        <GwInput autoFocus className="!h-[20px]" value={d.descripcion ?? ''} onChange={(e) => set({ descripcion: str(e.target.value) })} />
      </td>
      <td>
        <GwDate className="!h-[20px]" value={d.fecha_desde} onChange={(v) => set({ fecha_desde: v })} />
      </td>
      <td>
        <GwDate className="!h-[20px]" value={d.fecha_hasta} onChange={(v) => set({ fecha_hasta: v })} />
      </td>
      <td>
        <GwInput type="time" className="!h-[20px]" value={d.hora_desde ?? ''} onChange={(e) => set({ hora_desde: str(e.target.value) })} />
      </td>
      <td>
        <GwInput type="time" className="!h-[20px]" value={d.hora_hasta ?? ''} onChange={(e) => set({ hora_hasta: str(e.target.value) })} />
      </td>
      <td>
        <GwSelect className="!h-[20px]" value={d.tipo_oferta} onChange={(e) => set({ tipo_oferta: Number(e.target.value) })}>
          {TIPOS_OFERTA.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </GwSelect>
      </td>
      <td>
        <GwNumber className="!h-[20px]" value={d.cada_x_cantidad} decimals={3} onChange={(v) => set({ cada_x_cantidad: v })} />
      </td>
      <td>
        <GwInput className="!h-[20px]" disabled={d.tipo_oferta !== 1} value={d.articulo_regalo_codigo ?? ''} onChange={(e) => set({ articulo_regalo_codigo: str(e.target.value) })} />
      </td>
      <td>
        <GwNumber className="!h-[20px]" value={d.cantidad_oferta} decimals={3} onChange={(v) => set({ cantidad_oferta: v })} />
      </td>
      <td>
        <GwNumber className="!h-[20px]" value={d.descuento_pct} decimals={2} onChange={(v) => set({ descuento_pct: v })} />
      </td>
      <td>
        <GwNumber className="!h-[20px]" value={d.pvp_fijo} decimals={3} onChange={(v) => set({ pvp_fijo: v })} />
      </td>
    </tr>
  )

  const selected = rows.find((r) => r.id === selectedId)

  return (
    <div className="flex h-[190px] flex-col gap-0.5">
      <fieldset className="gw-group flex min-h-0 flex-1 flex-col !pt-1">
        <legend className="text-[12px]">Ofertas por fecha con regalos y descuentos</legend>
        <div className="min-h-0 flex-1 overflow-auto border border-[var(--gw-border)] bg-white">
          <table className="gw-grid w-max min-w-full text-[12px]">
            <thead className="sticky top-0 z-10">
              <tr>
                <th style={{ minWidth: 180 }}>Descripción</th>
                <th style={{ minWidth: 124 }}>Fec. Desde</th>
                <th style={{ minWidth: 124 }}>Fec. Hasta</th>
                <th style={{ minWidth: 100 }}>Hora Inic.</th>
                <th style={{ minWidth: 100 }}>Hora Fin</th>
                <th style={{ minWidth: 104 }}>Tipo</th>
                <th style={{ minWidth: 76 }}>Cada X uds.</th>
                <th style={{ minWidth: 110 }}>Art. Regalo</th>
                <th style={{ minWidth: 76 }}>Cant. Oferta</th>
                <th style={{ minWidth: 60 }}>%Dto.</th>
                <th style={{ minWidth: 80 }}>Pvp Fijo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) =>
                edit && edit.id === r.id ? (
                  filaEdit(edit)
                ) : (
                  <tr key={r.id} className={selectedId === r.id ? 'gw-selected' : ''} onClick={() => !edit && setSelectedId(r.id ?? null)}>
                    <td className={td}>{r.descripcion ?? ''}</td>
                    <td className={td}>{fecha(r.fecha_desde)}</td>
                    <td className={td}>{fecha(r.fecha_hasta)}</td>
                    <td className={td}>{r.hora_desde ?? ''}</td>
                    <td className={td}>{r.hora_hasta ?? ''}</td>
                    <td className={td}>{TIPOS_OFERTA.find((t) => t.value === r.tipo_oferta)?.label ?? r.tipo_oferta}</td>
                    <td className={`${td} text-right tabular-nums`}>{formatGw(r.cada_x_cantidad, 3)}</td>
                    <td className={td}>{r.articulo_regalo_codigo ?? ''}</td>
                    <td className={`${td} text-right tabular-nums`}>{formatGw(r.cantidad_oferta, 3)}</td>
                    <td className={`${td} text-right tabular-nums`}>{formatGw(r.descuento_pct, 2)}</td>
                    <td className={`${td} text-right tabular-nums`}>{formatGw(r.pvp_fijo, 3)}</td>
                  </tr>
                ),
              )}
              {edit && edit.id == null && filaEdit(edit)}
            </tbody>
          </table>
        </div>
      </fieldset>
      <MiniBar
        editing={!!edit}
        canEdit={!!selected}
        disabled={!editingFicha}
        onAdd={() => {
          setError(null)
          setEdit({
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
          if (selected) setEdit({ ...selected })
        }}
        onDelete={borrar}
        onSave={aceptar}
        onCancel={() => setEdit(null)}
      />
    </div>
  )
}

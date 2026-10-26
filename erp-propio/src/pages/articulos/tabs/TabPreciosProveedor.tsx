import { Fragment, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Save, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { TextInput, SelectInput } from '../../../components/FormField'
import type { ArticuloProveedor } from '../types'

const num = (v: string) => (v === '' ? null : Number(v))
const str = (v: string) => (v === '' ? null : v)
const th = 'px-2 py-2 text-left font-semibold whitespace-nowrap'
const td = 'px-2 py-1.5'
const inp = 'w-full min-w-16 py-1 text-xs'
const miniBtn =
  'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-30'

const COLS =
  'articulo_codigo, proveedor_codigo, codigo_compra, coste_puro, coste_neto, coste_bruto, precio_medio_compra, ultimo_descuento_pct, impuesto1_pct, impuesto2_pct, impuesto3_pct, ultima_bonificacion, ultima_compra_tienda, ultima_compra_numero, ultima_compra_fecha, fecha_prevista_entrega, ultimas_unidades_compradas, unidades_pedidas, unidades_compra'

type NumKey =
  | 'coste_puro'
  | 'coste_neto'
  | 'coste_bruto'
  | 'precio_medio_compra'
  | 'ultimo_descuento_pct'
  | 'impuesto2_pct'
  | 'unidades_pedidas'
  | 'unidades_compra'

const fmt = (v: number | null) => (v == null ? '—' : v.toLocaleString('es-ES', { maximumFractionDigits: 3 }))

export function TabPreciosProveedor({
  articuloCodigo,
  proveedores,
}: {
  articuloCodigo: string
  proveedores: { codigo: string; nombre: string }[]
}) {
  const [rows, setRows] = useState<ArticuloProveedor[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<ArticuloProveedor | null>(null)
  const [isNewRow, setIsNewRow] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const { data, error: err } = await supabase
      .from('articulo_proveedor')
      .select(COLS)
      .eq('articulo_codigo', articuloCodigo)
      .order('proveedor_codigo')
    if (err) setError(err.message)
    setRows((data ?? []) as ArticuloProveedor[])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articuloCodigo])

  const nombreProveedor = (codigo: string) => proveedores.find((p) => p.codigo === codigo)?.nombre ?? codigo

  function startNew() {
    setIsNewRow(true)
    setEditing({
      articulo_codigo: articuloCodigo,
      proveedor_codigo: '',
      codigo_compra: null,
      coste_puro: null,
      coste_neto: null,
      coste_bruto: null,
      precio_medio_compra: null,
      ultimo_descuento_pct: null,
      impuesto1_pct: null,
      impuesto2_pct: null,
      impuesto3_pct: null,
      ultima_bonificacion: null,
      ultima_compra_tienda: null,
      ultima_compra_numero: null,
      ultima_compra_fecha: null,
      fecha_prevista_entrega: null,
      ultimas_unidades_compradas: null,
      unidades_pedidas: null,
      unidades_compra: null,
    })
  }

  async function saveRow() {
    if (!editing) return
    setError(null)
    if (!editing.proveedor_codigo) {
      setError('Elige el proveedor.')
      return
    }
    const payload = {
      codigo_compra: editing.codigo_compra,
      coste_puro: editing.coste_puro,
      coste_neto: editing.coste_neto,
      coste_bruto: editing.coste_bruto,
      precio_medio_compra: editing.precio_medio_compra,
      ultimo_descuento_pct: editing.ultimo_descuento_pct,
      impuesto2_pct: editing.impuesto2_pct,
      unidades_pedidas: editing.unidades_pedidas,
      fecha_prevista_entrega: editing.fecha_prevista_entrega,
      unidades_compra: editing.unidades_compra,
    }
    const { error: err } = isNewRow
      ? await supabase
          .from('articulo_proveedor')
          .insert({ articulo_codigo: articuloCodigo, proveedor_codigo: editing.proveedor_codigo, ...payload })
      : await supabase
          .from('articulo_proveedor')
          .update(payload)
          .eq('articulo_codigo', articuloCodigo)
          .eq('proveedor_codigo', editing.proveedor_codigo)
    if (err) {
      setError(err.code === '23505' ? 'Ese proveedor ya tiene precios para este artículo.' : err.message)
      return
    }
    setEditing(null)
    setIsNewRow(false)
    setSelected(editing.proveedor_codigo)
    load()
  }

  async function deleteSelected() {
    if (!selected) return
    if (!confirm(`¿Quitar los precios del proveedor ${nombreProveedor(selected)} para este artículo?`)) return
    const { error: err } = await supabase
      .from('articulo_proveedor')
      .delete()
      .eq('articulo_codigo', articuloCodigo)
      .eq('proveedor_codigo', selected)
    if (err) {
      setError(err.message)
      return
    }
    setSelected(null)
    load()
  }

  function numInput(d: ArticuloProveedor, key: NumKey, step = '0.001') {
    return (
      <TextInput
        type="number"
        step={step}
        className={inp}
        value={d[key] ?? ''}
        onChange={(e) => setEditing({ ...d, [key]: num(e.target.value) })}
      />
    )
  }

  const usados = new Set(rows.map((r) => r.proveedor_codigo))

  const editRow = (d: ArticuloProveedor) => (
    <tr className="border-b border-slate-100 bg-amber-50/40">
      <td className={td}>
        {isNewRow ? (
          <SelectInput
            className={inp}
            value={d.proveedor_codigo}
            onChange={(e) => setEditing({ ...d, proveedor_codigo: e.target.value })}
            autoFocus
          >
            <option value="">— Proveedor —</option>
            {proveedores
              .filter((p) => !usados.has(p.codigo))
              .map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {p.nombre}
                </option>
              ))}
          </SelectInput>
        ) : (
          <span className="font-medium">{nombreProveedor(d.proveedor_codigo)}</span>
        )}
      </td>
      <td className={td}>
        <TextInput className={inp} value={d.codigo_compra ?? ''} onChange={(e) => setEditing({ ...d, codigo_compra: str(e.target.value) })} />
      </td>
      <td className={td}>{numInput(d, 'coste_puro')}</td>
      <td className={td}>{numInput(d, 'coste_neto')}</td>
      <td className={td}>{numInput(d, 'coste_bruto')}</td>
      <td className={td}>{numInput(d, 'precio_medio_compra')}</td>
      <td className={td}>{numInput(d, 'ultimo_descuento_pct', '0.01')}</td>
      <td className={td}>{numInput(d, 'impuesto2_pct', '0.01')}</td>
      <td className={td}>{numInput(d, 'unidades_pedidas')}</td>
      <td className={td}>
        <TextInput
          type="date"
          className={inp}
          value={d.fecha_prevista_entrega ?? ''}
          onChange={(e) => setEditing({ ...d, fecha_prevista_entrega: str(e.target.value) })}
        />
      </td>
      <td className={td}>{numInput(d, 'unidades_compra')}</td>
      <td className={`${td} text-slate-400`}>{d.ultima_compra_fecha ?? '—'}</td>
      <td className={`${td} text-slate-400`}>{fmt(d.ultimas_unidades_compradas)}</td>
      <td className={`${td} whitespace-nowrap`}>
        <button type="button" className={miniBtn} onClick={saveRow}>
          <Save size={14} />
        </button>
        <button
          type="button"
          className={miniBtn}
          onClick={() => {
            setEditing(null)
            setIsNewRow(false)
          }}
        >
          <X size={14} />
        </button>
      </td>
    </tr>
  )

  const selectedRow = rows.find((r) => r.proveedor_codigo === selected)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">
        Por cada proveedor: código de compra, costes puro, neto, bruto y líquido, unidades pedidas, previsión de
        entrada, unidades compradas, fecha y unidades de la última compra, y canon. Tablas ARTPROV + ARTDPROV. La
        última compra la actualiza la recepción de compras, no se edita a mano.
      </p>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1">
          <span className="mr-auto text-xs font-semibold uppercase tracking-wide text-slate-500">
            Precios por proveedor
          </span>
          <button type="button" className={miniBtn} onClick={startNew} disabled={!!editing}>
            <Plus size={14} /> Añadir línea
          </button>
          <button
            type="button"
            className={miniBtn}
            disabled={!selectedRow || !!editing}
            onClick={() => {
              if (!selectedRow) return
              setIsNewRow(false)
              setEditing({ ...selectedRow })
            }}
          >
            <Pencil size={14} /> Modificar
          </button>
          <button
            type="button"
            className={`${miniBtn} hover:bg-red-50 hover:text-red-600`}
            disabled={!selectedRow || !!editing}
            onClick={deleteSelected}
          >
            <Trash2 size={14} /> Borrar línea
          </button>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className={th}>Proveedor</th>
              <th className={th}>Cód. compra</th>
              <th className={th}>Coste puro</th>
              <th className={th}>Coste neto</th>
              <th className={th}>Coste bruto</th>
              <th className={th}>Líquido (medio)</th>
              <th className={th}>Últ. dto. %</th>
              <th className={th}>Canon %</th>
              <th className={th}>Uds. pedidas</th>
              <th className={th}>Previsión entrada</th>
              <th className={th}>Uds. compra</th>
              <th className={th}>Últ. compra</th>
              <th className={th}>Uds. últ. compra</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !editing && (
              <tr>
                <td colSpan={14} className="px-2 py-4 text-center text-slate-400">
                  Sin precios de proveedor.
                </td>
              </tr>
            )}
            {rows.map((r) =>
              editing && !isNewRow && editing.proveedor_codigo === r.proveedor_codigo ? (
                <Fragment key={r.proveedor_codigo}>{editRow(editing)}</Fragment>
              ) : (
                <tr
                  key={r.proveedor_codigo}
                  onClick={() => setSelected(r.proveedor_codigo)}
                  className={`cursor-pointer border-b border-slate-100 last:border-0 ${
                    selected === r.proveedor_codigo ? 'bg-indigo-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <td className={`${td} font-medium`}>{nombreProveedor(r.proveedor_codigo)}</td>
                  <td className={td}>{r.codigo_compra ?? '—'}</td>
                  <td className={td}>{fmt(r.coste_puro)}</td>
                  <td className={td}>{fmt(r.coste_neto)}</td>
                  <td className={td}>{fmt(r.coste_bruto)}</td>
                  <td className={td}>{fmt(r.precio_medio_compra)}</td>
                  <td className={td}>{fmt(r.ultimo_descuento_pct)}</td>
                  <td className={td}>{fmt(r.impuesto2_pct)}</td>
                  <td className={td}>{fmt(r.unidades_pedidas)}</td>
                  <td className={td}>{r.fecha_prevista_entrega ?? '—'}</td>
                  <td className={td}>{fmt(r.unidades_compra)}</td>
                  <td className={td}>{r.ultima_compra_fecha ?? '—'}</td>
                  <td className={td}>{fmt(r.ultimas_unidades_compradas)}</td>
                  <td className={td} />
                </tr>
              ),
            )}
            {editing && isNewRow && editRow(editing)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

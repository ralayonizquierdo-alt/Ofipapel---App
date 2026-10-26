import { useEffect, useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwField, GwGroup, GwInput, GwNumber, GwSelect, formatGw } from '../../../components/gw'
import type { ArticuloProveedor } from '../types'

const str = (v: string) => (v === '' ? null : v)
const fecha = (v: string | null) => {
  if (!v) return '  /  /'
  const [y, m, d] = v.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

const COLS =
  'articulo_codigo, proveedor_codigo, codigo_compra, coste_puro, coste_neto, coste_bruto, precio_medio_compra, ultimo_descuento_pct, impuesto1_pct, impuesto2_pct, impuesto3_pct, ultima_bonificacion, ultima_compra_tienda, ultima_compra_numero, ultima_compra_fecha, fecha_prevista_entrega, ultimas_unidades_compradas, unidades_pedidas, unidades_compra'

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
    const list = (data ?? []) as ArticuloProveedor[]
    setRows(list)
    setSelected((s) => s ?? list[0]?.proveedor_codigo ?? null)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articuloCodigo])

  const nombreProveedor = (codigo: string) => proveedores.find((p) => p.codigo === codigo)?.nombre ?? codigo

  function startNew() {
    setError(null)
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

  function cancel() {
    setEditing(null)
    setIsNewRow(false)
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
    setSelected(editing.proveedor_codigo)
    cancel()
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

  const usados = new Set(rows.map((r) => r.proveedor_codigo))
  const selectedRow = rows.find((r) => r.proveedor_codigo === selected)
  const d = editing ?? selectedRow ?? null
  const dis = !editing
  const set = (patch: Partial<ArticuloProveedor>) => editing && setEditing({ ...editing, ...patch })

  return (
    <div className="flex flex-col gap-1.5" title="ARTPROV + ARTDPROV">
      <div className="flex gap-1">
        <button type="button" className="gw-btn" onClick={startNew} disabled={!!editing}>
          <Plus size={14} /> Añadir línea
        </button>
        <button
          type="button"
          className="gw-btn"
          disabled={!selectedRow || !!editing}
          onClick={() => {
            if (!selectedRow) return
            setError(null)
            setIsNewRow(false)
            setEditing({ ...selectedRow })
          }}
        >
          <Pencil size={14} /> Modificar línea
        </button>
        <button type="button" className="gw-btn" disabled={!selectedRow || !!editing} onClick={deleteSelected}>
          <Trash2 size={14} /> Borrar línea
        </button>
        {editing && (
          <>
            <button type="button" className="gw-btn ml-3" onClick={saveRow}>
              <Check size={14} className="text-[#127a12]" /> Aceptar
            </button>
            <button type="button" className="gw-btn" onClick={cancel}>
              <X size={14} className="text-[#c42b1c]" /> Cancelar
            </button>
          </>
        )}
      </div>
      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{error}</div>}

      <div className="max-h-[170px] overflow-y-auto border border-[var(--gw-border)]">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: 80 }}>Proveedor</th>
              <th>Nombre Proveedor</th>
              <th style={{ width: 140 }}>Código de Compra</th>
              <th className="text-right" style={{ width: 95 }}>Coste Puro</th>
              <th className="text-right" style={{ width: 95 }}>Coste Neto</th>
              <th className="text-right" style={{ width: 95 }}>Coste Bruto</th>
              <th className="text-right" style={{ width: 95 }}>Coste Líquido</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !isNewRow && (
              <tr>
                <td colSpan={7} className="text-center text-[#6d6d6d]">Sin precios de proveedor.</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.proveedor_codigo}
                className={!isNewRow && selected === r.proveedor_codigo ? 'gw-selected' : ''}
                onClick={() => !editing && setSelected(r.proveedor_codigo)}
              >
                <td>{r.proveedor_codigo}</td>
                <td>{nombreProveedor(r.proveedor_codigo)}</td>
                <td>{r.codigo_compra ?? ''}</td>
                <td className="text-right tabular-nums">{formatGw(r.coste_puro, 3)}</td>
                <td className="text-right tabular-nums">{formatGw(r.coste_neto, 3)}</td>
                <td className="text-right tabular-nums">{formatGw(r.coste_bruto, 3)}</td>
                <td className="text-right tabular-nums">{formatGw(r.precio_medio_compra, 3)}</td>
              </tr>
            ))}
            {isNewRow && (
              <tr className="gw-selected">
                <td colSpan={7}>(nueva línea)</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {d && (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <GwGroup title="Proveedor">
            <div className="flex flex-col gap-1.5">
              <GwField label="Proveedor">
                {isNewRow && editing ? (
                  <GwSelect autoFocus value={editing.proveedor_codigo} onChange={(e) => set({ proveedor_codigo: e.target.value })}>
                    <option value="">— Proveedor —</option>
                    {proveedores
                      .filter((p) => !usados.has(p.codigo))
                      .map((p) => (
                        <option key={p.codigo} value={p.codigo}>
                          {p.codigo} {p.nombre}
                        </option>
                      ))}
                  </GwSelect>
                ) : (
                  <GwInput value={`${d.proveedor_codigo} ${nombreProveedor(d.proveedor_codigo)}`} disabled />
                )}
              </GwField>
              <GwField label="Código de Compra">
                <GwInput title="COD_COMPRA" value={d.codigo_compra ?? ''} disabled={dis} onChange={(e) => set({ codigo_compra: str(e.target.value) })} />
              </GwField>
              <GwField label="Canon">
                <GwNumber value={d.impuesto2_pct} decimals={2} disabled={dis} onChange={(v) => set({ impuesto2_pct: v })} />
              </GwField>
            </div>
          </GwGroup>
          <GwGroup title="Precios de coste">
            <div className="grid grid-cols-[1fr_110px] items-center gap-x-2 gap-y-1">
              <span className="gw-label">Coste Puro Prov.:</span>
              <GwNumber value={d.coste_puro} decimals={3} disabled={dis} onChange={(v) => set({ coste_puro: v })} />
              <span className="gw-label">Coste Neto:</span>
              <GwNumber value={d.coste_neto} decimals={3} disabled={dis} onChange={(v) => set({ coste_neto: v })} />
              <span className="gw-label">Coste Bruto:</span>
              <GwNumber value={d.coste_bruto} decimals={3} disabled={dis} onChange={(v) => set({ coste_bruto: v })} />
              <span className="gw-label">Coste Líquido:</span>
              <GwNumber value={d.precio_medio_compra} decimals={3} disabled={dis} onChange={(v) => set({ precio_medio_compra: v })} />
              <span className="gw-label">Últ. Dto. %:</span>
              <GwNumber value={d.ultimo_descuento_pct} decimals={2} disabled={dis} onChange={(v) => set({ ultimo_descuento_pct: v })} />
            </div>
          </GwGroup>
          <GwGroup title="Compras">
            <div className="grid grid-cols-[1fr_110px] items-center gap-x-2 gap-y-1">
              <span className="gw-label">Unids. Pedidas:</span>
              <GwNumber value={d.unidades_pedidas} decimals={3} disabled={dis} onChange={(v) => set({ unidades_pedidas: v })} />
              <span className="gw-label">Prev. Entrada:</span>
              <GwInput
                type="date"
                value={d.fecha_prevista_entrega ?? ''}
                disabled={dis}
                onChange={(e) => set({ fecha_prevista_entrega: str(e.target.value) })}
              />
              <span className="gw-label">Unids. Compradas:</span>
              <GwNumber value={d.unidades_compra} decimals={3} disabled={dis} onChange={(v) => set({ unidades_compra: v })} />
              <span className="gw-label">Última Compra:</span>
              <GwInput value={fecha(d.ultima_compra_fecha)} disabled />
              <span className="gw-label">Unids. Últ. Compra:</span>
              <GwNumber value={d.ultimas_unidades_compradas} decimals={3} disabled />
            </div>
          </GwGroup>
        </div>
      )}
    </div>
  )
}

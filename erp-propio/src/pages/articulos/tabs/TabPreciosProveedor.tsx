import { useEffect, useState, type ReactNode } from 'react'
import { Binoculars, Check, ChevronFirst, ChevronLast, FilePen, FilePlus2, Play, Trash2, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwDate, GwNumber, GwSelect, formatGw } from '../../../components/gw'
import type { ArticuloProveedor } from '../types'

const fecha = (v: string | null) => {
  if (!v) return ' /  /'
  const [y, m, d] = v.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

const COLS =
  'articulo_codigo, proveedor_codigo, codigo_compra, coste_puro, coste_neto, coste_bruto, precio_medio_compra, ultimo_descuento_pct, impuesto1_pct, impuesto2_pct, impuesto3_pct, ultima_bonificacion, ultima_compra_tienda, ultima_compra_numero, ultima_compra_fecha, fecha_prevista_entrega, ultimas_unidades_compradas, unidades_pedidas, unidades_compra'

const FILAS_MINIMAS = 12

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
    setSelected((s) => (s && list.some((r) => r.proveedor_codigo === s) ? s : (list[0]?.proveedor_codigo ?? null)))
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
  const idx = rows.findIndex((r) => r.proveedor_codigo === selected)
  const set = (patch: Partial<ArticuloProveedor>) => editing && setEditing({ ...editing, ...patch })
  const ir = (i: number) => rows[i] && setSelected(rows[i].proveedor_codigo)

  const filaEdicion = (e: ArticuloProveedor) => (
    <tr className="bg-[#fffbe6]">
      <td>
        {isNewRow ? (
          <GwSelect autoFocus value={e.proveedor_codigo} onChange={(ev) => set({ proveedor_codigo: ev.target.value })} title="COD_PROV">
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
          e.proveedor_codigo
        )}
      </td>
      <td><GwNumber value={e.coste_puro} decimals={3} onChange={(v) => set({ coste_puro: v })} /></td>
      <td><GwNumber value={e.coste_neto} decimals={3} onChange={(v) => set({ coste_neto: v })} /></td>
      <td><GwNumber value={e.coste_bruto} decimals={3} onChange={(v) => set({ coste_bruto: v })} /></td>
      <td><GwNumber value={e.precio_medio_compra} decimals={3} onChange={(v) => set({ precio_medio_compra: v })} /></td>
      <td><GwNumber value={e.unidades_pedidas} decimals={3} onChange={(v) => set({ unidades_pedidas: v })} /></td>
      <td>
        <GwDate value={e.fecha_prevista_entrega} onChange={(v) => set({ fecha_prevista_entrega: v })} />
      </td>
      <td><GwNumber value={e.unidades_compra} decimals={3} onChange={(v) => set({ unidades_compra: v })} /></td>
      <td>{fecha(e.ultima_compra_fecha)}</td>
      <td className="text-right tabular-nums">{formatGw(e.ultimas_unidades_compradas ?? 0, 2)}</td>
      <td><GwNumber value={e.impuesto2_pct} decimals={2} onChange={(v) => set({ impuesto2_pct: v })} /></td>
    </tr>
  )

  const huecos = Math.max(0, FILAS_MINIMAS - rows.length - (isNewRow ? 1 : 0))

  return (
    <div className="flex flex-col gap-1" title="ARTPROV + ARTDPROV">
      <fieldset className="gw-group">
        <legend>Precios de coste y datos última compra según proveedor</legend>
        {error && <div className="mb-1 border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{error}</div>}
        <div className="max-h-[270px] overflow-y-auto border border-[var(--gw-border)]">
          <table className="gw-grid">
            <thead className="sticky top-0">
              <tr>
                <th style={{ width: 90 }}>Proveedor</th>
                <th className="text-center!" style={{ width: 90 }}>Puro</th>
                <th className="text-center!" style={{ width: 90 }}>Neto</th>
                <th className="text-center!" style={{ width: 90 }}>Bruto</th>
                <th className="text-center!" style={{ width: 90 }}>Liquido</th>
                <th className="text-center!" style={{ width: 75 }}>Unds ped.</th>
                <th style={{ width: 95 }}>Prev. Entrada</th>
                <th className="text-center!" style={{ width: 95 }}>Unds. Compr.</th>
                <th style={{ width: 80 }}>Ult. Comp.</th>
                <th className="text-center!" style={{ width: 90 }}>Ult. Und. Co.</th>
                <th className="text-center!" style={{ width: 60 }}>%Canon</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) =>
                editing && !isNewRow && editing.proveedor_codigo === r.proveedor_codigo ? (
                  <FilaKey key={r.proveedor_codigo}>{filaEdicion(editing)}</FilaKey>
                ) : (
                  <tr
                    key={r.proveedor_codigo}
                    title={nombreProveedor(r.proveedor_codigo)}
                    className={!isNewRow && selected === r.proveedor_codigo ? 'gw-selected' : ''}
                    onClick={() => !editing && setSelected(r.proveedor_codigo)}
                  >
                    <td>{r.proveedor_codigo}</td>
                    <td className="text-right tabular-nums">{formatGw(r.coste_puro ?? 0, 3)}</td>
                    <td className="text-right tabular-nums">{formatGw(r.coste_neto ?? 0, 3)}</td>
                    <td className="text-right tabular-nums">{formatGw(r.coste_bruto ?? 0, 3)}</td>
                    <td className="text-right tabular-nums">{formatGw(r.precio_medio_compra ?? 0, 3)}</td>
                    <td className="text-right tabular-nums">{formatGw(r.unidades_pedidas ?? 0, 3)}</td>
                    <td>{fecha(r.fecha_prevista_entrega)}</td>
                    <td className="text-right tabular-nums">{formatGw(r.unidades_compra ?? 0, 3)}</td>
                    <td>{fecha(r.ultima_compra_fecha)}</td>
                    <td className="text-right tabular-nums">{formatGw(r.ultimas_unidades_compradas ?? 0, 2)}</td>
                    <td className="text-right tabular-nums">{formatGw(r.impuesto2_pct ?? 0, 2)}</td>
                  </tr>
                ),
              )}
              {isNewRow && editing && filaEdicion(editing)}
              {Array.from({ length: huecos }, (_, i) => (
                <tr key={`h${i}`}>
                  {Array.from({ length: 11 }, (_, j) => (
                    <td key={j} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-1 flex w-fit border border-[var(--gw-border)]">
          <MiniBtn title="Primero" disabled={!!editing || rows.length === 0} onClick={() => ir(0)}>
            <ChevronFirst size={14} strokeWidth={3} />
          </MiniBtn>
          <MiniBtn title="Anterior" disabled={!!editing || idx <= 0} onClick={() => ir(idx - 1)}>
            <Play size={10} className="rotate-180" fill="currentColor" />
          </MiniBtn>
          <MiniBtn title="Siguiente" disabled={!!editing || idx < 0 || idx >= rows.length - 1} onClick={() => ir(idx + 1)}>
            <Play size={10} fill="currentColor" />
          </MiniBtn>
          <MiniBtn title="Último" disabled={!!editing || rows.length === 0} onClick={() => ir(rows.length - 1)}>
            <ChevronLast size={14} strokeWidth={3} />
          </MiniBtn>
          <MiniBtn
            title="Buscar proveedor"
            disabled={!!editing || rows.length === 0}
            onClick={() => {
              const c = window.prompt('Código de proveedor:')?.trim()
              if (!c) return
              if (rows.some((r) => r.proveedor_codigo === c)) setSelected(c)
              else setError(`El proveedor ${c} no tiene precios para este artículo.`)
            }}
          >
            <Binoculars size={13} />
          </MiniBtn>
          {editing ? (
            <>
              <MiniBtn title="Aceptar" onClick={saveRow}>
                <Check size={14} strokeWidth={3} className="text-[#127a12]" />
              </MiniBtn>
              <MiniBtn title="Cancelar" onClick={cancel}>
                <X size={14} strokeWidth={3} className="text-[#c42b1c]" />
              </MiniBtn>
            </>
          ) : (
            <>
              <MiniBtn title="Nuevo" onClick={startNew}>
                <FilePlus2 size={13} />
              </MiniBtn>
              <MiniBtn
                title="Modificar"
                disabled={!selectedRow}
                onClick={() => {
                  if (!selectedRow) return
                  setError(null)
                  setIsNewRow(false)
                  setEditing({ ...selectedRow })
                }}
              >
                <FilePen size={13} />
              </MiniBtn>
              <MiniBtn title="Borrar" disabled={!selectedRow} onClick={deleteSelected}>
                <Trash2 size={13} />
              </MiniBtn>
            </>
          )}
        </div>
      </fieldset>
    </div>
  )
}

function FilaKey({ children }: { children: ReactNode }) {
  return <>{children}</>
}

function MiniBtn({ title, onClick, disabled, children }: { title: string; onClick?: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="flex h-[22px] w-[52px] items-center justify-center border-r border-[var(--gw-border-light)] bg-[var(--gw-face)] text-[#1d3a8a] last:border-r-0 hover:bg-[#e5f1fb] disabled:text-[#9a9a9a] disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

// Clientes → «Artículos comprados» (Luis, 29/10/2026): lo que ha comprado el cliente, artículo a
// artículo: código, referencia, descripción, unidades y el último precio al que se le facturó.
// Sale de sus ventas y albaranes no anulados (fn_cliente_articulos_comprados). Se filtra
// escribiendo y se ordena pulsando el título de cada columna.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GwInput, formatGw } from '../../../components/gw'
import { supabase } from '../../../lib/supabase'
import type { ClienteTabProps } from '../types'

interface Fila {
  articulo_codigo: string
  referencia: string | null
  descripcion: string | null
  unidades: number
  importe: number
  ultimo_precio: number | null
  ultimo_descuento_pct: number | null
  ultima_fecha: string | null
  veces: number
}

type Col = keyof Fila
const COLUMNAS: { key: Col; label: string; ancho?: number; num?: number }[] = [
  { key: 'articulo_codigo', label: 'Código', ancho: 110 },
  { key: 'referencia', label: 'Referencia', ancho: 130 },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'unidades', label: 'Unidades', ancho: 90, num: 2 },
  { key: 'ultimo_precio', label: 'Último precio', ancho: 105, num: 3 },
  { key: 'ultimo_descuento_pct', label: 'Dto. %', ancho: 65, num: 2 },
  { key: 'ultima_fecha', label: 'Última venta', ancho: 100 },
  { key: 'veces', label: 'Veces', ancho: 60, num: 0 },
  { key: 'importe', label: 'Importe total', ancho: 110, num: 2 },
]

export function TabArticulosComprados({ cliente }: ClienteTabProps) {
  const navigate = useNavigate()
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState('')
  const [orden, setOrden] = useState<{ col: Col; asc: boolean }>({ col: 'ultima_fecha', asc: false })
  const [sel, setSel] = useState<string | null>(null)

  useEffect(() => {
    if (!cliente.codigo) return
    let vivo = true
    supabase.rpc('fn_cliente_articulos_comprados', { p_cliente: cliente.codigo }).then(({ data, error: e }) => {
      if (!vivo) return
      setError(e?.message ?? null)
      setFilas(
        ((data ?? []) as Fila[]).map((f) => ({
          ...f,
          unidades: Number(f.unidades),
          importe: Number(f.importe),
          ultimo_precio: f.ultimo_precio == null ? null : Number(f.ultimo_precio),
          ultimo_descuento_pct: f.ultimo_descuento_pct == null ? null : Number(f.ultimo_descuento_pct),
        })),
      )
    })
    return () => {
      vivo = false
    }
  }, [cliente.codigo])

  const vistas = useMemo(() => {
    const t = filtro.trim().toLowerCase()
    const l = (filas ?? []).filter((f) => !t || `${f.articulo_codigo} ${f.referencia ?? ''} ${f.descripcion ?? ''}`.toLowerCase().includes(t))
    const { col, asc } = orden
    return [...l].sort((a, b) => {
      const x = a[col] ?? ''
      const y = b[col] ?? ''
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es', { numeric: true })
      return asc ? c : -c
    })
  }, [filas, filtro, orden])

  const total = vistas.reduce((s, f) => s + f.importe, 0)
  const unidades = vistas.reduce((s, f) => s + f.unidades, 0)

  return (
    <div className="flex flex-col gap-1.5 p-1">
      <div className="flex items-center gap-2">
        <span className="gw-label">Buscar:</span>
        <GwInput className="w-[320px]" placeholder="código, referencia o descripción" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        <span className="flex-1" />
        <span className="text-[13px]">
          {vistas.length} artículos · {formatGw(unidades, 2)} unidades · {formatGw(total, 2)} €
        </span>
      </div>
      <div className="h-[430px] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0 z-10">
            <tr>
              {COLUMNAS.map((c) => (
                <th
                  key={c.key}
                  style={c.ancho ? { width: c.ancho } : undefined}
                  className={`cursor-pointer select-none ${c.num != null ? 'text-right!' : ''}`}
                  title="Ordenar por esta columna"
                  onClick={() => setOrden((o) => ({ col: c.key, asc: o.col === c.key ? !o.asc : c.num == null }))}
                >
                  {c.label}
                  {orden.col === c.key ? (orden.asc ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas == null && (
              <tr>
                <td colSpan={COLUMNAS.length}>Cargando…</td>
              </tr>
            )}
            {filas != null && vistas.length === 0 && (
              <tr>
                <td colSpan={COLUMNAS.length} className="text-[#777]">
                  {filas.length ? 'Ningún artículo coincide con la búsqueda.' : 'Este cliente todavía no tiene compras en el ERP.'}
                </td>
              </tr>
            )}
            {vistas.map((f) => (
              <tr
                key={f.articulo_codigo}
                className={sel === f.articulo_codigo ? 'gw-selected' : ''}
                onClick={() => setSel(f.articulo_codigo)}
                onDoubleClick={() => navigate(`/articulos/${encodeURIComponent(f.articulo_codigo)}`)}
                title="Doble clic: abrir la ficha del artículo"
              >
                {COLUMNAS.map((c) => {
                  const v = f[c.key]
                  return (
                    <td key={c.key} className={c.num != null ? 'text-right' : 'truncate'}>
                      {v == null ? '' : c.key === 'ultima_fecha' ? String(v).split('-').reverse().join('/') : c.num != null ? formatGw(Number(v), c.num) : String(v)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <span className="text-[#c42b1c]">{error}</span>}
    </div>
  )
}

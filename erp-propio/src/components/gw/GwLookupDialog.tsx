import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { GwInput, GwWindow } from './index'
import { filaPorTecla } from './teclado'

export interface GwLookupColumn {
  key: string
  label: string
  width?: number
}

/**
 * Buscador de la tabla relacionada que abre el botón «···» de GeminisWin: rejilla con
 * filtro, doble clic o Intro para elegir, Esc para cerrar.
 */
export function GwLookupDialog<T extends Record<string, unknown>>({
  title,
  table,
  columns,
  searchColumns,
  orderBy,
  keyColumn,
  onPick,
  onClose,
  eq,
  ordenPrevio,
  filaRoja,
  filtroInicial = '',
}: {
  title: string
  table: string
  columns: GwLookupColumn[]
  searchColumns: string[]
  orderBy: string
  keyColumn: string
  onPick: (row: T) => void
  onClose: () => void
  /** Restricciones fijas (columna = valor), p. ej. { tipo: 'proveedor' } para no ofrecer acreedores. */
  eq?: Record<string, string>
  /** Columna por la que se ordena antes que `orderBy` (p. ej. «baja_orden»: los de baja al final). */
  ordenPrevio?: string
  /** Filas que salen en rojo (p. ej. empleados de baja). */
  filaRoja?: (r: T) => boolean
  /** Texto con el que se abre ya filtrado (p. ej. lo escrito en «Ver Presup.»). */
  filtroInicial?: string
}) {
  const [filtro, setFiltro] = useState(filtroInicial)
  const eqClave = JSON.stringify(eq ?? {})
  const [rows, setRows] = useState<T[]>([])
  const [sel, setSel] = useState(0)

  useEffect(() => {
    const t = setTimeout(async () => {
      const cols = [...new Set([...columns.map((c) => c.key), ...(ordenPrevio ? [ordenPrevio] : [])])].join(', ')
      let q = supabase.from(table).select(cols)
      if (ordenPrevio) q = q.order(ordenPrevio)
      q = q.order(orderBy).limit(200)
      const f = filtro.trim().replace(/[,%()]/g, ' ')
      if (f) q = q.or(searchColumns.map((c) => `${c}.ilike.%${f}%`).join(','))
      for (const [c, v] of Object.entries(JSON.parse(eqClave) as Record<string, string>)) q = q.eq(c, v)
      const { data } = await q
      setRows((data ?? []) as unknown as T[])
      setSel(0)
    }, 200)
    return () => clearTimeout(t)
  }, [filtro, table, orderBy, columns, searchColumns, eqClave, ordenPrevio])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-24" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title={title} onClose={onClose} className="w-[640px] max-w-[95vw]">
        <div className="flex flex-col gap-1.5">
          <GwInput
            autoFocus
            placeholder="Escribe para filtrar…"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            onKeyDown={(e) => {
              // Flechas, AvPág/RePág y Ctrl+Inicio/Fin mueven la fila; Intro = Aceptar.
              const n = filaPorTecla(e, sel, rows.length, 12)
              if (n != null) {
                e.preventDefault()
                setSel(n)
              } else if (e.key === 'Enter' && rows[sel]) {
                e.preventDefault()
                onPick(rows[sel])
              }
            }}
          />
          <div className="max-h-[360px] overflow-y-auto border border-[var(--gw-border)]">
            <table className="gw-grid">
              <thead className="sticky top-0">
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} style={c.width ? { width: c.width } : undefined}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={columns.length} className="text-center text-[#6d6d6d]">
                      Sin registros.
                    </td>
                  </tr>
                )}
                {rows.map((r, i) => (
                  <tr
                    key={String(r[keyColumn])}
                    className={i === sel ? 'gw-selected' : filaRoja?.(r) ? 'font-bold text-[#c42b1c]' : ''}
                    onClick={() => setSel(i)}
                    onDoubleClick={() => onPick(r)}
                  >
                    {columns.map((c) => (
                      <td key={c.key}>{String(r[c.key] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-1.5">
            <button type="button" className="gw-btn" disabled={!rows[sel]} onClick={() => rows[sel] && onPick(rows[sel])}>
              Aceptar
            </button>
            <button type="button" className="gw-btn" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </div>
      </GwWindow>
    </div>
  )
}

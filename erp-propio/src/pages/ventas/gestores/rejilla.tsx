import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'

export interface Col<T> {
  key: string
  label: string
  width: number
  align?: 'left' | 'right' | 'center'
  value: (r: T) => string | number | null
  render?: (r: T) => ReactNode
  cellStyle?: (r: T) => CSSProperties | undefined
  title?: string
}

export interface Orden {
  key: string
  asc: boolean
}

export function ordenar<T>(rows: T[], cols: Col<T>[], orden: Orden | null): T[] {
  if (!orden) return rows
  const col = cols.find((c) => c.key === orden.key)
  if (!col) return rows
  const out = [...rows].sort((a, b) => {
    const va = col.value(a)
    const vb = col.value(b)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    if (typeof va === 'number' && typeof vb === 'number') return va - vb
    return String(va).localeCompare(String(vb), 'es', { numeric: true })
  })
  return orden.asc ? out : out.reverse()
}

/**
 * Rejilla grande al estilo de los gestores de GeminisWin: cabeceras altas, filas de 27 px,
 * fila seleccionada con marco azul, colores por fila, desplazamiento horizontal dentro de la
 * propia rejilla y filas vacías hasta rellenar la altura.
 */
export function Rejilla<T>({
  rows,
  cols,
  rowKey,
  sel,
  onSel,
  onOpen,
  rowStyle,
  orden,
  onOrden,
  vacias = 14,
}: {
  rows: T[]
  cols: Col<T>[]
  rowKey: (r: T) => string
  sel: number
  onSel: (i: number) => void
  onOpen?: (r: T) => void
  rowStyle?: (r: T) => CSSProperties | undefined
  orden: Orden | null
  onOrden: (o: Orden) => void
  vacias?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector('tr[data-sel="1"]')?.scrollIntoView({ block: 'nearest' })
  }, [sel])
  const ancho = cols.reduce((s, c) => s + c.width, 0) + 12
  return (
    <div
      ref={ref}
      tabIndex={0}
      className="min-h-0 flex-1 overflow-auto border border-[var(--gw-border)] bg-white outline-none"
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          onSel(Math.min(sel + 1, rows.length - 1))
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          onSel(Math.max(sel - 1, 0))
        } else if (e.key === 'Enter' && rows[sel]) onOpen?.(rows[sel])
      }}
    >
      <table className="border-collapse text-[17px]" style={{ width: ancho, minWidth: '100%', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 12 }} />
          {cols.map((c) => (
            <col key={c.key} style={{ width: c.width }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr className="h-[50px] bg-[#f0f0f0]">
            <th className="border border-[var(--gw-border)]" />
            {cols.map((c) => (
              <th
                key={c.key}
                title={c.title ?? 'Pulsa para ordenar por esta columna'}
                onClick={() => onOrden({ key: c.key, asc: orden?.key === c.key ? !orden.asc : true })}
                className="cursor-default select-none truncate border border-[var(--gw-border)] px-1 text-left text-[18px] font-normal hover:bg-[#e5f1fb]"
              >
                {c.label}
                {orden?.key === c.key && <span className="ml-1 text-[11px] text-[#1d3a8a]">{orden.asc ? '▲' : '▼'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isSel = i === sel
            const st = rowStyle?.(r)
            return (
              <tr
                key={rowKey(r)}
                data-sel={isSel ? '1' : undefined}
                className="h-[27px]"
                style={st}
                onClick={() => onSel(i)}
                onDoubleClick={() => onOpen?.(r)}
              >
                <td className="border border-[var(--gw-border-light)] bg-[#f0f0f0] text-center text-[10px]">{isSel ? '▸' : ''}</td>
                {cols.map((c, j) => {
                  const v = c.render ? c.render(r) : c.value(r)
                  const extra = c.cellStyle?.(r)
                  const selFirst = isSel && j === 0
                  return (
                    <td
                      key={c.key}
                      className={`truncate border border-[var(--gw-border-light)] px-1 ${isSel ? 'border-y-[#0078d7]!' : ''}`}
                      style={{
                        textAlign: c.align ?? 'left',
                        ...(selFirst ? { background: '#0078d7', color: '#fff' } : {}),
                        ...extra,
                      }}
                    >
                      {v ?? ''}
                    </td>
                  )
                })}
              </tr>
            )
          })}
          {Array.from({ length: Math.max(0, vacias - rows.length) }, (_, i) => (
            <tr key={`__v${i}`} className="h-[27px]">
              <td className="border border-[var(--gw-border-light)] bg-[#f0f0f0]" />
              {cols.map((c) => (
                <td key={c.key} className="border border-[var(--gw-border-light)]" />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

import type { ReactNode } from 'react'
import { GwBuscar, GwEliminar, GwModificar, GwNuevo } from './GwIconos'

/** Mini barra de iconos bajo las rejillas de GeminisWin: nueva, modificar, borrar y buscar línea. */
export function GridMiniBar({
  onNuevo,
  onModificar,
  onBorrar,
  onBuscar,
  nuevo = true,
  modificar = true,
  borrar = true,
  buscar = true,
  children,
}: {
  onNuevo?: () => void
  onModificar?: () => void
  onBorrar?: () => void
  onBuscar?: () => void
  nuevo?: boolean
  modificar?: boolean
  borrar?: boolean
  buscar?: boolean
  children?: ReactNode
}) {
  const b = 'flex h-[22px] w-[58px] items-center justify-center border-r border-[var(--gw-border-light)] text-[#1d3a8a] hover:bg-[#e5f1fb] disabled:text-[#a8a8a8] disabled:hover:bg-transparent'
  return (
    <div className="flex items-center gap-3">
      <div className="flex border border-[var(--gw-border)] bg-[var(--gw-face)]">
        <button type="button" className={b} title="Nueva línea" disabled={!nuevo} onClick={onNuevo}>
          <GwNuevo />
        </button>
        <button type="button" className={b} title="Modificar línea" disabled={!modificar} onClick={onModificar}>
          <GwModificar />
        </button>
        <button type="button" className={b} title="Borrar línea" disabled={!borrar} onClick={onBorrar}>
          <GwEliminar />
        </button>
        <button type="button" className={`${b} border-r-0`} title="Buscar" disabled={!buscar} onClick={onBuscar}>
          <GwBuscar />
        </button>
      </div>
      {children}
    </div>
  )
}

/** Filas vacías para que la rejilla tenga la altura fija de GeminisWin aunque haya pocos registros. */
export function FilasVacias({ cols, ocupadas, total = 12 }: { cols: number; ocupadas: number; total?: number }) {
  const n = Math.max(0, total - ocupadas)
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <tr key={`__vacia${i}`}>
          {Array.from({ length: cols }, (_, j) => (
            <td key={j}>&nbsp;</td>
          ))}
        </tr>
      ))}
    </>
  )
}

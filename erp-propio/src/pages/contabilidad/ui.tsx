import type { ReactNode } from 'react'
import { GwDate, GwField } from '../../components/gw'

// Piezas comunes de las pantallas de Contabilidad (mismo estilo de ventana GeminisWin).

export function Barra({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-2 border border-[var(--gw-border-light)] bg-[var(--gw-face)] p-1.5">{children}</div>
}

export function Rango({
  desde,
  hasta,
  onDesde,
  onHasta,
}: {
  desde: string
  hasta: string
  onDesde: (v: string) => void
  onHasta: (v: string) => void
}) {
  return (
    <>
      <GwField label="Desde fecha">
        <GwDate value={desde} onChange={(v) => v && onDesde(v)} className="w-[100px]" />
      </GwField>
      <GwField label="Hasta fecha">
        <GwDate value={hasta} onChange={(v) => v && onHasta(v)} className="w-[100px]" />
      </GwField>
    </>
  )
}

/** Contenedor con desplazamiento para las rejillas gw-grid (altura ajustada a la ventana). */
export function Rejilla({ children, alto = 'calc(100vh - 300px)' }: { children: ReactNode; alto?: string }) {
  return (
    <div className="min-h-[160px] overflow-auto border border-[var(--gw-border)] bg-white" style={{ maxHeight: alto }}>
      {children}
    </div>
  )
}

export function Aviso({ error, ok }: { error?: string | null; ok?: string | null }) {
  if (error)
    return (
      <p className="text-[13px] font-bold text-[#c42b1c]" role="alert">
        {error}
      </p>
    )
  if (ok)
    return (
      <p className="text-[13px] font-bold text-[#127a12]" role="status">
        {ok}
      </p>
    )
  return null
}

export function Vacio({ cols, texto = 'Sin datos en el periodo.' }: { cols: number; texto?: string }) {
  return (
    <tr>
      <td colSpan={cols} className="text-[#555]">
        {texto}
      </td>
    </tr>
  )
}

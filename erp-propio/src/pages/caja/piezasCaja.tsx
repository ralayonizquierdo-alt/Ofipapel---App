import type { ReactNode } from 'react'

// Piezas de las ventanas de Caja: en GeminisWin usan letra grande (como Pagos de Gastos):
// etiquetas encima del campo y grupos con marco y título.

export const L = 'text-[18px] leading-[21px] whitespace-nowrap'
export const I = '!h-[32px] !text-[18px]'

export function Grupo({
  title,
  children,
  className = '',
  apagado,
}: {
  title?: ReactNode
  children: ReactNode
  className?: string
  apagado?: boolean
}) {
  return (
    <fieldset className={`min-w-0 border border-[var(--gw-border-light)] px-1.5 pb-1.5 pt-0 ${className}`}>
      {title != null && <legend className={`${L} px-1 ${apagado ? 'text-[#8a8a8a]' : ''}`}>{title}</legend>}
      {children}
    </fieldset>
  )
}

export function Campo({
  label,
  children,
  className = '',
  alinear,
}: {
  label: ReactNode
  children: ReactNode
  className?: string
  alinear?: 'right' | 'center'
}) {
  return (
    <div className={`flex min-w-0 flex-col ${className}`}>
      <span className={`${L} ${alinear === 'right' ? 'text-right' : alinear === 'center' ? 'text-center' : ''}`}>{label}</span>
      {children}
    </div>
  )
}

/** Radio solo de muestra (Tipo Forma de Pago / Tipo Contado se deducen de la forma de pago). */
export function RadioFijo({ label, checked, apagado }: { label: string; checked: boolean; apagado?: boolean }) {
  return (
    <span className={`flex select-none items-center gap-1.5 whitespace-nowrap text-[18px] ${apagado ? 'text-[#8a8a8a]' : ''}`}>
      <span
        className={`inline-flex h-[11px] w-[11px] items-center justify-center rounded-full border ${apagado ? 'border-[#a8a8a8]' : 'border-[#555]'} bg-white`}
      >
        {checked && <span className={`h-[5px] w-[5px] rounded-full ${apagado ? 'bg-[#8a8a8a]' : 'bg-black'}`} />}
      </span>
      {label}
    </span>
  )
}

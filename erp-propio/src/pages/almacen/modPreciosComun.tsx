import { Check, X } from 'lucide-react'
import type { ReactNode } from 'react'

export const NOMBRES_TARIFA = ['General', 'MAYOR  M-1', 'MAYOR  M-2', 'MAYOR  M-3', 'Tarifa Dcto -4', 'Tarifa Dcto -5', 'Tarifa Dcto -6']

export const hoyISO = () => new Date().toISOString().slice(0, 10)
export const horaActual = () => new Date().toTimeString().slice(0, 5)
export const redondear = (n: number, dec = 2) => Math.round(n * 10 ** dec) / 10 ** dec

/** Siguiente código numérico con relleno de ceros (GeminisWin: «0054», «0000002461»). */
export function siguienteCodigo(codigos: string[], ancho: number) {
  const max = codigos.reduce((m, c) => (/^\d+$/.test(c) ? Math.max(m, Number(c)) : m), 0)
  return String(max + 1).padStart(ancho, '0')
}

/** Botón-casilla de GeminisWin: × roja si está desmarcado, ✓ verde si está marcado. */
export function BotonMarca({
  checked,
  onChange,
  disabled,
  title,
  children,
  className = '',
}: {
  checked: boolean
  onChange?: (v: boolean) => void
  disabled?: boolean
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={`gw-btn h-auto min-h-[26px] justify-start gap-1 px-2 py-0.5 text-left leading-[15px] disabled:opacity-100 ${className}`}
    >
      {checked ? <Check size={13} strokeWidth={3} className="flex-none text-[#127a12]" /> : <X size={13} strokeWidth={3} className="flex-none text-[#c42b1c]" />}
      <span>{children}</span>
    </button>
  )
}

export function PieFicha({ texto }: { texto: string }) {
  return <div className="text-[11px] text-[#444]">{texto}</div>
}

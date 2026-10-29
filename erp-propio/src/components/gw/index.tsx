import { useRef, useState, type InputHTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Minus, Square, X } from 'lucide-react'
import { seleccionAlPulsar, seleccionAlSoltar, useSeleccionAlEntrar } from './seleccionEntrada'

export { GwDate, type GwDateProps } from './GwDate'

// Piezas de interfaz que replican el aspecto de GeminisWin (Visual FoxPro sobre Windows):
// ventanas hijas MDI, etiquetas encima del campo, números con coma decimal alineados
// a la derecha, grupos con marco, pestañas en varias filas y botones «···» de búsqueda.

/**
 * Ventana que se arrastra por su barra de título, como en Windows: `barra` va en la barra de
 * título y `estilo` en la ventana (propiedad CSS translate: no usar clases translate-* en ella).
 */
export function useArrastre(activo = true) {
  const [desplazado, setDesplazado] = useState({ x: 0, y: 0 })
  const arrastre = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const estilo = activo && (desplazado.x || desplazado.y) ? { translate: `${desplazado.x}px ${desplazado.y}px` } : undefined
  const barra = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (!activo || e.button !== 0 || (e.target as HTMLElement).closest('button, input, select, textarea')) return
      arrastre.current = { x: e.clientX, y: e.clientY, ox: desplazado.x, oy: desplazado.y }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const a = arrastre.current
      if (a) setDesplazado({ x: a.ox + e.clientX - a.x, y: a.oy + e.clientY - a.y })
    },
    onPointerUp: () => {
      arrastre.current = null
    },
  }
  return { estilo, barra }
}

export function GwWindow({
  title,
  onClose,
  children,
  className = '',
  movible = true,
  seccion,
}: {
  title: string
  onClose?: () => void
  children: ReactNode
  className?: string
  /** Se arrastra por la barra de título, como en Windows (todas salvo la ventana principal). */
  movible?: boolean
  /** Sección de la aplicación (clientes, compras…): tiñe la ventana con su color (index.css). */
  seccion?: string | null
}) {
  const { estilo, barra } = useArrastre(movible)
  return (
    <div
      className={`gw-ventana flex flex-col border border-[#6f6f6f] bg-[var(--gw-face)] shadow-[2px_2px_6px_rgba(0,0,0,0.35)] ${className}`}
      style={estilo}
      data-seccion={seccion ?? undefined}
    >
      <div
        className={`gw-titulo flex h-[22px] select-none items-center gap-1.5 bg-gradient-to-b from-[#dbe6f4] to-[#c7d6ea] px-1.5 text-[12px] ${movible ? 'cursor-move' : ''}`}
        {...barra}
      >
        <GwAppIcon size={14} />
        <span className="gw-titulo-texto flex-1 truncate">{title}</span>
        <span className="flex gap-0.5">
          <span className="flex h-[16px] w-[22px] items-center justify-center border border-[#9aa8bb] bg-[#e9eef6]">
            <Minus size={10} />
          </span>
          <span className="flex h-[16px] w-[22px] items-center justify-center border border-[#9aa8bb] bg-[#e9eef6]">
            <Square size={8} />
          </span>
          <button
            type="button"
            onClick={onClose}
            title="Cerrar"
            className="flex h-[16px] w-[22px] items-center justify-center border border-[#a33] bg-[#d9534f] text-white"
          >
            <X size={11} strokeWidth={3} />
          </button>
        </span>
      </div>
      <div className="flex-1 p-1.5">{children}</div>
    </div>
  )
}

export function GwAppIcon({ size = 16 }: { size?: number }) {
  // Icono de Ofipapel (cuadro «OFI» con el trébol), recortado del logo de la empresa.
  return (
    <img
      src={`${import.meta.env.BASE_URL}marca/icono-${size > 32 ? 64 : 32}.png`}
      alt=""
      width={size}
      height={size}
      className="inline-block flex-none object-contain"
      draggable={false}
    />
  )
}

export function GwField({ label, children, className = '' }: { label?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col ${className}`}>
      {label != null && <span className="gw-label">{label}</span>}
      {children}
    </div>
  )
}

/** Campo en línea: etiqueta a la izquierda y control a la derecha (p. ej. «Dto. Max.: [30,00]»). */
export function GwInline({ label, children, className = '' }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 items-center gap-1.5 ${className}`}>
      <span className="gw-label">{label}</span>
      {children}
    </div>
  )
}

export function GwInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`gw-input ${props.className ?? ''}`} />
}

export function GwTextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`gw-input ${props.className ?? ''}`} />
}

export function GwSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`gw-input ${props.className ?? ''}`} />
}

const nf = (decimals: number) =>
  new Intl.NumberFormat('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: true })

export function formatGw(value: number | null | undefined, decimals = 3) {
  if (value == null || Number.isNaN(Number(value))) return ''
  return nf(decimals).format(Number(value))
}

/**
 * Número al estilo GeminisWin: muestra «4,310» alineado a la derecha y, al entrar en el
 * campo, deja editar el valor en bruto aceptando coma o punto decimal.
 */
export function GwNumber({
  value,
  onChange,
  decimals = 3,
  disabled,
  className = '',
  emptyAsZero = false,
}: {
  value: number | null | undefined
  onChange?: (v: number | null) => void
  decimals?: number
  disabled?: boolean
  className?: string
  emptyAsZero?: boolean
}) {
  // Con el foco se ve el valor en bruto; `editing` es lo tecleado (null si aún no se ha tecleado
  // nada). Al salir sin teclear no se cambia el valor: si mientras tanto ha llegado otro (el
  // precio del artículo), no se pisa con el que había al entrar.
  const [focused, setFocused] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const raw = value == null ? '' : String(value).replace('.', ',')
  const shown = editing ?? (focused ? raw : value == null && emptyAsZero ? formatGw(0, decimals) : formatGw(value, decimals))
  // Sin teclear, todo seleccionado: lo que se escribe sustituye al valor (seleccionEntrada.ts).
  const campoNum = useSeleccionAlEntrar(focused && editing == null, shown)
  return (
    <input
      ref={campoNum}
      className={`gw-input gw-num ${className}`}
      disabled={disabled}
      readOnly={!onChange}
      value={shown}
      onFocus={() => setFocused(true)}
      onMouseDown={seleccionAlPulsar}
      onMouseUp={seleccionAlSoltar}
      onChange={(e) => setEditing(e.target.value)}
      onBlur={() => {
        setFocused(false)
        if (editing == null) return
        const limpio = editing.trim().replace(/\./g, '').replace(',', '.')
        const n = limpio === '' ? null : Number(limpio)
        setEditing(null)
        if (onChange && (n === null || !Number.isNaN(n))) onChange(n)
      }}
      // Intro confirma el número y pasa al campo siguiente (teclado.ts: instalarIntroAvanza).
      data-gw-intro="avanza"
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

export function GwCheck({
  label,
  checked,
  onChange,
  disabled,
  className = '',
}: {
  label: ReactNode
  checked: boolean
  onChange?: (v: boolean) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <label className={`flex select-none items-center gap-1 whitespace-nowrap text-[13px] ${className}`}>
      <input
        type="checkbox"
        className="m-0 h-[13px] w-[13px] accent-[#0078d7]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      {label}
    </label>
  )
}

export function GwRadio({
  label,
  checked,
  onChange,
  disabled,
  name,
}: {
  label: ReactNode
  checked: boolean
  onChange?: () => void
  disabled?: boolean
  name: string
}) {
  return (
    <label className="flex select-none items-center gap-1 whitespace-nowrap text-[13px]">
      <input
        type="radio"
        name={name}
        className="m-0 h-[12px] w-[12px] accent-[#0078d7]"
        checked={checked}
        disabled={disabled}
        onChange={() => onChange?.()}
      />
      {label}
    </label>
  )
}

export function GwGroup({ title, children, className = '' }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={`gw-group ${className}`}>
      {title != null && <legend>{title}</legend>}
      {children}
    </fieldset>
  )
}

/** Botón «···» que abre el buscador de la tabla relacionada, como en GeminisWin. */
export function GwLookupButton({ onClick, disabled, title }: { onClick?: () => void; disabled?: boolean; title?: string }) {
  return (
    <button type="button" className="gw-btn gw-lookup" onClick={onClick} disabled={disabled} title={title ?? 'Buscar'}>
      ···
    </button>
  )
}

export function GwPlusButton({ onClick, disabled, title }: { onClick?: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      className="gw-btn flex-none px-0 text-[20px] font-bold leading-none"
      style={{ width: 34, height: 22 }}
      onClick={onClick}
      disabled={disabled}
      title={title ?? 'Añadir'}
    >
      +
    </button>
  )
}

export interface GwTabDef {
  key: string
  label: string
}

/**
 * Pestañas en varias filas al estilo Win32: la fila que contiene la pestaña activa se
 * dibuja la última, pegada al contenido (en GeminisWin, «Características» queda abajo y
 * «Precios por Proveedor / Composición / Imagen / Web» arriba).
 */
export function GwTabs({
  rows,
  active,
  onChange,
  children,
}: {
  rows: GwTabDef[][]
  active: string
  onChange: (key: string) => void
  children: ReactNode
}) {
  const activeRow = rows.findIndex((r) => r.some((t) => t.key === active))
  const ordered = activeRow < 0 ? rows : [...rows.filter((_, i) => i !== activeRow), rows[activeRow]]
  return (
    <div className="flex flex-col">
      {ordered.map((row, i) => (
        <div key={i} className="flex">
          {row.map((t) => {
            const isActive = t.key === active
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onChange(t.key)}
                className={`-mb-px flex-auto whitespace-nowrap border border-[var(--gw-border)] px-2 text-[14px] ${
                  isActive ? 'z-10 h-[28px] border-b-transparent bg-[var(--gw-face)] font-bold' : 'h-[26px] mt-[2px] bg-[#f6f6f6] hover:bg-[#e5f1fb]'
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      ))}
      <div className="border border-[var(--gw-border)] bg-[var(--gw-face)] p-1.5">{children}</div>
    </div>
  )
}

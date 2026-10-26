import type { ReactNode } from 'react'
import { Check, ChevronFirst, ChevronLast, DoorOpen, FilePen, FilePlus2, FileX2, Play, Printer, ScrollText, X } from 'lucide-react'

/**
 * Barra inferior de la ventana «Pagos de Gastos…» de GeminisWin: bloque de navegación 2×2
 * (primero · siguiente / anterior · último) y botones con texto: Listados · Imprimir · Agregar ·
 * Editar · Eliminar · Cerrar. En alta o edición, Agregar/Editar pasan a Guardar/Cancelar.
 */
export function PagosBar({
  mode,
  canNavigate,
  saving,
  onFirst,
  onPrev,
  onNext,
  onLast,
  onPrint,
  onNew,
  onEdit,
  onDelete,
  onSave,
  onCancel,
  onExit,
}: {
  mode: 'consulta' | 'edicion' | 'alta'
  canNavigate: boolean
  saving?: boolean
  onFirst?: () => void
  onPrev?: () => void
  onNext?: () => void
  onLast?: () => void
  onPrint?: () => void
  onNew?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onSave?: () => void
  onCancel?: () => void
  onExit?: () => void
}) {
  const consulta = mode === 'consulta'
  return (
    <div className="flex items-stretch gap-[2px] border-t border-[var(--gw-border)] bg-[var(--gw-face)] pt-1">
      <div className="grid w-[252px] grid-cols-2 grid-rows-2 border border-[var(--gw-border)]">
        <Nav title="Primero" onClick={onFirst} disabled={!canNavigate}>
          <ChevronFirst size={15} strokeWidth={2.5} />
        </Nav>
        <Nav title="Siguiente" onClick={onNext} disabled={!canNavigate}>
          <Play size={10} fill="currentColor" />
        </Nav>
        <Nav title="Anterior" onClick={onPrev} disabled={!canNavigate}>
          <Play size={10} className="rotate-180" fill="currentColor" />
        </Nav>
        <Nav title="Último" onClick={onLast} disabled={!canNavigate}>
          <ChevronLast size={15} strokeWidth={2.5} />
        </Nav>
      </div>
      <span className="w-[120px]" />
      <Btn label="Listados" title="Listados — aún no disponible en el ERP propio" disabled>
        <ScrollText size={17} className="text-[#8a6d1d]" />
      </Btn>
      <Btn label="Imprimir" onClick={onPrint} disabled={!consulta}>
        <Printer size={17} />
      </Btn>
      {consulta ? (
        <>
          <Btn label="Agregar" onClick={onNew}>
            <FilePlus2 size={17} />
          </Btn>
          <Btn label="Editar" onClick={onEdit}>
            <FilePen size={17} />
          </Btn>
          <Btn label="Eliminar" onClick={onDelete}>
            <FileX2 size={17} />
          </Btn>
        </>
      ) : (
        <>
          <Btn label="Guardar" title="Guardar (F1)" onClick={onSave} disabled={saving}>
            <Check size={18} strokeWidth={3} className="text-[#127a12]" />
          </Btn>
          <Btn label="Cancelar" onClick={onCancel} disabled={saving}>
            <X size={18} strokeWidth={3} className="text-[#c42b1c]" />
          </Btn>
          <Btn label="Eliminar" disabled>
            <FileX2 size={17} />
          </Btn>
        </>
      )}
      <Btn label="Cerrar" onClick={onExit}>
        <DoorOpen size={17} />
      </Btn>
    </div>
  )
}

function Nav({ title, onClick, disabled, children }: { title: string; onClick?: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="flex h-[38px] items-center justify-center border border-[var(--gw-border-light)] text-[#1d3a8a] hover:bg-[#e5f1fb] disabled:text-[#a8a8a8] disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

function Btn({
  label,
  title,
  onClick,
  disabled,
  children,
}: {
  label: string
  title?: string
  onClick?: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title ?? label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-[78px] w-[124px] flex-col items-center justify-center gap-2 border border-[var(--gw-border)] text-[16px] text-black hover:bg-[#e5f1fb] disabled:text-[#9a9a9a] disabled:hover:bg-transparent [&>svg]:text-[#1d3a8a] disabled:[&>svg]:text-[#a8a8a8]"
    >
      {children}
      <span>{label}</span>
    </button>
  )
}

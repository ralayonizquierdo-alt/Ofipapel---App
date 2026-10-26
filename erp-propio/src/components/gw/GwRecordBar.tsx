import type { ReactNode } from 'react'
import {
  ArrowDownAZ,
  Binoculars,
  Check,
  ChevronFirst,
  ChevronLast,
  DoorOpen,
  FilePen,
  FilePlus2,
  Play,
  Printer,
  Trash2,
  X,
} from 'lucide-react'

/**
 * Barra inferior común a todas las fichas de GeminisWin: primero · anterior · siguiente ·
 * último · ordenar · buscar · imprimir · nuevo · modificar · eliminar · salir.
 * En alta o modificación, «modificar» y «eliminar» pasan a ser Aceptar y Cancelar.
 */
export function GwRecordBar({
  mode,
  canNavigate,
  saving,
  onFirst,
  onPrev,
  onNext,
  onLast,
  onSort,
  onSearch,
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
  onSort?: () => void
  onSearch?: () => void
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
    <div className="mt-1.5 flex border border-[var(--gw-border)] bg-[var(--gw-face)] p-[2px]">
      <Btn title="Primero" onClick={onFirst} disabled={!canNavigate}>
        <ChevronFirst size={15} strokeWidth={3} />
      </Btn>
      <Btn title="Anterior" onClick={onPrev} disabled={!canNavigate}>
        <Play size={11} className="rotate-180" fill="currentColor" />
      </Btn>
      <Btn title="Siguiente" onClick={onNext} disabled={!canNavigate}>
        <Play size={11} fill="currentColor" />
      </Btn>
      <Btn title="Último" onClick={onLast} disabled={!canNavigate}>
        <ChevronLast size={15} strokeWidth={3} />
      </Btn>
      <Btn title="Ordenar" onClick={onSort} disabled={!consulta}>
        <ArrowDownAZ size={15} />
      </Btn>
      <Btn title="Buscar" onClick={onSearch} disabled={!consulta}>
        <Binoculars size={15} />
      </Btn>
      <Btn title="Imprimir" onClick={onPrint} disabled={!consulta}>
        <Printer size={15} />
      </Btn>
      <Btn title="Nuevo" onClick={onNew} disabled={!consulta}>
        <FilePlus2 size={15} />
      </Btn>
      {consulta ? (
        <>
          <Btn title="Modificar" onClick={onEdit}>
            <FilePen size={15} />
          </Btn>
          <Btn title="Eliminar" onClick={onDelete}>
            <Trash2 size={15} />
          </Btn>
        </>
      ) : (
        <>
          <Btn title="Aceptar (guardar)" onClick={onSave} disabled={saving}>
            <Check size={16} strokeWidth={3} className="text-[#127a12]" />
          </Btn>
          <Btn title="Cancelar" onClick={onCancel} disabled={saving}>
            <X size={16} strokeWidth={3} className="text-[#c42b1c]" />
          </Btn>
        </>
      )}
      <Btn title="Salir" onClick={onExit}>
        <DoorOpen size={15} />
      </Btn>
    </div>
  )
}

function Btn({ title, onClick, disabled, children }: { title: string; onClick?: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="flex h-[26px] w-[84px] items-center justify-center border-r border-[var(--gw-border-light)] text-[#1d3a8a] last:border-r-0 hover:bg-[#e5f1fb] disabled:text-[#9a9a9a] disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

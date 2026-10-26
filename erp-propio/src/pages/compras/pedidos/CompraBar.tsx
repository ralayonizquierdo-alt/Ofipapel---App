import type { ReactNode } from 'react'
import { ArrowDownAZ, Binoculars, Check, ChevronFirst, ChevronLast, DoorOpen, FilePen, FilePlus2, FileX2, Play, Printer, X } from 'lucide-react'

/**
 * Barra inferior de «Compras» (pedido / albarán de proveedor) de GeminisWin: 11 botones —
 * primero · anterior · siguiente · último · ordenar · buscar · imprimir · nuevo · modificar ·
 * eliminar · cerrar. En alta o modificación, modificar/eliminar pasan a Guardar y Cancelar.
 */
export function CompraBar({
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
  onSave?: () => void
  onCancel?: () => void
  onExit?: () => void
}) {
  const consulta = mode === 'consulta'
  return (
    <div className="flex border border-[var(--gw-border)] bg-[var(--gw-face)] p-[2px]">
      <Btn title="Ir al primer registro" onClick={onFirst} disabled={!canNavigate}>
        <ChevronFirst size={17} strokeWidth={3} />
      </Btn>
      <Btn title="Ir al anterior registro" onClick={onPrev} disabled={!canNavigate}>
        <Play size={12} className="rotate-180" fill="currentColor" />
      </Btn>
      <Btn title="Ir al siguiente registro" onClick={onNext} disabled={!canNavigate}>
        <Play size={12} fill="currentColor" />
      </Btn>
      <Btn title="Ir al último registro" onClick={onLast} disabled={!canNavigate}>
        <ChevronLast size={17} strokeWidth={3} />
      </Btn>
      <Btn title="Ordenar" onClick={onSort} disabled={!consulta}>
        <ArrowDownAZ size={17} />
      </Btn>
      <Btn title="Buscar (Localizar registros)" onClick={onSearch} disabled={!consulta}>
        <Binoculars size={17} />
      </Btn>
      <Btn title="Imprimir" onClick={onPrint} disabled={!consulta}>
        <Printer size={17} />
      </Btn>
      <Btn title="Nuevo" onClick={onNew} disabled={!consulta}>
        <FilePlus2 size={17} />
      </Btn>
      {consulta ? (
        <>
          <Btn title="Modificar" onClick={onEdit}>
            <FilePen size={17} />
          </Btn>
          <Btn title="Los pedidos a proveedor no se eliminan desde el ERP propio" disabled>
            <FileX2 size={17} />
          </Btn>
        </>
      ) : (
        <>
          <Btn title="Guardar (F1)" onClick={onSave} disabled={saving}>
            <Check size={18} strokeWidth={3} className="text-[#127a12]" />
          </Btn>
          <Btn title="Cancelar" onClick={onCancel} disabled={saving}>
            <X size={18} strokeWidth={3} className="text-[#c42b1c]" />
          </Btn>
        </>
      )}
      <Btn title="Cerrar" onClick={onExit}>
        <DoorOpen size={17} />
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
      className="flex h-[34px] flex-1 items-center justify-center border-r border-[var(--gw-border-light)] text-[#1d3a8a] last:border-r-0 hover:bg-[#e5f1fb] disabled:text-[#a8a8a8] disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

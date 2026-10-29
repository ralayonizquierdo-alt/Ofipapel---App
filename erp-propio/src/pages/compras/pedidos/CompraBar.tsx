import { useRef, type ReactNode } from 'react'
import { conTecla, useTeclasFicha } from '../../../components/gw/teclasFicha'
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
  const raiz = useRef<HTMLDivElement>(null)
  useTeclasFicha({
    mode,
    canNavigate,
    saving,
    raiz,
    acciones: {
      primero: onFirst,
      anterior: onPrev,
      siguiente: onNext,
      ultimo: onLast,
      buscar: onSearch,
      nuevo: onNew,
      modificar: onEdit,
      guardar: onSave,
      cancelar: onCancel,
      salir: onExit,
    },
  })
  return (
    <div ref={raiz} className="flex border border-[var(--gw-border)] bg-[var(--gw-face)] p-[2px]">
      <Btn title={conTecla('Ir al primer registro', 'primero')} onClick={onFirst} disabled={!canNavigate}>
        <ChevronFirst size={17} strokeWidth={3} />
      </Btn>
      <Btn title={conTecla('Ir al anterior registro', 'anterior')} onClick={onPrev} disabled={!canNavigate}>
        <Play size={12} className="rotate-180" fill="currentColor" />
      </Btn>
      <Btn title={conTecla('Ir al siguiente registro', 'siguiente')} onClick={onNext} disabled={!canNavigate}>
        <Play size={12} fill="currentColor" />
      </Btn>
      <Btn title={conTecla('Ir al último registro', 'ultimo')} onClick={onLast} disabled={!canNavigate}>
        <ChevronLast size={17} strokeWidth={3} />
      </Btn>
      <Btn title="Ordenar" onClick={onSort} disabled={!consulta}>
        <ArrowDownAZ size={17} />
      </Btn>
      <Btn title={conTecla('Buscar (Localizar registros)', 'buscar')} onClick={onSearch} disabled={!consulta}>
        <Binoculars size={17} />
      </Btn>
      <Btn title="Imprimir" onClick={onPrint} disabled={!consulta}>
        <Printer size={17} />
      </Btn>
      <Btn title={conTecla('Nuevo', 'nuevo')} onClick={onNew} disabled={!consulta}>
        <FilePlus2 size={17} />
      </Btn>
      {consulta ? (
        <>
          <Btn title={conTecla('Modificar', 'modificar')} onClick={onEdit}>
            <FilePen size={17} />
          </Btn>
          <Btn title="Los pedidos a proveedor no se eliminan desde el ERP propio" disabled>
            <FileX2 size={17} />
          </Btn>
        </>
      ) : (
        <>
          <Btn title={conTecla('Guardar', 'guardar')} onClick={onSave} disabled={saving}>
            <Check size={18} strokeWidth={3} className="text-[#127a12]" />
          </Btn>
          <Btn title={conTecla('Cancelar', 'cancelar')} onClick={onCancel} disabled={saving}>
            <X size={18} strokeWidth={3} className="text-[#c42b1c]" />
          </Btn>
        </>
      )}
      <Btn title={conTecla('Cerrar', 'salir')} onClick={onExit}>
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
      data-gw-estado={title}
      onClick={onClick}
      disabled={disabled}
      className="flex h-[34px] flex-1 items-center justify-center border-r border-[var(--gw-border-light)] text-[#1d3a8a] last:border-r-0 hover:bg-[#e5f1fb] disabled:text-[#a8a8a8] disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

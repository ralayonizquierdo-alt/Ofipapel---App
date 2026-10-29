import { useEffect, useRef, type ReactNode } from 'react'
import { registrarVistaPrevia } from '../../lib/impresion'
import { conTecla, useTeclasFicha } from './teclasFicha'
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
 * Teclas (todas las fichas, `teclasFicha.ts`): Ctrl+Inicio · RePág · AvPág · Ctrl+Fin · F5 buscar ·
 * F3 nuevo · F2 modificar · Esc salir; en alta/modificación F1 aceptar y Alt+Retroceso / Esc cancelar.
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
  grande = false,
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
  /** Botones altos que ocupan todo el ancho de la ventana (Caja, Aperturas y Cierres de GeminisWin). */
  grande?: boolean
}) {
  const consulta = mode === 'consulta'
  // Archivo → Presentación preliminar: en una ficha es su «Imprimir» (el navegador enseña la vista
  // previa antes de imprimir). Solo si la ficha tiene botón Imprimir.
  const imprimir = useRef(onPrint)
  useEffect(() => {
    imprimir.current = onPrint
  })
  const tieneImprimir = Boolean(onPrint)
  useEffect(() => (tieneImprimir ? registrarVistaPrevia(() => () => imprimir.current?.()) : undefined), [tieneImprimir])
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
    <div ref={raiz} className={`mt-1.5 flex border border-[var(--gw-border)] bg-[var(--gw-face)] p-[2px] ${grande ? 'gw-barra-grande gap-[2px]' : ''}`}>
      <Btn title={conTecla('Primero', 'primero')} onClick={onFirst} disabled={!canNavigate}>
        <ChevronFirst size={15} strokeWidth={3} />
      </Btn>
      <Btn title={conTecla('Anterior', 'anterior')} onClick={onPrev} disabled={!canNavigate}>
        <Play size={11} className="rotate-180" fill="currentColor" />
      </Btn>
      <Btn title={conTecla('Siguiente', 'siguiente')} onClick={onNext} disabled={!canNavigate}>
        <Play size={11} fill="currentColor" />
      </Btn>
      <Btn title={conTecla('Último', 'ultimo')} onClick={onLast} disabled={!canNavigate}>
        <ChevronLast size={15} strokeWidth={3} />
      </Btn>
      <Btn title="Ordenar" onClick={onSort} disabled={!consulta}>
        <ArrowDownAZ size={15} />
      </Btn>
      <Btn title={conTecla('Buscar', 'buscar')} onClick={onSearch} disabled={!consulta}>
        <Binoculars size={15} />
      </Btn>
      <Btn title="Imprimir" onClick={onPrint} disabled={!consulta}>
        <Printer size={15} />
      </Btn>
      <Btn title={conTecla('Nuevo', 'nuevo')} onClick={onNew} disabled={!consulta}>
        <FilePlus2 size={15} />
      </Btn>
      {consulta ? (
        <>
          <Btn title={conTecla('Modificar', 'modificar')} onClick={onEdit}>
            <FilePen size={15} />
          </Btn>
          <Btn title="Eliminar" onClick={onDelete}>
            <Trash2 size={15} />
          </Btn>
        </>
      ) : (
        <>
          <Btn title={conTecla('Aceptar (guardar)', 'guardar')} onClick={onSave} disabled={saving}>
            <Check size={16} strokeWidth={3} className="text-[#127a12]" />
          </Btn>
          <Btn title={conTecla('Cancelar', 'cancelar')} onClick={onCancel} disabled={saving}>
            <X size={16} strokeWidth={3} className="text-[#c42b1c]" />
          </Btn>
        </>
      )}
      <Btn title={conTecla('Salir', 'salir')} onClick={onExit}>
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
      data-gw-estado={title}
      onClick={onClick}
      disabled={disabled}
      className="flex h-[26px] w-[84px] items-center justify-center border-r border-[var(--gw-border-light)] text-[#1d3a8a] last:border-r-0 hover:bg-[#e5f1fb] disabled:text-[#9a9a9a] disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

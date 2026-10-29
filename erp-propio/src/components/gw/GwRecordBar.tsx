import { useEffect, useRef, type ReactNode } from 'react'
import { registrarVistaPrevia } from '../../lib/impresion'
import { conTecla, useTeclasFicha } from './teclasFicha'
import {
  GwAceptar,
  GwAnterior,
  GwBuscar,
  GwCancelar,
  GwEliminar,
  GwImprimir,
  GwModificar,
  GwNuevo,
  GwOrdenar,
  GwPrimero,
  GwSalir,
  GwSiguiente,
  GwUltimo,
} from './GwIconos'

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
    <div ref={raiz} className={`mt-1.5 flex gap-[2px] border border-[var(--gw-border)] bg-[var(--gw-face)] p-[3px] ${grande ? 'gw-barra-grande' : ''}`}>
      <Btn title={conTecla('Primero', 'primero')} onClick={onFirst} disabled={!canNavigate}>
        <GwPrimero />
      </Btn>
      <Btn title={conTecla('Anterior', 'anterior')} onClick={onPrev} disabled={!canNavigate}>
        <GwAnterior />
      </Btn>
      <Btn title={conTecla('Siguiente', 'siguiente')} onClick={onNext} disabled={!canNavigate}>
        <GwSiguiente />
      </Btn>
      <Btn title={conTecla('Último', 'ultimo')} onClick={onLast} disabled={!canNavigate}>
        <GwUltimo />
      </Btn>
      <Btn title="Ordenar" onClick={onSort} disabled={!consulta}>
        <GwOrdenar />
      </Btn>
      <Btn title={conTecla('Buscar', 'buscar')} onClick={onSearch} disabled={!consulta}>
        <GwBuscar />
      </Btn>
      <Btn title="Imprimir" onClick={onPrint} disabled={!consulta}>
        <GwImprimir />
      </Btn>
      <Btn title={conTecla('Nuevo', 'nuevo')} onClick={onNew} disabled={!consulta}>
        <GwNuevo />
      </Btn>
      {consulta ? (
        <>
          <Btn title={conTecla('Modificar', 'modificar')} onClick={onEdit}>
            <GwModificar />
          </Btn>
          <Btn title="Eliminar" onClick={onDelete}>
            <GwEliminar />
          </Btn>
        </>
      ) : (
        <>
          <Btn title={conTecla('Aceptar (guardar)', 'guardar')} onClick={onSave} disabled={saving}>
            <GwAceptar />
          </Btn>
          <Btn title={conTecla('Cancelar', 'cancelar')} onClick={onCancel} disabled={saving}>
            <GwCancelar />
          </Btn>
        </>
      )}
      <Btn title={conTecla('Salir', 'salir')} onClick={onExit}>
        <GwSalir />
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
      className="gw-boton-barra h-[30px] w-[84px]"
    >
      {children}
    </button>
  )
}

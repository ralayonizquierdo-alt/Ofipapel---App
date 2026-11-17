import { useEffect, useRef, type ReactNode } from 'react'
import { registrarVistaPrevia } from '../../lib/impresion'
import { BotonListados } from './BotonListados'
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
  soloConsulta = null,
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
  /** Si el área es de GeminisWin (lib/areaDueno.ts): el aviso que se enseña; Nuevo, Modificar y Eliminar quedan apagados. */
  soloConsulta?: string | null
}) {
  const consulta = mode === 'consulta'
  if (soloConsulta && consulta) {
    onNew = undefined
    onEdit = undefined
    onDelete = undefined
  }
  const apagado = Boolean(soloConsulta) && consulta
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
    <>
      {soloConsulta && (
        <p role="note" className="mt-1.5 border border-[#e2c275] bg-[#fff8e1] px-2 py-1 text-[13px] text-[#6b4a00] print:hidden">
          🔒 {soloConsulta}
        </p>
      )}
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
      <Btn title={conTecla('Nuevo', 'nuevo')} onClick={onNew} disabled={!consulta || apagado}>
        <GwNuevo />
      </Btn>
      {consulta ? (
        <>
          <Btn title={conTecla('Modificar', 'modificar')} onClick={onEdit} disabled={apagado}>
            <GwModificar />
          </Btn>
          <Btn title="Eliminar" onClick={onDelete} disabled={apagado}>
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
      {/* Generador de listados de esta pantalla (aparte, con fondo gris). */}
      <BotonListados className="ml-3" />
    </div>
    </>
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
      className="gw-boton-barra h-[34px] w-[84px]"
    >
      {children}
    </button>
  )
}

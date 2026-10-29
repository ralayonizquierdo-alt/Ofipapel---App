import { useRef, type ReactNode } from 'react'
import { conTecla, useTeclasFicha } from '../../../components/gw/teclasFicha'
import { GwAceptar, GwAnterior, GwBuscar, GwCancelar, GwEliminar, GwImprimir, GwModificar, GwNuevo, GwOrdenar, GwPrimero, GwSalir, GwSiguiente, GwUltimo } from '../../../components/gw/GwIconos'

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
        <GwPrimero />
      </Btn>
      <Btn title={conTecla('Ir al anterior registro', 'anterior')} onClick={onPrev} disabled={!canNavigate}>
        <GwAnterior />
      </Btn>
      <Btn title={conTecla('Ir al siguiente registro', 'siguiente')} onClick={onNext} disabled={!canNavigate}>
        <GwSiguiente />
      </Btn>
      <Btn title={conTecla('Ir al último registro', 'ultimo')} onClick={onLast} disabled={!canNavigate}>
        <GwUltimo />
      </Btn>
      <Btn title="Ordenar" onClick={onSort} disabled={!consulta}>
        <GwOrdenar />
      </Btn>
      <Btn title={conTecla('Buscar (Localizar registros)', 'buscar')} onClick={onSearch} disabled={!consulta}>
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
          <Btn title="Los pedidos a proveedor no se eliminan desde el ERP propio" disabled>
            <GwEliminar />
          </Btn>
        </>
      ) : (
        <>
          <Btn title={conTecla('Guardar', 'guardar')} onClick={onSave} disabled={saving}>
            <GwAceptar />
          </Btn>
          <Btn title={conTecla('Cancelar', 'cancelar')} onClick={onCancel} disabled={saving}>
            <GwCancelar />
          </Btn>
        </>
      )}
      <Btn title={conTecla('Cerrar', 'salir')} onClick={onExit}>
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
      className="flex h-[34px] flex-1 items-center justify-center gw-boton-barra"
    >
      {children}
    </button>
  )
}

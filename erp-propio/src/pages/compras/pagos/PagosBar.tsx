import { useRef, type ReactNode } from 'react'
import { conTecla, useTeclasFicha } from '../../../components/gw/teclasFicha'
import { ScrollText } from 'lucide-react'
import { GwAceptar, GwAnterior, GwCancelar, GwEliminar, GwImprimir, GwModificar, GwNuevo, GwPrimero, GwSalir, GwSiguiente, GwUltimo } from '../../../components/gw/GwIconos'

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
      nuevo: onNew,
      modificar: onEdit,
      guardar: onSave,
      cancelar: onCancel,
      salir: onExit,
    },
  })
  return (
    <div ref={raiz} className="flex items-stretch gap-[2px] border-t border-[var(--gw-border)] bg-[var(--gw-face)] pt-1">
      <div className="grid w-[252px] grid-cols-2 grid-rows-2 border border-[var(--gw-border)]">
        <Nav title={conTecla('Primero', 'primero')} onClick={onFirst} disabled={!canNavigate}>
          <GwPrimero />
        </Nav>
        <Nav title={conTecla('Siguiente', 'siguiente')} onClick={onNext} disabled={!canNavigate}>
          <GwSiguiente />
        </Nav>
        <Nav title={conTecla('Anterior', 'anterior')} onClick={onPrev} disabled={!canNavigate}>
          <GwAnterior />
        </Nav>
        <Nav title={conTecla('Último', 'ultimo')} onClick={onLast} disabled={!canNavigate}>
          <GwUltimo />
        </Nav>
      </div>
      <span className="w-[120px]" />
      <Btn label="Listados" title="Listados — aún no disponible en el ERP propio" disabled>
        <ScrollText size={17} className="text-[#8a6d1d]" />
      </Btn>
      <Btn label="Imprimir" onClick={onPrint} disabled={!consulta}>
        <GwImprimir />
      </Btn>
      {consulta ? (
        <>
          <Btn label="Agregar" title={conTecla('Agregar', 'nuevo')} onClick={onNew}>
            <GwNuevo />
          </Btn>
          <Btn label="Editar" title={conTecla('Editar', 'modificar')} onClick={onEdit}>
            <GwModificar />
          </Btn>
          <Btn label="Eliminar" onClick={onDelete}>
            <GwEliminar />
          </Btn>
        </>
      ) : (
        <>
          <Btn label="Guardar" title={conTecla('Guardar', 'guardar')} onClick={onSave} disabled={saving}>
            <GwAceptar />
          </Btn>
          <Btn label="Cancelar" title={conTecla('Cancelar', 'cancelar')} onClick={onCancel} disabled={saving}>
            <GwCancelar />
          </Btn>
          <Btn label="Eliminar" disabled>
            <GwEliminar />
          </Btn>
        </>
      )}
      <Btn label="Cerrar" title={conTecla('Cerrar', 'salir')} onClick={onExit}>
        <GwSalir />
      </Btn>
    </div>
  )
}

function Nav({ title, onClick, disabled, children }: { title: string; onClick?: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      data-gw-estado={title}
      onClick={onClick}
      disabled={disabled}
      className="flex h-[38px] items-center justify-center gw-boton-barra"
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
      data-gw-estado={title ?? label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-[78px] w-[124px] flex-col items-center justify-center gap-2 gw-boton-barra text-[16px] text-black [&>svg]:text-[#1d3a8a] disabled:[&>svg]:text-[#a8a8a8]"
    >
      {children}
      <span>{label}</span>
    </button>
  )
}

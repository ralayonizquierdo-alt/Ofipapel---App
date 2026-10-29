import { useEffect, useRef, type RefObject } from 'react'
import { comboDeEvento, esTextarea, modalAlPulsar, teclaDeHerramienta } from './teclado'

// Teclas de la barra de registro de las fichas y documentos (GwRecordBar, PedidoBar, CompraBar,
// PagosBar, Traspasos, Regularización). Una sola definición para todas: antes cada ficha tenía su
// manejador suelto (F1 en unas, Alt+Retroceso en otras, nada en la mayoría).
//
// Fuente: F1 = Grabar y Alt+Retroceso = Cancelar salen de GeminisWin (ya estaban en Pedidos,
// Pedido a proveedor, Traspasos, Regularización, TPV). El resto lo propone el ERP (confirmar con
// Luis la tecla real de GeminisWin): ver docs/ATAJOS_TECLADO.md.

export type AccionFicha = 'primero' | 'anterior' | 'siguiente' | 'ultimo' | 'buscar' | 'nuevo' | 'modificar' | 'guardar' | 'cancelar' | 'salir'

/** Teclas de cada botón, en el formato de `comboDeEvento`, y cómo se rotulan. */
export const TECLAS_FICHA: Record<AccionFicha, { combos: string[]; rotulo: string; modo: 'consulta' | 'edicion' }> = {
  primero: { combos: ['ctrl+home'], rotulo: 'Ctrl+Inicio', modo: 'consulta' },
  anterior: { combos: ['pageup'], rotulo: 'RePág', modo: 'consulta' },
  siguiente: { combos: ['pagedown'], rotulo: 'AvPág', modo: 'consulta' },
  ultimo: { combos: ['ctrl+end'], rotulo: 'Ctrl+Fin', modo: 'consulta' },
  buscar: { combos: ['f5'], rotulo: 'F5', modo: 'consulta' },
  nuevo: { combos: ['f3'], rotulo: 'F3', modo: 'consulta' },
  modificar: { combos: ['f2'], rotulo: 'F2', modo: 'consulta' },
  salir: { combos: ['escape'], rotulo: 'Esc', modo: 'consulta' },
  guardar: { combos: ['f1'], rotulo: 'F1', modo: 'edicion' },
  cancelar: { combos: ['alt+backspace', 'escape'], rotulo: 'Alt+Retroceso / Esc', modo: 'edicion' },
}

/** «Modificar» → «Modificar (F2)», para el tooltip y la barra de estado. */
export function conTecla(titulo: string, accion: AccionFicha) {
  return `${titulo} (${TECLAS_FICHA[accion].rotulo})`
}

// Si hay varias barras montadas (una ficha dentro de otra), manda la última montada que se vea.
const pila: { id: number; raiz: RefObject<HTMLElement | null> }[] = []
let siguienteId = 1

/**
 * Engancha las teclas de la barra de registro. `acciones` son los mismos manejadores que los
 * botones; una acción sin manejador o con su botón desactivado no hace nada.
 */
export function useTeclasFicha({
  mode,
  canNavigate = true,
  saving = false,
  acciones,
  desactivadas = {},
  raiz,
}: {
  mode: 'consulta' | 'edicion' | 'alta'
  canNavigate?: boolean
  saving?: boolean
  acciones: Partial<Record<AccionFicha, (() => void) | undefined>>
  /** Botones que se ven pero están desactivados (p. ej. «Nuevo» sin permiso). */
  desactivadas?: Partial<Record<AccionFicha, boolean>>
  /** Elemento de la barra: decide si la ficha está a la vista y si está dentro del diálogo activo. */
  raiz: RefObject<HTMLElement | null>
}) {
  const estado = useRef({ mode, canNavigate, saving, acciones, desactivadas })
  useEffect(() => {
    estado.current = { mode, canNavigate, saving, acciones, desactivadas }
  })

  useEffect(() => {
    const yo = { id: siguienteId++, raiz }
    pila.push(yo)
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return
      const el = raiz.current
      if (!el || !el.isConnected || el.getClientRects().length === 0) return
      // Solo la barra de arriba del todo de la pila que esté a la vista.
      const activa = [...pila].reverse().find((p) => p.raiz.current?.isConnected && p.raiz.current.getClientRects().length > 0)
      if (activa?.id !== yo.id) return
      // Con un diálogo modal abierto solo responde la barra que está dentro de él.
      const modal = modalAlPulsar(e)
      if (modal && !modal.contains(el)) return
      if (teclaDeHerramienta(e)) return
      const { mode: m, canNavigate: nav, saving: guardando, acciones: acc, desactivadas: off } = estado.current
      const combo = comboDeEvento(e)
      const consulta = m === 'consulta'
      const accion = (Object.keys(TECLAS_FICHA) as AccionFicha[]).find((a) => {
        const def = TECLAS_FICHA[a]
        return def.combos.includes(combo) && (def.modo === 'consulta') === consulta
      })
      if (!accion) return
      const fn = acc[accion]
      if (!fn || off[accion]) return
      if (['primero', 'anterior', 'siguiente', 'ultimo'].includes(accion)) {
        if (!nav) return
        // AvPág/RePág/Inicio/Fin son del control en áreas de texto y desplegables.
        if (esTextarea(e.target) || e.target instanceof HTMLSelectElement) return
      }
      if ((accion === 'guardar' || accion === 'cancelar') && guardando) return
      e.preventDefault()
      // Esc no descarta una modificación sin preguntar (Alt+Retroceso sí, como en GeminisWin).
      if (accion === 'cancelar' && combo === 'escape' && !window.confirm('¿Cancelar la modificación? Se perderán los cambios no guardados.')) return
      fn()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      const i = pila.indexOf(yo)
      if (i >= 0) pila.splice(i, 1)
    }
  }, [raiz])
}

// Piezas comunes de los diálogos del menú Utilidades (y Archivo → Seleccionar Periodo): ventana
// pequeña tipo diálogo de Windows clásico, centrada sobre el escritorio, que se cierra con Esc.

import { useEffect, type ReactNode } from 'react'
import { GwWindow } from '../../components/gw'

export function Dialogo({
  titulo,
  onClose,
  ancho = 380,
  children,
}: {
  titulo: string
  onClose: () => void
  ancho?: number
  children: ReactNode
}) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose() // Esc de un campo (fecha) no cierra el diálogo
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10">
      <GwWindow title={titulo} onClose={onClose} className="max-w-[95vw]">
        <div role="dialog" aria-label={titulo} style={{ width: ancho }} className="flex max-w-full flex-col gap-2 p-1.5 text-[12px]">
          {children}
        </div>
      </GwWindow>
    </div>
  )
}

/** Fila de botones a la derecha (Aceptar / Cancelar…). */
export function Botones({ children }: { children: ReactNode }) {
  return <div className="flex justify-end gap-1.5 border-t border-[var(--gw-border-light)] pt-2">{children}</div>
}

export function Mensaje({ texto, error }: { texto: string; error?: boolean }) {
  return <div className={`border px-2 py-1 ${error ? 'border-[#d9a0a0] bg-[#fdeaea] text-[#a00]' : 'border-[#a8c8a8] bg-[#eef8ee] text-[#185a18]'}`}>{texto}</div>
}

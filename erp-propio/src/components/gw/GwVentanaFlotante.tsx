// Ventana flotante para ver un detalle aparte (Luis, 02/11/2026: «tipo ventana emergente que pueda
// mover y achicar, siempre y en todos los programas»). Es una GwWindow normal (se arrastra por el
// título, se minimiza, se maximiza y cambia de tamaño por la esquina) que flota encima de la pantalla.
// Se pueden abrir varias (por ejemplo, para comparar dos registros): cada una sale un poco desplazada y
// la que se pulsa pasa delante.

import { useState, type ReactNode } from 'react'
import { GwWindow } from '.'

let zMax = 200

export function GwVentanaFlotante({
  titulo,
  onCerrar,
  children,
  indice = 0,
  ancho = 440,
}: {
  titulo: string
  onCerrar: () => void
  children: ReactNode
  /** Posición en la pila de ventanas abiertas (para que no salgan una encima de otra). */
  indice?: number
  ancho?: number
}) {
  const [z, setZ] = useState(() => ++zMax)
  return (
    <div className="pointer-events-none fixed inset-0" style={{ zIndex: z }}>
      <div className="pointer-events-auto absolute" style={{ right: 24 + indice * 28, top: 70 + indice * 28 }} onMouseDown={() => z < zMax && setZ(++zMax)}>
        <GwWindow title={titulo} onClose={onCerrar} className="max-w-[95vw]" extraTitulo={null}>
          <div className="max-h-[70vh] overflow-auto bg-white" style={{ width: ancho, maxWidth: '90vw' }}>
            {children}
          </div>
        </GwWindow>
      </div>
    </div>
  )
}

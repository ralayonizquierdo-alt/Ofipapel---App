import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useCuadreEstancia } from '../lib/cuadreEstancia'
import CuadroEstancia from './CuadroEstancia'
import type { Reservation } from '../types'

const ANCHO = 580
const MARGEN = 8

/**
 * Una celda de la tabla de Cobros que, al pasar el ratón, enseña el cuadro de la
 * estancia con el formato del Excel del propietario, y al pincharla abre la ficha.
 *
 * Antes era un `title`, que solo admite texto suelto. Lleva su propio estado para
 * que pasar el ratón no vuelva a pintar la tabla entera, y el recuadro va en un
 * portal porque dentro de la tabla, que desplaza por dentro, saldría cortado.
 */
export default function CeldaDesglose({ reserva, onClick, className, children }: {
  reserva: Reservation
  onClick: () => void
  className: string
  children: ReactNode
}) {
  const [ancla, setAncla] = useState<DOMRect | null>(null)

  // Al desplazar, la celda se va de debajo del ratón sin que salte mouseleave.
  useEffect(() => {
    if (!ancla) return
    const cerrar = () => setAncla(null)
    window.addEventListener('scroll', cerrar, true)
    return () => window.removeEventListener('scroll', cerrar, true)
  }, [ancla])

  return (
    <td className={className}
      onClick={() => { setAncla(null); onClick() }}
      onMouseEnter={e => setAncla(e.currentTarget.getBoundingClientRect())}
      onMouseLeave={() => setAncla(null)}>
      {children}
      {ancla && createPortal(<Recuadro reserva={reserva} ancla={ancla} />, document.body)}
    </td>
  )
}

function Recuadro({ reserva, ancla }: { reserva: Reservation; ancla: DOMRect }) {
  const cuadre = useCuadreEstancia(reserva)
  const caja = useRef<HTMLDivElement>(null)

  // A la derecha de la celda si cabe; si no, a su izquierda. De alto, pegado a
  // la celda sin salirse de la ventana: su altura depende de los meses.
  useLayoutEffect(() => {
    const el = caja.current
    if (!el) return
    const derecha = ancla.right + MARGEN
    const left = derecha + ANCHO + MARGEN <= window.innerWidth ? derecha : ancla.left - MARGEN - ANCHO
    const maxTop = window.innerHeight - el.offsetHeight - MARGEN
    el.style.left = `${Math.max(MARGEN, left)}px`
    el.style.top = `${Math.max(MARGEN, Math.min(ancla.top, maxTop))}px`
  }, [ancla])

  return (
    <div ref={caja} translate="no" style={{ width: ANCHO, top: 0, left: 0 }}
      className="fixed z-[60] pointer-events-none bg-white rounded-lg border border-slate-300 shadow-xl p-2 space-y-2 print:hidden">
      <CuadroEstancia cuadre={cuadre} compacto />
      <p className="text-[10px] text-slate-400 text-right">Pincha para abrir la ficha, imprimirla o enviarla</p>
    </div>
  )
}

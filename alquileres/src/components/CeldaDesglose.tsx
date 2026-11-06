import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useCuadreEstancia, rutaDeTarifa } from '../lib/cuadreEstancia'
import CuadroEstancia from './CuadroEstancia'
import type { Reservation } from '../types'

const ANCHO = 580
/**
 * El recuadro se ve al 75 % (Luis, 06/11/2026): es para echar un vistazo, y para
 * leerlo con calma se pincha y sale la ficha grande. Va con `zoom` por dentro y
 * no con `transform: scale`, que encogía el texto ya dibujado y descomponía las
 * letras («Im porte»). La caja de fuera no lleva zoom: con ella se coloca, y se
 * mide ya encogida.
 */
const ESCALA = 0.75
const MARGEN = 8
/** Lo que espera el recuadro antes de cerrarse: da tiempo a llevar el ratón hasta él. */
const ESPERA_CIERRE = 350

/**
 * Una celda de la tabla de Cobros que, al pasar el ratón, enseña el cuadro de la
 * estancia con el formato del Excel del propietario, y al pincharla abre la ficha.
 *
 * Antes era un `title`, que solo admite texto suelto. Lleva su propio estado para
 * que pasar el ratón no vuelva a pintar la tabla entera, y el recuadro va en un
 * portal porque dentro de la tabla, que desplaza por dentro, saldría cortado.
 *
 * El recuadro también se pincha (Luis, 06/11/2026: «no se queda quieto y no puedo
 * pinchar»): se cerraba al salir de la celda, y entre ella y el recuadro hay un
 * hueco. Ahora espera un momento antes de cerrarse, se queda abierto mientras el
 * ratón está encima, y pincharlo abre la ficha igual que la celda: el clic sube
 * por el portal hasta el `onClick` de la celda.
 */
export default function CeldaDesglose({ reserva, onClick, className, children }: {
  reserva: Reservation
  onClick: () => void
  className: string
  children: ReactNode
}) {
  const [ancla, setAncla] = useState<DOMRect | null>(null)
  const cierre = useRef<number | undefined>(undefined)

  const abrir = (celda: HTMLElement) => {
    window.clearTimeout(cierre.current)
    setAncla(a => a ?? celda.getBoundingClientRect())
  }
  const cerrarEnUnMomento = () => {
    window.clearTimeout(cierre.current)
    cierre.current = window.setTimeout(() => setAncla(null), ESPERA_CIERRE)
  }

  // Al desplazar, la celda se va de debajo del ratón sin que salte mouseleave.
  useEffect(() => {
    if (!ancla) return
    const cerrar = () => setAncla(null)
    window.addEventListener('scroll', cerrar, true)
    return () => window.removeEventListener('scroll', cerrar, true)
  }, [ancla])

  useEffect(() => () => window.clearTimeout(cierre.current), [])

  return (
    <td className={className}
      onClick={() => { window.clearTimeout(cierre.current); setAncla(null); onClick() }}
      onMouseEnter={e => abrir(e.currentTarget)}
      onMouseLeave={cerrarEnUnMomento}>
      {children}
      {ancla && createPortal(<Recuadro reserva={reserva} ancla={ancla} />, document.body)}
    </td>
  )
}

function Recuadro({ reserva, ancla }: { reserva: Reservation; ancla: DOMRect }) {
  const cuadre = useCuadreEstancia(reserva)
  const caja = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  // La tarifa, también aquí, lleva a Precios: es lo primero que se pincha.
  const irATarifa = cuadre.tarifa ? () => navigate(rutaDeTarifa(cuadre.tarifa!)) : undefined

  // A la derecha de la celda si cabe; si no, a su izquierda. De alto, pegado a
  // la celda sin salirse de la ventana: su altura depende de los meses.
  useLayoutEffect(() => {
    const el = caja.current
    if (!el) return
    const ancho = ANCHO * ESCALA
    const derecha = ancla.right + MARGEN
    const left = derecha + ancho + MARGEN <= window.innerWidth ? derecha : ancla.left - MARGEN - ancho
    const maxTop = window.innerHeight - el.getBoundingClientRect().height - MARGEN
    el.style.left = `${Math.max(MARGEN, left)}px`
    el.style.top = `${Math.max(MARGEN, Math.min(ancla.top, maxTop))}px`
  }, [ancla])

  return (
    <div ref={caja} translate="no" style={{ top: 0, left: 0 }}
      className="fixed z-[60] cursor-pointer bg-white rounded-lg border border-slate-300 shadow-xl hover:border-blue-400 print:hidden">
      <div style={{ width: ANCHO, zoom: ESCALA }} className="p-2 space-y-2">
        <CuadroEstancia cuadre={cuadre} compacto onTarifa={irATarifa} />
        <p className="text-xs text-blue-700 text-right font-medium">
          Pincha la tarifa para ir a Precios, o el resto del recuadro para abrir la ficha e imprimirla o enviarla a la agencia
        </p>
      </div>
    </div>
  )
}

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

/**
 * Una celda de la tabla de Cobros. Pincharla abre la ficha de la estancia.
 *
 * Con `desglose`, lleva delante un cuadradito «+» que abre el cuadro de la
 * estancia (el formato del Excel del propietario) **al hacer clic**, y se cierra
 * con otro clic en el cuadradito, fuera o con Esc. Hasta el 16/11/2026 se abría
 * solo al pasar el ratón, y al moverse por la tabla salían recuadros por todas
 * partes: «un medio caos» (Luis). Es el mismo sistema que «Comparar con Booking».
 *
 * El recuadro va en un portal porque dentro de la tabla, que desplaza por dentro,
 * saldría cortado. Pincharlo abre la ficha igual que la celda: el clic sube por
 * el portal hasta el `onClick` de la celda.
 */
export default function CeldaDesglose({ reserva, onClick, className, children, desglose = true }: {
  reserva: Reservation
  onClick: () => void
  className: string
  children: ReactNode
  /** Sin él, la celda solo abre la ficha (la de las noches: un cuadradito por fila basta). */
  desglose?: boolean
}) {
  const [ancla, setAncla] = useState<DOMRect | null>(null)
  const boton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!ancla) return
    // El recuadro está en un portal: se reconoce por su marca `data-desglose`.
    const fuera = (e: MouseEvent) => {
      const t = e.target as Element
      if (!t.closest?.('[data-desglose]') && !boton.current?.contains(t)) setAncla(null)
    }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAncla(null) }
    // Al desplazar, la celda se va de su sitio y el recuadro se quedaría flotando.
    const cerrar = () => setAncla(null)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    window.addEventListener('scroll', cerrar, true)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', tecla)
      window.removeEventListener('scroll', cerrar, true)
    }
  }, [ancla])

  return (
    <td className={className} onClick={() => { setAncla(null); onClick() }}>
      {desglose && (
        <button ref={boton} type="button" aria-label="Ver el desglose" aria-expanded={!!ancla}
          onClick={e => {
            e.stopPropagation()
            // La medida se toma ya: dentro de `setAncla(a => …)` el evento ya no tiene celda.
            const celda = e.currentTarget.closest('td')!.getBoundingClientRect()
            setAncla(a => a ? null : celda)
          }}
          className={`inline-flex items-center justify-center w-5 h-5 mr-2 align-middle rounded border text-xs font-bold leading-none print:hidden ${
            ancla ? 'bg-blue-600 border-blue-600 text-white' : 'border-blue-500 text-blue-600 bg-white hover:bg-blue-50'}`}>
          {ancla ? '−' : '+'}
        </button>
      )}
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
    <div ref={caja} data-desglose translate="no" style={{ top: 0, left: 0 }}
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

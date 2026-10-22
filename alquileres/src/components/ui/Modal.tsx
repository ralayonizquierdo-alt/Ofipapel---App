import { X } from 'lucide-react'
import { useRef, useState, type PointerEvent as EventoPuntero, type ReactNode } from 'react'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  size?: 'md' | 'lg' | 'xl'
}

/**
 * Ventana modal, movible arrastrando su barra de título.
 *
 * Lo de moverla no es un adorno: estas ventanas tapan justo la tabla con la que
 * se está comparando —los precios del año, el cuadro de cobros— y hasta ahora
 * había que cerrarla, mirar el dato y volver a abrirla. La barra del título
 * nunca se puede sacar entera de la pantalla, que entonces la ventana quedaría
 * inalcanzable.
 */
export default function Modal({ title, onClose, children, size = 'md' }: ModalProps) {
  const widths = { md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' }
  const [pos, setPos] = useState({ x: 0, y: 0 })
  /** Dónde se agarró la ventana, para que no pegue un salto al empezar. */
  const agarre = useRef<{ x: number; y: number } | null>(null)
  const caja = useRef<HTMLDivElement>(null)

  function empieza(e: EventoPuntero<HTMLDivElement>) {
    // Solo con el botón principal, y nunca desde la X de cerrar.
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
    agarre.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function mueve(e: EventoPuntero<HTMLDivElement>) {
    const ini = agarre.current
    if (!ini) return
    let x = e.clientX - ini.x
    let y = e.clientY - ini.y

    // La ventana no sale de la pantalla: los botones de Guardar y Cancelar
    // están abajo del todo, y una ventana que se pueda arrastrar fuera los deja
    // inalcanzables. `sitio` es de dónde partiría la ventana sin desplazar.
    const r = caja.current?.getBoundingClientRect()
    if (r) {
      const margen = 8
      const sitio = { x: r.left - pos.x, y: r.top - pos.y }
      const entre = (v: number, a: number, b: number) => Math.min(Math.max(v, Math.min(a, b)), Math.max(a, b))
      x = entre(x, margen - sitio.x, window.innerWidth - r.width - margen - sitio.x)
      y = entre(y, margen - sitio.y, window.innerHeight - r.height - margen - sitio.y)
    }
    setPos({ x, y })
  }

  function suelta(e: EventoPuntero<HTMLDivElement>) {
    agarre.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={caja}
        className={`bg-white rounded-xl shadow-2xl w-full ${widths[size]} max-h-[90vh] flex flex-col`}
        style={pos.x || pos.y ? { transform: `translate(${pos.x}px, ${pos.y}px)` } : undefined}>
        <div
          onPointerDown={empieza} onPointerMove={mueve} onPointerUp={suelta} onPointerCancel={suelta}
          onDoubleClick={() => setPos({ x: 0, y: 0 })}
          title="Arrastra para mover la ventana (doble clic para centrarla)"
          className="flex items-center justify-between px-5 py-4 border-b cursor-move select-none touch-none">
          <h2 className="font-semibold text-slate-800 text-base">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded cursor-pointer">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">{children}</div>
      </div>
    </div>
  )
}

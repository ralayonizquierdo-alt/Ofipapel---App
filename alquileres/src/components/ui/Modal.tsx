import { Maximize2, Minimize2, X } from 'lucide-react'
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
  /**
   * Ampliada a casi toda la pantalla, como en la ERP (Luis, 08/11/2026: «la
   * ventana no la puedo expandir»). Con su botón al lado de la X; otra vez, y
   * vuelve a su tamaño.
   */
  const [grande, setGrande] = useState(false)
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

  /**
   * Redimensionar tirando de la esquina de abajo a la derecha, poco a poco
   * (Luis, 08/11/2026: «estirar de una esquina y que se vaya expandiendo
   * gradualmente»). La ventana va centrada, así que al crecer se desplaza la
   * mitad de lo que crece: la esquina sigue al ratón y no se escapa.
   */
  const [tam, setTam] = useState<{ w: number; h: number } | null>(null)
  const estirando = useRef<{
    x: number; y: number; w: number; h: number; px: number; py: number; derecha: number; abajo: number
  } | null>(null)

  function empiezaEstirar(e: EventoPuntero<HTMLDivElement>) {
    if (e.button !== 0) return
    const r = caja.current?.getBoundingClientRect()
    if (!r) return
    e.preventDefault()
    estirando.current = {
      x: e.clientX, y: e.clientY, w: r.width, h: r.height, px: pos.x, py: pos.y, derecha: r.right, abajo: r.bottom,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function estira(e: EventoPuntero<HTMLDivElement>) {
    const ini = estirando.current
    if (!ini) return
    // La esquina no pasa del borde de la pantalla (8 px de margen).
    const w = Math.min(Math.max(ini.w + e.clientX - ini.x, 320), ini.w + window.innerWidth - 8 - ini.derecha)
    const h = Math.min(Math.max(ini.h + e.clientY - ini.y, 200), ini.h + window.innerHeight - 8 - ini.abajo)
    setTam({ w, h })
    setPos({ x: ini.px + (w - ini.w) / 2, y: ini.py + (h - ini.h) / 2 })
  }

  function sueltaEstirar(e: EventoPuntero<HTMLDivElement>) {
    estirando.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={caja}
        className={`relative bg-white rounded-xl shadow-2xl w-full flex flex-col ${grande
          ? 'max-w-[96vw] h-[94vh] max-h-[94vh]' : tam ? 'max-w-none max-h-none' : `${widths[size]} max-h-[90vh]`}`}
        style={grande ? undefined : {
          ...(pos.x || pos.y ? { transform: `translate(${pos.x}px, ${pos.y}px)` } : {}),
          ...(tam ? { width: tam.w, height: tam.h } : {}),
        }}>
        <div
          onPointerDown={e => { if (!grande) empieza(e) }} onPointerMove={mueve} onPointerUp={suelta} onPointerCancel={suelta}
          onDoubleClick={() => setPos({ x: 0, y: 0 })}
          title={grande ? undefined : 'Arrastra para mover la ventana (doble clic para centrarla)'}
          className={`flex items-center justify-between px-5 py-4 border-b select-none touch-none ${grande ? '' : 'cursor-move'}`}>
          <h2 className="font-semibold text-slate-800 text-base">{title}</h2>
          <div className="flex items-center gap-1">
            <button onClick={() => { setGrande(g => !g); setPos({ x: 0, y: 0 }); setTam(null) }}
              title={grande ? 'Volver al tamaño normal' : 'Ampliar la ventana'}
              aria-label={grande ? 'Volver al tamaño normal' : 'Ampliar la ventana'}
              className="text-slate-400 hover:text-slate-600 p-1 rounded cursor-pointer">
              {grande ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
            <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600 p-1 rounded cursor-pointer">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 min-h-0 p-5">{children}</div>
        {/* La esquina para estirar: rayitas en diagonal, como en las ventanas de Windows. */}
        {!grande && (
          <div onPointerDown={empiezaEstirar} onPointerMove={estira} onPointerUp={sueltaEstirar} onPointerCancel={sueltaEstirar}
            title="Arrastra la esquina para hacer la ventana más grande o más pequeña"
            aria-label="Cambiar el tamaño de la ventana"
            className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize touch-none print:hidden flex items-end justify-end p-0.5 text-slate-400 hover:text-slate-600">
            <svg viewBox="0 0 10 10" width="12" height="12" aria-hidden="true">
              <path d="M9 1 L1 9 M9 4.5 L4.5 9 M9 8 L8 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}

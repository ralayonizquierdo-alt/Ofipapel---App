import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { actualizar, consultarServidor } from '../lib/version'

const CADA_MS = 60_000

/**
 * La franja amarilla de «Hay una versión nueva · Actualizar», la misma del ERP
 * (Luis, 06/11/2026: hasta ahora solo se avisaba en la pantalla de entrada, y con
 * la aplicación abierta no había manera de saber que se había publicado algo).
 *
 * Mira cada minuto, y al volver a la pestaña, si el servidor anuncia otra
 * compilación (`lib/version.ts`). No recarga sola, para no perder lo que se esté
 * escribiendo: la recarga es el botón. En desarrollo no hay compilación con la que
 * comparar y no sale nunca.
 */
export default function AvisoVersion() {
  const [hayNueva, setHayNueva] = useState(false)

  useEffect(() => {
    let vivo = true
    const mirar = async () => {
      if (await consultarServidor() === 'nueva' && vivo) setHayNueva(true)
    }
    const alVolver = () => { if (document.visibilityState === 'visible') mirar() }
    const t = window.setInterval(mirar, CADA_MS)
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      vivo = false
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [])

  if (!hayNueva) return null
  return (
    // Pegada arriba aunque se haya bajado por la pantalla: si no, quien está a
    // mitad de una tabla larga no la ve.
    <div role="status"
      className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2 bg-yellow-100 border-b-2 border-yellow-400 text-sm text-yellow-900 shadow-sm print:hidden">
      <span className="font-semibold">Hay una versión nueva de Alquileres.</span>
      <button type="button" onClick={actualizar}
        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-yellow-950 font-bold">
        <RefreshCw size={15} /> Actualizar
      </button>
      <span className="text-yellow-800">Guarda antes lo que estés escribiendo.</span>
    </div>
  )
}

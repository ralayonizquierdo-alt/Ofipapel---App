import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { NOMBRE_PANTALLA } from '../lib/volver'

/**
 * «← Volver a …», abajo en el centro de todas las pantallas, en cuanto hay un
 * paso atrás al que volver. Deshace el camino de uno en uno, como la flecha del
 * navegador, y cada pantalla vuelve como se dejó (ver `lib/volver.ts`).
 *
 * Lleva la cuenta de los pasos dados dentro de la aplicación para saber el
 * nombre de la pantalla anterior y no enseñarse en la primera: el historial del
 * navegador no deja leer a dónde lleva atrás.
 */
type Paso = { key: string; pantalla: string }

export default function BotonVolver() {
  const location = useLocation()
  const tipo = useNavigationType()
  const navigate = useNavigate()
  const [pasos, setPasos] = useState<Paso[]>([])

  useEffect(() => {
    const aqui = { key: location.key, pantalla: location.pathname }
    setPasos(p => {
      if (tipo === 'PUSH') return [...p, aqui]
      if (tipo === 'REPLACE') return [...p.slice(0, -1), aqui]
      // Atrás (o adelante): se recorta hasta el paso al que se ha vuelto.
      const i = p.findIndex(x => x.key === location.key)
      return i >= 0 ? p.slice(0, i + 1) : [aqui]
    })
  }, [location.key, location.pathname, tipo])

  if (pasos.length < 2) return null
  const anterior = pasos[pasos.length - 2]
  const nombre = NOMBRE_PANTALLA[anterior.pantalla]

  return (
    <button type="button" onClick={() => navigate(-1)}
      title="Vuelve al paso anterior, tal como lo dejaste"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-5 py-3 rounded-full bg-blue-600 text-white text-sm font-semibold shadow-lg hover:bg-blue-700 print:hidden">
      <ArrowLeft size={18} /> {nombre ? `Volver a ${nombre}` : 'Volver'}
    </button>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tag, ArrowRight } from 'lucide-react'
import { miradoEsteMes, usePreciosBooking } from '../lib/booking'
import { MONTH_NAMES_ES } from '../lib/dateUtils'

/**
 * «Toca mirar Booking» (Luis, 16/11/2026): una vez al mes hay que apuntar lo
 * que publica la agencia en Booking (Precios → Comparar con Booking). Mientras
 * en el mes no haya ninguna consulta apuntada, sale al entrar; «Ahora no» la
 * calla solo hasta la próxima vez que se abra la app, como las demás.
 *
 * Espera a que se cierren las otras ventanas de entrada (`esperar`).
 */
export default function AvisoBooking({ esperar = false }: { esperar?: boolean }) {
  const consultas = usePreciosBooking()
  const [cerrado, setCerrado] = useState(false)
  const navigate = useNavigate()

  if (cerrado || esperar || consultas === null || miradoEsteMes(consultas)) return null
  const mes = MONTH_NAMES_ES[new Date().getMonth()].toLowerCase()

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 print:hidden">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="bg-blue-700 text-white px-5 py-4 flex items-center gap-3">
          <Tag size={24} className="shrink-0" />
          <div>
            <h2 className="font-bold">Toca mirar los precios de Booking</h2>
            <p className="text-sm text-blue-100">En {mes} aún no se ha apuntado ninguno.</p>
          </div>
        </div>
        <div className="px-5 py-4 text-sm text-slate-700">
          Mira en Booking una semana de cada apartamento y apunta lo que pide. La app lo compara con nuestra tarifa.
        </div>
        <div className="px-5 py-4 border-t border-slate-200 flex flex-wrap items-center justify-end gap-3">
          <button onClick={() => setCerrado(true)}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">
            Ahora no
          </button>
          <button onClick={() => { setCerrado(true); navigate('/precios?ver=booking') }}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
            Ir a apuntar <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

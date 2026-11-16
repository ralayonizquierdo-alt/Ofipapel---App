import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Tag, Bot } from 'lucide-react'
import { ENLACE_CLAUDE, miradoEsteMes, usePreciosBooking } from '../lib/booking'
import { MONTH_NAMES_ES } from '../lib/dateUtils'

/**
 * «Toca comprobar los precios de Booking» (Luis, 16/11/2026): una vez al mes,
 * mientras en el mes no haya ninguna consulta apuntada en Precios → Comparar
 * con Booking, sale al entrar, como la de «alquilado dos veces».
 *
 * La comprobación la hace Claude («esto es lo propio»): «Comprobar con Claude»
 * abre Claude (pestaña Code) con el encargo ya escrito, y basta con pulsar
 * Enter. «Ahora no» la calla solo hasta la próxima vez que se abra la app.
 *
 * Espera a que se cierren las otras ventanas de entrada (`esperar`).
 */
export default function AvisoBooking({ esperar = false }: { esperar?: boolean }) {
  const consultas = usePreciosBooking()
  const [cerrado, setCerrado] = useState(false)

  // Solo en pruebas locales: `?probarAvisoBooking` lo enseña aunque este mes ya se haya mirado.
  const { search } = useLocation()
  const probar = import.meta.env.DEV && new URLSearchParams(search).has('probarAvisoBooking')
  if (cerrado || esperar || consultas === null || (miradoEsteMes(consultas) && !probar)) return null
  const mes = MONTH_NAMES_ES[new Date().getMonth()].toLowerCase()

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 print:hidden">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl overflow-hidden">
        <div className="bg-blue-700 text-white px-5 py-4 flex items-center gap-3">
          <Tag size={24} className="shrink-0" />
          <div>
            <h2 className="font-bold text-lg">Toca comprobar los precios de Booking</h2>
            <p className="text-sm text-blue-100">En {mes} aún no se han comprobado.</p>
          </div>
        </div>
        <div className="px-5 py-4 text-base text-slate-700">
          Claude mira lo que publica la agencia en Booking y lo compara con nuestra tarifa.
          Al pulsar el botón se abre Claude con el encargo escrito: <b>solo hay que pulsar Enter</b>.
        </div>
        <div className="px-5 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">Este aviso volverá a salir cada vez que entres hasta que se compruebe.</p>
          <div className="flex gap-2">
            <button onClick={() => setCerrado(true)}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">
              Ahora no
            </button>
            <a href={ENLACE_CLAUDE} onClick={() => setCerrado(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
              <Bot size={16} /> Comprobar con Claude
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

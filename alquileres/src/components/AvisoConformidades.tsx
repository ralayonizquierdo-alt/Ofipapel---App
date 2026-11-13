import { useEffect, useMemo, useState } from 'react'
import { Mail, ArrowRight } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { conformidadesPorEnviar, HORAS_ESPERA } from '../lib/conformidades'
import { formatDateShort } from '../lib/dateUtils'
import { num } from '../lib/formato'
import { useNavigate } from 'react-router-dom'

/**
 * La ventana de «Conformidades pendientes de enviar» (Luis, 13/11/2026).
 *
 * El globo del hub avisaba a las HORAS_ESPERA de entrar la reserva, pero al
 * abrir la aplicación no decía por qué: había que buscarlo en el Dashboard.
 * Ahora salta al entrar, igual que la de «alquilado dos veces»: «Ir a enviar»
 * abre la ficha (cuadre y conformidad) para revisarla de esa reserva y pregunta si se quiere añadir texto;
 * «Ahora no» la calla **solo hasta la próxima vez** que se abra la app. Deja
 * de salir cuando, tras mandarla, se contesta «Sí, enviada» en la ficha.
 *
 * Espera a que se cierre la de reservas pisadas (`esperar`): una encima de
 * otra no se leen.
 */
export default function AvisoConformidades({ esperar = false }: { esperar?: boolean }) {
  const { reservations, apartments } = useData()
  const [cerrado, setCerrado] = useState(false)
  const navigate = useNavigate()
  // Se mira cada minuto: si la app está abierta cuando se cumplen las horas,
  // sale a su hora sin recargar.
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  const lista = useMemo(() => conformidadesPorEnviar(reservations, ahora), [reservations, ahora])
  const nombre = (id: string) => apartments.find(a => a.id === id)?.name ?? id

  /**
   * La ficha se abre en el Dashboard, no aquí: así entra en el «← Volver» como
   * las demás (lib/volver.ts). Si desde ella se va a la reserva o a la tarifa,
   * al volver sale otra vez la ficha, y no este aviso.
   */
  const ir = (id: string) => {
    setCerrado(true)
    navigate('/dashboard', { state: { abrirConformidad: id } })
  }
  if (cerrado || esperar || lista.length === 0) return null

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 print:hidden">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto">
        <div className="bg-blue-700 text-white px-5 py-4 flex items-center gap-3">
          <Mail size={24} className="shrink-0" />
          <div>
            <h2 className="font-bold">
              {lista.length === 1
                ? 'Conformidad pendiente de enviar'
                : `${lista.length} conformidades pendientes de enviar`}
            </h2>
            <p className="text-sm text-blue-100">
              {lista.length === 1 ? 'Esta reserva entró' : 'Estas reservas entraron'} hace más de {HORAS_ESPERA} horas
              y la agencia aún no tiene su conformidad.
            </p>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {lista.map(({ r }) => (
            <div key={r.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800">
                  {nombre(r.apartmentId)} — {formatDateShort(r.checkIn)} al {formatDateShort(r.checkOut)}
                </p>
                <p className="text-xs text-slate-500">
                  {r.nights} noches · {num(r.total, 2)} € · entró el {new Date(r.createdAt).toLocaleString('es-ES', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>
              <button type="button" onClick={() => ir(r.id)}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 whitespace-nowrap">
                Ir a enviar <ArrowRight size={15} />
              </button>
            </div>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Este aviso volverá a salir cada vez que entres hasta que se envíen.
          </p>
          <button onClick={() => setCerrado(true)}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">
            Ahora no
          </button>
        </div>
      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { AlertOctagon, Pencil, Ban, Copy } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import { solapes, type Solape } from '../lib/solapes'
import { formatDate } from '../lib/dateUtils'
import type { Reservation } from '../types'

/**
 * El aviso de reservas que se pisan.
 *
 * Dos piezas con los mismos datos:
 *  · `TarjetaSolapes`, fija en el panel mientras quede alguna.
 *  · `AvisoSolapes`, una ventana que salta al entrar en la app y que **vuelve
 *    a salir cada vez** hasta que no quede ninguna. Lo pidió así el propietario
 *    (26/10/2026): «eso nunca puede pasar», y un aviso que se puede ignorar
 *    para siempre no sirve de nada. Cerrarla la calla solo hasta la próxima
 *    vez que se abra la aplicación.
 *
 * Las dos avisan solo de lo que toca **de hoy en adelante** (`lib/solapes.ts`
 * ya no devuelve nada anterior): lo de ejercicios cerrados no se puede
 * arreglar con nadie dentro y un aviso que no se puede cerrar nunca deja de
 * mirarse.
 *
 * Desde aquí se puede anular la que sobra (nunca borrar: la reserva se queda
 * con su historial y sus cobros), pero la app no elige sola: dice cuál cree
 * que es y lo confirma la persona.
 */

function fecha(iso: string) { return formatDate(iso) }

/** Una reserva del par, con sus dos acciones. */
function FichaReserva({ r, sobra, onIr, onAnular }: {
  r: Reservation
  sobra: boolean
  onIr: (id: string) => void
  onAnular: (r: Reservation) => void
}) {
  return (
    <div className={`text-xs border rounded-lg px-3 py-2 ${sobra ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-200'}`}>
      <span className="block font-medium text-slate-700">
        {fecha(r.checkIn)} → {fecha(r.checkOut)} · {r.nights}-N
      </span>
      <span className="block text-slate-500">
        {[r.guestName, r.channel].filter(Boolean).join(' · ')}
      </span>
      {sobra && <span className="block text-amber-800 font-medium mt-0.5">parece la que sobra</span>}
      <div className="flex flex-wrap items-center gap-3 mt-1.5">
        <button onClick={() => onIr(r.id)} className="flex items-center gap-1 text-blue-700 hover:underline">
          <Pencil size={11} /> abrir
        </button>
        <button onClick={() => onAnular(r)} className="flex items-center gap-1 text-red-700 hover:underline">
          <Ban size={11} /> anular esta
        </button>
      </div>
    </div>
  )
}

function Lineas({ lista, onIr }: { lista: Solape[]; onIr: (id: string) => void }) {
  const { apartments, updateReservation } = useData()
  const nombre = (id: string) => apartments.find(a => a.id === id)?.name ?? id

  /**
   * Anular, no borrar. Una reserva anulada deja de pisar a nadie y de salir en
   * el planning, pero se queda ahí con sus cobros y su rastro, que es lo que
   * hay que poder mirar el día que alguien pregunte.
   */
  function anular(r: Reservation) {
    const quien = [r.guestName, `${fecha(r.checkIn)} → ${fecha(r.checkOut)}`].filter(Boolean).join(', ')
    if (!confirm(`¿Marcar como ANULADA la reserva de ${nombre(r.apartmentId)} (${quien})?\n\nNo se borra nada: se queda con sus cobros y su historial, solo deja de ocupar el apartamento.`)) return
    updateReservation(r.id, { status: 'cancelada' })
  }

  return (
    <div className="divide-y divide-slate-100">
      {lista.map(s => (
        <div key={s.id} className="py-3 px-4">
          <p className="text-sm font-semibold text-slate-800">
            {nombre(s.apartmentId)} · {s.noches} {s.noches === 1 ? 'noche' : 'noches'} a la vez
            <span className="font-normal text-slate-500"> ({fecha(s.desde)} → {fecha(s.hasta)})</span>
          </p>
          {s.tipo === 'duplicada'
            ? <p className="mt-0.5 text-xs text-amber-800 flex items-start gap-1">
                <Copy size={12} className="shrink-0 mt-0.5" /> {s.motivo}
              </p>
            : <p className="mt-0.5 text-xs text-red-700 font-medium">
                Son dos estancias distintas pisándose: esto sí puede ser la misma llave dada dos veces.
              </p>}
          <div className="mt-1.5 grid sm:grid-cols-2 gap-2">
            {[s.a, s.b].map(r => (
              <FichaReserva key={r.id} r={r} sobra={s.sobra?.id === r.id} onIr={onIr} onAnular={anular} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** La tarjeta del panel: se queda ahí mientras haya solapes. */
export function TarjetaSolapes() {
  const { reservations } = useData()
  const navigate = useNavigate()
  const lista = useMemo(() => solapes(reservations), [reservations])
  if (lista.length === 0) return null

  return (
    <div className="mb-6 bg-white rounded-xl shadow-sm border-2 border-red-400 overflow-hidden">
      <div className="bg-red-50 border-b border-red-200 px-4 py-2.5 flex items-center gap-2">
        <AlertOctagon size={18} className="text-red-600 shrink-0" />
        <p className="text-sm font-bold text-red-900">
          {lista.length === 1
            ? 'Hay un apartamento alquilado dos veces a la vez'
            : `Hay ${lista.length} apartamentos alquilados dos veces a la vez`}
        </p>
      </div>

      <Lineas lista={lista} onIr={id => navigate(`/reservas?edit=${id}`)} />

      <p className="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-100">
        O sobra una (una anulación que no se llegó a anular, un aviso subido dos veces, la misma
        estancia cortada en el cambio de año) o hay dos clientes con la misma llave. Abre la que
        sobre y anúlala: no se borra nada, se queda con sus cobros.
      </p>
    </div>
  )
}

/**
 * La ventana que salta al entrar. Se cierra, pero vuelve la próxima vez que se
 * abra la aplicación: solo deja de salir cuando no queda ningún solape que
 * toque de hoy en adelante.
 */
export default function AvisoSolapes() {
  const { reservations } = useData()
  const navigate = useNavigate()
  const [cerrado, setCerrado] = useState(false)
  const lista = useMemo(() => solapes(reservations), [reservations])
  if (cerrado || lista.length === 0) return null

  const ir = (id: string) => { setCerrado(true); navigate(`/reservas?edit=${id}`) }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 print:hidden">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto">
        <div className="bg-red-600 text-white px-5 py-4 flex items-center gap-3">
          <AlertOctagon size={24} className="shrink-0" />
          <div>
            <h2 className="font-bold">
              {lista.length === 1
                ? 'Un apartamento está alquilado dos veces a la vez'
                : `${lista.length} apartamentos están alquilados dos veces a la vez`}
            </h2>
            <p className="text-sm text-red-100">Hay que resolverlo: dos reservas no pueden pisarse.</p>
          </div>
        </div>
        <Lineas lista={lista} onIr={ir} />
        <div className="px-5 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Este aviso volverá a salir cada vez que entres hasta que no quede ninguno.
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

import { useMemo, useState } from 'react'
import { CheckCircle2, ClipboardCheck, AlertTriangle } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import {
  altaDe, faltanCobros, parcheDe, planDe, type Paso,
} from '../lib/correccionesLuis'

/**
 * Las correcciones de las estancias que se pisaban, para aplicarlas de una vez.
 *
 * Es de usar y tirar: en cuanto no queda nada pendiente el panel desaparece
 * solo, y el día que se quiera quitar se borran este fichero y
 * lib/correccionesLuis.ts sin tocar nada más.
 *
 * Enseña una por una lo que va a hacer antes de hacerlo, porque toca reservas
 * de años ya cerrados y conviene poder mirarlo con calma.
 */
export default function CorreccionesLuis() {
  const {
    reservations, payments, apartments,
    addReservation, updateReservation, deleteReservation, addPayment,
  } = useData()
  const [abierto, setAbierto] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [error, setError] = useState('')

  const plan = useMemo(() => planDe(reservations, payments), [reservations, payments])
  const pendientes = plan.filter(p => p.estado === 'pendiente')
  const sinReserva = plan.filter(p => p.estado === 'sin-reserva')

  if (!pendientes.length) return null

  const nombre = (id: string) => apartments.find(a => a.id === id)?.name || id

  async function aplicar() {
    setAplicando(true)
    setError('')
    try {
      for (const p of pendientes) {
        const c = p.correccion

        if (c.tipo === 'borrar' && p.reserva) {
          deleteReservation(p.reserva.id, payments)
          continue
        }

        // Alta: primero la reserva, y los cobros van contra ella.
        let destino = p.reserva
        const alta = altaDe(p)
        if (alta) destino = addReservation(alta)

        const parche = parcheDe(p)
        if (parche && destino) updateReservation(destino.id, parche)

        if (destino) {
          for (const cobro of faltanCobros(c, destino, payments)) {
            addPayment({
              reservationId: destino.id,
              amount: cobro.amount,
              paymentDate: cobro.date,
              received: true,
              paymentMethod: 'otro',
            })
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se han podido guardar los cambios')
    } finally {
      setAplicando(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-blue-200 overflow-hidden mb-6">
      <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardCheck size={18} className="text-blue-600 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 text-sm">Correcciones de las reservas que se pisaban</p>
            <p className="text-xs text-slate-500">
              {pendientes.length} cambio{pendientes.length === 1 ? '' : 's'} pendiente{pendientes.length === 1 ? '' : 's'}, según las respuestas de Luis
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAbierto(v => !v)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white hover:border-blue-300 whitespace-nowrap">
            {abierto ? 'Ocultar' : 'Ver qué cambia'}
          </button>
          <button onClick={aplicar} disabled={aplicando}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
            {aplicando ? 'Aplicando…' : 'Aplicar'}
          </button>
        </div>
      </div>

      {error && (
        <p className="px-4 py-2 text-sm text-red-700 bg-red-50 border-b border-red-100">{error}</p>
      )}

      {abierto && (
        <div className="divide-y divide-slate-100">
          {pendientes.map((p, i) => <Fila key={i} paso={p} nombre={nombre} />)}

          {sinReserva.length > 0 && (
            <div className="px-4 py-3 bg-amber-50">
              <p className="text-xs font-medium text-amber-800 flex items-center gap-1.5 mb-1">
                <AlertTriangle size={13} />
                No se han encontrado en la app ({sinReserva.length})
              </p>
              <p className="text-xs text-amber-700">
                Puede que ya se corrigieran a mano. No se toca nada de esto.
              </p>
            </div>
          )}

          {plan.some(p => p.estado === 'hecha') && (
            <p className="px-4 py-2 text-xs text-slate-400 flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-green-600" />
              {plan.filter(p => p.estado === 'hecha').length} ya estaban bien
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Fila({ paso, nombre }: { paso: Paso; nombre: (id: string) => string }) {
  const c = paso.correccion
  const etiqueta = c.tipo === 'borrar' ? 'Borrar' : c.tipo === 'alta' ? 'Alta' : 'Corregir'
  const color = c.tipo === 'borrar'
    ? 'bg-red-100 text-red-700'
    : c.tipo === 'alta' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${color}`}>{etiqueta}</span>
        <span className="text-sm font-medium text-slate-700">{nombre(c.apt)}</span>
        <span className="text-xs text-slate-500 tabular-nums">
          {c.checkIn.split('-').reverse().join('/')} → {c.checkOut.split('-').reverse().join('/')}
        </span>
      </div>
      <ul className="text-xs text-slate-600 space-y-0.5 mb-1">
        {paso.cambios.map((t, i) => <li key={i}>· {t}</li>)}
      </ul>
      <p className="text-xs text-slate-400 italic">{c.motivo}</p>
    </div>
  )
}

import { useState } from 'react'
import { Unlink } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { estanciasPosibles, estanciaSugerida } from '../lib/cobrosSinReserva'
import { formatDate, formatDateShort } from '../lib/dateUtils'
import { num } from '../lib/formato'
import type { Payment } from '../types'

const eur = (n: number) => `${num(n, 2)} €`

/**
 * Un cobro sin reserva, en rojo en el Dashboard, hasta que se revisa: se une a
 * una estancia del desplegable o se dice «Dejarlo sin reserva». La estancia
 * que se propone es solo una pista; nunca se une sola. Ver
 * lib/cobrosSinReserva.ts.
 */
export default function AvisoCobroSinReserva({ p, nombreApt }: { p: Payment; nombreApt: (id: string) => string }) {
  const { reservations, updatePayment } = useData()
  const posibles = estanciasPosibles(p, reservations)
  const sugerida = estanciaSugerida(p, reservations)
  const [elegida, setElegida] = useState(sugerida?.id ?? '')

  return (
    <div className="rounded-lg p-3 border bg-red-50 border-red-200">
      <div className="flex items-center gap-3">
        <Unlink size={16} className="shrink-0 text-red-600" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-800">
            {nombreApt(p.apartmentId ?? '')} — cobro de {eur(p.amount)}
            {p.paymentDate && <> del {formatDateShort(p.paymentDate)}</>}
            <span className="ml-2 text-xs font-bold">sin reserva</span>
          </p>
          <p className="text-xs text-red-700">
            Transferencia{p.justificanteNombre && <> · {p.justificanteNombre}</>}. Elige su estancia cuando lo hayas revisado.
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 sm:pl-7">
        <select value={elegida} onChange={e => setElegida(e.target.value)}
          className="w-full sm:w-auto max-w-full px-2 py-1.5 text-xs border border-red-200 rounded-lg bg-white text-slate-700">
          <option value="">— elegir estancia —</option>
          {posibles.map(r => (
            <option key={r.id} value={r.id}>
              {formatDate(r.checkIn)} al {formatDate(r.checkOut)} · {eur(r.total)}
              {r.id === sugerida?.id ? ' (la más probable)' : ''}
            </option>
          ))}
        </select>
        <button type="button" disabled={!elegida}
          onClick={() => updatePayment(p.id, { reservationId: elegida, sinRevisar: false })}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
          Unir a esa estancia
        </button>
        <button type="button"
          onClick={() => { if (confirm('¿Dejar este cobro sin reserva? Deja de avisar, y el cobro sigue contando en su mes.')) updatePayment(p.id, { sinRevisar: false }) }}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-300 text-red-800 hover:bg-red-100">
          Dejarlo sin reserva
        </button>
      </div>
    </div>
  )
}

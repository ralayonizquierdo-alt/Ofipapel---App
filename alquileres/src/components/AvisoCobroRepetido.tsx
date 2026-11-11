import { Copy } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { formatDate, formatDateShort } from '../lib/dateUtils'
import { num } from '../lib/formato'
import type { Payment, Reservation } from '../types'

const eur = (n: number) => `${num(n, 2)} €`

/**
 * Dos cobros que parecen el mismo, en rojo en el Dashboard: se quita el que
 * sobra o se dice que no están repetidos. Ver lib/cobrosRepetidos.ts.
 */
export default function AvisoCobroRepetido({ r, cobros, nombreApt }: {
  r: Reservation
  cobros: Payment[]
  nombreApt: (id: string) => string
}) {
  const { updatePayment, deletePayment } = useData()
  const quitar = (p: Payment) => {
    if (confirm(`¿Quitar el cobro de ${eur(p.amount)} ${p.paymentDate ? `del ${formatDate(p.paymentDate)}` : 'sin fecha'}? `
      + 'Se borra y no se puede deshacer.')) deletePayment(p.id)
  }
  return (
    <div className="rounded-lg p-3 border bg-red-50 border-red-200">
      <div className="flex items-center gap-3">
        <Copy size={16} className="shrink-0 text-red-600" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-800">
            {nombreApt(r.apartmentId)} — {formatDateShort(r.checkIn)} al {formatDateShort(r.checkOut)}
            <span className="ml-2 text-xs font-bold">cobro repetido</span>
          </p>
          <p className="text-xs text-red-700">
            {cobros.length} cobros de <strong>{eur(cobros[0].amount)}</strong>: parece el mismo apuntado {cobros.length === 2 ? 'dos' : `${cobros.length}`} veces.
          </p>
        </div>
      </div>
      <ul className="mt-2 space-y-1.5 sm:pl-7">
        {cobros.map(p => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 bg-white border border-red-200 rounded-lg px-3 py-1.5 text-xs text-slate-700">
            <span>
              <b>{p.paymentDate ? formatDate(p.paymentDate) : 'sin fecha'}</b>
              {' · '}apuntado el {formatDate(p.createdAt.slice(0, 10))}
              {p.justificanteNombre && <> · {p.justificanteNombre}</>}
              {p.entryNumber && <> · asiento {p.entryNumber}</>}
            </span>
            <button type="button" onClick={() => quitar(p)}
              className="px-2.5 py-1 font-medium rounded-lg border border-red-300 text-red-800 hover:bg-red-100">
              Quitar este
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 sm:pl-7">
        <button type="button"
          onClick={() => { if (confirm('¿No están repetidos? Deja de avisar y cuentan los dos.')) cobros.forEach(p => updatePayment(p.id, { noRepetido: true })) }}
          className="text-xs text-red-700 underline hover:text-red-900">
          No están repetidos: son cobros distintos
        </button>
      </div>
    </div>
  )
}

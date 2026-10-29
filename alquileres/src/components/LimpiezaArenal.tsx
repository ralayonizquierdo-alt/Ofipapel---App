import { useMemo, useState } from 'react'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { vaSinLimpieza } from '../lib/limpieza'
import { formatDate } from '../lib/dateUtils'
import { num } from '../lib/formato'
import Modal from './ui/Modal'
import type { Reservation } from '../types'

/**
 * Quitarle la limpieza a las reservas del Arenal que la llevan.
 *
 * El Arenal va sin los 40 € (`lib/limpieza.ts`), pero eso solo estaba escrito
 * en el lector del informe de Airbnb, así que las reservas metidas por otro
 * camino —pegando el aviso, el formulario, el calendario— se los llevaron
 * igual. La regla ya vale para las nuevas; estas son las que quedaron
 * guardadas con la limpieza puesta.
 *
 * Quitarla baja el total de la reserva en esos 40 €, así que no se hace sola:
 * sale un aviso con la lista y se cambia lo que se marque. Lo cobrado no se
 * toca — si ya estaba pagada entera, quedará como pagada de más, que es
 * exactamente lo que hay que reclamar o devolver.
 */

const eur = (n: number) => `${num(n, 2)} €`

export default function LimpiezaArenal() {
  const { reservations, updateReservation, anotaVolcado } = useData()
  const [abierto, setAbierto] = useState(false)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [hecho, setHecho] = useState('')

  const conLimpieza = useMemo(
    () => reservations
      .filter(r => vaSinLimpieza(r.apartmentId) && r.status !== 'cancelada' && (Number(r.cleaningFee) || 0) > 0)
      .sort((a, b) => b.checkIn.localeCompare(a.checkIn)),
    [reservations],
  )
  if (conLimpieza.length === 0) return null

  const elegidas = conLimpieza.filter(r => marcadas.has(r.id))
  const suma = conLimpieza.reduce((s, r) => s + (Number(r.cleaningFee) || 0), 0)

  function quitar() {
    for (const r of elegidas) {
      const limpieza = Number(r.cleaningFee) || 0
      updateReservation(r.id, {
        cleaningFee: 0,
        total: Math.round((r.total - limpieza) * 100) / 100,
        notes: [r.notes, `Limpieza quitada el ${formatDate(new Date().toISOString().slice(0, 10))}: `
          + `el Arenal va sin los ${eur(limpieza)} (la cobra Airbnb y se la queda la gestora)`]
          .filter(Boolean).join(' · '),
      })
    }
    anotaVolcado({
      origen: 'correcciones',
      resumen: `Limpieza quitada a ${elegidas.length} ${elegidas.length === 1 ? 'reserva' : 'reservas'} del Arenal`,
      year: Number(elegidas[0].checkIn.slice(0, 4)),
      reservas: elegidas.length,
    })
    setHecho(`${elegidas.length} ${elegidas.length === 1 ? 'reserva corregida' : 'reservas corregidas'}`)
    setMarcadas(new Set())
  }

  return (
    <>
      <div className="mb-5 bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 flex flex-wrap items-center gap-3 print:hidden">
        <Sparkles size={18} className="text-amber-700 shrink-0" />
        <p className="text-sm text-amber-900 flex-1">
          {conLimpieza.length === 1
            ? 'Hay una reserva del Arenal con limpieza'
            : `Hay ${conLimpieza.length} reservas del Arenal con limpieza`}
          {' '}<span className="text-amber-700">({eur(suma)} en total)</span>, y ese apartamento va sin ella:
          la cobra Airbnb y se la queda la gestora.
        </p>
        <button onClick={() => setAbierto(true)}
          className="px-3 py-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg whitespace-nowrap">
          Ver y quitarla
        </button>
      </div>

      {abierto && (
        <Modal title="Limpieza del Arenal" onClose={() => setAbierto(false)} size="lg">
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Quitarla baja el total de cada reserva en esos euros. <b>Se cambia solo lo que marques.</b>{' '}
              Lo cobrado no se toca: si ya estaba pagada entera, quedará como pagada de más.
            </p>

            {hecho && (
              <div className="bg-green-50 border border-green-300 rounded-lg p-3 text-sm font-medium text-green-900">
                {hecho}
              </div>
            )}

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                  <tr>
                    <th className="py-2 px-3 w-8">
                      <input type="checkbox"
                        checked={elegidas.length === conLimpieza.length}
                        onChange={e => setMarcadas(e.target.checked ? new Set(conLimpieza.map(r => r.id)) : new Set())} />
                    </th>
                    <th className="text-left py-2 px-3 font-medium">Estancia</th>
                    <th className="text-right py-2 px-3 font-medium">Limpieza</th>
                    <th className="text-right py-2 px-3 font-medium">Total ahora</th>
                    <th className="text-right py-2 px-3 font-medium">Quedaría en</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {conLimpieza.map((r: Reservation) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className="py-2 px-3">
                        <input type="checkbox" checked={marcadas.has(r.id)}
                          onChange={e => setMarcadas(m => {
                            const n = new Set(m)
                            if (e.target.checked) n.add(r.id); else n.delete(r.id)
                            return n
                          })} />
                      </td>
                      <td className="py-2 px-3 text-slate-600">
                        {formatDate(r.checkIn)} al {formatDate(r.checkOut)} · {r.nights}-N
                        {r.guestName ? <span className="block text-xs text-slate-400">{r.guestName}</span> : null}
                      </td>
                      <td className="py-2 px-3 text-right text-amber-700">{eur(Number(r.cleaningFee) || 0)}</td>
                      <td className="py-2 px-3 text-right text-slate-500">{eur(r.total)}</td>
                      <td className="py-2 px-3 text-right font-semibold text-slate-800">
                        {eur(Math.round((r.total - (Number(r.cleaningFee) || 0)) * 100) / 100)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-amber-800 flex items-start gap-1.5">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              Si alguna llevaba la limpieza a propósito, déjala sin marcar.
            </p>

            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setAbierto(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cerrar</button>
              <button onClick={quitar} disabled={elegidas.length === 0}
                className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium disabled:opacity-50">
                {elegidas.length === 1 ? 'Quitar la limpieza de 1 reserva' : `Quitar la limpieza de ${elegidas.length} reservas`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

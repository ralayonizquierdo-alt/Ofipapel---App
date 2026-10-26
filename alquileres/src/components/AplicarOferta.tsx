import { useMemo, useState } from 'react'
import { Tag, AlertTriangle } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { buscaTarifa, calcTotal } from '../lib/priceCalc'
import { formatDate, MONTH_NAMES_ES } from '../lib/dateUtils'
import { num } from '../lib/formato'
import Modal from './ui/Modal'
import type { OfferPrice, Reservation } from '../types'

/**
 * Llevar una tarifa de oferta a las reservas que ya estaban hechas.
 *
 * La oferta manda sobre la tarifa general, pero solo **al calcular** el precio:
 * una reserva guarda el importe con el que se creó, no la tarifa. Así que
 * cambiar los precios de la oferta de octubre no movía ni un euro de las
 * reservas de octubre ya metidas — «no aplica los precios de las ofertas»
 * (propietario, 26/10/2026).
 *
 * Recalcularlas solas sería peor: hay estancias con un precio pactado a mano
 * que no debe tocarse, y la aplicación no sabe cuáles. Por eso esto enseña
 * **una por una** lo que vale ahora y lo que valdría con la oferta, y se
 * aplica solo lo que se marque. Lo cobrado no se toca: si una estancia baja de
 * precio y ya estaba pagada, aparecerá como pagada de más, que es justo lo que
 * hay que mirar.
 */

const eur = (n: number) => `${num(n, 2)} €`

interface Cambio {
  r: Reservation
  total: number
  base: number
  limpieza: number
}

export default function AplicarOferta({ oferta, onClose }: { oferta: OfferPrice; onClose: () => void }) {
  const { reservations, prices, updateReservation, anotaVolcado } = useData()
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [hecho, setHecho] = useState('')

  /** Las reservas que entran en el mes de la oferta y a las que les cambia el precio. */
  const { cambian, igual } = useMemo(() => {
    const mes = `${oferta.year}-${String(oferta.month).padStart(2, '0')}`
    const cambian: Cambio[] = []
    let igual = 0
    for (const r of reservations) {
      if (r.status === 'cancelada' || !r.checkIn?.startsWith(mes)) continue
      // Con la oferta sola: si no cubre ese apartamento, no devuelve nada.
      const t = buscaTarifa(prices, r.apartmentId, r.checkIn, r.nights, [oferta])
      if (!t?.oferta) continue
      const limpieza = Number(t.entry.cleaningFee) || 0
      const total = calcTotal(t.base, limpieza, r.discountPct || 0)
      if (Math.abs(total - r.total) < 0.005) { igual++; continue }
      cambian.push({ r, total, base: t.base, limpieza })
    }
    cambian.sort((a, b) => a.r.checkIn.localeCompare(b.r.checkIn))
    return { cambian, igual }
  }, [oferta, prices, reservations])

  const elegidas = cambian.filter(c => marcadas.has(c.r.id))

  function aplicar() {
    for (const c of elegidas) {
      updateReservation(c.r.id, {
        basePrice: c.base, cleaningFee: c.limpieza, total: c.total,
        notes: [c.r.notes, `Precio puesto al día con la tarifa de oferta «${oferta.label}» `
          + `el ${formatDate(new Date().toISOString().slice(0, 10))}: `
          + `${eur(c.r.total)} → ${eur(c.total)}`].filter(Boolean).join(' · '),
      })
    }
    anotaVolcado({
      origen: 'correcciones',
      resumen: `Tarifa de oferta «${oferta.label}» aplicada a ${elegidas.length} `
        + `${elegidas.length === 1 ? 'reserva' : 'reservas'}`,
      year: oferta.year,
      reservas: elegidas.length,
    })
    setHecho(`${elegidas.length} ${elegidas.length === 1 ? 'reserva actualizada' : 'reservas actualizadas'}`)
    setMarcadas(new Set())
  }

  const titulo = `Aplicar la oferta de ${MONTH_NAMES_ES[oferta.month - 1].toLowerCase()} ${oferta.year}`

  return (
    <Modal title={titulo} onClose={onClose} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Una reserva guarda el importe con el que se creó, así que cambiar la oferta no mueve
          las que ya estaban hechas. Aquí se ven las que entran en ese mes y lo que valdrían con
          la oferta tal y como está ahora. <b>Se cambia solo lo que marques.</b>
        </p>

        {hecho && (
          <div className="bg-green-50 border border-green-300 rounded-lg p-3 text-sm font-medium text-green-900">
            {hecho}
          </div>
        )}

        {cambian.length === 0 ? (
          <p className="text-sm text-slate-500">
            {igual > 0
              ? `Las ${igual} reservas de ese mes ya están al precio de la oferta: no hay nada que cambiar.`
              : 'No hay reservas de ese mes en los apartamentos de esta oferta.'}
          </p>
        ) : (
          <>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                  <tr>
                    <th className="py-2 px-3 w-8">
                      <input type="checkbox"
                        checked={elegidas.length === cambian.length && cambian.length > 0}
                        onChange={e => setMarcadas(e.target.checked ? new Set(cambian.map(c => c.r.id)) : new Set())} />
                    </th>
                    <th className="text-left py-2 px-3 font-medium">Apto.</th>
                    <th className="text-left py-2 px-3 font-medium">Estancia</th>
                    <th className="text-right py-2 px-3 font-medium">Ahora</th>
                    <th className="text-right py-2 px-3 font-medium">Con la oferta</th>
                    <th className="text-right py-2 px-3 font-medium">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {cambian.map(c => {
                    const dif = Math.round((c.total - c.r.total) * 100) / 100
                    return (
                      <tr key={c.r.id} className="border-b border-slate-100">
                        <td className="py-2 px-3">
                          <input type="checkbox" checked={marcadas.has(c.r.id)}
                            onChange={e => setMarcadas(m => {
                              const n = new Set(m)
                              if (e.target.checked) n.add(c.r.id); else n.delete(c.r.id)
                              return n
                            })} />
                        </td>
                        <td className="py-2 px-3 text-slate-700">{c.r.apartmentId}</td>
                        <td className="py-2 px-3 text-slate-600">
                          {formatDate(c.r.checkIn)} al {formatDate(c.r.checkOut)} · {c.r.nights}-N
                          {c.r.guestName ? <span className="block text-xs text-slate-400">{c.r.guestName}</span> : null}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-500">{eur(c.r.total)}</td>
                        <td className="py-2 px-3 text-right font-semibold text-slate-800">{eur(c.total)}</td>
                        <td className={`py-2 px-3 text-right font-medium ${dif < 0 ? 'text-green-700' : 'text-amber-700'}`}>
                          {dif > 0 ? '+' : ''}{eur(dif)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-amber-800 flex items-start gap-1.5">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              Si alguna lleva un precio pactado a mano, déjala sin marcar. Lo cobrado no se toca:
              una estancia que baje de precio y ya esté pagada saldrá como pagada de más.
            </p>
          </>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
            Cerrar
          </button>
          {cambian.length > 0 && (
            <button onClick={aplicar} disabled={elegidas.length === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium disabled:opacity-50">
              <Tag size={15} />
              {elegidas.length === 1 ? 'Aplicar a 1 reserva' : `Aplicar a ${elegidas.length} reservas`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

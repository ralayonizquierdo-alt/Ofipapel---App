import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { reservasConTarifaSiguiente } from '../lib/tarifaAnoSiguiente'
import { formatDate } from '../lib/dateUtils'
import { num } from '../lib/formato'
import Modal from './ui/Modal'

const eur = (n: number) => `${num(n, 2)} €`

/**
 * Las reservas que se calcularon con la tarifa del año siguiente, para
 * revisarlas y corregirlas (Luis, 08/11/2026). Ver lib/tarifaAnoSiguiente.ts.
 *
 * Nada se corrige solo: se enseñan con lo que tienen, lo que deberían tener y
 * lo ya cobrado, y se corrigen las que se dejen marcadas. Cuando no queda
 * ninguna, el aviso desaparece.
 */
export default function CorregirTarifaAno() {
  const { reservations, payments, prices, offerPrices, apartments, updateReservation, addPayment, updatePayment, anotaVolcado } = useData()
  const lista = useMemo(
    () => reservasConTarifaSiguiente(reservations, payments, prices, offerPrices),
    [reservations, payments, prices, offerPrices],
  )
  const [abierto, setAbierto] = useState(false)
  /** Las que NO se quieren corregir (por defecto, todas marcadas). */
  const [fuera, setFuera] = useState<Set<string>>(new Set())
  const [hecho, setHecho] = useState('')

  if (!lista.length && !hecho) return null
  const nombre = (id: string) => apartments.find(a => a.id === id)?.name ?? id
  const marcadas = lista.filter(x => !fuera.has(x.r.id))

  function corregir() {
    for (const x of marcadas) {
      updateReservation(x.r.id, { basePrice: x.baseCorrecta, total: x.correcto })
      // El pendiente de cobro se ajusta como al editar la reserva a mano.
      const suyos = payments.filter(p => p.reservationId === x.r.id)
      const pendiente = x.correcto - x.cobrado
      const sinCobrar = suyos.filter(p => !p.received)
      if (sinCobrar.length === 0) {
        if (pendiente > 0.005) addPayment({ reservationId: x.r.id, amount: Math.round(pendiente * 100) / 100, received: false })
      } else {
        updatePayment(sinCobrar[0].id, { amount: Math.max(0, Math.round(pendiente * 100) / 100) })
        sinCobrar.slice(1).forEach(p => updatePayment(p.id, { amount: 0 }))
      }
    }
    anotaVolcado({
      origen: 'correcciones', reservas: marcadas.length,
      resumen: `Importe recalculado con la tarifa de su año (se había usado la del año siguiente): `
        + marcadas.map(x => `${nombre(x.r.apartmentId)} ${formatDate(x.r.checkIn)}: ${eur(x.actual)} → ${eur(x.correcto)}`).join(' · '),
    })
    setHecho(`${marcadas.length} ${marcadas.length === 1 ? 'reserva corregida' : 'reservas corregidas'}`)
    setFuera(new Set())
  }

  return (
    <>
      {lista.length > 0 && (
        <div className="mb-6 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 flex flex-wrap items-center gap-3">
          <AlertTriangle size={18} className="text-amber-600 shrink-0" />
          <div className="flex-1 min-w-[16rem]">
            <p className="text-sm font-semibold text-amber-900">
              {lista.length === 1 ? '1 reserva calculada' : `${lista.length} reservas calculadas`} con la tarifa del año siguiente
            </p>
            <p className="text-xs text-amber-800">Un fallo ya corregido les puso el precio del año que viene. Revísalas y corrígelas.</p>
          </div>
          <button type="button" onClick={() => { setAbierto(true); setHecho('') }}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700">
            Revisar y corregir
          </button>
        </div>
      )}

      {abierto && (
        <Modal title="Reservas con la tarifa del año siguiente" onClose={() => setAbierto(false)} size="xl">
          <div className="space-y-3 text-sm" translate="no">
            {hecho && <p className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-green-900 font-medium">✓ {hecho}. Quedan apuntadas en el Registro.</p>}
            {lista.length > 0 ? (
              <>
                <p className="text-slate-600">
                  Su importe sale de la tabla de Precios del <b>año siguiente</b>. «Correcto» es el de la tabla de <b>su año</b>.
                  Quita la marca a las que se acordaron así, y márcalas como <b>precio pactado</b> en su ficha
                  para que no vuelvan a salir.
                </p>
                <table className="w-full text-sm border border-slate-200">
                  <thead className="bg-slate-50 text-slate-600 text-xs">
                    <tr>
                      <th className="p-2 w-8"></th>
                      <th className="p-2 text-left font-medium">Apartamento</th>
                      <th className="p-2 text-left font-medium">Estancia</th>
                      <th className="p-2 text-right font-medium">Ahora</th>
                      <th className="p-2 text-right font-medium">Correcto</th>
                      <th className="p-2 text-right font-medium">Diferencia</th>
                      <th className="p-2 text-right font-medium">Cobrado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map(x => {
                      const marcada = !fuera.has(x.r.id)
                      const deMas = x.cobrado - x.correcto
                      return (
                        <tr key={x.r.id} className={`border-t border-slate-100 ${marcada ? '' : 'opacity-50'}`}>
                          <td className="p-2 text-center">
                            <input type="checkbox" checked={marcada} aria-label={`Corregir ${nombre(x.r.apartmentId)}`}
                              onChange={() => setFuera(f => { const n = new Set(f); if (n.has(x.r.id)) n.delete(x.r.id); else n.add(x.r.id); return n })} />
                          </td>
                          <td className="p-2 font-medium text-slate-800">{nombre(x.r.apartmentId)}</td>
                          <td className="p-2 text-slate-600">{formatDate(x.r.checkIn)} al {formatDate(x.r.checkOut)} · {x.r.nights} noches</td>
                          <td className="p-2 text-right tabular-nums text-slate-700">{eur(x.actual)}</td>
                          <td className="p-2 text-right tabular-nums font-semibold text-green-700">{eur(x.correcto)}</td>
                          <td className="p-2 text-right tabular-nums text-amber-800">{eur(x.correcto - x.actual)}</td>
                          <td className="p-2 text-right tabular-nums text-slate-700">
                            {eur(x.cobrado)}
                            {deMas > 0.005 && <span className="block text-[11px] text-purple-700">quedará {eur(deMas)} cobrado de más</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setAbierto(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cerrar</button>
                  <button type="button" onClick={corregir} disabled={!marcadas.length}
                    className="px-4 py-2 text-sm font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40">
                    Corregir las marcadas ({marcadas.length})
                  </button>
                </div>
              </>
            ) : (
              <p className="text-slate-600">No queda ninguna.</p>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}

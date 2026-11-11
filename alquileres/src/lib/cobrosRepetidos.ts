import type { Payment, Reservation } from '../types'
import { EJERCICIO_APP } from './cuentas'

/**
 * Cobros que parecen el mismo apuntado dos veces: misma reserva, mismo
 * importe y la misma fecha (o alguno sin fecha). Caso real: el Arenal del
 * 05/11 al 14/11/2026 tenía dos de 791,72 €, uno del 14/11 y otro sin fecha
 * sacado de una foto (Luis, 11/11/2026: «pásalo al dashboard, ya lo revisaré
 * en la oficina»).
 *
 * Con fechas, asientos o meses contables distintos no se avisa: una estancia
 * larga paga cada mes lo mismo (el Piso 3, 1.625 €) y eso no es un repetido. Se quita el aviso
 * borrando el que sobra o diciendo que no están repetidos (`noRepetido`).
 * Solo desde {EJERCICIO_APP}, como el resto de avisos.
 */
export function cobrosRepetidos(reservations: Reservation[], payments: Payment[]) {
  const porReserva = new Map<string, Payment[]>()
  for (const p of payments) {
    if (!p.received || !p.reservationId || p.noRepetido) continue
    const lista = porReserva.get(p.reservationId) ?? []
    lista.push(p)
    porReserva.set(p.reservationId, lista)
  }
  const grupos: { r: Reservation; cobros: Payment[] }[] = []
  for (const [id, lista] of porReserva) {
    const r = reservations.find(x => x.id === id)
    if (!r || r.checkOut < `${EJERCICIO_APP}-01-01`) continue
    const vistos = new Set<string>()
    for (const p of lista) {
      if (vistos.has(p.id)) continue
      const iguales = lista.filter(q => Math.abs(q.amount - p.amount) < 0.005
        && (!q.paymentDate || !p.paymentDate || q.paymentDate === p.paymentDate)
        // Con asientos distintos o en meses contables distintos son dos
        // cobros: el Piso 3 de abril y de mayo (010426P3 y 040526P3) llevan
        // la misma fecha por un error del Excel, y no son el mismo.
        && (q === p || !q.entryNumber || !p.entryNumber || q.entryNumber === p.entryNumber)
        && (q === p || !q.mes || !p.mes || q.mes === p.mes))
      if (iguales.length > 1) {
        iguales.forEach(q => vistos.add(q.id))
        grupos.push({ r, cobros: iguales })
      }
    }
  }
  return grupos
}

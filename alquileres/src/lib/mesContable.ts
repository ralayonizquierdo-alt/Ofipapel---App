import type { Payment, Reservation } from '../types'

/** El día anterior a una fecha «AAAA-MM-DD», en el mismo formato. */
function diaAnterior(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Mes al que pertenece un cobro, «AAAA-MM».
 *
 * Luis, 09/11/2026: «la asesoría paga según reserva» y declara por trimestres;
 * lo que tiene que cuadrar es la cifra del año. La reserva del 30/09 pagada el
 * 05/10 es de septiembre, y la de diciembre pagada el 5 de enero, de diciembre:
 * contarla por la fecha del pago la mandaba al año siguiente. Por eso:
 *
 * 1. Si el cobro trae el mes contable del Excel, ese.
 * 2. Si cuelga de una reserva, el mes del pago **dentro de la estancia**: pagado
 *    después de la salida, el último mes de la estancia; antes de la entrada
 *    (no pasa, nunca pagan por adelantado), el primero. Una estancia de varios
 *    meses pagada mes a mes conserva el mes de cada pago.
 * 3. Si no, el mes de la fecha del pago.
 */
export function mesContable(p: Payment, r?: Reservation): string | undefined {
  if (p.mes) return p.mes
  const pago = p.paymentDate?.slice(0, 7)
  if (!pago || !r?.checkIn || !r.checkOut || r.status === 'cancelada') return pago
  const primero = r.checkIn.slice(0, 7)
  const ultimo = r.checkOut > r.checkIn ? diaAnterior(r.checkOut).slice(0, 7) : primero
  if (pago < primero) return primero
  if (pago > ultimo) return ultimo
  return pago
}

/** `mesContable` con las reservas a mano: busca la del cobro por su id. */
export function mesContableCon(reservations: Reservation[]) {
  const porId = new Map(reservations.map(r => [r.id, r]))
  return (p: Payment) => mesContable(p, porId.get(p.reservationId))
}

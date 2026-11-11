import type { Payment, Reservation } from '../types'

/**
 * Cobros que entraron sin reserva y esperan a que alguien los mire.
 *
 * Los de Airbnb (Arenal 2B) se anotan así: la gestora no manda a tiempo la
 * documentación y no hay forma fiable de saber de qué estancia es cada
 * transferencia, así que no se unen solos a ninguna (Luis, 11/11/2026: «de
 * momento no unas a otra reserva, manda el aviso al dashboard como que no
 * tiene reserva hasta que pueda revisar todo»). Avisan en el Dashboard hasta
 * que se unen a una estancia o se dicen revisados.
 */
export function cobrosSinReserva(payments: Payment[]): Payment[] {
  return payments
    .filter(p => p.received && !p.reservationId && p.sinRevisar)
    .sort((a, b) => (a.paymentDate ?? '').localeCompare(b.paymentDate ?? ''))
}

const masDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Las estancias del mismo piso entre las que elegir: las que empezaron hasta
 * dos meses antes del pago o empiezan en la semana siguiente, de la más
 * reciente a la más antigua.
 */
export function estanciasPosibles(p: Payment, reservations: Reservation[]): Reservation[] {
  const pago = p.paymentDate ?? p.createdAt.slice(0, 10)
  const desde = masDias(pago, -60)
  const hasta = masDias(pago, 7)
  return reservations
    .filter(r => r.apartmentId === p.apartmentId && r.status !== 'cancelada'
      && r.checkIn >= desde && r.checkIn <= hasta)
    .sort((a, b) => b.checkIn.localeCompare(a.checkIn))
}

/**
 * La que probablemente es, solo para proponerla en el desplegable: nunca se
 * une sola. Airbnb paga al día siguiente de la entrada (o cada mes en una
 * estancia larga): la que ya ha empezado, o empezó hace 3 días como mucho; si
 * una tiene justo ese neto, esa.
 */
export function estanciaSugerida(p: Payment, reservations: Reservation[]): Reservation | null {
  if (!p.paymentDate) return null
  const pago = p.paymentDate
  const limite = masDias(pago, -3)
  const posibles = estanciasPosibles(p, reservations)
    .filter(r => r.checkIn <= pago && (r.checkOut >= pago || r.checkIn >= limite))
  return posibles.find(r => Math.abs(r.total - p.amount) < 0.02) ?? posibles[0] ?? null
}

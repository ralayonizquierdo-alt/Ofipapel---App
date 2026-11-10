import type { Payment, Reservation } from '../types'
import { EJERCICIO_APP } from './cuentas'
import { porApartamento } from './apartamentos'

/**
 * Reservas anuladas que se quedaron con dinero cobrado.
 *
 * Al anular, la reserva no se borra y conserva sus cobros (ver «Anulaciones» en
 * la Operativa). Ese dinero hay que devolverlo o pasarlo a otra reserva, y si
 * nadie lo mira se queda ahí olvidado. Por eso avisan en rojo en el Dashboard
 * hasta que se quitan o se mueven esos cobros, o se pulsa «Ya está resuelto» en
 * la ficha (Luis, 08/11/2026).
 *
 * Solo las que acaban en 2026 o después: las anulaciones antiguas que trajo el
 * Excel no son para revisar ahora (misma regla que el resto de avisos).
 */
export function cobradoDeReserva(id: string, payments: Payment[]): number {
  return payments.filter(p => p.reservationId === id && p.received).reduce((s, p) => s + p.amount, 0)
}

export function anuladasConCobros(reservations: Reservation[], payments: Payment[]) {
  return reservations
    .filter(r => r.status === 'cancelada' && !r.anulacionResuelta && r.checkOut > `${EJERCICIO_APP}-01-01`)
    .map(r => ({ r, cobrado: cobradoDeReserva(r.id, payments) }))
    .filter(x => x.cobrado > 0.005)
    .sort((a, b) => porApartamento(a.r, b.r))
}

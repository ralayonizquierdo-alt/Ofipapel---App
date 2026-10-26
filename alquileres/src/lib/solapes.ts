import type { Reservation } from '../types'

/**
 * Reservas que se pisan: el mismo apartamento alquilado dos veces a la vez.
 *
 * Esto no es un descuadre de cuentas que uno revisa cuando puede: es un error
 * que no puede existir. Si dos estancias comparten una noche en el mismo piso,
 * o sobra una (una anulación que no se llegó a anular, un aviso subido dos
 * veces) o hay dos clientes a los que se les ha dado la misma llave.
 *
 * Nació de un caso real (26/10/2026): el Arenal salía con tres estancias
 * encima, y resultó ser una reserva anulada que nunca se marcó como anulada.
 * El planning lo enseñaba, pero había que ir a mirarlo; ahora salta solo.
 *
 * Una salida y una entrada el mismo día NO se pisan: el `checkOut` es
 * exclusivo, esa noche ya no duerme nadie.
 */

export interface Solape {
  /** Identificador estable, para no repetir el mismo aviso. */
  id: string
  apartmentId: string
  a: Reservation
  b: Reservation
  /** Las noches que se comparten, en ISO. */
  desde: string
  hasta: string
  noches: number
}

const DIA = 86400000
const enDias = (iso: string) =>
  Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))

/**
 * Todos los pares de reservas que se pisan, del más reciente al más antiguo.
 *
 * Se miran todas, no solo las del ejercicio en curso: una reserva vieja mal
 * anulada sigue siendo un error, y además ensucia el planning de ese mes.
 */
export function solapes(reservations: Reservation[]): Solape[] {
  const vivas = reservations
    .filter(r => r.status !== 'cancelada' && r.checkIn && r.checkOut && r.checkIn < r.checkOut)
    .sort((x, y) => x.checkIn.localeCompare(y.checkIn))

  const porApto = new Map<string, Reservation[]>()
  for (const r of vivas) {
    const lista = porApto.get(r.apartmentId) ?? []
    lista.push(r)
    porApto.set(r.apartmentId, lista)
  }

  const fuera: Solape[] = []
  for (const [apartmentId, lista] of porApto) {
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        const a = lista[i], b = lista[j]
        // Ordenadas por entrada: en cuanto una empieza después de que acabe la
        // primera, ninguna de las siguientes puede pisarla.
        if (b.checkIn >= a.checkOut) break
        const desde = a.checkIn > b.checkIn ? a.checkIn : b.checkIn
        const hasta = a.checkOut < b.checkOut ? a.checkOut : b.checkOut
        fuera.push({
          id: [a.id, b.id].sort().join('|'),
          apartmentId, a, b, desde, hasta,
          noches: Math.max(1, Math.round((enDias(hasta) - enDias(desde)) / DIA)),
        })
      }
    }
  }

  return fuera.sort((x, y) => y.desde.localeCompare(x.desde))
}

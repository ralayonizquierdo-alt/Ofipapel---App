import type { Reservation } from '../types'

/**
 * El huésped y cuántos son, para enseñarlo en una línea.
 *
 * El número de personas no siempre está en su campo: los avisos de la
 * inmobiliaria que se pegaban antes del 26/10/2026 lo metían dentro del nombre
 * («Rosario (4 personas)»), así que se lee también de ahí. Lo que se guarda a
 * partir de ahora va en `guests`, que es donde tiene que estar.
 */

/** Cuántas personas, mire donde mire. 0 si no consta. */
export function personasDe(r: Pick<Reservation, 'guests' | 'guestName'>): number {
  if (r.guests && r.guests > 0) return r.guests
  const m = (r.guestName ?? '').match(/(\d+)\s*personas?/i)
  return m ? Number(m[1]) : 0
}

/** El nombre sin el «(4 personas)» pegado detrás, que ya va en su columna. */
export function nombreDe(r: Pick<Reservation, 'guests' | 'guestName'>): string {
  return (r.guestName ?? '').replace(/\s*\(?\s*\d+\s*personas?\s*\)?/i, '').trim()
}

/** «Rosario · 4 pers.», lo que cabe en la franja del planning. */
export function huespedYPersonas(r: Pick<Reservation, 'guests' | 'guestName'>): string {
  const nombre = nombreDe(r)
  const personas = personasDe(r)
  return [nombre, personas ? `${personas} pers.` : ''].filter(Boolean).join(' · ')
}

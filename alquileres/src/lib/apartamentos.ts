/**
 * El orden en que se nombran los apartamentos, y que vale para toda la app.
 *
 * No es alfabético ni por importe: es el orden de la casa, el mismo del Excel
 * y el que usa el propietario al hablar de ellos. Lo pidió explícitamente para
 * todas las pantallas, así que se ordena una sola vez al cargar los datos
 * (`contexts/DataContext.tsx`) y de ahí sale ya ordenado a todas partes.
 *
 * Un apartamento que no esté en la lista —uno nuevo— va al final, por su
 * nombre, en vez de desaparecer o colarse por delante.
 */
export const ORDEN_APARTAMENTOS = ['104', '105', '106', '203', '204', '402', 'P3', 'AP2B']

function posicion(id: string): number {
  const i = ORDEN_APARTAMENTOS.indexOf(id)
  return i === -1 ? ORDEN_APARTAMENTOS.length : i
}

/** Compara dos apartamentos por el orden de la casa. */
export function comparaApartamentos(
  a: { id: string; name?: string },
  b: { id: string; name?: string },
): number {
  const d = posicion(a.id) - posicion(b.id)
  return d !== 0 ? d : (a.name ?? a.id).localeCompare(b.name ?? b.id)
}

/** El mismo orden, aplicado a una lista cualquiera que lleve `id`. */
export function ordenaApartamentos<T extends { id: string; name?: string }>(lista: T[]): T[] {
  return [...lista].sort(comparaApartamentos)
}

/** Para ordenar cosas que llevan `apartmentId` en vez de `id`. */
export function ordenDeApartamento(apartmentId: string): number {
  return posicion(apartmentId)
}

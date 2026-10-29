/**
 * Qué apartamentos van sin limpieza.
 *
 * **El Arenal (AP-2-B) no lleva los 40 €.** Lo gestiona SOC Properties y se
 * alquila por Airbnb: la limpieza la cobra Airbnb y se la queda la gestora, y
 * lo que llega al banco es el neto. Cobrarle 40 € encima sería cobrarla dos
 * veces.
 *
 * Esto estaba escrito en un solo sitio —el lector del informe anual de Airbnb,
 * que guardaba `cleaningFee: 0`—, pero no como regla del apartamento. Así que
 * cualquier reserva del Arenal metida por otro camino (pegando el aviso, el
 * formulario, la subida de reservas) se llevaba los 40 € de la tarifa, y la
 * limpieza volvía a aparecer (propietario, 29/10/2026: «habíamos dicho que ese
 * apartamento no llevaba limpieza»). Ahora la regla vive aquí y la usan todos.
 */

/** Los que no llevan limpieza, por id. */
export const SIN_LIMPIEZA = ['AP2B']

/** ¿Este apartamento va sin limpieza? */
export function vaSinLimpieza(apartmentId: string | null | undefined): boolean {
  return !!apartmentId && SIN_LIMPIEZA.includes(apartmentId)
}

/**
 * La limpieza que le toca a una reserva: la de su tarifa, o nada si el
 * apartamento va sin ella.
 */
export function limpiezaDe(apartmentId: string | null | undefined, deLaTarifa: number): number {
  if (vaSinLimpieza(apartmentId)) return 0
  const n = Number(deLaTarifa)
  return Number.isFinite(n) ? n : 0
}

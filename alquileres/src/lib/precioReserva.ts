import type { OfferPrice, PrecioPactado, PriceEntry, Reservation } from '../types'
import { buscaTarifa, calcTotal } from './priceCalc'
import { limpiezaDe } from './limpieza'
import { EJERCICIO_APP } from './cuentas'

/**
 * ¿De dónde sale el importe de una reserva: de la tarifa, de un precio pactado,
 * o de ninguno de los dos?
 *
 * Lo pidió Luis el 06/11/2026, con el 106 delante (4.490 € por tarifa, 2.400 € en
 * la reserva): «yo sé lo que hay, tiene que decírmelo la aplicación». La reserva
 * guarda el importe, no la cuenta que lo dio, así que se rehace la cuenta con la
 * misma tarifa que usan el formulario y el cuadro (`buscaTarifa()`, ofertas
 * incluidas) y se compara con lo guardado.
 *
 * Fuera de la comparación queda lo que nunca va a cuadrar con la tarifa y no es
 * un error: el Arenal, cuyo importe es el neto que paga SOC por Airbnb, y las
 * estancias que acabaron antes de la app, que llevan importes estimados del
 * calendario.
 */

/** Pisos cuyo precio no sale de la tarifa de la casa: el Arenal lo pone SOC por Airbnb. */
const PRECIO_DE_FUERA = ['AP2B']

/** Diferencia que se da por buena: redondeos de céntimos. */
// Menos de 1 €: la tarifa por noche lleva decimales y el importe se apuntó
// redondeado. El Ático 402 del 02/07/2026 avisaba por 0,11 € (1.390,25 frente a
// 1.390,36), y eso no es un descuadre (Luis, 08/11/2026).
const TOLERANCIA = 1

export type EstadoPrecio =
  | { tipo: 'tarifa'; esperado: number }
  | { tipo: 'pactado'; pactado: PrecioPactado; esperado: number | null; diferencia: number | null }
  | { tipo: 'descuadre'; esperado: number; diferencia: number }
  | { tipo: 'sin-tarifa' }
  | { tipo: 'fuera'; motivo: string }

const redondea = (n: number) => Math.round(n * 100) / 100

/** Lo que costaría la estancia hoy por la lista de Precios, con su descuento. */
export function importeSegunTarifa(
  r: Pick<Reservation, 'apartmentId' | 'checkIn' | 'nights' | 'discountPct'>,
  prices: PriceEntry[],
  offerPrices: OfferPrice[],
): number | null {
  const t = buscaTarifa(prices, r.apartmentId, r.checkIn, r.nights, offerPrices)
  if (!t) return null
  const deLaTarifa = Number(t.entry.cleaningFee)
  const limpieza = limpiezaDe(r.apartmentId, Number.isFinite(deLaTarifa) ? deLaTarifa : 40)
  return calcTotal(t.base, limpieza, Number(r.discountPct) || 0)
}

export function estadoPrecio(r: Reservation, prices: PriceEntry[], offerPrices: OfferPrice[]): EstadoPrecio {
  const esperado = importeSegunTarifa(r, prices, offerPrices)
  const diferencia = esperado === null ? null : redondea((Number(r.total) || 0) - esperado)

  // Lo anotado como pactado manda: se dijo a propósito.
  if (r.precioPactado?.motivo?.trim()) {
    return { tipo: 'pactado', pactado: r.precioPactado, esperado, diferencia }
  }
  if (r.status === 'cancelada') return { tipo: 'fuera', motivo: 'Reserva anulada.' }
  if (PRECIO_DE_FUERA.includes(r.apartmentId)) {
    return { tipo: 'fuera', motivo: 'El precio lo pone SOC por Airbnb; se guarda el neto que paga la gestora.' }
  }
  // Solo quedan fuera las que acabaron antes de 2026. Una que entra en 2025 y
  // sigue en 2026 sí se compara (Luis, 06/11/2026, con el 106 del 30/11/25 al
  // 27/02/26 delante: 2.400 € frente a 4.490 € por tarifa, sin ningún aviso).
  // La salida no cuenta como noche: la que sale el 01/01 acabó en el año anterior.
  if (r.checkOut <= `${EJERCICIO_APP}-01-01`) {
    return { tipo: 'fuera', motivo: `Acabó antes de ${EJERCICIO_APP}: el importe viene estimado del calendario.` }
  }
  if (esperado === null || diferencia === null) return { tipo: 'sin-tarifa' }
  if (Math.abs(diferencia) <= TOLERANCIA) return { tipo: 'tarifa', esperado }
  return { tipo: 'descuadre', esperado, diferencia }
}

/** «2.090,00 € menos que la tarifa» / «150,00 € más que la tarifa». */
export function textoDiferencia(diferencia: number, eur: (n: number) => string): string {
  return `${eur(Math.abs(diferencia))} ${diferencia < 0 ? 'menos' : 'más'} que la tarifa`
}

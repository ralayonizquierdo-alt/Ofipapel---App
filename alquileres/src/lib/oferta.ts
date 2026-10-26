import type { OfferPrice, PriceEntry, Reservation } from '../types'
import { buscaTarifa } from './priceCalc'

/**
 * Si una estancia está cogiendo precios de una tarifa de oferta.
 *
 * Las ofertas mandan sobre la tarifa general (`buscaTarifa()`), pero eso pasa
 * por debajo y sin verse: lo pidió el propietario el 26/10/2026 —«si los
 * precios que coge una estancia son de oferta debería tener una marca para
 * saberlo»—, porque un importe más bajo de lo normal, sin explicación al lado,
 * parece un error.
 *
 * La reserva no guarda qué tarifa se le aplicó: guarda el importe. Así que se
 * vuelve a hacer la cuenta y se compara:
 *
 *  · `cuadra` — hay oferta para ese mes y el importe guardado es el que sale
 *    de ella: la estancia va a precio de oferta, sin duda.
 *  · sin `cuadra` — hay oferta para esas fechas pero el importe no sale de
 *    ella (se pactó a mano, o la reserva es anterior a la oferta). Se avisa
 *    igual, porque es justo lo que hay que mirar.
 */
export interface OfertaDeReserva {
  oferta: OfferPrice
  /** El importe guardado es el que sale de la oferta. */
  cuadra: boolean
  /** Lo que daría la oferta hoy: base + limpieza, con el descuento aplicado. */
  total: number
}

export function ofertaDeReserva(
  r: Pick<Reservation, 'apartmentId' | 'checkIn' | 'nights' | 'basePrice' | 'cleaningFee' | 'discountPct' | 'total'>,
  prices: PriceEntry[],
  offerPrices: OfferPrice[],
): OfertaDeReserva | null {
  if (!offerPrices.length) return null
  const t = buscaTarifa(prices, r.apartmentId, r.checkIn, r.nights, offerPrices)
  if (!t?.oferta) return null

  const dto = Number(r.discountPct) || 0
  const limpieza = Number(t.entry.cleaningFee) || 0
  const total = Math.round((t.base * (1 - dto / 100) + limpieza) * 100) / 100
  // Al céntimo no: una reserva vieja puede llevar la limpieza de otro año.
  const cuadra = Math.abs((Number(r.basePrice) || 0) - t.base) < 0.02

  return { oferta: t.oferta, cuadra, total }
}

/** El nombre de una oferta, para enseñarlo en una línea. */
export function nombreOferta(o: OfferPrice): string {
  return o.label?.trim() || `Oferta ${String(o.month).padStart(2, '0')}/${o.year}`
}

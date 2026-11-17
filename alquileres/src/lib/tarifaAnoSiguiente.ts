import type { OfferPrice, Payment, PriceEntry, Reservation } from '../types'
import { buscaTarifa, calcTotal, getApartmentType, precioPorNoches, tarifaDelAnio } from './priceCalc'
import { anioDeTarifa, getSeason } from './dateUtils'
import { limpiezaDe } from './limpieza'
import { EJERCICIO_APP } from './cuentas'
import { porApartamento } from './apartamentos'

/**
 * Reservas que se calcularon con la tarifa del AÑO SIGUIENTE.
 *
 * Hasta el 06/11/2026 la aplicación, al poner el precio a una reserva, cogía la
 * primera tarifa del tipo de apartamento que encontraba, y a veces era la del
 * año siguiente: el 204 del 08/11/2026 se calculó con «1 Mes» de 2027 (1.650 €)
 * en vez del de 2026 (1.500 €) y quedó en 2.185 € en vez de 1.990 € (Luis,
 * 08/11/2026: «tienes que revisar todos los importes de este tipo»). El fallo
 * está corregido; esto encuentra las que se quedaron mal.
 *
 * Y al revés del 06/11 al 17/11/2026: aquel arreglo hizo que las entradas de
 * noviembre y diciembre cogieran la tabla de invierno del año de entrada, que es
 * la del invierno PASADO (el 203 del 13/11/2026 a 650 € en vez de 695 €). Desde
 * el 17/11/2026 la tabla buena es la de anioDeTarifa() y esto encuentra también
 * esas.
 *
 * El rastro es exacto: el importe coincide (±1 €) con lo que da la otra tabla
 * de esa temporada y no con la que le toca. No se tocan las de precio pactado, las
 * anuladas, el Arenal ni las que acabaron antes de 2026.
 */
const TOLERANCIA = 1

export interface ConTarifaSiguiente {
  r: Reservation
  /** Lo que tiene ahora (sacado de la tabla de otro año). */
  actual: number
  /** Lo que da la tabla de su año: el importe bueno. */
  correcto: number
  /** Base de alojamiento correcta, con la tabla de su año. */
  baseCorrecta: number
  cobrado: number
}

function importe(r: Reservation, prices: PriceEntry[], offerPrices: OfferPrice[]) {
  const t = buscaTarifa(prices, r.apartmentId, r.checkIn, r.nights, offerPrices)
  if (!t) return null
  const limpieza = limpiezaDe(r.apartmentId, Number(t.entry.cleaningFee) || 40)
  return { base: t.base, total: calcTotal(t.base, limpieza, Number(r.discountPct) || 0), oferta: !!t.oferta }
}

export function reservasConTarifaSiguiente(
  reservations: Reservation[], payments: Payment[], prices: PriceEntry[], offerPrices: OfferPrice[],
): ConTarifaSiguiente[] {
  const lista: ConTarifaSiguiente[] = []
  for (const r of reservations) {
    if (r.status === 'cancelada' || r.precioPactado?.motivo?.trim()) continue
    if (r.apartmentId === 'AP2B' || r.checkOut <= `${EJERCICIO_APP}-01-01`) continue
    const anio = Number(r.checkIn.slice(0, 4))
    const suyo = importe(r, prices, offerPrices)
    // Con oferta del mes manda la oferta, antes y ahora: ahí no hubo fallo.
    if (!suyo || suyo.oferta) continue
    // La otra tabla que cogía el fallo: la del año siguiente si la buena es la
    // del año de entrada; la del año de entrada si la buena es la siguiente.
    const otroAnio = anioDeTarifa(r.checkIn) === anio ? anio + 1 : anio
    const otra = tarifaDelAnio(prices, getApartmentType(r.apartmentId), getSeason(r.checkIn), otroAnio)
    if (!otra) continue
    const otraBase = precioPorNoches(otra, r.nights).base
    const siguiente = { total: calcTotal(otraBase, limpiezaDe(r.apartmentId, Number(otra.cleaningFee) || 40), Number(r.discountPct) || 0) }
    const total = Number(r.total) || 0
    if (Math.abs(total - siguiente.total) > TOLERANCIA) continue
    if (Math.abs(total - suyo.total) <= TOLERANCIA) continue
    const cobrado = payments.filter(p => p.reservationId === r.id && p.received).reduce((s, p) => s + p.amount, 0)
    lista.push({ r, actual: total, correcto: suyo.total, baseCorrecta: suyo.base, cobrado })
  }
  return lista.sort((a, b) => porApartamento(a.r, b.r))
}

import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from './firebase'
import { usuarioActual } from './auth'
import { buscaTarifa, calcPrices, getApartmentType } from './priceCalc'
import { MONTH_NAMES_ES, getSeason } from './dateUtils'
import type { OfferPrice, PriceEntry } from '../types'

/**
 * «Comparar con Booking» (Luis, 13/11/2026 y 16/11/2026).
 *
 * El anuncio de Booking («Apartments Los Playeros») lo lleva la agencia, y Luis
 * quiere vigilar que el precio que publica no se aleje del nuestro. Booking no
 * deja que un programa mire sus precios sin una persona delante, así que el
 * precio de Booking se apunta a mano: apartamento, una semana de fechas y lo
 * que dice Booking por esa semana. Lo nuestro lo calcula la app con la tarifa
 * de esas fechas (oferta incluida): precio web de 1 semana + limpieza.
 *
 * Se comparan solo semanas de 7 noches: es el tramo que se publica y el único
 * en el que el precio de Booking y el nuestro hablan de lo mismo.
 */

/** Las noches que se comparan: siempre una semana. */
export const NOCHES_BOOKING = 7

/**
 * Cómo llama Booking a cada apartamento. Los fijó Luis con las fotos el
 * 13/11/2026 y la agencia los cambió el 16/11: desde entonces los dos estudios
 * se llaman igual, y el 203 y el 204 también, así que en Booking no se
 * distinguen (sí por precio: el mismo para los dos de cada pareja).
 */
export const TIPO_BOOKING: Record<string, string> = {
  '104': 'Estudio con terraza 35 m²',
  '105': 'Estudio con terraza 35 m²',
  '106': 'Apartamento con balcón 50 m²',
  '203': 'Apartamento de 2 dormitorios con terraza 65 m²',
  '204': 'Apartamento de 2 dormitorios con terraza 65 m²',
  '402': 'Ático 70 m²',
}

/** Los que están en Booking, en el orden de la casa. El Piso 3 y el Arenal no. */
export const APARTAMENTOS_BOOKING = Object.keys(TIPO_BOOKING)

/** Una consulta: lo que decía Booking ese día para esa semana. */
export interface PrecioBooking {
  id: string
  apartmentId: string
  /** Entrada de la semana consultada (AAAA-MM-DD). La salida es 7 noches después. */
  entrada: string
  /** Precio total que daba Booking por la semana, en €. */
  precio: number
  /** Día en que se miró Booking (AAAA-MM-DD). */
  consultado: string
  por?: string
  nota?: string
}

export const COLECCION_BOOKING = 'preciosBooking'

/** Las consultas, las más recientes primero. `null` mientras llegan de la nube. */
export function usePreciosBooking(): PrecioBooking[] | null {
  const [lista, setLista] = useState<PrecioBooking[] | null>(null)
  useEffect(() => onSnapshot(collection(db, COLECCION_BOOKING), s => {
    setLista(s.docs.map(d => d.data() as PrecioBooking).sort(masReciente))
  }, () => setLista([])), [])
  return lista
}

/** Por día de consulta y, dentro del mismo día, la última apuntada. */
function masReciente(a: PrecioBooking, b: PrecioBooking): number {
  return b.consultado.localeCompare(a.consultado) || b.id.localeCompare(a.id)
}

export async function apuntaPrecioBooking(datos: Omit<PrecioBooking, 'id' | 'por'>): Promise<void> {
  const id = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const item: PrecioBooking = { id, ...datos, por: usuarioActual() ?? undefined }
  await setDoc(doc(db, COLECCION_BOOKING, id), JSON.parse(JSON.stringify(item)))
}

export async function quitaPrecioBooking(id: string): Promise<void> {
  await deleteDoc(doc(db, COLECCION_BOOKING, id))
}

/**
 * El precio de Booking «incluye impuestos y cargos» (visto el 16/11/2026), así
 * que a lo nuestro se le suma el IGIC para comparar lo mismo con lo mismo.
 */
export const IGIC = 0.07

/** Lo nuestro para esa semana: web de 1 semana + limpieza + IGIC. */
export interface PrecioNuestro {
  /** Web + limpieza + IGIC: lo que se compara con Booking. */
  total: number
  /** Web (publicar) + limpieza, sin IGIC. */
  sinIgic: number
  web: number
  limpieza: number
  igic: number
  /** «Invierno 2026», «Verano 2027» u «Oferta octubre 2026». */
  tarifa: string
  /**
   * El año de las fechas aún no tiene tarifa y se ha usado la del año más
   * reciente de esa temporada (Booking publica el verano siguiente antes de
   * que se haga la tarifa en enero).
   */
  deOtroAnio?: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function precioNuestro(
  prices: PriceEntry[], offerPrices: OfferPrice[], apartmentId: string, entrada: string,
): PrecioNuestro | null {
  let t = buscaTarifa(prices, apartmentId, entrada, NOCHES_BOOKING, offerPrices)
  let deOtroAnio: number | undefined
  if (!t) {
    // Sin tarifa de ese año: la última que haya de esa temporada y tipo, la
    // misma regla que usa Precios al preparar un año nuevo.
    const y = Number(entrada.slice(0, 4))
    const ultima = prices
      .filter(p => p.season === getSeason(entrada) && p.apartmentType === getApartmentType(apartmentId) && p.year < y)
      .sort((a, b) => b.year - a.year)[0]
    if (!ultima) return null
    t = buscaTarifa(prices, apartmentId, `${ultima.year}${entrada.slice(4)}`, NOCHES_BOOKING, [])
    if (!t) return null
    deOtroAnio = y
  }
  const limpieza = t.entry.cleaningFee
  const web = calcPrices(t.base, limpieza).webPrice
  const sinIgic = r2(web + limpieza)
  const igic = r2(sinIgic * IGIC)
  const tarifa = t.oferta
    ? `Oferta ${MONTH_NAMES_ES[t.oferta.month - 1].toLowerCase()} ${t.oferta.year}`
    : `${t.entry.season === 'VERANO' ? 'Verano' : 'Invierno'} ${t.entry.year}`
      + (deOtroAnio ? ` (aún no hay ${deOtroAnio})` : '')
  return { total: r2(sinIgic + igic), sinIgic, web, limpieza, igic, tarifa, deOtroAnio }
}

/** «2026-11»: el mes de un día, para saber si este mes ya se miró Booking. */
export function mesDe(dia: string): string {
  return dia.slice(0, 7)
}

/** ¿Se ha apuntado alguna consulta este mes? */
export function miradoEsteMes(lista: PrecioBooking[], hoy = new Date()): boolean {
  const mes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  return lista.some(p => mesDe(p.consultado) === mes)
}

import type { PriceEntry, PriceCalculation, ApartmentType, StayType } from '../types'
import { getSeason } from './dateUtils'

const CHANNEL_FEE = 0.15
const CLEANING_FEE = 40
const DISCOUNT_DIRECT = 0.10

export function getApartmentType(apartmentId: string): ApartmentType {
  if (apartmentId === '402') return '2BR_ATICO'
  if (apartmentId === 'P3' || apartmentId === 'PISO3') return '3BR'
  if (['106', '203', '204'].includes(apartmentId)) return '2BR'
  return '1BR'
}

export function getBasePrice(priceEntry: PriceEntry, stayType: StayType): number {
  switch (stayType) {
    case '1semana': return priceEntry.price1week
    case '2semanas': return priceEntry.price2weeks
    case '3semanas': return priceEntry.price3weeks
    case '1mes': return priceEntry.price1month
    case 'directo': return priceEntry.price1month * 0.9
    default: return priceEntry.price1week
  }
}

export function calcExtension(contractedType: StayType, priceEntry: PriceEntry, extraDays: number): number {
  const basePrice = getBasePrice(priceEntry, contractedType)
  const baseDays = stayTypeDays(contractedType)
  return (basePrice / baseDays) * extraDays
}

/** Los cuatro tramos con los que se tarifica. 'directo' y 'otro' no son tramos. */
export type Tramo = '1semana' | '2semanas' | '3semanas' | '1mes'

/**
 * Tramo que corresponde a una estancia, según la regla del propietario:
 * siempre se baja al tramo más cercano por debajo.
 *
 *    7 – 13 noches → 1 semana
 *   14 – 20        → 2 semanas
 *   21 – 29        → 3 semanas
 *   30 o más       → 1 mes
 *
 * Por debajo de 7 noches no hay tramo definido; se usa el de 1 semana, que es
 * el mismo criterio (bajar al más cercano) llevado al extremo inferior.
 */
export function tramoPorNoches(nights: number): Tramo {
  if (nights >= 30) return '1mes'
  if (nights >= 21) return '3semanas'
  if (nights >= 14) return '2semanas'
  return '1semana'
}

export interface PrecioTramo {
  tramo: Tramo
  /** Días que cubre el tramo: 7, 14, 21 o 30. */
  diasTramo: number
  /** Precio de tarifa del tramo, sin prorratear. */
  precioTramo: number
  /** Precio base de la estancia: precioTramo / diasTramo × noches. */
  base: number
}

/**
 * Precio base de una estancia. El precio de tarifa nunca se cobra tal cual: se
 * divide entre los días del tramo y se multiplica por las noches reales.
 * Ejemplo del propietario: 10 noches con tarifa de 1 semana de 495 €
 * → 495 / 7 × 10 = 707,14 €.
 */
export function precioPorNoches(priceEntry: PriceEntry, nights: number): PrecioTramo {
  const tramo = tramoPorNoches(nights)
  const diasTramo = stayTypeDays(tramo)
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
  const precioTramo = num({
    '1semana': priceEntry.price1week,
    '2semanas': priceEntry.price2weeks,
    '3semanas': priceEntry.price3weeks,
    '1mes': priceEntry.price1month,
  }[tramo])
  const noches = Number.isFinite(nights) && nights > 0 ? nights : 0
  return {
    tramo,
    diasTramo,
    precioTramo,
    base: Math.round((precioTramo / diasTramo) * noches * 100) / 100,
  }
}

export function stayTypeDays(stayType: StayType): number {
  switch (stayType) {
    case '1semana': return 7
    case '2semanas': return 14
    case '3semanas': return 21
    case '1mes': return 30
    case 'directo': return 30
    default: return 7
  }
}

/**
 * La tarifa que toca aplicar a una estancia: busca en la lista de precios la
 * del tipo de apartamento y la temporada de la fecha de entrada, y prorratea.
 * Devuelve null si no hay precios cargados para ese año.
 */
export function buscaTarifa(
  prices: PriceEntry[], apartmentId: string, checkIn: string, nights: number,
): (PrecioTramo & { entry: PriceEntry }) | null {
  if (!apartmentId || !checkIn || !(nights > 0)) return null
  const entrada = new Date(checkIn)
  if (Number.isNaN(entrada.getTime())) return null
  const season = getSeason(entrada)
  const aptType = getApartmentType(apartmentId)
  const year = entrada.getFullYear()
  const entry = prices.find(p =>
    p.apartmentType === aptType && p.season === season &&
    (p.year === year || p.year === year + 1),
  )
  if (!entry) return null
  return { entry, ...precioPorNoches(entry, nights) }
}

export const TRAMO_LABEL: Record<Tramo, string> = {
  '1semana': '1 semana', '2semanas': '2 semanas', '3semanas': '3 semanas', '1mes': '1 mes',
}

const eur = (n: number) =>
  `${(Number.isFinite(n) ? n : 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

/**
 * Explica en texto llano de dónde sale el total de una reserva, paso a paso.
 * Es solo informativo —no interviene en ningún cálculo—, pero deja por escrito
 * qué tarifa y qué cuentas se aplicaron, que es lo que hace falta el día que
 * los precios cambien y haya que entender una reserva antigua.
 */
export function lineasPrecio(p: {
  nights: number
  basePrice: number
  cleaningFee: number
  discountPct: number
  tarifa?: { tramo: Tramo; precioTramo: number; diasTramo: number } | null
  pactado?: boolean
}): string[] {
  const base = Number.isFinite(p.basePrice) ? p.basePrice : 0
  const limpieza = Number.isFinite(p.cleaningFee) ? p.cleaningFee : 0
  const dto = Number.isFinite(p.discountPct) ? p.discountPct : 0
  const conDto = Math.round(base * (1 - dto / 100) * 100) / 100
  const lineas: string[] = []

  if (p.tarifa) {
    const { tramo, precioTramo, diasTramo } = p.tarifa
    lineas.push(
      `Tarifa de ${TRAMO_LABEL[tramo]} (${eur(precioTramo)}) ÷ ${diasTramo} días × ${p.nights} noches = ${eur(base)}`,
    )
  } else if (p.pactado) {
    lineas.push(`Precio pactado a mano, sin aplicar la tarifa por tramos: ${eur(base)}`)
  } else {
    lineas.push(`Precio base: ${eur(base)}`)
  }

  if (dto > 0) lineas.push(`Descuento del ${dto} %: ${eur(base)} − ${eur(base - conDto)} = ${eur(conDto)}`)
  lineas.push(`Limpieza: ${eur(conDto)} + ${eur(limpieza)} = ${eur(conDto + limpieza)}`)

  return lineas
}

export function calcPrices(basePrice: number, cleaning = CLEANING_FEE): PriceCalculation {
  const totalOwner = basePrice + cleaning
  // Commission is applied only on base price (excluding cleaning fee)
  const commission = Math.round(basePrice * CHANNEL_FEE * 100) / 100
  // Web published price = base + both channel commissions (Inmobiliaria + Reserva)
  const webPrice = Math.round((basePrice + commission * 2) * 100) / 100

  return {
    basePrice,
    cleaningFee: cleaning,
    totalOwner,
    realEstate: commission,
    booking: commission,
    webPrice,
    discount10: Math.round(basePrice * (1 - DISCOUNT_DIRECT) * 100) / 100,
  }
}

export function calcTotal(basePrice: number, cleaningFee: number, discountPct: number): number {
  return Math.round((basePrice * (1 - discountPct / 100) + cleaningFee) * 100) / 100
}

export function calcIGIC(amount: number, rate = 0.07): number {
  return Math.round(amount * rate * 100) / 100
}

export const DEFAULT_PRICES_2026: Omit<PriceEntry, 'id'>[] = [
  // VERANO 2026 - 1BR (104, 105)
  {
    year: 2026, season: 'VERANO', apartmentType: '1BR',
    price1week: 330, price2weeks: 545, price3weeks: 685, price1month: 970, cleaningFee: 40,
  },
  // VERANO 2026 - 2BR (106, 203, 204)
  {
    year: 2026, season: 'VERANO', apartmentType: '2BR',
    price1week: 415, price2weeks: 540, price3weeks: 835, price1month: 995, cleaningFee: 40,
  },
  // VERANO 2026 - ÁTICO 402
  {
    year: 2026, season: 'VERANO', apartmentType: '2BR_ATICO',
    price1week: 595, price2weeks: 995, price3weeks: 1375, price1month: 1395, cleaningFee: 40,
  },
  // VERANO 2026 - PISO-3
  {
    year: 2026, season: 'VERANO', apartmentType: '3BR',
    price1week: 795, price2weeks: 995, price3weeks: 1200, price1month: 1400, cleaningFee: 40,
  },
  // INVIERNO 2026/27 - 1BR
  {
    year: 2027, season: 'INVIERNO', apartmentType: '1BR',
    price1week: 595, price2weeks: 795, price3weeks: 1200, price1month: 1485, cleaningFee: 40,
  },
  // INVIERNO 2026/27 - 2BR
  {
    year: 2027, season: 'INVIERNO', apartmentType: '2BR',
    price1week: 695, price2weeks: 895, price3weeks: 1350, price1month: 1650, cleaningFee: 40,
  },
  // INVIERNO 2026/27 - ÁTICO 402
  {
    year: 2027, season: 'INVIERNO', apartmentType: '2BR_ATICO',
    price1week: 850, price2weeks: 1265, price3weeks: 1675, price1month: 1795, cleaningFee: 40,
  },
  // INVIERNO 2026/27 - PISO-3
  {
    year: 2027, season: 'INVIERNO', apartmentType: '3BR',
    price1week: 995, price2weeks: 1210, price3weeks: 1375, price1month: 1980, cleaningFee: 40,
  },
  // VERANO 2025 - 1BR (historical)
  {
    year: 2025, season: 'VERANO', apartmentType: '1BR',
    price1week: 300, price2weeks: 495, price3weeks: 625, price1month: 885, cleaningFee: 40,
  },
  // VERANO 2025 - 2BR
  {
    year: 2025, season: 'VERANO', apartmentType: '2BR',
    price1week: 380, price2weeks: 495, price3weeks: 760, price1month: 950, cleaningFee: 40,
  },
  // VERANO 2025 - ÁTICO
  {
    year: 2025, season: 'VERANO', apartmentType: '2BR_ATICO',
    price1week: 550, price2weeks: 935, price3weeks: 1275, price1month: 1320, cleaningFee: 40,
  },
  // VERANO 2025 - PISO-3
  {
    year: 2025, season: 'VERANO', apartmentType: '3BR',
    price1week: 725, price2weeks: 910, price3weeks: 1100, price1month: 1335, cleaningFee: 40,
  },
  // INVIERNO 2024/25 - 1BR
  {
    year: 2025, season: 'INVIERNO', apartmentType: '1BR',
    price1week: 550, price2weeks: 760, price3weeks: 1100, price1month: 1350, cleaningFee: 40,
  },
  // INVIERNO 2024/25 - 2BR
  {
    year: 2025, season: 'INVIERNO', apartmentType: '2BR',
    price1week: 650, price2weeks: 830, price3weeks: 1235, price1month: 1500, cleaningFee: 40,
  },
  // INVIERNO 2024/25 - ÁTICO
  {
    year: 2025, season: 'INVIERNO', apartmentType: '2BR_ATICO',
    price1week: 785, price2weeks: 1150, price3weeks: 1525, price1month: 1635, cleaningFee: 40,
  },
  // INVIERNO 2024/25 - PISO-3
  {
    year: 2025, season: 'INVIERNO', apartmentType: '3BR',
    price1week: 915, price2weeks: 1100, price3weeks: 1250, price1month: 1800, cleaningFee: 40,
  },
]

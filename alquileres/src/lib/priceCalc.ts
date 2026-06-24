import type { PriceEntry, PriceCalculation, ApartmentType, StayType } from '../types'

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

export function calcPrices(basePrice: number, cleaning = CLEANING_FEE): PriceCalculation {
  const totalOwner = basePrice + cleaning
  const realEstate = basePrice * (1 + CHANNEL_FEE)
  const booking = basePrice * (1 + CHANNEL_FEE)
  const webPrice = basePrice * (1 + CHANNEL_FEE)
  const discount10 = basePrice * (1 - DISCOUNT_DIRECT)

  return {
    basePrice,
    cleaningFee: cleaning,
    totalOwner,
    realEstate: Math.round(realEstate * 100) / 100,
    booking: Math.round(booking * 100) / 100,
    webPrice: Math.round(webPrice * 100) / 100,
    discount10: Math.round(discount10 * 100) / 100,
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

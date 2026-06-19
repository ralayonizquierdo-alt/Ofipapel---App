export type Season = 'VERANO' | 'INVIERNO'
export type ApartmentType = '1BR' | '2BR' | '2BR_ATICO' | '3BR'
export type StayType = '1semana' | '2semanas' | '3semanas' | '1mes' | 'directo' | 'otro'
export type Channel = 'directo' | 'inmobiliaria' | 'booking' | 'web'
export type ReservationStatus = 'confirmada' | 'cancelada' | 'completada'

export interface Apartment {
  id: string
  name: string
  bedrooms: number
  type: ApartmentType
  active: boolean
  notes?: string
}

export interface PriceEntry {
  id: string
  year: number
  season: Season
  apartmentType: ApartmentType
  price1week: number
  price2weeks: number
  price3weeks: number
  price1month: number
  cleaningFee: number
}

export interface Reservation {
  id: string
  apartmentId: string
  guestName?: string
  checkIn: string  // ISO date YYYY-MM-DD
  checkOut: string // ISO date YYYY-MM-DD
  nights: number
  stayType: StayType
  channel: Channel
  basePrice: number
  cleaningFee: number
  discountPct: number
  total: number
  status: ReservationStatus
  notes?: string
  createdAt: string
}

export interface Payment {
  id: string
  reservationId: string
  amount: number
  paymentDate?: string
  entryNumber?: string
  received: boolean
  createdAt: string
}

export interface Repair {
  id: string
  apartmentId: string
  repairDate?: string
  item: string
  supplier?: string
  document?: string
  amount?: number
  entryNumber?: string
  createdAt: string
}

export interface QuarterSummary {
  quarter: 1 | 2 | 3 | 4
  year: number
  apartmentId: string
  total: number
  igic: number
  months: { month: number; amount: number }[]
}

export interface PriceCalculation {
  basePrice: number
  cleaningFee: number
  totalOwner: number
  realEstate: number
  booking: number
  webPrice: number
  discount10: number
}

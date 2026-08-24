export type Season = 'VERANO' | 'INVIERNO'
export type ApartmentType = '1BR' | '2BR' | '2BR_ATICO' | '3BR'
export type StayType = '1semana' | '2semanas' | '3semanas' | '1mes' | 'directo' | 'otro'
export type Channel = 'directo' | 'inmobiliaria' | 'booking' | 'airbnb' | 'web'
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

export type PaymentMethod = 'efectivo' | 'transferencia' | 'otro'

/**
 * Conceptos de gasto del modelo fiscal de vivienda vacacional. Los cuatro
 * primeros van ligados directamente al alquiler; el resto son gastos de la
 * vivienda que solo se deducen en proporción a los días alquilados
 * (ver EXPENSE_DEDUCIBILIDAD en lib/deducible.ts).
 */
export type ExpenseType =
  | 'comisiones'      // Airbnb, Booking…
  | 'comisionAgencia' // agencia intermediaria
  | 'limpieza'
  | 'lavanderia'
  | 'electricidad'
  | 'agua'
  | 'internet'        // internet y telefonía fija
  | 'comunidad'
  | 'ibi'
  | 'basura'
  | 'profesionales'   // abogados, asesorías…
  | 'otro'            // otros servicios y gastos

export interface Payment {
  id: string
  reservationId: string
  amount: number
  paymentDate?: string
  entryNumber?: string
  received: boolean
  paymentMethod?: PaymentMethod
  createdAt: string
}

export interface Expense {
  id: string
  apartmentId: string
  expenseDate?: string
  expenseType: ExpenseType
  description: string
  supplier?: string
  /** Base imponible, sin IGIC. Es la que se prorratea para el deducible. */
  amount: number
  /** IGIC soportado, si consta en la factura. */
  igic?: number
  entryNumber?: string
  createdAt: string
}

export interface OfferPrice {
  id: string
  year: number
  month: number
  apartmentType: ApartmentType
  price1week: number
  price2weeks: number
  price3weeks: number
  price1month: number
  cleaningFee: number
  label: string
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

export interface DeletedRepair {
  id: string
  originalId: string
  reason: string
  deletedAt: string
  deletedBy: string
  apartmentId: string
  repairDate?: string
  item: string
  supplier?: string
  document?: string
  amount?: number
  entryNumber?: string
}

/**
 * Ingreso bruto mensual declarado por inmueble, tal y como viene del Excel.
 * Convive con `payments` sin sustituirlos: los cobros llevan fecha y reserva
 * detrás y siguen siendo la referencia de tesorería, mientras que esto es la
 * cifra que se declara. Cuando ambos existen, la app enseña la diferencia.
 */
export interface IngresoMensual {
  id: string
  apartmentId: string
  year: number
  month: number
  amount: number
  origen: 'excel'
}

/**
 * Días alquilados y totales de un mes, declarados en el Excel. Cuando existen,
 * mandan sobre lo que se pueda deducir de las reservas: el Excel es la fuente
 * oficial del ejercicio y las reservas de la app pueden estar incompletas.
 */
export interface OcupacionMensual {
  id: string
  apartmentId: string
  year: number
  month: number
  diasAlquilados: number
  diasTotales: number
  origen: 'excel'
}

/**
 * Reparaciones que el Excel da por mes e inmueble. No son gastos de la app: las
 * reparaciones de verdad viven en `repairs`, con proveedor y factura. Esto se
 * guarda solo para poder comparar una cifra con la otra y avisar si no cuadran.
 */
export interface ReparacionMensual {
  id: string
  apartmentId: string
  year: number
  month: number
  amount: number
  origen: 'excel'
}

/**
 * Un volcado de Excel: qué fichero, cuándo y quién lo subió. Sirve para poder
 * mirar atrás y saber de dónde salió cada cifra de un ejercicio.
 */
export interface ImportLog {
  id: string
  fileName: string
  year: number
  /** Fecha y hora en ISO. */
  at: string
  /** Quién tenía la sesión abierta al subirlo. */
  by: string
  gastos: number
  ingresos: number
  ocupaciones: number
  reparaciones: number
  /** Apuntes del Excel anterior que este fichero ya no traía. */
  borrados: number
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

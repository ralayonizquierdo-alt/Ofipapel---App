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

/** Por dónde entró un dato en la aplicación: el «cómo» del registro. */
export type OrigenSubida =
  | 'excel-gastos'      // Excel «Resumen anual de ingresos y gastos», uno por ejercicio
  | 'excel-limpieza'    // parte semanal de limpieza y reparaciones
  | 'excel-calendario'  // calendario anual de reservas en colores
  | 'pegado-whatsapp'   // aviso de la inmobiliaria, pegado como texto
  | 'pegado-airbnb'     // aviso de reserva de la aplicación de Airbnb
  | 'justificante'      // transferencia, pegada o leída de su PDF
  | 'correcciones'      // arreglo puntual de datos ya cargados

export const ORIGEN_LABEL: Record<OrigenSubida, string> = {
  'excel-gastos': 'Resumen anual de ingresos y gastos',
  'excel-limpieza': 'Parte de limpieza',
  'excel-calendario': 'Calendario de reservas',
  'pegado-whatsapp': 'Pegado de WhatsApp',
  'pegado-airbnb': 'Aviso de Airbnb',
  'justificante': 'Justificante de transferencia',
  'correcciones': 'Corrección de datos',
}

/**
 * Una subida de datos: qué entró, cuándo, por dónde y quién la hizo.
 *
 * Se anota siempre **después** de guardar, para que en el registro solo figure
 * lo que de verdad entró y nunca un intento que se quedó a medias. Sirve para
 * poder mirar atrás y saber de dónde salió cada cifra de un ejercicio.
 *
 * Casi todo es opcional a propósito: cada vía trae unas cosas y no otras (un
 * pegado no tiene fichero, un justificante no tiene año de ejercicio), y los
 * registros guardados antes de que esto existiera solo llevan lo de gastos.
 */
export interface ImportLog {
  id: string
  /** Cuándo, en ISO. */
  at: string
  /** Quién tenía la sesión abierta. */
  by: string
  /** Por dónde entró. Los registros antiguos no lo traen: eran de gastos. */
  origen?: OrigenSubida
  /** Nombre del fichero, cuando vino de uno. */
  fileName?: string
  /** Ejercicio al que afecta, si es uno solo. */
  year?: number
  /** Qué pasó, en una línea y en cristiano. */
  resumen?: string

  // Cuántos apuntes entraron de cada cosa.
  reservas?: number
  cobros?: number
  gastos?: number
  ingresos?: number
  ocupaciones?: number
  reparaciones?: number
  /** Apuntes que esta subida se llevó por delante. */
  borrados?: number
}

/**
 * Un aviso de descuadre que alguien ha mirado y ha dado por bueno. Se guarda
 * con la diferencia que tenía al darlo por bueno: si más adelante cambia, el
 * aviso vuelve a salir, porque ya no es el mismo asunto.
 */
export interface AvisoRevisado {
  id: string
  /** Identificador del aviso, p. ej. «ingresos-2025». */
  descuadreId: string
  diferencia: number
  at: string
  by: string
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

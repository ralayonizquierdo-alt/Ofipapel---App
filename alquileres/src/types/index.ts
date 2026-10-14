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
  /**
   * Apartamento al que pertenece el cobro.
   *
   * Los cobros que entran por la app cuelgan de una reserva y el apartamento
   * sale de ella. Los que vienen del Excel van por apartamento y mes —así los
   * lleva Luis— y pueden no tener una estancia identificable detrás: sin este
   * campo, ese dinero no aparecería en ninguna parte.
   */
  apartmentId?: string
  /**
   * Mes contable, «AAAA-MM»: la hoja del Excel en la que figura el cobro.
   *
   * No siempre coincide con `paymentDate`. El alquiler de enero del 106 se
   * pagó el 31 de diciembre y en el Excel cuenta en enero; agrupar por la
   * fecha del movimiento lo mandaría a diciembre y descuadraría los dos meses.
   * Cuando falta, manda `paymentDate`.
   */
  mes?: string
  /**
   * El justificante del que salió este cobro, guardado tal cual se subió.
   * Opcional porque los cobros anotados a mano no tienen papel detrás, y los
   * de antes de que esto existiera tampoco.
   */
  justificanteUrl?: string
  justificanteNombre?: string
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

/** Los cuatro precios y la limpieza de un tipo de apartamento. */
export interface OfferTarifa {
  price1week: number
  price2weeks: number
  price3weeks: number
  price1month: number
  cleaningFee: number
}

/**
 * Tarifa de oferta: la que se aplica en un mes concreto en lugar de la general.
 *
 * Nace de algo muy real: en octubre de 2026 el propietario ofreció por Airbnb
 * el precio del año anterior. Eso no es la tarifa general del año —no se puede
 * tocar, rige para todo lo demás— pero tampoco es un precio pactado a mano con
 * un inquilino: es una oferta para un mes entero y unos apartamentos.
 *
 * `year` y `month` son **cuándo se aplica**, no de dónde salieron los precios.
 * De dónde salieron se guarda aparte, en `sourceYear`, y es solo memoria: sirve
 * para saber, dentro de dos años, que aquella oferta de octubre era «el precio
 * de 2025». Antes los dos sentidos compartían el mismo campo y las primeras
 * tarifas se guardaron con el año de origen, no con el de aplicación.
 *
 * Una oferta cubre **los apartamentos que se marquen** (`apartments`) y guarda
 * un juego de precios por cada tipo que haya entre ellos (`byType`), porque un
 * ático no vale lo mismo que un estudio. Antes era una oferta por tipo: la
 * misma oferta de octubre eran cuatro fichas idénticas salvo el precio, y había
 * que crearlas y mantenerlas una por una. Las de entonces siguen leyéndose
 * (`apartmentType` y los precios sueltos, ver `tarifaDeOferta`).
 */
export interface OfferPrice {
  id: string
  /** Año en el que se aplica. */
  year: number
  /** Mes en el que se aplica, 1-12. */
  month: number
  label: string
  /** Apartamentos a los que se aplica, por id. */
  apartments?: string[]
  /** Los precios de cada tipo de apartamento de los marcados. */
  byType?: Partial<Record<ApartmentType, OfferTarifa>>
  /** Año de la tarifa general de la que se copiaron los precios. Informativo. */
  sourceYear?: number
  /** Temporada de esa tarifa: puede no ser la del mes en que se aplica. */
  sourceSeason?: Season

  // ── Ofertas de antes de octubre de 2026: una por tipo ──────────────────────
  /** @deprecated Usar `apartments` + `byType`. */
  apartmentType?: ApartmentType
  /** @deprecated */ price1week?: number
  /** @deprecated */ price2weeks?: number
  /** @deprecated */ price3weeks?: number
  /** @deprecated */ price1month?: number
  /** @deprecated */ cleaningFee?: number
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
  | 'informe-airbnb'    // informe anual de la gestora del Arenal (Airbnb)
  | 'justificante'      // transferencia, pegada o leída de su PDF
  | 'correcciones'      // arreglo puntual de datos ya cargados

export const ORIGEN_LABEL: Record<OrigenSubida, string> = {
  'excel-gastos': 'Resumen anual de ingresos y gastos',
  'excel-limpieza': 'Parte de limpieza',
  'excel-calendario': 'Calendario de reservas',
  'pegado-whatsapp': 'Pegado de WhatsApp',
  'pegado-airbnb': 'Aviso de Airbnb',
  'informe-airbnb': 'Informe anual de Airbnb',
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

  /** El documento que se subió, guardado. Solo lo tienen los justificantes. */
  justificanteUrl?: string
  justificanteNombre?: string
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

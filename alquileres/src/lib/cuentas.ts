import type {
  Apartment, Channel, Expense, ExpenseType, IngresoMensual, OcupacionMensual, Payment, Repair, Reservation,
} from '../types'
import { getDaysInMonth } from './dateUtils'
import { calcIGIC } from './priceCalc'
import {
  deducibleGasto, deducibleReparacion, mapaOcupaciones, nochesOcupadas, redondea,
} from './deducible'

/**
 * Las cuentas de un ejercicio, tal como hay que presentarlas.
 *
 * Es el único sitio donde se decide de dónde sale cada cifra, para que la
 * pantalla de Analítica y la hoja que se manda a la asesoría no puedan contar
 * cosas distintas. La regla que manda: si el ejercicio tiene ingresos del
 * Excel, esos son los ingresos; los cobros de la app quedan como comprobación
 * de tesorería.
 */

export type Periodo = 'anual' | 'T1' | 'T2' | 'T3' | 'T4' | `M${number}`

export const TRIMESTRES: Record<string, number[]> = {
  T1: [1, 2, 3], T2: [4, 5, 6], T3: [7, 8, 9], T4: [10, 11, 12],
}

export function mesesDe(periodo: Periodo): number[] {
  if (periodo === 'anual') return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  if (periodo in TRIMESTRES) return TRIMESTRES[periodo]
  return [Number(periodo.slice(1))]
}

/**
 * Comisiones de las plataformas.
 *
 * Luis lo dejó dicho el 24/08/2026: no se teclean, salen del canal de la
 * propia reserva —«se INDEXARÁ desde pestaña de PRECIOS + Inmobi. (15%) +
 * Reserva (15%)»—. Quien reserva por Booking o por la inmobiliaria paga el
 * precio publicado, la plataforma se queda su parte y a la propiedad le llega
 * el resto; esa parte es gasto del alquiler y se deduce entera.
 *
 * Solo desde 2026, y por dos razones. Los ejercicios anteriores se cerraron sin
 * comisiones —«en el 2025 NO se ha aplicado, ni en años anteriores»—, y además
 * su canal no es de fiar: el volcado del calendario marcó las 396 reservas
 * como «inmobiliaria» porque el calendario no dice por dónde entró cada una.
 * Aplicarlo hacia atrás inventaría miles de euros de gasto que nunca existió.
 */
export const COMISIONES_DESDE = 2026
export const COMISION = 0.15

/**
 * Comisión de la plataforma que sí se apunta como gasto.
 *
 * Con la inmobiliaria y con Booking, el huésped paga el precio publicado, la
 * plataforma se queda su parte y a la propiedad le llega el resto: la comisión
 * es un gasto del alquiler y se deduce entera.
 *
 * Airbnb **no** está aquí, y no es un olvido. El recibo de Airbnb que se sube
 * llega ya neto —Airbnb descuenta lo suyo antes de transferir—, así que su
 * parte no se ve nunca y lo que se apunta como ingreso ya viene descontado.
 * Apuntarla además como gasto sería contarla dos veces: se deduciría una
 * comisión que ya está restada del ingreso. Además Airbnb pone el precio, no
 * la propiedad, así que tampoco hay tarifa de la que sacar el bruto.
 */
const CANALES_CON_COMISION: Channel[] = ['inmobiliaria', 'booking']

/** Lo que se queda la plataforma de una reserva. 0 si no hay intermediario. */
export function comisionDe(r: Reservation): number {
  if (r.status === 'cancelada') return 0
  if (Number(r.checkIn.slice(0, 4)) < COMISIONES_DESDE) return 0
  if (!CANALES_CON_COMISION.includes(r.channel)) return 0
  // Sobre el precio base, no sobre el total: la limpieza no lleva comisión.
  return redondea((r.basePrice || 0) * COMISION)
}

export interface CuentasInmueble {
  apt: Apartment
  /** Noches ocupadas del periodo y días que tiene el periodo. */
  noches: number
  diasPeriodo: number
  ocupacion: number
  /** Lo que se declara. Del Excel si lo hay; si no, de los cobros. */
  ingresos: number
  /** Lo cobrado de verdad en la app, para comprobar tesorería. */
  cobrado: number
  gastos: number
  deducible: number
  resultado: number
  /** IGIC repercutido al 7 % sobre los ingresos. */
  igic: number
  /** IGIC soportado, el que consta en las facturas de gasto. */
  igicSoportado: number
  /** Gasto y deducible desglosados por concepto. */
  porConcepto: { concepto: ExpenseType | 'reparaciones'; gasto: number; deducible: number }[]
}

export interface DatosCuentas {
  apartments: Apartment[]
  reservations: Reservation[]
  payments: Payment[]
  expenses: Expense[]
  repairs: Repair[]
  incomes: IngresoMensual[]
  occupancies: OcupacionMensual[]
}

/**
 * El primer ejercicio que se lleva de verdad en la aplicación.
 *
 * De 2026 en adelante, lo que hay en la app —reservas, cobros, gastos— es la
 * contabilidad del año y se enseña tal cual. De los ejercicios anteriores solo
 * cuenta el Excel: se cargaron para tener el histórico de estancias, y el
 * propietario dejó dicho que de esos años «solo iban a estar las reservas, no
 * tenía que haber cobros ni gastos ni nada».
 *
 * Por eso un año anterior a este sin Excel no tiene cuentas, y no se le
 * inventan a partir de los cuatro cobros sueltos que puedan haber quedado: eso
 * es justo lo que hacía que la plataforma enseñara cifras que no salían de
 * ningún sitio y no cuadraban con nada.
 */
export const EJERCICIO_APP = 2026

export function cuentasDe(d: DatosCuentas, year: number, meses: number[]) {
  const ocupDeclarada = mapaOcupaciones(d.occupancies)

  const declarados = new Map<string, number>()
  for (const i of d.incomes) {
    if (i.year !== year) continue
    const k = `${i.apartmentId}|${i.month}`
    declarados.set(k, (declarados.get(k) || 0) + i.amount)
  }
  const hayDeclarados = declarados.size > 0

  /** Año viejo sin Excel: solo tiene reservas, no tiene contabilidad. */
  const soloReservas = !hayDeclarados && year < EJERCICIO_APP

  const aptDeReserva = new Map(d.reservations.map(r => [r.id, r.apartmentId]))
  const enPeriodo = (fecha?: string) => {
    if (!fecha) return false
    const [y, m] = fecha.split('-')
    return Number(y) === year && meses.includes(Number(m))
  }

  const porInmueble: CuentasInmueble[] = d.apartments.map(apt => {
    const diasPeriodo = meses.reduce((s, m) => s + getDaysInMonth(year, m), 0)
    // Con ocupación declarada, las noches salen de ella: son las que sustentan
    // el prorrateo, así que lo que se enseña y lo que se calcula coinciden.
    const noches = Math.round(meses.reduce((s, m) => {
      const dias = getDaysInMonth(year, m)
      const decl = ocupDeclarada.get(`${apt.id}|${year}|${m}`)
      return s + (decl !== undefined ? decl * dias : nochesOcupadas(d.reservations, apt.id, year, m))
    }, 0))

    const cobrado = d.payments
      .filter(p => p.received && enPeriodo(p.paymentDate) && aptDeReserva.get(p.reservationId) === apt.id)
      .reduce((s, p) => s + p.amount, 0)
    const declarado = meses.reduce((s, m) => s + (declarados.get(`${apt.id}|${m}`) || 0), 0)
    // Con Excel manda el Excel. Sin Excel, solo los ejercicios que se llevan en
    // la app tienen ingresos; los viejos no declaran nada.
    const ingresos = hayDeclarados ? declarado : (soloReservas ? 0 : cobrado)

    const gastosApt = d.expenses.filter(e => e.apartmentId === apt.id && enPeriodo(e.expenseDate))
    const repsApt = d.repairs.filter(r => r.apartmentId === apt.id && enPeriodo(r.repairDate))

    const porConceptoMap = new Map<ExpenseType | 'reparaciones', { gasto: number; deducible: number }>()
    const anota = (c: ExpenseType | 'reparaciones', gasto: number, deducible: number) => {
      const a = porConceptoMap.get(c) || { gasto: 0, deducible: 0 }
      a.gasto += gasto; a.deducible += deducible
      porConceptoMap.set(c, a)
    }
    for (const e of gastosApt) anota(e.expenseType, e.amount || 0, deducibleGasto(e, d.reservations, ocupDeclarada))
    for (const r of repsApt) anota('reparaciones', r.amount || 0, deducibleReparacion(r, d.reservations, ocupDeclarada))

    // Las comisiones no están en «expenses»: se sacan del canal de cada reserva.
    // Van al 100 %, como todo gasto ligado directamente al alquiler.
    const comisiones = redondea(d.reservations
      .filter(r => r.apartmentId === apt.id && enPeriodo(r.checkIn))
      .reduce((s, r) => s + comisionDe(r), 0))
    if (comisiones) anota('comisiones', comisiones, comisiones)

    const gastos = gastosApt.reduce((s, e) => s + (e.amount || 0), 0)
      + repsApt.reduce((s, r) => s + (r.amount || 0), 0)
      + comisiones
    const deducible = [...porConceptoMap.values()].reduce((s, v) => s + v.deducible, 0)

    const base = {
      apt, noches, diasPeriodo,
      ocupacion: diasPeriodo ? Math.round((noches / diasPeriodo) * 100) : 0,
      cobrado: redondea(cobrado),
    }

    // Ejercicio viejo sin Excel: se queda en las estancias y nada más. Alguna
    // reparación suelta puede llevar fecha de esos años, pero enseñarla como el
    // gasto de un ejercicio del que no hay ingresos daría un resultado negativo
    // que no significa nada. La reparación sigue en su pantalla, intacta.
    if (soloReservas) {
      return {
        ...base,
        ingresos: 0, gastos: 0, deducible: 0, resultado: 0,
        igic: 0, igicSoportado: 0, porConcepto: [],
      }
    }

    return {
      ...base,
      ingresos: redondea(ingresos),
      gastos: redondea(gastos),
      deducible: redondea(deducible),
      resultado: redondea(ingresos - deducible),
      igic: calcIGIC(ingresos),
      igicSoportado: redondea(gastosApt.reduce((s, e) => s + (e.igic || 0), 0)),
      porConcepto: [...porConceptoMap.entries()]
        .map(([concepto, v]) => ({ concepto, gasto: redondea(v.gasto), deducible: redondea(v.deducible) }))
        .sort((a, b) => b.gasto - a.gasto),
    }
  })

  const suma = (f: (c: CuentasInmueble) => number) => redondea(porInmueble.reduce((s, c) => s + f(c), 0))

  return {
    hayDeclarados,
    /** Ejercicio viejo del que solo se guardó el histórico de estancias. */
    soloReservas,
    porInmueble,
    total: {
      noches: porInmueble.reduce((s, c) => s + c.noches, 0),
      diasPeriodo: porInmueble.reduce((s, c) => s + c.diasPeriodo, 0),
      ingresos: suma(c => c.ingresos),
      cobrado: suma(c => c.cobrado),
      gastos: suma(c => c.gastos),
      deducible: suma(c => c.deducible),
      resultado: suma(c => c.resultado),
      igic: suma(c => c.igic),
      igicSoportado: suma(c => c.igicSoportado),
    },
  }
}

/**
 * Las cuentas de un año puestas como en el Excel de siempre: una rejilla por
 * inmueble, con los conceptos en vertical y los doce meses en horizontal.
 *
 * Es el formato con el que llevan años trabajando y el que entiende la
 * asesoría, así que tanto lo que se imprime como lo que se exporta salen de
 * aquí y no pueden discrepar entre sí ni con lo que enseña Analítica: por
 * debajo es el mismo cuentasDe(), mes a mes.
 */
export interface MesInmueble {
  mes: number
  diasTotales: number
  diasAlquilados: number
  ocupacion: number
  ingresos: number
  /** IGIC repercutido del mes, la columna que el Excel pone junto a la base. */
  igic: number
  gastos: number
  deducible: number
  porConcepto: Map<ExpenseType | 'reparaciones', { gasto: number; deducible: number }>
}

export interface RejillaInmueble {
  apt: Apartment
  meses: MesInmueble[]
  /** Los conceptos que de verdad tienen algo en el año, en orden fijo. */
  conceptos: (ExpenseType | 'reparaciones')[]
}

/** Orden en el que van los conceptos: fila por fila, el mismo que usa el Excel. */
export const ORDEN_CONCEPTOS: (ExpenseType | 'reparaciones')[] = [
  'comisiones', 'comisionAgencia', 'limpieza', 'lavanderia', 'electricidad',
  'agua', 'internet', 'comunidad', 'ibi', 'basura', 'profesionales', 'otro',
  'reparaciones',
]

/**
 * El texto exacto con el que cada concepto aparece en el Excel de la asesoría.
 *
 * No es lo mismo que EXPENSE_LABELS: ahí se busca claridad en pantalla y aquí
 * que la asesoría reconozca la fila de siempre, letra por letra.
 */
export const ETIQUETA_EXCEL: Record<ExpenseType | 'reparaciones', string> = {
  comisiones:      'Comisiones (Airbnb, Reale State, Booking…)',
  comisionAgencia: 'Comisión agencia intermediaria',
  limpieza:        'Limpieza',
  lavanderia:      'Lavandería',
  electricidad:    'Electricidad',
  agua:            'Agua',
  internet:        'Internet y telefonía fija',
  comunidad:       'Comunidad',
  ibi:             'IBI',
  basura:          'Basura',
  profesionales:   'Profesionales (abogados, asesorías,…)',
  otro:            'Otros servicios y gastos',
  reparaciones:    'Reparaciones y conservación',
}

export function rejillaAnual(d: DatosCuentas, year: number): RejillaInmueble[] {
  // Un cálculo por mes: así cada casilla sale exactamente del mismo sitio que
  // el total del año, en vez de rehacer la cuenta por otro camino.
  const porMes = Array.from({ length: 12 }, (_, i) => cuentasDe(d, year, [i + 1]))

  return d.apartments.map(apt => {
    const meses: MesInmueble[] = porMes.map((c, i) => {
      const x = c.porInmueble.find(p => p.apt.id === apt.id)
      const dias = getDaysInMonth(year, i + 1)
      const noches = x?.noches ?? 0
      return {
        mes: i + 1,
        diasTotales: dias,
        diasAlquilados: noches,
        ocupacion: dias ? noches / dias : 0,
        ingresos: x?.ingresos ?? 0,
        igic: x?.igic ?? 0,
        gastos: x?.gastos ?? 0,
        deducible: x?.deducible ?? 0,
        porConcepto: new Map((x?.porConcepto ?? []).map(g => [g.concepto, { gasto: g.gasto, deducible: g.deducible }])),
      }
    })
    const usados = new Set<ExpenseType | 'reparaciones'>()
    for (const m of meses) for (const [k, v] of m.porConcepto) if (v.gasto) usados.add(k)
    return { apt, meses, conceptos: ORDEN_CONCEPTOS.filter(c => usados.has(c)) }
  })
}

/** El gasto de un concepto en un mes; 0 si ese mes no tuvo nada. */
export function gastoMes(m: MesInmueble, c: ExpenseType | 'reparaciones'): number {
  return m.porConcepto.get(c)?.gasto ?? 0
}

/** El total del año de un concepto, y lo que de él se deduce. */
export function totalConcepto(r: RejillaInmueble, c: ExpenseType | 'reparaciones') {
  let gasto = 0, deducible = 0
  for (const m of r.meses) {
    const v = m.porConcepto.get(c)
    if (v) { gasto += v.gasto; deducible += v.deducible }
  }
  return { gasto: redondea(gasto), deducible: redondea(deducible) }
}

/** Suma de una columna del año (ingresos, gastos, deducible, igic…). */
export function totalAnual(r: RejillaInmueble, f: (m: MesInmueble) => number): number {
  return redondea(r.meses.reduce((s, m) => s + f(m), 0))
}

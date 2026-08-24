import type {
  Apartment, Expense, ExpenseType, IngresoMensual, OcupacionMensual, Payment, Repair, Reservation,
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

export function cuentasDe(d: DatosCuentas, year: number, meses: number[]) {
  const ocupDeclarada = mapaOcupaciones(d.occupancies)

  const declarados = new Map<string, number>()
  for (const i of d.incomes) {
    if (i.year !== year) continue
    const k = `${i.apartmentId}|${i.month}`
    declarados.set(k, (declarados.get(k) || 0) + i.amount)
  }
  const hayDeclarados = declarados.size > 0

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
    const ingresos = hayDeclarados ? declarado : cobrado

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

    const gastos = gastosApt.reduce((s, e) => s + (e.amount || 0), 0)
      + repsApt.reduce((s, r) => s + (r.amount || 0), 0)
    const deducible = [...porConceptoMap.values()].reduce((s, v) => s + v.deducible, 0)

    return {
      apt, noches, diasPeriodo,
      ocupacion: diasPeriodo ? Math.round((noches / diasPeriodo) * 100) : 0,
      ingresos: redondea(ingresos),
      cobrado: redondea(cobrado),
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

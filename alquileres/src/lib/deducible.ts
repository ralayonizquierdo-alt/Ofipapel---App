import type { ExpenseType, Reservation, Expense, Repair, OcupacionMensual } from '../types'
import { getDaysInMonth } from './dateUtils'

/**
 * Un gasto de vivienda vacacional solo se deduce en proporción a los días que
 * el inmueble estuvo alquilado. Hay dos reglas:
 *
 *  - 'directo':   ligado al propio alquiler, deducible al 100%.
 *  - 'ocupacion': gasto de la vivienda, deducible × (días alquilados / días del mes).
 *
 * El Excel del que venían estos datos aplicaba el prorrateo con la ocupación de
 * un inmueble equivocado en 7 de los 8, inflando el deducible en 3.415 €. Aquí
 * la ocupación se calcula siempre a partir de las reservas del propio inmueble.
 */
export type Deducibilidad = 'directo' | 'ocupacion'

export const EXPENSE_DEDUCIBILIDAD: Record<ExpenseType, Deducibilidad> = {
  comisiones:      'directo',
  comisionAgencia: 'directo',
  limpieza:        'directo',
  lavanderia:      'directo',
  electricidad:    'ocupacion',
  agua:            'ocupacion',
  internet:        'ocupacion',
  comunidad:       'ocupacion',
  ibi:             'ocupacion',
  basura:          'ocupacion',
  profesionales:   'ocupacion',
  otro:            'ocupacion',
}

export const EXPENSE_LABELS: Record<ExpenseType, string> = {
  comisiones:      'Comisiones (Airbnb, Booking…)',
  comisionAgencia: 'Comisión agencia intermediaria',
  limpieza:        'Limpieza',
  lavanderia:      'Lavandería',
  electricidad:    'Electricidad',
  agua:            'Agua',
  internet:        'Internet y telefonía fija',
  comunidad:       'Comunidad',
  ibi:             'IBI',
  basura:          'Basura',
  profesionales:   'Profesionales (abogados, asesorías…)',
  otro:            'Otros servicios y gastos',
}

/** Las reparaciones son gasto de conservación de la vivienda: se prorratean. */
export const DEDUCIBILIDAD_REPARACIONES: Deducibilidad = 'ocupacion'

/** Noches ocupadas de un inmueble dentro de un mes concreto. */
export function nochesOcupadas(
  reservations: Reservation[],
  apartmentId: string,
  year: number,
  month: number,
): number {
  const inicioMes = new Date(year, month - 1, 1).getTime()
  const finMes = new Date(year, month, 1).getTime()
  let noches = 0

  for (const r of reservations) {
    if (r.apartmentId !== apartmentId || r.status === 'cancelada') continue
    if (!r.checkIn || !r.checkOut) continue
    const entrada = new Date(r.checkIn).getTime()
    const salida = new Date(r.checkOut).getTime()
    if (Number.isNaN(entrada) || Number.isNaN(salida)) continue

    // Solapamiento de la estancia con el mes. La noche se cuenta el día de
    // entrada, no el de salida, por eso el mes se cierra en su primer día.
    const desde = Math.max(entrada, inicioMes)
    const hasta = Math.min(salida, finMes)
    if (hasta > desde) noches += Math.round((hasta - desde) / 86_400_000)
  }

  return noches
}

/** Índice de ocupaciones declaradas, listo para consultar por inmueble y mes. */
export function mapaOcupaciones(ocupaciones: OcupacionMensual[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const o of ocupaciones) {
    if (o.diasTotales <= 0) continue
    // La ocupación del Excel venía de la aplicación anterior y traía nueve meses
    // imposibles, de más de un 100 %: más noches alquiladas que días tiene el
    // mes. Luis eligió (24/08/2026) que en esos casos mande el cálculo de la
    // app a partir de las reservas, así que un mes imposible no se declara y se
    // deja que lo resuelva ocupacionMes(). El resto del Excel se respeta.
    if (o.diasAlquilados > o.diasTotales) continue
    m.set(`${o.apartmentId}|${o.year}|${o.month}`, o.diasAlquilados / o.diasTotales)
  }
  return m
}

/**
 * Ocupación 0–1 de un inmueble en un mes. Si hay ocupación declarada para ese
 * mes se usa esa; si no, se calcula desde las reservas de la app.
 */
export function ocupacionMes(
  reservations: Reservation[],
  apartmentId: string,
  year: number,
  month: number,
  declaradas?: Map<string, number>,
): number {
  const declarada = declaradas?.get(`${apartmentId}|${year}|${month}`)
  if (declarada !== undefined) return declarada
  const dias = getDaysInMonth(year, month)
  if (!dias) return 0
  return Math.min(1, nochesOcupadas(reservations, apartmentId, year, month) / dias)
}

function mesDe(fecha: string | undefined): { year: number; month: number } | null {
  if (!fecha) return null
  const [y, m] = fecha.split('-')
  const year = Number(y)
  const month = Number(m)
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null
  return { year, month }
}

/** Parte deducible de un gasto, ya aplicada su regla. */
export function deducibleGasto(
  gasto: Expense, reservations: Reservation[], declaradas?: Map<string, number>,
): number {
  const importe = Number(gasto.amount)
  if (!Number.isFinite(importe)) return 0
  if (EXPENSE_DEDUCIBILIDAD[gasto.expenseType] === 'directo') return importe

  const periodo = mesDe(gasto.expenseDate)
  if (!periodo) return 0
  return importe * ocupacionMes(reservations, gasto.apartmentId, periodo.year, periodo.month, declaradas)
}

/** Parte deducible de una reparación (siempre prorrateada). */
export function deducibleReparacion(
  rep: Repair, reservations: Reservation[], declaradas?: Map<string, number>,
): number {
  const importe = Number(rep.amount)
  if (!Number.isFinite(importe)) return 0
  const periodo = mesDe(rep.repairDate)
  if (!periodo) return 0
  return importe * ocupacionMes(reservations, rep.apartmentId, periodo.year, periodo.month, declaradas)
}

export function redondea(n: number): number {
  return Math.round(n * 100) / 100
}

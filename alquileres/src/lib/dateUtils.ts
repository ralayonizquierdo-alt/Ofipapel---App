import type { Season } from '../types'

export function getSeason(date: string | Date): Season {
  const d = typeof date === 'string' ? new Date(date) : date
  const month = d.getMonth() + 1 // 1-12
  // VERANO: May(5) - Sep(9), INVIERNO: Oct(10) - Apr(4)
  return month >= 5 && month <= 9 ? 'VERANO' : 'INVIERNO'
}

/**
 * El año de la tabla de Precios que le toca a una fecha.
 *
 * La tarifa de invierno de un año N es la del invierno (N−1)/N: de octubre de
 * N−1 a abril de N. Por eso una entrada de octubre, noviembre o diciembre usa
 * la tarifa del año SIGUIENTE: el 13/11/2026 va con «Invierno 2027», la de
 * 2026/27 (595 € la semana del estudio), y no con la de 2025/26 (550 €). Lo
 * confirmó la agencia el 17/11/2026 con su tabla de Booking.
 */
export function anioDeTarifa(date: string | Date): number {
  const d = typeof date === 'string' ? new Date(date) : date
  return getSeason(d) === 'INVIERNO' && d.getMonth() + 1 >= 10 ? d.getFullYear() + 1 : d.getFullYear()
}

/** «Verano 2026» o «Invierno 2025/26» (la tabla de invierno de 2026). */
export function nombreTemporada(season: Season, year: number): string {
  return season === 'VERANO' ? `Verano ${year}` : `Invierno ${year - 1}/${String(year).slice(2)}`
}

export function getNights(checkIn: string, checkOut: string): number {
  const start = new Date(checkIn)
  const end = new Date(checkOut)
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
}

export function getQuarter(month: number): 1 | 2 | 3 | 4 {
  if (month <= 3) return 1
  if (month <= 6) return 2
  if (month <= 9) return 3
  return 4
}

export function formatDate(date: string | undefined): string {
  if (!date) return '—'
  const d = new Date(date)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDateShort(date: string | undefined): string {
  if (!date) return '—'
  const d = new Date(date)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
}

export function formatMonthYear(year: number, month: number): string {
  const d = new Date(year, month - 1, 1)
  return d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export function getMonthDays(year: number, month: number): Date[] {
  const days: Date[] = []
  const total = getDaysInMonth(year, month)
  for (let d = 1; d <= total; d++) {
    days.push(new Date(year, month - 1, d))
  }
  return days
}

export function isDateInRange(date: string, checkIn: string, checkOut: string): boolean {
  const d = new Date(date).getTime()
  const ci = new Date(checkIn).getTime()
  const co = new Date(checkOut).getTime()
  return d >= ci && d < co
}

export function today(): string {
  return new Date().toISOString().split('T')[0]
}

export function addDays(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

export const DAY_NAMES_ES = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do']

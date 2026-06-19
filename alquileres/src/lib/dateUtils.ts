import type { Season } from '../types'

export function getSeason(date: string | Date): Season {
  const d = typeof date === 'string' ? new Date(date) : date
  const month = d.getMonth() + 1 // 1-12
  // VERANO: May(5) - Sep(9), INVIERNO: Oct(10) - Apr(4)
  return month >= 5 && month <= 9 ? 'VERANO' : 'INVIERNO'
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

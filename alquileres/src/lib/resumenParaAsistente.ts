import type { Apartment, Expense, Payment, Reservation } from '../types'
import { MONTH_NAMES_ES, today } from './dateUtils'
import { partesDeAlojamiento } from './devengo'
import { num } from './formato'

/**
 * El resumen de datos que se le manda al asistente para que conteste.
 *
 * La regla de la casa: **las cifras las calcula la aplicación, no el modelo**.
 * Aquí se arma un texto con todo ya sumado —lo devengado y lo cobrado de cada
 * mes, cada estancia con su saldo, los cobros uno a uno, los gastos por
 * concepto— y el asistente se limita a redactar la respuesta sobre eso. Así no
 * hay forma de que se invente un total: o está en este texto, o dice que no lo
 * sabe.
 *
 * Va en texto plano y apretado a propósito: es lo que mejor lee un modelo y lo
 * que menos ocupa. Un ejercicio entero cabe de sobra.
 */

const eur = (n: number) => num(Math.round(n * 100) / 100, 2)

/** Lo cobrado de una reserva, con todos sus cobros, sean del año que sean. */
function cobradoDe(r: Reservation, payments: Payment[]): number {
  return Math.round(payments
    .filter(p => p.reservationId === r.id && p.received)
    .reduce((s, p) => s + p.amount, 0) * 100) / 100
}

export interface DatosResumen {
  apartments: Apartment[]
  reservations: Reservation[]
  payments: Payment[]
  expenses: Expense[]
}

/**
 * Arma el resumen de un ejercicio. `hoy` se pasa para poder probarlo.
 */
export function resumenParaAsistente(d: DatosResumen, year: number, hoy = today()): string {
  const { apartments, reservations, payments, expenses } = d
  const nombre = (id: string) => apartments.find(a => a.id === id)?.name ?? id
  const esDelAnio = (iso?: string) => (iso ?? '').startsWith(String(year))
  const mesDe = (p: Payment) => p.mes ?? p.paymentDate?.slice(0, 7)
  const aptDe = (p: Payment) =>
    p.apartmentId ?? reservations.find(r => r.id === p.reservationId)?.apartmentId ?? '?'

  const L: string[] = []
  L.push(`Hoy es ${hoy}. Este resumen es del ejercicio ${year}.`)
  L.push('Los importes están en euros. «Devengado» es lo que le toca a cada mes por sus noches;')
  L.push('«cobrado» es el dinero que entró, contado en su mes contable.')
  L.push('')

  L.push('APARTAMENTOS')
  for (const a of apartments) L.push(`- ${a.id}: ${a.name}${a.active ? '' : ' (dado de baja)'}`)
  L.push('')

  // ── Reservas del año ───────────────────────────────────────────────────────
  const delAnio = reservations
    .filter(r => r.status !== 'cancelada'
      && r.checkIn <= `${year}-12-31` && r.checkOut > `${year}-01-01`)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn))

  L.push(`RESERVAS QUE TOCAN ${year} (${delAnio.length})`)
  L.push('apto | entrada | salida | noches | importe total | cobrado | falta | estado')
  for (const r of delAnio) {
    const cob = cobradoDe(r, payments)
    const falta = Math.round((r.total - cob) * 100) / 100
    const estado = Math.abs(falta) < 0.005 ? 'cobrada del todo'
      : falta < 0 ? `cobrada de más en ${eur(-falta)}`
        : r.checkIn > hoy ? 'aún no ha entrado'
          : r.checkOut > hoy ? 'estancia en curso'
            : 'TERMINADA Y DEBIENDO'
    L.push(`${r.apartmentId} | ${r.checkIn} | ${r.checkOut} | ${r.nights} | ${eur(r.total)} | ${eur(cob)} | ${eur(falta)} | ${estado}`)
  }
  L.push('')

  // ── Devengado y cobrado, mes a mes y por apartamento ───────────────────────
  const dev = new Map<string, number>()
  for (const r of delAnio) {
    for (const [mm, parte] of partesDeAlojamiento(r)) {
      if (!mm.startsWith(String(year))) continue
      const k = `${mm}|${r.apartmentId}`
      dev.set(k, Math.round(((dev.get(k) ?? 0) + parte) * 100) / 100)
    }
    if (esDelAnio(r.checkIn) && r.cleaningFee) {
      const k = `${r.checkIn.slice(0, 7)}|${r.apartmentId}`
      dev.set(k, Math.round(((dev.get(k) ?? 0) + r.cleaningFee) * 100) / 100)
    }
  }
  const cob = new Map<string, number>()
  const cobrosAnio = payments.filter(p => p.received && esDelAnio(mesDe(p)))
  for (const p of cobrosAnio) {
    const k = `${mesDe(p)}|${aptDe(p)}`
    cob.set(k, Math.round(((cob.get(k) ?? 0) + p.amount) * 100) / 100)
  }

  L.push(`DEVENGADO Y COBRADO POR MES Y APARTAMENTO (${year})`)
  L.push('mes | apto | devengado | cobrado')
  for (let m = 1; m <= 12; m++) {
    const mm = `${year}-${String(m).padStart(2, '0')}`
    for (const a of apartments) {
      const d1 = dev.get(`${mm}|${a.id}`) ?? 0
      const c1 = cob.get(`${mm}|${a.id}`) ?? 0
      if (!d1 && !c1) continue
      L.push(`${MONTH_NAMES_ES[m - 1].toLowerCase()} | ${a.id} | ${eur(d1)} | ${eur(c1)}`)
    }
  }
  const totalDev = Math.round([...dev.values()].reduce((s, v) => s + v, 0) * 100) / 100
  const totalCob = Math.round(cobrosAnio.reduce((s, p) => s + p.amount, 0) * 100) / 100
  L.push(`TOTAL ${year}: devengado ${eur(totalDev)} | cobrado ${eur(totalCob)}`)
  L.push('')

  // ── Los cobros, uno a uno ──────────────────────────────────────────────────
  L.push(`COBROS DE ${year} (${cobrosAnio.length})`)
  L.push('fecha | mes contable | apto | importe | forma | nº asiento | estancia')
  for (const p of [...cobrosAnio].sort((a, b) => (mesDe(a) ?? '').localeCompare(mesDe(b) ?? ''))) {
    const r = reservations.find(x => x.id === p.reservationId)
    L.push([
      p.paymentDate ?? '—', mesDe(p) ?? '—', aptDe(p), eur(p.amount),
      p.paymentMethod ?? '—', p.entryNumber ?? '—',
      r ? `${r.checkIn}→${r.checkOut}` : 'sin estancia',
    ].join(' | '))
  }
  L.push('')

  // ── Lo que hay que reclamar ────────────────────────────────────────────────
  const debiendo = delAnio
    .map(r => ({ r, falta: Math.round((r.total - cobradoDe(r, payments)) * 100) / 100 }))
    .filter(x => x.falta > 0.005)
  const vencidas = debiendo.filter(x => x.r.checkOut < hoy)
  const porVenir = debiendo.filter(x => x.r.checkOut >= hoy)
  L.push('LO QUE FALTA POR COBRAR')
  L.push(`- De estancias ya terminadas (esto sí es un descubierto): ${vencidas.length} por ${eur(vencidas.reduce((s, x) => s + x.falta, 0))}`)
  for (const x of vencidas) L.push(`  · ${nombre(x.r.apartmentId)} ${x.r.checkIn}→${x.r.checkOut}: faltan ${eur(x.falta)}`)
  L.push(`- De estancias en curso o por venir (NO es un descubierto): ${porVenir.length} por ${eur(porVenir.reduce((s, x) => s + x.falta, 0))}`)
  for (const x of porVenir) L.push(`  · ${nombre(x.r.apartmentId)} ${x.r.checkIn}→${x.r.checkOut}: faltan ${eur(x.falta)}`)
  const deMas = delAnio
    .map(r => ({ r, sobra: Math.round((cobradoDe(r, payments) - r.total) * 100) / 100 }))
    .filter(x => x.sobra > 0.005)
  if (deMas.length) {
    L.push(`- Cobrado de más: ${deMas.length} por ${eur(deMas.reduce((s, x) => s + x.sobra, 0))}`)
    for (const x of deMas) L.push(`  · ${nombre(x.r.apartmentId)} ${x.r.checkIn}→${x.r.checkOut}: ${eur(x.sobra)} de más`)
  }
  L.push('')

  // ── Gastos ────────────────────────────────────────────────────────────────
  const gastosAnio = expenses.filter(e => esDelAnio(e.expenseDate))
  if (gastosAnio.length) {
    const porTipo = new Map<string, number>()
    for (const g of gastosAnio) porTipo.set(g.expenseType, Math.round(((porTipo.get(g.expenseType) ?? 0) + g.amount) * 100) / 100)
    L.push(`GASTOS DE ${year} (${gastosAnio.length} apuntes, ${eur(gastosAnio.reduce((s, g) => s + g.amount, 0))})`)
    for (const [tipo, importe] of [...porTipo].sort((a, b) => b[1] - a[1])) L.push(`- ${tipo}: ${eur(importe)}`)
    L.push('')
  }

  L.push('DÓNDE MIRAR CADA COSA EN LA APP')
  L.push('- Cobros: lo cobrado por trimestres y mes a mes, «Cobros según reserva» y «Pagos por reserva».')
  L.push('- Planning: el calendario de ocupación. Edificios: lo mismo visto desde la calle.')
  L.push('- Precios: la tarifa general y las tarifas de oferta.')
  L.push('- Asesoría: la hoja del ejercicio y la comparación con la hoja del gestor.')

  return L.join('\n')
}

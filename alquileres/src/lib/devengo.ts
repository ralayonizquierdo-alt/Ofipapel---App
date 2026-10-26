import type { Reservation } from '../types'

/**
 * Reparto de una estancia entre los meses que ocupa: el devengo.
 *
 * Nace de algo muy concreto (21/10/2026). El listado de Cobros enseñaba una
 * estancia en todos los meses que pisa y repetía cifras en cada uno: la del
 * 105 del 31 de julio al 10 de agosto salía con 511,42 € en julio y otra vez
 * en agosto, y el ojo las sumaba. «Esa cifra en ese mes no es real, se cobra
 * al mes siguiente» —palabras del propietario—, y como los cobros se hacen
 * **mes a mes**, lo que tiene que cuadrar es lo devengado de cada mes.
 *
 * Así que cada mes se queda con **su parte**: las noches que duerme en él. La
 * limpieza no se reparte —se cobra una vez, al entrar— y va entera en el mes
 * de entrada. Las partes suman exactamente el importe de la estancia: el
 * último mes se lleva el redondeo para que no se pierda ni un céntimo.
 *
 * Nada de esto toca a los cobros: el dinero sigue contando en el mes en el que
 * entró. Son las dos caras —lo devengado y lo cobrado— y es justo su
 * diferencia la que dice si una estancia va al día, por delante o debiendo.
 */

const enDias = (iso: string) =>
  Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))

const DIA = 86400000

const round2 = (n: number) => Math.round(n * 100) / 100

/** El mes siguiente a «AAAA-MM». */
export function mesSiguiente(mm: string): string {
  const y = Number(mm.slice(0, 4)), m = Number(mm.slice(5, 7))
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

/** Noches de la estancia que caen dentro del mes «AAAA-MM». */
export function nochesEnMes(r: Pick<Reservation, 'checkIn' | 'checkOut'>, mm: string): number {
  const y = Number(mm.slice(0, 4)), m = Number(mm.slice(5, 7))
  const ini = Date.UTC(y, m - 1, 1), fin = Date.UTC(y, m, 1)
  const desde = Math.max(enDias(r.checkIn), ini)
  const hasta = Math.min(enDias(r.checkOut), fin)
  return hasta > desde ? Math.round((hasta - desde) / DIA) : 0
}

/** Noches de la estancia, contadas de sus fechas. */
export function nochesTotales(r: Pick<Reservation, 'checkIn' | 'checkOut'>): number {
  return Math.max(0, Math.round((enDias(r.checkOut) - enDias(r.checkIn)) / DIA))
}

/**
 * El alojamiento (el importe sin la limpieza) repartido por meses.
 *
 * Devuelve un mapa «AAAA-MM» → euros. Suma exacta: al último mes se le ajusta
 * el redondeo, así que las partes dan siempre el alojamiento completo.
 */
export function partesDeAlojamiento(r: Reservation): Map<string, number> {
  const partes = new Map<string, number>()
  const noches = nochesTotales(r)
  const alojamiento = round2((r.total || 0) - (r.cleaningFee || 0))
  if (noches <= 0) {
    if (alojamiento) partes.set(r.checkIn.slice(0, 7), alojamiento)
    return partes
  }
  const porNoche = alojamiento / noches
  let mm = r.checkIn.slice(0, 7)
  const ultimo = r.checkOut.slice(0, 7)
  let repartido = 0, ultimoConNoches = mm
  // Hasta el mes de salida incluido; si se sale el día 1, ese mes no tiene
  // ninguna noche y nochesEnMes lo deja en cero, que es lo correcto.
  for (let i = 0; i < 400 && mm <= ultimo; i++) {
    const n = nochesEnMes(r, mm)
    if (n > 0) {
      const parte = round2(porNoche * n)
      partes.set(mm, parte)
      repartido = round2(repartido + parte)
      ultimoConNoches = mm
    }
    mm = mesSiguiente(mm)
  }
  const resto = round2(alojamiento - repartido)
  if (resto !== 0 && partes.has(ultimoConNoches)) {
    partes.set(ultimoConNoches, round2(partes.get(ultimoConNoches)! + resto))
  }
  return partes
}

/**
 * El desglose de una estancia, mes a mes, tal y como lo escribe el propietario
 * a mano (26/10/2026):
 *
 *   agosto       15-N      697,50
 *   septiembre   30-N    1.395,00
 *   ...
 *   Limpieza                40,00
 *   Total                4.707,50
 *
 * Es lo que sale al parar el ratón encima del importe o de las noches en
 * Cobros. Solo tiene sentido en estancias que pasan de un mes; en una semana
 * no hay nada que repartir.
 */
export interface LineaDesglose {
  /** «AAAA-MM». */
  mes: string
  noches: number
  importe: number
}

export function desglosePorMeses(r: Reservation): LineaDesglose[] {
  const partes = partesDeAlojamiento(r)
  return [...partes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, importe]) => ({ mes, noches: nochesEnMes(r, mes), importe }))
}

/** Lo devengado en ese mes: su parte de alojamiento y, si entra, la limpieza. */
export function devengoDelMes(r: Reservation, mm: string, partes?: Map<string, number>): number {
  const p = (partes ?? partesDeAlojamiento(r)).get(mm) ?? 0
  const limpieza = r.checkIn.slice(0, 7) === mm ? (r.cleaningFee || 0) : 0
  return round2(p + limpieza)
}

/**
 * Lo devengado desde que empezó la estancia hasta el final de ese mes.
 *
 * Cuenta también los meses del año anterior: una estancia que entró en
 * diciembre ya había devengado esa parte antes de enero, y comparar lo cobrado
 * con lo devengado solo del año en curso daría un falso descubierto.
 */
export function devengoAcumulado(r: Reservation, mm: string, partes?: Map<string, number>): number {
  const ps = partes ?? partesDeAlojamiento(r)
  let total = 0
  for (const [mes, parte] of ps) if (mes <= mm) total = round2(total + parte)
  if (r.checkIn.slice(0, 7) <= mm) total = round2(total + (r.cleaningFee || 0))
  return total
}

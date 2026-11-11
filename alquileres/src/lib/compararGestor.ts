// El paquete no expone entrada raíz, solo subrutas: en el navegador va /browser.
import readXlsxFile from 'read-excel-file/browser'
import { mesContableCon } from './mesContable'
import type { Apartment, Payment, Reservation } from '../types'

/**
 * La hoja trimestral del gestor («ALQUILER MAURIZ AAAA …»), para compararla
 * con lo que tenemos nosotros.
 *
 * Es lo que pidió el propietario el 23/10/2026: «necesito dónde subir estos
 * ficheros para hacer comparativa con lo que figura en nuestra aplicación y
 * señalar diferencias e incongruencias».
 *
 * El fichero es corto y siempre igual: una fila por trimestre e inmueble, con
 * «1T … 4T» en una columna, «APART/104» o «JUAN XXIII» en la siguiente, la
 * base en la de más allá y el IGIC al 7 % al final. No trae cabeceras, así que
 * se lee buscando el trimestre en la fila, no por posición fija: en el de 2025
 * y el de 2026 las columnas no caen en el mismo sitio.
 *
 * **Esto no guarda nada.** Solo lee para enseñar la diferencia; lo que la app
 * tiene registrado no se toca.
 */

export interface FilaGestor {
  /** 1 a 4. */
  trimestre: number
  /** El identificador nuestro: 104, 402, JXXIII… */
  apartmentId: string
  /** Lo que el gestor pone en esa casilla, tal cual. */
  rotulo: string
  base: number
  igic: number
}

export interface HojaGestor {
  year: number
  filas: FilaGestor[]
  /** Rótulos que no hemos sabido emparejar con ningún apartamento nuestro. */
  sinCasar: string[]
  total: number
  /**
   * Lo que pone el propio gestor en su fila «TOTAL». En la hoja de 2026 dice
   * 40.227,09 € y sus casillas suman 43.627,09 €: le falta el 1T del 104
   * (3.400 €). Se compara para avisarlo.
   */
  totalDeclarado?: number
  /** Trimestres en los que su hoja no trae ninguna cifra: aún no los ha hecho. */
  sinHacer: number[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Pisos que no lleva el gestor: el Arenal 2B lo explota SOC y su cuadre va
 * contra el informe anual de SOC, no contra «ALQUILER MAURIZ» (Luis,
 * 11/11/2026: «en el listado de Mauriz no hay nada del 2B»). Sin esto, todo
 * lo cobrado del Arenal salía como diferencia con el gestor.
 */
export const FUERA_DEL_GESTOR = ['AP2B']

/**
 * «APART/104» → 104, «JUAN XXIII» → P3 (el Piso 3).
 *
 * Se compara sin espacios ni barras y sin acentos, porque el mismo inmueble
 * aparece escrito de varias maneras entre un año y otro.
 */
export function apartamentoDeRotulo(rotulo: string, apartments: Apartment[]): string | null {
  const limpio = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '')
  const r = limpio(rotulo)
  if (!r) return null
  // «JUAN XXIII» es el Piso 3 (Luis, 11/11/2026): no se parece ni a su id
  // (P3) ni a su nombre, así que se dice aquí.
  if (/JUANXXI{1,3}/.test(r) && apartments.some(a => a.id === 'P3')) return 'P3'
  // Primero por el número o el código: APART104 contiene 104.
  for (const a of apartments) {
    const id = limpio(a.id)
    if (id && (r === id || r.endsWith(id) || r.startsWith(id))) return a.id
  }
  // Y si no, por el nombre.
  for (const a of apartments) {
    const nombre = limpio(a.name)
    if (nombre && (r === nombre || r.includes(nombre) || nombre.includes(r))) return a.id
  }
  return null
}

const esTrimestre = (v: unknown): number | null => {
  const m = String(v ?? '').trim().toUpperCase().match(/^([1-4])\s*T$/)
  return m ? Number(m[1]) : null
}

const numero = (v: unknown): number | null => {
  if (typeof v === 'number') return v
  const t = String(v ?? '').replace(/\s|€/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')
  if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null
  return Number(t)
}

/**
 * Según la versión, la librería devuelve las filas directamente o envueltas en
 * [{ sheet, data }]. Se admiten las dos formas, igual que en `importExcel.ts`.
 */
function extraeFilas(bruto: unknown): unknown[][] {
  if (!Array.isArray(bruto)) return []
  const primero: unknown = bruto[0]
  if (primero && !Array.isArray(primero) && typeof primero === 'object') {
    const data = (primero as { data?: unknown }).data
    if (Array.isArray(data)) return data as unknown[][]
  }
  return bruto as unknown[][]
}

/** Lee la hoja del gestor. No escribe nada: solo devuelve lo que pone. */
export async function leeHojaGestor(fichero: File, apartments: Apartment[]): Promise<HojaGestor> {
  return analizaHojaGestor(await readXlsxFile(fichero), apartments)
}

/** Analiza las filas ya leídas. Aparte de la lectura, para poder probarlo. */
export function analizaHojaGestor(bruto: unknown, apartments: Apartment[]): HojaGestor {
  const filas = extraeFilas(bruto)
  const resultado: FilaGestor[] = []
  const sinCasar: string[] = []
  let year = 0
  let totalDeclarado: number | undefined
  /** Trimestres con alguna cifra distinta de cero en la hoja. */
  const conCifras = new Set<number>()

  for (const fila of filas) {
    for (const celda of fila) {
      const n = numero(celda)
      // El año va suelto en una celda, a la izquierda del todo.
      if (!year && n && Number.isInteger(n) && n >= 2000 && n <= 2100) year = n
    }
    const iTotal = fila.findIndex(c => String(c ?? '').trim().toUpperCase() === 'TOTAL')
    if (iTotal >= 0) {
      const n = fila.slice(iTotal + 1).map(numero).find((x): x is number => x !== null)
      if (n !== undefined) totalDeclarado = round2(n)
      continue
    }
    const iT = fila.findIndex(c => esTrimestre(c) !== null)
    if (iT < 0) continue
    const trimestre = esTrimestre(fila[iT])!
    const rotulo = String(fila[iT + 1] ?? '').trim()
    if (!rotulo) continue
    // De lo que queda a la derecha, la base es el primer número y el IGIC el
    // último: en medio hay una columna que siempre viene a cero.
    const numeros = fila.slice(iT + 2).map(numero).filter((x): x is number => x !== null)
    if (numeros.length === 0) continue
    const base = numeros[0]
    const igic = numeros.length > 1 ? numeros[numeros.length - 1] : 0
    if (base) conCifras.add(trimestre)
    const apartmentId = apartamentoDeRotulo(rotulo, apartments)
    if (!apartmentId) { if (!sinCasar.includes(rotulo)) sinCasar.push(rotulo); continue }
    resultado.push({ trimestre, apartmentId, rotulo, base: round2(base), igic: round2(igic) })
  }

  return {
    year,
    filas: resultado,
    sinCasar,
    total: round2(resultado.reduce((s, f) => s + f.base, 0)),
    totalDeclarado,
    sinHacer: [1, 2, 3, 4].filter(t => !conCifras.has(t)),
  }
}

export interface LineaCuadre {
  trimestre: number
  apartmentId: string
  /** Lo que dice la hoja del gestor. */
  gestor: number
  /** Lo que tiene la app cobrado en ese trimestre de ese inmueble. */
  nuestro: number
  diferencia: number
}

export interface CuadreGestor {
  year: number
  lineas: LineaCuadre[]
  /** Solo las que no cuadran, de mayor a menor diferencia. */
  diferencias: LineaCuadre[]
  totalGestor: number
  totalNuestro: number
  sinCasar: string[]
  /** Trimestres que el gestor aún no ha hecho: no se comparan. */
  sinHacer: number[]
  /** Su fila «TOTAL», si no coincide con lo que suman sus casillas. */
  totalDeclaradoMal?: { declarado: number; suma: number }
}

/** Un céntimo arriba o abajo no es una diferencia: es el redondeo. */
const UMBRAL = 0.02

/**
 * Compara la hoja del gestor con lo cobrado en la app, trimestre a trimestre y
 * por inmueble.
 *
 * Se compara contra **lo cobrado**, no contra lo devengado: la hoja del gestor
 * es de ingresos declarados y es con los cobros con lo que se cuadra. El mes
 * que manda es el contable (`Payment.mes`), igual que en la pantalla de Cobros;
 * cuando un cobro no lo trae, se usa su fecha.
 */
export function cuadraConGestor(
  hoja: HojaGestor,
  reservations: Reservation[],
  payments: Payment[],
): CuadreGestor {
  const aptDeReserva = new Map(reservations.map(r => [r.id, r.apartmentId]))
  const mesDe = mesContableCon(reservations)
  const nuestro = new Map<string, number>()
  for (const p of payments) {
    if (!p.received) continue
    const cuando = mesDe(p)
    if (!cuando?.startsWith(String(hoja.year))) continue
    const apt = p.apartmentId ?? aptDeReserva.get(p.reservationId)
    if (!apt || FUERA_DEL_GESTOR.includes(apt)) continue
    const mes = Number(cuando.slice(5, 7))
    const t = Math.floor((mes - 1) / 3) + 1
    // Un trimestre que el gestor no ha hecho todavía no es una diferencia.
    if (hoja.sinHacer.includes(t)) continue
    const clave = `${t}|${apt}`
    nuestro.set(clave, round2((nuestro.get(clave) ?? 0) + p.amount))
  }

  const claves = new Set<string>([
    ...hoja.filas.map(f => `${f.trimestre}|${f.apartmentId}`),
    ...nuestro.keys(),
  ])
  const lineas: LineaCuadre[] = [...claves].map(k => {
    const [t, apt] = k.split('|')
    const g = round2(hoja.filas
      .filter(f => f.trimestre === Number(t) && f.apartmentId === apt)
      .reduce((s, f) => s + f.base, 0))
    const n = nuestro.get(k) ?? 0
    return { trimestre: Number(t), apartmentId: apt, gestor: g, nuestro: n, diferencia: round2(g - n) }
  }).sort((a, b) => a.trimestre - b.trimestre || a.apartmentId.localeCompare(b.apartmentId))

  return {
    year: hoja.year,
    lineas,
    diferencias: lineas.filter(l => Math.abs(l.diferencia) >= UMBRAL)
      .sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia)),
    totalGestor: round2(lineas.reduce((s, l) => s + l.gestor, 0)),
    totalNuestro: round2(lineas.reduce((s, l) => s + l.nuestro, 0)),
    sinCasar: hoja.sinCasar,
    sinHacer: hoja.sinHacer,
    totalDeclaradoMal: hoja.totalDeclarado !== undefined && Math.abs(hoja.totalDeclarado - hoja.total) >= UMBRAL
      ? { declarado: hoja.totalDeclarado, suma: hoja.total }
      : undefined,
  }
}

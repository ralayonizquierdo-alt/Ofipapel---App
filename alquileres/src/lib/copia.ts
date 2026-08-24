import type {
  Apartment, PriceEntry, Reservation, Payment, Repair, Expense, OfferPrice,
  DeletedRepair, IngresoMensual, OcupacionMensual, ReparacionMensual, ImportLog,
} from '../types'

/**
 * Copia de seguridad de todos los datos, en un solo fichero.
 *
 * Firebase no borra a la papelera: lo que se borra por error, desaparece. Esto
 * deja un fichero que se puede guardar en cualquier sitio y con el que se puede
 * reconstruir el ejercicio si hiciera falta.
 *
 * No sustituye a las copias automáticas de Firebase; es lo que se puede hacer
 * desde la propia app, sin depender de nadie.
 */

export interface DatosCopia {
  apartments: Apartment[]
  prices: PriceEntry[]
  reservations: Reservation[]
  payments: Payment[]
  repairs: Repair[]
  deletedRepairs: DeletedRepair[]
  expenses: Expense[]
  offerPrices: OfferPrice[]
  incomes: IngresoMensual[]
  occupancies: OcupacionMensual[]
  repairTotals: ReparacionMensual[]
  importLogs: ImportLog[]
}

export interface Copia extends DatosCopia {
  /** Versión del formato, por si algún día cambia la forma de los datos. */
  formato: 1
  creada: string
  totales: Record<string, number>
}

export function construyeCopia(datos: DatosCopia): Copia {
  const totales: Record<string, number> = {}
  for (const [nombre, lista] of Object.entries(datos)) {
    totales[nombre] = Array.isArray(lista) ? lista.length : 0
  }
  return { formato: 1, creada: new Date().toISOString(), totales, ...datos }
}

/** Nombre con la fecha delante, para que se ordenen solas en la carpeta. */
export function nombreCopia(fecha = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `alquileres-copia-${fecha.getFullYear()}${p(fecha.getMonth() + 1)}${p(fecha.getDate())}` +
         `-${p(fecha.getHours())}${p(fecha.getMinutes())}.json`
}

/** Cada cuántos días toca hacer copia, según lo acordado con el propietario. */
export const DIAS_ENTRE_COPIAS = 15

const CLAVE = 'aq_ultima_copia'

/**
 * Cuándo se hizo la última copia. Se apunta en el navegador, no en Firebase:
 * la copia la descarga una persona a su equipo, así que el aviso vive donde
 * está esa persona.
 */
export function ultimaCopia(): string | null {
  try { return localStorage.getItem(CLAVE) } catch { return null }
}

export function apuntaCopia(iso: string) {
  try { localStorage.setItem(CLAVE, iso) } catch { /* navegador sin almacenamiento */ }
}

/** ¿Toca hacer copia? También cuando no se ha hecho ninguna nunca. */
export function tocaCopia(): boolean {
  const dias = diasDesde(ultimaCopia())
  return dias === null || dias >= DIAS_ENTRE_COPIAS
}

/** Cuántos días hace de la última copia. `null` si no hay ninguna. */
export function diasDesde(iso: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((Date.now() - t) / 86400000)
}

/** Lanza la descarga del fichero en el navegador. */
export function descargaCopia(datos: DatosCopia): string {
  const copia = construyeCopia(datos)
  const nombre = nombreCopia()
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(copia, null, 2)], { type: 'application/json' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Sin esto el navegador se queda con el fichero entero en memoria.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return nombre
}

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
  return descargaTexto(nombreCopia(), JSON.stringify(construyeCopia(datos), null, 2))
}

/** Los registros que lleva una copia, para decirlo en el correo y en pantalla. */
export function registrosDe(datos: DatosCopia): number {
  return Object.values(datos).reduce((s, l) => s + (Array.isArray(l) ? l.length : 0), 0)
}

// ─── Copia automática y por correo (Luis, 16/11/2026) ─────────────────────────
//
// Cada 15 días, al abrir la app, la copia se hace sola: se descarga y se manda
// por correo (netlify/functions/alquileres-copia-correo.js). La fecha de la
// última va en Firestore (`meta/copiaSeguridad`) y no solo en el navegador, para
// que no la haga cada ordenador por su cuenta.

export const DOC_COPIA = { coleccion: 'meta', id: 'copiaSeguridad' }

export interface EstadoCopia {
  ultima: string
  por?: string
  /** Cómo fue el correo de la última: «enviada» o el error. */
  correo?: string
}

/**
 * La función de correo vive en Netlify. La copia de GitHub Pages (y las pruebas
 * en local) no tienen funciones, así que desde fuera de *.netlify.app se llama
 * a la publicada.
 */
const RUTA_CORREO = '/.netlify/functions/alquileres-copia-correo'
function urlCorreo(): string {
  return location.hostname.endsWith('netlify.app') ? RUTA_CORREO : `https://ofipapel.netlify.app${RUTA_CORREO}`
}

/** UTF-8 a base64 por trozos: `btoa` de una cadena larga con tildes no vale. */
function aBase64(texto: string): string {
  const bytes = new TextEncoder().encode(texto)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Manda la copia por correo. Devuelve a quién, o lanza el error en castellano. */
export async function enviaCopiaPorCorreo(
  nombre: string, texto: string, registros: number, token: string, desde: string | null,
): Promise<string> {
  const resp = await fetch(urlCorreo(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nombre, contenido: aBase64(texto), registros, desde }),
  })
  const r = await resp.json().catch(() => ({})) as { error?: string; para?: string }
  if (!resp.ok) throw new Error(r.error || `El servidor ha contestado ${resp.status}.`)
  return r.para || 'el correo de la oficina'
}

/** Descarga un texto como fichero .json. */
export function descargaTexto(nombre: string, texto: string): string {
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }))
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

// El paquete no expone entrada raíz, solo subrutas: en el navegador va /browser.
import readXlsxFile from 'read-excel-file/browser'
import type { ExpenseType } from '../types'

/**
 * Lector del Excel «Resumen cobros y gastos».
 *
 * El fichero repite un bloque por inmueble. Dentro de cada bloque:
 *   fila DIRECCION   -> col C dirección, col D nombre del apartamento
 *   fila siguiente   -> % de ocupación de cada mes (columnas D, F, H… )
 *   filas de concepto-> col B nombre del gasto; base imponible en C, E, G…
 *                       e IGIC en la columna siguiente de cada par.
 *
 * Se lee por posición de columna, no por cabecera, porque las cabeceras están
 * combinadas por meses y no llegan fila a fila.
 */

/**
 * Dónde está cada cosa dentro de una fila. No son columnas fijas: el fichero
 * ha cambiado de sitio con el tiempo (en la versión de 2025 todo se corrió una
 * columna a la derecha), así que se deducen mirando dónde cae el rótulo
 * DIRECCION y se desplaza todo lo demás con él.
 */
interface Columnas {
  concepto: number
  direccion: number
  base: number[]
  igic: number[]
}

function columnasDe(desplazamiento: number): Columnas {
  const base = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24].map(c => c + desplazamiento)
  return {
    concepto: 1 + desplazamiento,
    direccion: 2 + desplazamiento,
    base,
    igic: base.map(c => c + 1),
  }
}

/** Busca el rótulo DIRECCION para saber cuánto se ha desplazado la tabla. */
function desplazamientoDe(filas: unknown[][]): number {
  for (const fila of filas) {
    if (!Array.isArray(fila)) continue
    for (let c = 0; c < 6; c++) {
      if (normaliza(fila[c]) === 'direccion') return c - 1
    }
  }
  return 0
}

export interface GastoImportado {
  apartmentId: string
  year: number
  month: number
  expenseType: ExpenseType
  base: number
  igic: number
}

export interface OcupacionImportada {
  apartmentId: string
  month: number
  diasAlquilados: number
  diasTotales: number
}

export interface ResultadoImport {
  year: number
  gastos: GastoImportado[]
  ingresosPorInmueble: { apartmentId: string; month: number; base: number }[]
  reparaciones: { apartmentId: string; month: number; base: number }[]
  /** Gastos que el Excel marca como sin justificante: no se cargan. */
  sinJustificante: { apartmentId: string; month: number; base: number }[]
  ocupaciones: OcupacionImportada[]
  inmueblesNoReconocidos: string[]
}

function normaliza(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim()
}

function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = Number(String(v ?? '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/** Del nombre o la dirección del bloque al id de apartamento de la app. */
export function reconoceInmueble(nombre: unknown, direccion: unknown): string | null {
  const t = normaliza(nombre) + ' ' + normaliza(direccion)
  for (const id of ['104', '105', '106', '203', '204', '402']) {
    if (t.includes(id)) return id
  }
  if (t.includes('arenal')) return 'AP2B'
  if (t.includes('juan') || t.includes('piso 3')) return 'P3'
  return null
}

const CONCEPTOS: { patron: string; tipo: ExpenseType }[] = [
  { patron: 'comisiones',        tipo: 'comisiones' },
  { patron: 'comision agencia',  tipo: 'comisionAgencia' },
  { patron: 'limpieza',          tipo: 'limpieza' },
  { patron: 'lavanderia',        tipo: 'lavanderia' },
  { patron: 'electricidad',      tipo: 'electricidad' },
  { patron: 'agua',              tipo: 'agua' },
  { patron: 'internet',          tipo: 'internet' },
  { patron: 'comunidad',         tipo: 'comunidad' },
  { patron: 'ibi',               tipo: 'ibi' },
  { patron: 'basura',            tipo: 'basura' },
  { patron: 'profesionales',     tipo: 'profesionales' },
  { patron: 'otros servicios',   tipo: 'otro' },
]

function reconoceConcepto(texto: string): ExpenseType | null {
  // 'comision agencia' antes que 'comisiones' para que no se lo trague el primero.
  const orden = [...CONCEPTOS].sort((a, b) => b.patron.length - a.patron.length)
  for (const { patron, tipo } of orden) {
    if (texto.includes(patron)) return tipo
  }
  return null
}

export async function leerExcel(fichero: File): Promise<ResultadoImport> {
  return analizaFilas((await readXlsxFile(fichero)) as unknown)
}

/**
 * Según la versión, la librería devuelve las filas directamente o envueltas en
 * [{ sheet, data }]. Se admiten las dos formas.
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

/** Analiza las filas ya leídas. Separado de la lectura para poder probarlo. */
export function analizaFilas(bruto: unknown): ResultadoImport {
  const filas = extraeFilas(bruto)
  const COL = columnasDe(desplazamientoDe(filas))

  // Ejercicio: el primer año suelto que aparezca antes de los datos. Se mira
  // toda la cabecera hasta el primer bloque de inmueble, no unas pocas filas:
  // en la versión de 2025 el año está bastante más abajo, junto al título.
  const primerBloque = filas.findIndex(f =>
    Array.isArray(f) && f.some(c => normaliza(c) === 'direccion'))
  const hastaDonde = primerBloque > 0 ? primerBloque : 40
  let year = 0
  for (const fila of filas.slice(0, hastaDonde)) {
    // Las filas vacías del Excel no siempre llegan como array.
    if (!Array.isArray(fila)) continue
    for (const celda of fila) {
      const n = typeof celda === 'number' ? celda : Number(celda)
      if (Number.isInteger(n) && n >= 2000 && n <= 2100) { year = n; break }
    }
    if (year) break
  }
  if (!year) year = new Date().getFullYear()

  const gastos: GastoImportado[] = []
  const ingresosPorInmueble: ResultadoImport['ingresosPorInmueble'] = []
  const reparaciones: ResultadoImport['reparaciones'] = []
  const sinJustificante: ResultadoImport['sinJustificante'] = []
  const inmueblesNoReconocidos: string[] = []

  // Los días alquilados y totales de cada mes viven en las filas siguientes a
  // DIRECCION, con el rótulo en la columna C y el valor en la de al lado. Son
  // los que dan la ocupación con la que se prorratea el gasto deducible.
  const diasAlq = new Map<string, number>()
  const diasTot = new Map<string, number>()

  let apartmentId: string | null = null

  for (const fila of filas) {
    if (!Array.isArray(fila)) continue

    // Antes del filtro de abajo: la fila de «DIAS TOTALES» trae la columna B
    // vacía y el rótulo en la C, así que se descartaría por no tener etiqueta.
    const rotulo = normaliza(fila[COL.direccion])
    if (apartmentId && (rotulo.startsWith('dias totales') || rotulo.startsWith('dias alquilado'))) {
      const destino = rotulo.startsWith('dias totales') ? diasTot : diasAlq
      for (let m = 0; m < 12; m++) {
        const v = num(fila[COL.igic[m]])
        if (v) destino.set(`${apartmentId}|${m + 1}`, v)
      }
      continue
    }

    const etiqueta = normaliza(fila[COL.concepto])
    if (!etiqueta) continue

    if (etiqueta === 'direccion') {
      // El nombre del inmueble no siempre está en la misma casilla —a veces va
      // pegado a la dirección, a veces unas columnas más allá—, así que se mira
      // todo el trozo de fila que sigue al rótulo.
      const trozo = fila.slice(COL.direccion, COL.direccion + 7).map(v => String(v ?? '')).join(' ')
      apartmentId = reconoceInmueble(trozo, fila[COL.direccion])
      if (!apartmentId) {
        inmueblesNoReconocidos.push(String(fila[COL.direccion + 1] ?? fila[COL.direccion] ?? '¿?'))
      }
      continue
    }
    if (!apartmentId) continue

    const registra = (destino: { apartmentId: string; month: number; base: number }[]) => {
      for (let m = 0; m < 12; m++) {
        const base = num(fila[COL.base[m]])
        if (base) destino.push({ apartmentId: apartmentId!, month: m + 1, base })
      }
    }

    const registraGasto = (tipo: ExpenseType) => {
      for (let m = 0; m < 12; m++) {
        const base = num(fila[COL.base[m]])
        const igic = num(fila[COL.igic[m]])
        if (base) gastos.push({ apartmentId: apartmentId!, year, month: m + 1, expenseType: tipo, base, igic })
      }
    }

    if (etiqueta.includes('ingresos brutos')) {
      // Desde 2025 hay dos filas con ese nombre: lo que cobra la propiedad y el
      // precio publicado en la web, que es otra cosa y no se declara como
      // ingreso. Solo entra la primera.
      if (!/web|publi/.test(etiqueta)) registra(ingresosPorInmueble)
      continue
    }

    // Gastos sin justificante. Luis confirmó (24/08/2026) que SÍ se declaran, y
    // qué es cada letra —está también en la cabecera de la plantilla de
    // limpieza, columna DESTINO—:
    //   (A) → limpieza y lavandería de los apartamentos
    //   (R) → otros servicios y gastos: fontaneros y demás
    // Antes se descartaban por no saber qué eran. Ahora entran como el gasto
    // que les corresponde; se siguen contando aparte para poder enseñarlos
    // marcados en la vista previa, porque no llevan factura detrás.
    // «just» cubre las tres formas que usa el Excel: «s/just.», «s/justificante»
    // y «sin justificante». Se exige esa palabra a propósito: buscar solo «(a)»
    // o «(r)» se llevaría por delante cualquier otra fila que lleve un paréntesis.
    if (etiqueta.includes('just')) {
      registra(sinJustificante)
      const suTipo: ExpenseType = /\(\s*a\s*\)/.test(etiqueta) ? 'limpieza' : 'otro'
      registraGasto(suTipo)
      continue
    }

    // Las reparaciones no se dan de alta como gasto: ya viven en su propia
    // pantalla con proveedor y factura, y volcarlas aquí las duplicaría. Se
    // guardan aparte solo como cifra declarada, para poder compararlas.
    if (etiqueta.includes('reparaciones')) { registra(reparaciones); continue }

    const tipo = reconoceConcepto(etiqueta)
    if (tipo) registraGasto(tipo)
  }

  // Se recorren los días totales, no los alquilados: un mes cerrado (0 noches)
  // también es un dato: su gasto no se deduce. Si solo miráramos los alquilados
  // ese mes desaparecería y acabaría prorrateándose con otra ocupación.
  const ocupaciones: OcupacionImportada[] = []
  for (const [clave, diasTotales] of diasTot) {
    if (diasTotales <= 0) continue
    const [apt, mes] = clave.split('|')
    ocupaciones.push({
      apartmentId: apt, month: Number(mes),
      diasAlquilados: diasAlq.get(clave) || 0, diasTotales,
    })
  }

  return { year, gastos, ingresosPorInmueble, reparaciones, sinJustificante, ocupaciones, inmueblesNoReconocidos }
}

/**
 * Id estable por inmueble/mes/concepto: volver a importar el mismo Excel
 * actualiza los apuntes en vez de duplicarlos.
 */
export function idGasto(g: GastoImportado): string {
  const mm = String(g.month).padStart(2, '0')
  return `xls-${g.year}${mm}-${g.apartmentId}-${g.expenseType}`
}

/** Mismo criterio para la ocupación declarada. */
export function idOcupacion(year: number, apartmentId: string, month: number): string {
  return `xls-${year}${String(month).padStart(2, '0')}-${apartmentId}`
}

/** Mismo criterio para los ingresos brutos declarados. */
export function idIngreso(year: number, apartmentId: string, month: number): string {
  return `xls-${year}${String(month).padStart(2, '0')}-${apartmentId}`
}

/** Mismo criterio para las reparaciones declaradas. */
export function idReparacionDeclarada(year: number, apartmentId: string, month: number): string {
  return `xls-${year}${String(month).padStart(2, '0')}-${apartmentId}`
}

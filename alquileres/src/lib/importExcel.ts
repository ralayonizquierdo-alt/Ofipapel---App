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

// Columnas (base 0) de base imponible e IGIC de enero a diciembre.
const COL_BASE = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]
const COL_IGIC = COL_BASE.map(c => c + 1)
const COL_CONCEPTO = 1
const COL_DIRECCION = 2
const COL_NOMBRE = 3

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
  reparacionesIgnoradas: { apartmentId: string; month: number; base: number }[]
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

  // Año: primer número de 4 cifras plausible en la cabecera del documento.
  let year = new Date().getFullYear()
  for (const fila of filas.slice(0, 12)) {
    // Las filas vacías del Excel no siempre llegan como array.
    if (!Array.isArray(fila)) continue
    for (const celda of fila) {
      const n = typeof celda === 'number' ? celda : Number(celda)
      if (Number.isInteger(n) && n >= 2000 && n <= 2100) { year = n; break }
    }
  }

  const gastos: GastoImportado[] = []
  const ingresosPorInmueble: ResultadoImport['ingresosPorInmueble'] = []
  const reparacionesIgnoradas: ResultadoImport['reparacionesIgnoradas'] = []
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
    const rotulo = normaliza(fila[COL_DIRECCION])
    if (apartmentId && (rotulo.startsWith('dias totales') || rotulo.startsWith('dias alquilado'))) {
      const destino = rotulo.startsWith('dias totales') ? diasTot : diasAlq
      for (let m = 0; m < 12; m++) {
        const v = num(fila[COL_IGIC[m]])
        if (v) destino.set(`${apartmentId}|${m + 1}`, v)
      }
      continue
    }

    const etiqueta = normaliza(fila[COL_CONCEPTO])
    if (!etiqueta) continue

    if (etiqueta === 'direccion') {
      apartmentId = reconoceInmueble(fila[COL_NOMBRE], fila[COL_DIRECCION])
      if (!apartmentId) {
        inmueblesNoReconocidos.push(String(fila[COL_NOMBRE] ?? fila[COL_DIRECCION] ?? '¿?'))
      }
      continue
    }
    if (!apartmentId) continue

    const registra = (destino: { apartmentId: string; month: number; base: number }[]) => {
      for (let m = 0; m < 12; m++) {
        const base = num(fila[COL_BASE[m]])
        if (base) destino.push({ apartmentId: apartmentId!, month: m + 1, base })
      }
    }

    if (etiqueta.includes('ingresos brutos')) { registra(ingresosPorInmueble); continue }

    // Las reparaciones ya viven en su propia pantalla con proveedor y factura:
    // importarlas aquí duplicaría el gasto.
    if (etiqueta.includes('reparaciones')) { registra(reparacionesIgnoradas); continue }

    const tipo = reconoceConcepto(etiqueta)
    if (!tipo) continue

    for (let m = 0; m < 12; m++) {
      const base = num(fila[COL_BASE[m]])
      const igic = num(fila[COL_IGIC[m]])
      if (base) gastos.push({ apartmentId, year, month: m + 1, expenseType: tipo, base, igic })
    }
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

  return { year, gastos, ingresosPorInmueble, reparacionesIgnoradas, ocupaciones, inmueblesNoReconocidos }
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

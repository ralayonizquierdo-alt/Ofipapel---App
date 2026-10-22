// El paquete no expone entrada raíz, solo subrutas: en el navegador va /browser.
import readXlsxFile from 'read-excel-file/browser'
import type { ExpenseType } from '../types'

/**
 * Lector del cuadrante de limpieza («LIMPIEZA Y REPARACIONES OFIPAPEL.xlsx»).
 *
 * Es el parte que llevan en administración: una línea por cada vez que va la
 * persona de la limpieza, con la fecha, las horas, el precio y —lo importante—
 * a qué se dedicaron esas horas. Se paga en efectivo, así que no hay factura:
 * son los «gastos sin justificante» del otro Excel.
 *
 * La cabecera parte el DESTINO en tres columnas, y de ahí sale todo:
 *
 *   I  Ofipapel        → la papelería. NO son gastos del alquiler: se descartan.
 *   J  APARTAMENTOS    → «(S/Just. (A))»: limpieza y lavandería de los pisos.
 *   K  REPARACIONES    → «(S/Just. (R))»: fontaneros y demás.
 *
 * Dentro de J se escribe a mano a qué piso fue («SALIDA APTO.204», «SALIDA 104»,
 * «ESCALERAS PISO 3»…), con toda la variedad de mayúsculas, puntos y comas que
 * cabe esperar de algo escrito a mano durante cuatro años. De ahí sale el
 * apartamento; lo que no se pueda atribuir a uno concreto se devuelve aparte y
 * a la vista, no se reparte por nuestra cuenta.
 */

/** Dónde está cada cosa. Índices desde 0, como los da la librería. */
const COL = {
  fecha: 1,      // B
  horas: 4,      // E
  importe: 6,    // G
  ofipapel: 8,   // I
  apartamentos: 9,  // J
  reparaciones: 10, // K
}

export const HOJA = 'CUADRANTE LIMPIEZA'

export interface ApunteLimpieza {
  /** Identidad de la línea: la misma línea del mismo fichero da siempre lo mismo. */
  id: string
  apartmentId: string
  fecha: string          // ISO
  expenseType: ExpenseType
  horas: number
  importe: number
  /** El destino tal cual lo escribieron, para poder enseñarlo. */
  destino: string
}

export interface SinAsignar {
  fecha: string
  destino: string
  importe: number
  motivo: string
}

export interface ResultadoLimpieza {
  apuntes: ApunteLimpieza[]
  /** Líneas de la papelería: ni se cargan ni se enseñan como problema. */
  deOfipapel: { n: number; importe: number }
  /** Líneas de los apartamentos que no se han podido atribuir a uno concreto. */
  sinAsignar: SinAsignar[]
  /** Años que trae el fichero, para saber qué periodo cubre. */
  anios: string[]
}

function normaliza(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim()
}

function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = Number(String(v ?? '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function iso(v: unknown): string | null {
  const d = v instanceof Date ? v : new Date(String(v))
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * De lo que escriben en la columna DESTINO al inmueble.
 *
 * El número del piso manda: «SALIDA APTO.204», «SALIDA 204» y «REPASO 204» son
 * todos el 204. Después van los nombres del Piso 3, que no lleva número.
 */
export function inmuebleDe(destino: string): string | null {
  const t = normaliza(destino)
  const numero = t.match(/\b(104|105|106|203|204|402)\b/)
  if (numero) return numero[1]
  if (/\bp\s*-?\s*3\b|\bpiso\s*-?\s*3\b|\bjuan\s*xxi{1,3}\b/.test(t)) return 'P3'
  if (/\barenal\b|\bmonta[nñ]a\s*chica\b/.test(t)) return 'AP2B'
  return null
}

/** Lavandería y planchado se declaran por separado de la limpieza. */
function tipoDe(destino: string, esReparacion: boolean): ExpenseType {
  if (esReparacion) return 'otro'
  return /lavander|planch/.test(normaliza(destino)) ? 'lavanderia' : 'limpieza'
}

export function analizaLimpieza(filas: unknown[][]): ResultadoLimpieza {
  const apuntes: ApunteLimpieza[] = []
  const sinAsignar: SinAsignar[] = []
  const anios = new Set<string>()
  let ofipapelN = 0
  let ofipapelImporte = 0
  // Un mismo día puede tener dos líneas idénticas (dos salidas del mismo piso):
  // el contador las distingue sin depender del número de fila, que se mueve en
  // cuanto alguien inserta algo más arriba.
  const vistos = new Map<string, number>()

  for (const fila of filas) {
    if (!Array.isArray(fila)) continue

    const fecha = iso(fila[COL.fecha])
    const importe = num(fila[COL.importe])
    if (!fecha || !importe) continue   // subtotales, cabeceras y filas en blanco

    const aptTexto = String(fila[COL.apartamentos] ?? '').trim()
    const repTexto = String(fila[COL.reparaciones] ?? '').trim()
    const destino = aptTexto || repTexto

    if (!destino) {
      // Sin destino de apartamento ni de reparación: o es de la papelería, o es
      // una línea suelta. En los dos casos, fuera de las cuentas del alquiler.
      const ofi = normaliza(fila[COL.ofipapel])
      if (ofi.includes('ofipapel')) { ofipapelN++; ofipapelImporte += importe }
      continue
    }

    anios.add(fecha.slice(0, 4))
    const apartmentId = inmuebleDe(destino)
    if (!apartmentId) {
      sinAsignar.push({
        fecha, destino, importe,
        motivo: /escalera/.test(normaliza(destino))
          ? 'Zona común: hay que decidir entre qué pisos se reparte'
          : 'No dice a qué apartamento va',
      })
      continue
    }

    const esReparacion = !aptTexto && !!repTexto
    const base = `limp-${fecha}-${apartmentId}-${Math.round(importe * 100)}`
    const repe = (vistos.get(base) ?? 0) + 1
    vistos.set(base, repe)

    apuntes.push({
      id: repe > 1 ? `${base}-${repe}` : base,
      apartmentId,
      fecha,
      expenseType: tipoDe(destino, esReparacion),
      horas: num(fila[COL.horas]),
      importe,
      destino,
    })
  }

  return {
    apuntes,
    deOfipapel: { n: ofipapelN, importe: Math.round(ofipapelImporte * 100) / 100 },
    sinAsignar,
    anios: [...anios].sort(),
  }
}

/**
 * Saca las filas de la hoja del cuadrante.
 *
 * La librería devuelve todas las hojas del libro —el fichero tiene cinco—, así
 * que hay que quedarse con la buena. Si el nombre cambiase, se cae a la
 * primera hoja en vez de fallar: más vale enseñar algo y que se vea que no
 * cuadra, que un error seco.
 */
export function hojaDelCuadrante(bruto: unknown): unknown[][] {
  if (!Array.isArray(bruto)) return []
  const primero: unknown = bruto[0]
  if (primero && !Array.isArray(primero) && typeof primero === 'object') {
    const hojas = bruto as { sheet?: string; data?: unknown[][] }[]
    const buscada = hojas.find(h => (h.sheet ?? '').trim().toUpperCase() === HOJA)
    return (buscada ?? hojas[0])?.data ?? []
  }
  return bruto as unknown[][]
}

export async function leeLimpieza(fichero: File): Promise<ResultadoLimpieza> {
  return analizaLimpieza(hojaDelCuadrante(await readXlsxFile(fichero)))
}

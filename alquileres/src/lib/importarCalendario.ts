import { leeXlsxConColores, type HojaXlsx } from './leeXlsx'

/**
 * Saca las reservas del calendario anual de alquileres.
 *
 * El fichero es un calendario pintado a mano: una fila por inmueble, una
 * columna por día del mes, y cada estancia es una franja de casillas del mismo
 * color. El nombre del huésped y, muchas veces, las fechas exactas están
 * escritos dentro de alguna casilla de la franja.
 *
 * Cuando la nota trae las fechas escritas, mandan ellas: el color se pinta a
 * ojo y a veces baila un día. Si no las trae, se usan los extremos de la
 * franja. Comprobado contra las notas del propio fichero.
 */

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO',
  'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']

/** Grises y blancos de la rejilla y las cabeceras: no son reservas. */
const NO_ES_RESERVA = new Set(['D9D9D9', 'FFFFFF', '000000'])

/** De lo que pone la columna del inmueble al identificador de la app. */
const INMUEBLES: Record<string, string> = {
  '104': '104', '105': '105', '106': '106', '203': '203', '204': '204',
  '402': '402', 'P-3': 'P3', 'P3': 'P3', 'AP-2-B': 'AP2B', 'A-2B': 'AP2B', 'AP2B': 'AP2B',
}

const COL_INMUEBLE = 2
const COL_PRIMER_DIA = 3
const COL_ULTIMO_DIA = 33

export interface ReservaImportada {
  apartmentId: string
  checkIn: string
  checkOut: string
  nights: number
  guestName: string
  /** De dónde salen las fechas: de la nota escrita o de la franja de color. */
  origen: 'nota' | 'color'
  /** La nota dice que se anuló. Entra, pero como cancelada. */
  cancelada: boolean
  /** Se pisa con otra estancia viva del mismo inmueble. */
  solapada: boolean
}

/**
 * Una estancia anulada se queda pintada en el calendario y encima se pinta la
 * que la sustituye, así que salen dos franjas donde solo hubo una estancia. La
 * nota es lo único que lo distingue.
 */
const ANULADA = /\b(anulad|cancelad)/i

export interface ResultadoCalendario {
  reservas: ReservaImportada[]
  /** Meses que se han leído, para poder decir qué abarca el fichero. */
  meses: number
  avisos: string[]
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const diasDelMes = (anio: number, mes: number) => new Date(anio, mes, 0).getDate()

function fecha(dia: number, mes: number, anio: number): Date | null {
  const d = new Date(anio, mes - 1, dia)
  return (d.getFullYear() === anio && d.getMonth() === mes - 1 && d.getDate() === dia) ? d : null
}

const F = String.raw`(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2,4}))?`
const RANGO = new RegExp(
  String.raw`(?:del?|desde|entra|entrada)?\s*${F}\s*(?:al?|hasta|sale|salida|y\s+sale)\s*${F}`, 'i')

/** Las dos fechas escritas en una nota («del 09/01/24 al 15/03/24»), si las hay. */
function fechasDeNota(nota: string, anioRef: number): [Date, Date] | null {
  const m = RANGO.exec(nota)
  if (!m) return null
  const anio = (t: string | undefined, porDefecto: number) =>
    t ? (Number(t) < 100 ? 2000 + Number(t) : Number(t)) : porDefecto
  const ini = fecha(Number(m[1]), Number(m[2]), anio(m[3], anioRef))
  if (!ini) return null
  let fin = fecha(Number(m[4]), Number(m[5]), anio(m[6], ini.getFullYear()))
  if (!fin) return null
  // Sin año escrito y una salida anterior a la entrada: cruza el fin de año.
  if (!m[6] && fin < ini) fin = new Date(fin.setFullYear(fin.getFullYear() + 1))
  if (fin < ini) return null
  return [ini, fin]
}

interface Franja {
  apartmentId: string
  color: string
  anioIni: number; mesIni: number; diaIni: number
  anioFin: number; mesFin: number; diaFin: number
  notas: string[]
}

export function analizaCalendario(hoja: HojaXlsx): ResultadoCalendario {
  const avisos: string[] = []
  const celda = (f: number, c: number) => hoja.filas.get(f)?.get(c)

  // Un bloque de mes empieza en la fila que numera los días: 1, 2, 3…
  const cabeceras: number[] = []
  for (const [fila] of hoja.filas) {
    if (celda(fila, 3)?.texto === '1' && celda(fila, 4)?.texto === '2' && celda(fila, 5)?.texto === '3') {
      cabeceras.push(fila)
    }
  }
  cabeceras.sort((a, b) => a - b)
  if (cabeceras.length === 0) {
    return { reservas: [], meses: 0, avisos: ['No se ha reconocido ningún mes: ¿es el calendario de alquileres?'] }
  }

  // Mes de cada bloque, y cuántos años han pasado desde el primero. Los meses
  // van en orden: cada vez que el número de mes retrocede, se ha cambiado de
  // año. El año de verdad se decide después, con un ancla.
  const bloques: { fila: number; anio: number; mes: number }[] = []
  const relativos: { fila: number; mes: number; salto: number; anioEtiqueta: number | null }[] = []
  let mes = 0, salto = 0
  for (const fila of cabeceras) {
    let etiqueta: string | null = null, anioEtiqueta: number | null = null
    for (let dr = 1; dr <= 4 && !etiqueta; dr++) {
      for (const col of [1, 2, 3]) {
        const t = (celda(fila - dr, col)?.texto || '').toUpperCase()
        const m = MESES.find(x => t.startsWith(x))
        if (m) {
          etiqueta = m
          const ya = /(20\d\d)/.exec(t)
          anioEtiqueta = ya ? Number(ya[1]) : null
          break
        }
      }
    }
    const nuevoMes = etiqueta ? MESES.indexOf(etiqueta) + 1 : (mes % 12) + 1
    if (mes && nuevoMes < mes) salto++
    mes = nuevoMes
    relativos.push({ fila, mes, salto, anioEtiqueta })
  }

  // Ancla: el primer mes que traiga el año escrito. Si ninguno lo trae, se
  // busca un año suelto en la cabecera del documento, que es donde suele estar.
  const conAnio = relativos.find(r => r.anioEtiqueta)
  let anioInicial: number | null = conAnio ? conAnio.anioEtiqueta! - conAnio.salto : null
  if (anioInicial === null) {
    for (let f = 1; f < cabeceras[0] && anioInicial === null; f++) {
      for (const [, c] of hoja.filas.get(f) ?? []) {
        const n = Number(c.texto)
        if (Number.isInteger(n) && n >= 2000 && n <= 2100) { anioInicial = n; break }
      }
    }
  }
  if (anioInicial === null) {
    anioInicial = new Date().getFullYear()
    avisos.push('El fichero no dice de qué año es el primer mes: se ha supuesto el actual')
  }
  for (const r of relativos) bloques.push({ fila: r.fila, anio: anioInicial + r.salto, mes: r.mes })

  // Franjas de color, mes a mes
  const franjas: Franja[] = []
  bloques.forEach((bloque, i) => {
    const ultimo = diasDelMes(bloque.anio, bloque.mes)
    const finBloque = i + 1 < bloques.length ? bloques[i + 1].fila - 4 : hoja.ultimaFila
    for (let fila = bloque.fila + 1; fila < finBloque; fila++) {
      const etiqueta = (celda(fila, COL_INMUEBLE)?.texto || '').toUpperCase().replace(/\s+/g, '')
      const apartmentId = INMUEBLES[etiqueta]
      if (!apartmentId) continue

      let actual: Franja | null = null
      for (let col = COL_PRIMER_DIA; col <= COL_ULTIMO_DIA; col++) {
        const dia = Number(celda(bloque.fila, col)?.texto)
        if (!Number.isInteger(dia) || dia < 1 || dia > ultimo) continue
        const c = celda(fila, col)
        const color = c?.color && !NO_ES_RESERVA.has(c.color) ? c.color : null
        if (color && actual && actual.color === color) {
          actual.diaFin = dia
          if (c?.texto) actual.notas.push(c.texto)
        } else {
          if (actual) franjas.push(actual)
          actual = color ? {
            apartmentId, color,
            anioIni: bloque.anio, mesIni: bloque.mes, diaIni: dia,
            anioFin: bloque.anio, mesFin: bloque.mes, diaFin: dia,
            notas: c?.texto ? [c.texto] : [],
          } : null
        }
      }
      if (actual) franjas.push(actual)
    }
  })

  // Unir las franjas que cruzan de un mes al siguiente. Se compara con la
  // última franja *de ese mismo inmueble*: entre una y otra van las de los
  // demás pisos del mismo mes.
  const unidas: Franja[] = []
  const ultimaDe = new Map<string, Franja>()
  for (const f of franjas) {
    const u = ultimaDe.get(f.apartmentId)
    const anteriorEsperado = f.mesIni === 1 ? { anio: f.anioIni - 1, mes: 12 } : { anio: f.anioIni, mes: f.mesIni - 1 }
    if (u && u.color === f.color && f.diaIni === 1
      && u.diaFin === diasDelMes(u.anioFin, u.mesFin)
      && u.anioFin === anteriorEsperado.anio && u.mesFin === anteriorEsperado.mes) {
      u.anioFin = f.anioFin; u.mesFin = f.mesFin; u.diaFin = f.diaFin
      u.notas.push(...f.notas)
      continue
    }
    unidas.push(f)
    ultimaDe.set(f.apartmentId, f)
  }

  // De franja a reserva
  const reservas: ReservaImportada[] = []
  for (const f of unidas) {
    const iniColor = fecha(f.diaIni, f.mesIni, f.anioIni)
    const finColor = fecha(f.diaFin, f.mesFin, f.anioFin)
    if (!iniColor || !finColor) continue

    // De todas las notas de la franja, la buena es la que habla de esta misma
    // estancia: la que empieza donde empieza el color.
    let mejor: { d: number; ini: Date; fin: Date } | null = null
    for (const nota of new Set(f.notas)) {
      const fechas = fechasDeNota(nota, f.anioIni)
      if (!fechas) continue
      const [ini, fin] = fechas
      const dIni = Math.abs((+ini - +iniColor) / 86400000)
      const dFin = Math.abs((+fin - +finColor) / 86400000)
      if (dIni <= 5 && dFin <= 45 && (!mejor || dIni + dFin < mejor.d)) mejor = { d: dIni + dFin, ini, fin }
    }

    const entrada = mejor ? mejor.ini : iniColor
    let salida = mejor ? mejor.fin : finColor
    if (salida <= entrada) salida = new Date(+entrada + 86400000)

    const nombres = [...new Set(f.notas)].filter(n => !/^[<>\s\d.,/-]*$/.test(n))
    reservas.push({
      apartmentId: f.apartmentId,
      checkIn: iso(entrada), checkOut: iso(salida),
      nights: Math.round((+salida - +entrada) / 86400000),
      guestName: nombres.join(' / ').slice(0, 150),
      origen: mejor ? 'nota' : 'color',
      cancelada: nombres.some(n => ANULADA.test(n)),
      solapada: false,
    })
  }

  reservas.sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.apartmentId.localeCompare(b.apartmentId))

  // Marcar las que se pisan con otra del mismo inmueble. Las anuladas no
  // cuentan: su sitio lo ocupa la que las sustituyó, y por eso se pisaban.
  const porApt = new Map<string, ReservaImportada[]>()
  for (const r of reservas) {
    if (r.cancelada) continue
    if (!porApt.has(r.apartmentId)) porApt.set(r.apartmentId, [])
    porApt.get(r.apartmentId)!.push(r)
  }
  for (const lista of porApt.values()) {
    for (let i = 1; i < lista.length; i++) {
      // Pisarse un solo día es el cambio de huésped de toda la vida: uno sale
      // por la mañana y el siguiente entra por la tarde, y el calendario pinta
      // ese día en las dos franjas. Solo molesta a partir de dos días.
      const dias = (+new Date(lista[i - 1].checkOut) - +new Date(lista[i].checkIn)) / 86400000
      if (dias >= 2) {
        lista[i].solapada = true
        lista[i - 1].solapada = true
      }
    }
  }

  return { reservas, meses: bloques.length, avisos }
}

export async function leeCalendario(fichero: File): Promise<ResultadoCalendario> {
  return analizaCalendario(leeXlsxConColores(await fichero.arrayBuffer()))
}

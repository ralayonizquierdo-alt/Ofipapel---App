/**
 * Lee las reservas escritas en un mensaje de WhatsApp.
 *
 * Los avisos de la inmobiliaria llegan siempre en texto suelto, con el formato
 * que le apetezca a quien lo escribe:
 *
 *   ALAYON 104: entra 30/07/2026 y sale 13/08/2026.
 *   Apart. 105 del 31/07 al 10/08
 *   PISO 3: entrada 1/9/26 salida 15/9/26
 *
 * De cada línea hacen falta tres cosas: de qué inmueble habla y las dos fechas.
 * Todo lo demás (saludos, «Buenos días», firmas) se ignora. Lo que no se
 * entienda se devuelve igual, marcado, para que se vea en pantalla y nadie se
 * quede pensando que se ha perdido una reserva por el camino.
 */

export interface LineaPegada {
  /** La línea tal cual venía, para poder enseñarla si algo falla. */
  texto: string
  apartmentId: string | null
  checkIn: string | null
  checkOut: string | null
  nights: number
  /** Por qué no se puede usar esta línea. Vacío si está bien. */
  problema: string
}

const INMUEBLES: { id: string; patrones: RegExp[] }[] = [
  { id: '104',  patrones: [/\b104\b/] },
  { id: '105',  patrones: [/\b105\b/] },
  { id: '106',  patrones: [/\b106\b/] },
  { id: '203',  patrones: [/\b203\b/] },
  { id: '204',  patrones: [/\b204\b/] },
  { id: '402',  patrones: [/\b402\b/, /\b[áa]tico\b/i] },
  { id: 'P3',   patrones: [/\bpiso\s*-?\s*3\b/i, /\bp\s*-?\s*3\b/i, /\bjuan\s*xxi{1,3}\b/i] },
  { id: 'AP2B', patrones: [/\barenal\b/i, /\bap\s*-?\s*2\s*-?\s*b\b/i, /\bmonta[ñn]a\s*chica\b/i] },
]

const FECHA = /(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2,4}))?/g

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function construye(dia: number, mes: number, anio: number): Date | null {
  const d = new Date(anio, mes - 1, dia)
  // new Date(2026, 1, 31) no falla: se va al 3 de marzo. Hay que comprobarlo.
  if (d.getFullYear() !== anio || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null
  return d
}

/**
 * Analiza el mensaje entero. `hoy` se pasa aparte para poder probarlo con una
 * fecha fija y para deducir el año cuando el mensaje no lo trae.
 */
export function analizaPegado(texto: string, hoy = new Date()): LineaPegada[] {
  const salida: LineaPegada[] = []

  for (const bruta of (texto || '').split(/\r?\n/)) {
    const linea = bruta.trim()
    if (!linea) continue

    FECHA.lastIndex = 0
    const fechas = [...linea.matchAll(FECHA)]

    // El inmueble se busca solo antes de la primera fecha: si no, un «13/08»
    // podría confundirse con el número de un apartamento.
    const cabeza = fechas.length ? linea.slice(0, fechas[0].index) : linea
    let apartmentId: string | null = null
    for (const { id, patrones } of INMUEBLES) {
      if (patrones.some(p => p.test(cabeza))) { apartmentId = id; break }
    }

    // Una línea sin inmueble ni fechas es saludo o firma: no se enseña.
    if (!apartmentId && fechas.length === 0) continue

    const base: LineaPegada = { texto: linea, apartmentId, checkIn: null, checkOut: null, nights: 0, problema: '' }

    if (!apartmentId) { salida.push({ ...base, problema: 'No se reconoce el apartamento' }); continue }
    if (fechas.length < 2) { salida.push({ ...base, problema: 'Faltan las fechas de entrada o salida' }); continue }

    const [f1, f2] = fechas
    const anioBase = hoy.getFullYear()
    const anio = (t: string | undefined) => {
      if (!t) return null
      const n = Number(t)
      return n < 100 ? 2000 + n : n
    }

    let entrada = construye(Number(f1[1]), Number(f1[2]), anio(f1[3]) ?? anioBase)
    if (!entrada) { salida.push({ ...base, problema: 'La fecha de entrada no existe' }); continue }

    // Sin año escrito: si la entrada cae muy atrás, se entiende que es del año
    // que viene. Los avisos siempre hablan de reservas futuras.
    if (!f1[3]) {
      const seisMeses = new Date(hoy); seisMeses.setMonth(seisMeses.getMonth() - 6)
      if (entrada < seisMeses) entrada = new Date(entrada.setFullYear(entrada.getFullYear() + 1))
    }

    let salidaF = construye(Number(f2[1]), Number(f2[2]), anio(f2[3]) ?? entrada.getFullYear())
    if (!salidaF) { salida.push({ ...base, problema: 'La fecha de salida no existe' }); continue }
    // Sin año escrito y una salida anterior a la entrada: cruza el fin de año.
    if (!f2[3] && salidaF <= entrada) salidaF = new Date(salidaF.setFullYear(salidaF.getFullYear() + 1))

    const noches = Math.round((salidaF.getTime() - entrada.getTime()) / 86400000)
    if (noches <= 0) { salida.push({ ...base, checkIn: iso(entrada), checkOut: iso(salidaF), problema: 'La salida no es posterior a la entrada' }); continue }
    if (noches > 400) { salida.push({ ...base, checkIn: iso(entrada), checkOut: iso(salidaF), nights: noches, problema: 'Más de un año de estancia: revísalo' }); continue }

    salida.push({ ...base, checkIn: iso(entrada), checkOut: iso(salidaF), nights: noches })
  }

  return salida
}

// ─── Justificantes de transferencia ──────────────────────────────────────────

export interface CobroPegado {
  apartmentId: string | null
  /** Importe de la transferencia. */
  amount: number
  /** Fecha del pago (la del justificante). */
  paymentDate: string | null
  /** Periodo que dice el concepto, si lo trae: sirve para dar con la reserva. */
  periodoIni: string | null
  periodoFin: string | null
  /** El concepto tal cual, para poder enseñarlo. */
  concepto: string
  problema: string
}

/** «Importe 1.435,00 €» → 1435. En castellano el punto son miles y la coma decimales. */
function importeDe(texto: string): number | null {
  const m = texto.match(/importe(?:\s+a\s+adeudar)?\s*:?\s*([\d.,]+)/i)
             || texto.match(/([\d]{1,3}(?:\.\d{3})*,\d{2})\s*€/)
             || texto.match(/([\d.,]+)\s*€/)
  if (!m) return null
  const n = Number(m[1].replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** «Fecha 18 ago 2026» o «18/08/2026». */
function fechaPagoDe(texto: string): string | null {
  const m = texto.match(/(\d{1,2})\s+([a-záéíóú]{3,10})\.?\s+(\d{4})/i)
  if (m) {
    const mes = MESES_CORTOS.indexOf(m[2].slice(0, 3).toLowerCase())
    if (mes >= 0) {
      const d = construye(Number(m[1]), mes + 1, Number(m[3]))
      if (d) return iso(d)
    }
  }
  const f = texto.match(/fecha\s*:?\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/i)
  if (f) {
    const a = Number(f[3]) < 100 ? 2000 + Number(f[3]) : Number(f[3])
    const d = construye(Number(f[1]), Number(f[2]), a)
    if (d) return iso(d)
  }
  return null
}

/**
 * Lee un justificante de transferencia, pegado como texto o sacado del PDF.
 * El banco pone el inmueble y el periodo en el concepto («Alayon 402
 * 17/08/26 - 17/09/26»), que es lo que permite colgar el cobro de su reserva.
 */
export function analizaCobro(texto: string): CobroPegado | null {
  const plano = (texto || '').replace(/\s+/g, ' ').trim()
  if (!plano) return null

  const amount = importeDe(plano)
  if (!amount) return null

  const conceptoM = plano.match(/concepto\s*:?\s*(.{0,80}?)(?:\s+periodicidad|\s+fecha\b|$)/i)
  const concepto = (conceptoM ? conceptoM[1] : plano).trim()

  let apartmentId: string | null = null
  for (const { id, patrones } of INMUEBLES) {
    if (patrones.some(p => p.test(concepto))) { apartmentId = id; break }
  }

  FECHA.lastIndex = 0
  const fechas = [...concepto.matchAll(FECHA)]
  const aIso = (m: RegExpMatchArray): string | null => {
    const a = m[3] ? (Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3])) : new Date().getFullYear()
    const d = construye(Number(m[1]), Number(m[2]), a)
    return d ? iso(d) : null
  }

  return {
    apartmentId,
    amount,
    paymentDate: fechaPagoDe(plano),
    periodoIni: fechas[0] ? aIso(fechas[0]) : null,
    periodoFin: fechas[1] ? aIso(fechas[1]) : null,
    concepto,
    problema: apartmentId ? '' : 'No se reconoce el apartamento en el concepto',
  }
}

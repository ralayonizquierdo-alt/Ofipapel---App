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
  /** Nombre del huésped, cuando el aviso lo trae (Airbnb sí). */
  guestName?: string
  /** De dónde viene la reserva. Sin esto, se entiende que de la inmobiliaria. */
  origen?: 'airbnb'
  /** Avisos que no impiden crearla, pero que hay que enseñar. */
  nota?: string
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

// ─── Avisos de reserva de Airbnb ─────────────────────────────────────────────

/**
 * El único piso publicado en Airbnb hoy. El aviso de la aplicación no dice de
 * qué vivienda habla —no hace falta, quien lo lee ya está dentro de ese
 * anuncio—, así que si no se nombra ninguna se da por hecho esta. El día que
 * haya un segundo anuncio, esto deja de valer y hay que enseñar un selector.
 */
export const AIRBNB_POR_DEFECTO = 'AP2B'

const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** «sept», «sep.», «septiembre», «SEPT» → 9. Devuelve 0 si no es un mes. */
function mesDe(txt: string): number {
  const t = txt.toLowerCase().replace(/\./g, '').trim()
  // «sept» es el único que no encaja recortando a tres letras.
  const corto = t.slice(0, 3)
  const i = MESES_LARGOS.findIndex(m => m.startsWith(corto))
  return i + 1
}

/**
 * ¿Esto es un aviso de Airbnb y no un mensaje de la inmobiliaria?
 *
 * Se pide más de una señal a propósito: un mensaje de WhatsApp puede decir
 * «6 noches» de pasada, y no queremos que por eso se lea como si fuera Airbnb.
 */
export function pareceAirbnb(texto: string): boolean {
  const t = (texto || '').toLowerCase()
  const señales = [
    /llega\s+en\s+\d+\s+d[ií]as/.test(t),
    /c[oó]digo\s+de\s+la\s+puerta/.test(t),
    /\bllegada\b[\s\S]{0,60}\bsalida\b/.test(t),
    /\btus\s+notas\b/.test(t),
    /\bgrupo\s+de\b.*\bpersonas?\b/.test(t),
    /\b\d+\s+noches?\b/.test(t),
    /\breserva\s+confirmada\b/.test(t),
  ].filter(Boolean).length
  return señales >= 2
}

/** Todas las fechas tipo «16 sept» o «mié, 16 sept» que haya en el texto. */
function fechasConMes(texto: string): { dia: number; mes: number; indice: number }[] {
  const re = /(\d{1,2})\s*(?:de\s+)?([a-záéíóúñ]{3,10})\.?/gi
  const salida: { dia: number; mes: number; indice: number }[] = []
  for (const m of texto.matchAll(re)) {
    const mes = mesDe(m[2])
    const dia = Number(m[1])
    if (mes >= 1 && dia >= 1 && dia <= 31) salida.push({ dia, mes, indice: m.index ?? 0 })
  }
  return salida
}

/**
 * Lee el aviso de reserva de la aplicación de Airbnb, pegado tal cual.
 *
 * El formato no trae ni año ni vivienda, así que las dos cosas se deducen: el
 * año, entendiendo que la reserva es futura; la vivienda, porque de momento
 * solo hay un anuncio publicado. Las dos deducciones se avisan en pantalla.
 *
 * Ejemplo de lo que llega:
 *
 *   Llega en 23 días
 *   Grupo de Rosario de 4 personas
 *   16–22 sept · 6 noches
 *   Llegada        Salida
 *   mié, 16 sept   mar, 22 sept
 *   15:00          10:00
 *   Código de la puerta sugerido
 *   8286
 */
export function analizaAirbnb(texto: string, hoy = new Date()): LineaPegada | null {
  const bruto = (texto || '').trim()
  if (!bruto || !pareceAirbnb(bruto)) return null

  const plano = bruto.replace(/\s+/g, ' ')
  const base: LineaPegada = {
    texto: bruto.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 4).join(' · '),
    apartmentId: null, checkIn: null, checkOut: null, nights: 0, problema: '', origen: 'airbnb',
  }

  // ── Vivienda ───────────────────────────────────────────────────────────────
  // Si el texto nombra una, manda; si no, la única publicada en Airbnb.
  let apartmentId: string | null = null
  for (const { id, patrones } of INMUEBLES) {
    if (patrones.some(p => p.test(plano))) { apartmentId = id; break }
  }
  const notas: string[] = []
  if (!apartmentId) {
    apartmentId = AIRBNB_POR_DEFECTO
    notas.push('El aviso de Airbnb no dice el apartamento: se usa Arenal 2-B, el único publicado')
  }

  // ── Huésped ────────────────────────────────────────────────────────────────
  const nombreM =
    plano.match(/grupo\s+de\s+(.+?)\s+de\s+\d+\s+personas?/i) ??
    plano.match(/reserva\s+de\s+(.+?)(?:\s+de\s+\d|\s*[·|]|$)/i)
  const personasM = plano.match(/de\s+(\d+)\s+personas?/i)
  const guestName = nombreM ? nombreM[1].trim() : ''

  // ── Noches declaradas ──────────────────────────────────────────────────────
  const nochesM = plano.match(/(\d+)\s+noches?\b/i)
  const nochesDicho = nochesM ? Number(nochesM[1]) : 0

  // ── Fechas ─────────────────────────────────────────────────────────────────
  // Se prefiere el bloque «Llegada … Salida …», que trae el mes de cada una.
  // El resumen de arriba («16–22 sept») comparte mes y engaña si la estancia
  // cambia de mes.
  // 1) El bloque «Llegada … Salida», que es el único que trae el mes de cada
  //    una. Admite las dos formas en que puede salir transcrito: una fecha a
  //    cada lado —si se leyó columna por columna— o las dos seguidas después
  //    de «Salida», si se leyó por filas, que es como está puesto en pantalla.
  const bloque = plano.match(/llegada\b([\s\S]{0,160}?)salida\b([\s\S]{0,160})/i)
  let par: { dia: number; mes: number; indice: number }[] = []
  if (bloque) {
    const izq = fechasConMes(bloque[1])
    const der = fechasConMes(bloque[2])
    if (izq.length && der.length) par = [izq[0], der[0]]
    else if (der.length >= 2) par = der.slice(0, 2)
    else if (izq.length >= 2) par = izq.slice(0, 2)
  }

  // 2) «16–22 sept»: los dos días comparten el mes, que solo se escribe al
  //    final, así que el primero no se ve como fecha por sí solo. Va antes que
  //    el barrido de abajo precisamente por eso: ahí el «16» se pierde y la
  //    primera fecha que aparece es el 22, con lo que entrada y salida salen
  //    del revés.
  if (par.length < 2) {
    const compacto = plano.match(/(\d{1,2})\s*[–—-]\s*(\d{1,2})\s*(?:de\s+)?([a-záéíóúñ]{3,10})\.?/i)
    if (compacto) {
      const mes = mesDe(compacto[3])
      if (mes >= 1) par = [
        { dia: Number(compacto[1]), mes, indice: 0 },
        { dia: Number(compacto[2]), mes, indice: 1 },
      ]
    }
  }

  // 3) Último recurso: las dos primeras fechas que haya en el texto.
  if (par.length < 2) par = fechasConMes(plano).slice(0, 2)

  if (par.length < 2) {
    return { ...base, apartmentId, guestName, problema: 'No se encuentran las fechas de llegada y salida' }
  }

  // ── Año ────────────────────────────────────────────────────────────────────
  // El aviso nunca lo trae. Se toma el año en curso y, si la entrada ya quedó
  // atrás, el siguiente: estos avisos son siempre de reservas por venir.
  let entrada = construye(par[0].dia, par[0].mes, hoy.getFullYear())
  if (!entrada) return { ...base, apartmentId, guestName, problema: 'La fecha de llegada no existe' }
  const margen = new Date(hoy); margen.setDate(margen.getDate() - 30)
  if (entrada < margen) entrada = new Date(entrada.setFullYear(entrada.getFullYear() + 1))

  let salidaF = construye(par[1].dia, par[1].mes, entrada.getFullYear())
  if (!salidaF) return { ...base, apartmentId, guestName, problema: 'La fecha de salida no existe' }
  if (salidaF <= entrada) salidaF = new Date(salidaF.setFullYear(salidaF.getFullYear() + 1))

  const noches = Math.round((salidaF.getTime() - entrada.getTime()) / 86400000)
  if (noches <= 0 || noches > 400) {
    return {
      ...base, apartmentId, guestName, checkIn: iso(entrada), checkOut: iso(salidaF), nights: noches,
      problema: 'Las fechas no cuadran: revísalo',
    }
  }
  // El aviso dice las noches; si no coinciden con las fechas leídas, algo se ha
  // entendido mal y más vale decirlo que crear una reserva con fechas erróneas.
  if (nochesDicho && nochesDicho !== noches) {
    notas.push(`El aviso dice ${nochesDicho} noches y de las fechas salen ${noches}: compruébalo`)
  }

  return {
    ...base,
    apartmentId,
    guestName: guestName + (personasM ? ` (${personasM[1]} personas)` : ''),
    checkIn: iso(entrada),
    checkOut: iso(salidaF),
    nights: noches,
    nota: notas.join('. '),
  }
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

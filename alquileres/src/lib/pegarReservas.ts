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
  /** Cuántas personas, cuando el aviso lo dice («grupo de 4 personas»). */
  guests?: number
  /** De dónde viene la reserva. Sin esto, se entiende que de la inmobiliaria. */
  origen?: 'airbnb'
  /** Avisos que no impiden crearla, pero que hay que enseñar. */
  nota?: string
}

/**
 * El número de un inmueble, venga pegado a lo que venga.
 *
 * En los conceptos del banco el número va pegado a las letras: «AL104 11/10-27/10».
 * Con `\b104\b` eso no casaba —entre la «L» y el «1» no hay frontera de palabra,
 * las dos son caracteres de palabra— y el cobro se quedaba sin apartamento. Lo
 * único que hay que exigir es que no esté pegado a OTRO dígito, para no leer
 * «1104» o «2041» como si fueran el 104 y el 204.
 */
const numero = (n: string) => new RegExp(`(?:^|[^0-9])${n}(?:[^0-9]|$)`)

const INMUEBLES: { id: string; patrones: RegExp[] }[] = [
  { id: '104',  patrones: [numero('104')] },
  { id: '105',  patrones: [numero('105')] },
  { id: '106',  patrones: [numero('106')] },
  { id: '203',  patrones: [numero('203')] },
  { id: '204',  patrones: [numero('204')] },
  { id: '402',  patrones: [numero('402'), /[áa]tico/i] },
  { id: 'P3',   patrones: [/piso\s*-?\s*3(?:[^0-9]|$)/i, /(?:^|[^a-z0-9])p\s*-?\s*3(?:[^0-9]|$)/i,
                           /juan\s*xxi{1,3}/i] },
  { id: 'AP2B', patrones: [/arenal/i, /(?:^|[^a-z0-9])ap\s*-?\s*2\s*-?\s*b/i, /monta[ñn]a\s*chica/i] },
]

/**
 * «AL104» → «AL 104», para que el P-3 y el AP-2-B también se reconozcan
 * cuando el banco los escribe pegados al prefijo de siempre.
 */
const despega = (t: string) => t.replace(/\bAL(?=[A-Za-z0-9])/g, 'AL ')

/**
 * Una fecha suelta: «17/08», «17/08/26» o «17-08-2026».
 *
 * El año solo se toma si detrás no viene otra fecha. En «11/10-27/10» el guion
 * es el del periodo, no el separador del año: sin esa condición se leía «11 de
 * octubre de 2027» y el cobro se iba a un año que no existe.
 */
const FECHA = /(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2,4})(?!\s*[/.]\s*\d))?/g

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
      if (patrones.some(p => p.test(despega(cabeza)))) { apartmentId = id; break }
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
    if (patrones.some(p => p.test(despega(plano)))) { apartmentId = id; break }
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
    guestName,
    guests: personasM ? Number(personasM[1]) : undefined,
    checkIn: iso(entrada),
    checkOut: iso(salidaF),
    nights: noches,
    nota: notas.join('. '),
  }
}

// ─── Avisos de anulación ─────────────────────────────────────────────────────

export interface AnulacionPegada {
  /** El aviso recortado, para poder enseñarlo y guardarlo en la nota. */
  texto: string
  apartmentId: string | null
  checkIn: string | null
  checkOut: string | null
  /** El código de la reserva, cuando el aviso lo trae («HMHJT5K3D4»). */
  codigo?: string
  /** El viajero, cuando se puede leer. */
  guestName?: string
  problema: string
  nota?: string
}

/**
 * ¿Esto es un aviso de que una reserva se ha caído?
 *
 * Se piden frases enteras, no la palabra «cancelar» suelta: el aviso de una
 * reserva NUEVA de Airbnb habla de «tu política de cancelación» al final, y
 * leerlo como una anulación daría de baja justo la reserva que acaba de entrar.
 */
export function pareceAnulacion(texto: string): boolean {
  const t = (texto || '').toLowerCase().replace(/\s+/g, ' ')
  return [
    /reserva\s+cancelada/,
    /cancelada\s*:\s*reserva/,
    /ha\s+tenido\s+que\s+cancelar/,
    /\bha\s+cancelado\s+(?:la\s+|su\s+)?reserva/,
    /\bcancel[oó]\s+(?:la\s+|su\s+)?reserva/,
    /reserva\s+anulada/,
    /\banulad[ao]\b[^.]{0,40}\breserva\b/,
    /\breserva\b[^.]{0,40}\banulad[ao]\b/,
    // «se anula la reserva», «anular la reserva», «anulación de la reserva».
    /\banula(?:r|n|mos|ción|cion)?\s+(?:de\s+)?(?:la\s+|su\s+|esta\s+)?reserva/,
    // Los verbos de cancelar, pero NO el nombre: «política de cancelación de
    // la reserva» sale en el aviso de una reserva nueva.
    /\bcancel(?:a|ar|an|amos)\s+(?:de\s+)?(?:la\s+|su\s+|esta\s+)?reserva/,
  ].some(re => re.test(t))
}

/**
 * Lee el aviso de una reserva anulada, pegado tal cual.
 *
 * Vale el correo de Airbnb —que es el que llega del Arenal— y también el
 * mensaje suelto de la inmobiliaria («Se anula la reserva del 104 del 12/11 al
 * 20/11»). De las dos cosas hace falta lo mismo: qué vivienda y qué fechas,
 * para dar con la reserva que hay que marcar. Nunca anula nada por su cuenta:
 * esto solo encuentra: quien decide es quien lo lee.
 *
 * Ejemplo de lo que llega de Airbnb:
 *
 *   Cancelada: reserva HMHJT5K3D4 (del 22 oct – 10 nov)
 *   Reserva cancelada
 *   Arenal - Céntrico con Aire Acondicionado
 *   22 oct – 10 nov, 3 viajeros
 *   Sentimos informarte de que I Erna, tu viajero, ha tenido que cancelar la
 *   reserva HMHJT5K3D4 para el periodo del 22 oct – 10 nov.
 */
export function analizaAnulacion(texto: string, hoy = new Date()): AnulacionPegada | null {
  const bruto = (texto || '').trim()
  if (!bruto || !pareceAnulacion(bruto)) return null

  const plano = bruto.replace(/\s+/g, ' ')
  // Lo que se guarda en la nota de la reserva. Se tiran las líneas de cabecera
  // del correo (remitente, destinatario, fecha suelta): si no, la nota acaba
  // diciendo «Para: …@gmail.com» en vez de de qué reserva habla.
  const base: AnulacionPegada = {
    texto: bruto.split(/\r?\n/).map(l => l.trim())
      .filter(l => l && !/@/.test(l) && !/^(para|de|cc|cco|asunto|enviado|fecha)\s*:/i.test(l)
        && !/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(l))
      .slice(0, 3).join(' · '),
    apartmentId: null, checkIn: null, checkOut: null, problema: '',
  }
  const notas: string[] = []

  // ── Vivienda ───────────────────────────────────────────────────────────────
  let apartmentId: string | null = null
  for (const { id, patrones } of INMUEBLES) {
    if (patrones.some(p => p.test(despega(plano)))) { apartmentId = id; break }
  }
  const deAirbnb = /airbnb|anuncio\s+n\.?[ºo°]|viajer[oa]/i.test(plano)
  if (!apartmentId && deAirbnb) {
    apartmentId = AIRBNB_POR_DEFECTO
    notas.push('El aviso no dice el apartamento: se usa Arenal 2-B, el único publicado en Airbnb')
  }

  // ── Código y viajero ───────────────────────────────────────────────────────
  // El código de Airbnb son 10 caracteres en mayúsculas con al menos una letra
  // y una cifra, para no confundirlo con una palabra escrita en mayúsculas.
  const codM = plano.match(/reserva\s+([A-Z0-9]{8,12})\b/)
  const codigo = codM && /[A-Z]/.test(codM[1]) && /\d/.test(codM[1]) ? codM[1] : undefined
  const huespedM = plano.match(/de\s+que\s+(.+?),?\s+tu\s+viajer[oa]/i)
  const guestName = huespedM ? huespedM[1].trim() : undefined

  // ── Fechas ─────────────────────────────────────────────────────────────────
  // Primero las que llevan el mes escrito («22 oct – 10 nov»), que es como las
  // manda Airbnb; si no hay, las numéricas de un mensaje normal.
  let entrada: Date | null = null
  let salidaF: Date | null = null

  const conMes = fechasConMes(plano)
  if (conMes.length >= 2) {
    // El año no viene nunca. Se toma el de hoy y, si la entrada queda muy
    // atrás, el siguiente. El margen es amplio a propósito: una anulación
    // puede llegar con la estancia ya empezada, o hasta terminada.
    entrada = construye(conMes[0].dia, conMes[0].mes, hoy.getFullYear())
    if (entrada) {
      const margen = new Date(hoy); margen.setMonth(margen.getMonth() - 6)
      if (entrada < margen) entrada = new Date(entrada.setFullYear(entrada.getFullYear() + 1))
      salidaF = construye(conMes[1].dia, conMes[1].mes, entrada.getFullYear())
      if (salidaF && salidaF <= entrada) salidaF = new Date(salidaF.setFullYear(salidaF.getFullYear() + 1))
    }
  } else {
    FECHA.lastIndex = 0
    const fechas = [...plano.matchAll(FECHA)]
    if (fechas.length >= 2) {
      const anio = (t: string | undefined) => {
        if (!t) return null
        const n = Number(t)
        return n < 100 ? 2000 + n : n
      }
      entrada = construye(Number(fechas[0][1]), Number(fechas[0][2]), anio(fechas[0][3]) ?? hoy.getFullYear())
      if (entrada) {
        salidaF = construye(Number(fechas[1][1]), Number(fechas[1][2]), anio(fechas[1][3]) ?? entrada.getFullYear())
        if (salidaF && salidaF <= entrada) salidaF = new Date(salidaF.setFullYear(salidaF.getFullYear() + 1))
      }
    }
  }

  const salida: AnulacionPegada = {
    ...base, apartmentId, codigo, guestName,
    checkIn: entrada ? iso(entrada) : null,
    checkOut: salidaF ? iso(salidaF) : null,
    nota: notas.join('. ') || undefined,
  }

  if (!apartmentId) return { ...salida, problema: 'No se reconoce el apartamento' }
  if (!entrada || !salidaF) return { ...salida, problema: 'No se encuentran las fechas de la reserva anulada' }
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
  const paraBuscar = despega(concepto)
  for (const { id, patrones } of INMUEBLES) {
    if (patrones.some(p => p.test(paraBuscar))) { apartmentId = id; break }
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

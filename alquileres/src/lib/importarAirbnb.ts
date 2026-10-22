import type { Payment, Reservation } from '../types'
import { getNights } from './dateUtils'

/**
 * El informe anual de SOC Properties (el Arenal, por Airbnb).
 *
 * ─── Por qué hace falta ─────────────────────────────────────────────────────
 * El Arenal (AP-2-B) es el único inmueble que no se gestiona desde casa: lo
 * lleva SOC Properties y se alquila por Airbnb. En el Excel maestro aparecen
 * sus estancias —escritas a mano en la banda del calendario— pero **nunca sus
 * importes**, porque el dinero no pasa por nuestra mano: Airbnb cobra al
 * huésped, SOC se queda su comisión y la limpieza, y nos transfiere el resto.
 *
 * Resultado: hasta ahora las 17 reservas de 2026 del Arenal estaban en la
 * aplicación con importe 0,00 €, y los cobros que sí llegaban del banco no
 * tenían a qué estancia agarrarse. Ni se podía saber qué faltaba por cobrar ni
 * si un cobro era el que tocaba.
 *
 * Este informe es la pieza que faltaba: trae, estancia por estancia, el bruto,
 * las dos comisiones y **el neto que nos llega**, que es exactamente la cifra
 * que aparece en el banco.
 *
 * ─── Qué se guarda como importe de la reserva ───────────────────────────────
 * El NETO, no el bruto. Es lo que cobramos y lo que Luis anota en el Excel, así
 * que es lo único con lo que la estancia puede cuadrar contra el banco. El
 * bruto y las comisiones quedan escritos en las observaciones de la reserva
 * para poder reconstruir la cuenta, pero **no se dan de alta como gasto**: si
 * el ingreso ya va neto, apuntar además la comisión la descontaría dos veces.
 *
 * La limpieza va a 0: la que cobra Airbnb (90 o 100 €) se la queda SOC, no
 * nosotros, y el Arenal es justo el inmueble que el propietario dejó sin los
 * 40 € de limpieza propios.
 */

// ─── Lo que trae el informe ───────────────────────────────────────────────────

export interface EstanciaAirbnb {
  huesped: string
  /** ISO, AAAA-MM-DD. */
  checkIn: string
  checkOut: string
  /** Las que dice el informe; si no cuadran con las fechas, se avisa. */
  noches: number
  /** Ingreso bruto (lo que paga el huésped), cuando el informe lo da. */
  bruto?: number
  /** Limpieza cobrada al huésped. Se la queda el gestor. */
  limpiezaHuesped?: number
  comisionAirbnb?: number
  /** «Comisión Soc + Limpieza»: la del gestor, limpieza incluida. */
  comisionGestor?: number
  /** «Ajuste del precio por noche», que resta. */
  ajuste?: number
  /** Lo que nos llega. Es la cifra que cuadra con el banco. */
  neto: number
  /** El informe la marca como pagada en mano. */
  enEfectivo: boolean
  /** Lo que no cuadra dentro del propio informe. */
  avisos: string[]
}

export interface ResultadoAirbnb {
  estancias: EstanciaAirbnb[]
  /** El año del encabezado del informe, si lo trae. */
  anio?: number
  avisos: string[]
}

const MESES: Record<string, number> = {
  ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4,
  may: 5, mayo: 5, jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8,
  sep: 9, sept: 9, septiembre: 9, oct: 10, octubre: 10, nov: 11, noviembre: 11,
  dic: 12, diciembre: 12,
}

/** Sin tildes y en minúsculas, que es como se comparan las etiquetas. */
function llano(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** «Mié, 17 dic 2025» → «2025-12-17». */
export function fechaAirbnb(texto: string): string | undefined {
  const m = llano(texto).match(/(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})/)
  if (!m) return undefined
  const mes = MESES[m[2]]
  if (!mes) return undefined
  return `${m[3]}-${String(mes).padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

/** «−1.276,00 €» → 1276. Devuelve el valor absoluto: el signo lo pone el concepto. */
export function importeAirbnb(texto: string): number | undefined {
  const m = texto.replace(/\s/g, '').match(/-?−?([\d.]+,\d{2}|\d+)/)
  if (!m) return undefined
  const n = Number(m[1].replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? Math.abs(n) : undefined
}

const redondea = (n: number) => Math.round(n * 100) / 100

/**
 * Lee el informe tal y como llega: un HTML con una tarjeta por estancia.
 *
 * No se busca una estructura exacta de etiquetas porque el informe lo genera
 * el gestor y puede cambiar de un año a otro. Se busca por el texto de cada
 * concepto («Check-in», «Total neto»…), sin tildes ni mayúsculas, dentro de
 * cada tarjeta. Si un año viene con otro maquetado pero los mismos nombres,
 * sigue leyéndose.
 */
export function leeInformeAirbnb(html: string): ResultadoAirbnb {
  const avisos: string[] = []
  const doc = new DOMParser().parseFromString(html, 'text/html')

  const anioTexto = doc.querySelector('.period, .header')?.textContent ?? ''
  const anio = Number(anioTexto.match(/\b(20\d{2})\b/)?.[1]) || undefined

  // Las tarjetas. Si el informe no trae la clase de siempre, se buscan los
  // bloques que hablen de un check-in y de un total, que es lo que las define.
  let tarjetas = [...doc.querySelectorAll<HTMLElement>('.reservation')]
  if (tarjetas.length === 0) {
    tarjetas = [...doc.querySelectorAll<HTMLElement>('div, section, article')].filter(e => {
      const t = llano(e.textContent ?? '')
      if (!t.includes('check-in') || !t.includes('check-out')) return false
      // Solo el bloque más interno: el contenedor de todos también casaría.
      return !e.querySelector(':scope div, :scope section, :scope article')
        || ![...e.querySelectorAll('div, section, article')]
          .some(h => llano(h.textContent ?? '').includes('check-in'))
    })
  }

  const estancias: EstanciaAirbnb[] = []

  for (const tarjeta of tarjetas) {
    const propio: string[] = []
    const texto = tarjeta.textContent ?? ''

    /** El valor que acompaña a una etiqueta dentro de esta tarjeta. */
    const valor = (...etiquetas: string[]): string | undefined => {
      for (const fila of tarjeta.querySelectorAll<HTMLElement>('div, p, tr, li')) {
        // Solo las filas de verdad: «etiqueta | valor», una al lado de otra.
        // El contenedor que las agrupa también tiene dos hijos o más, y daría
        // por valor la última fila entera — así se leía la fecha de salida
        // como si fueran las noches, y el total neto como si fuera el bruto.
        const hijos = [...fila.children]
        if (hijos.length < 2 || hijos.some(c => c.children.length > 0)) continue
        const partes = hijos.map(c => c.textContent ?? '')
        const izq = llano(partes[0])
        if (etiquetas.some(e => izq.includes(llano(e)))) return partes[partes.length - 1]
      }
      return undefined
    }

    const checkIn = fechaAirbnb(valor('check-in') ?? '')
    const checkOut = fechaAirbnb(valor('check-out') ?? '')
    if (!checkIn || !checkOut) continue

    // El neto es lo único imprescindible: sin él la estancia no sirve de nada.
    const neto = importeAirbnb(valor('total neto', 'total a recibir', 'neto') ?? '')
    if (neto === undefined) {
      avisos.push(`La estancia del ${checkIn} no trae el total neto; se ha dejado fuera.`)
      continue
    }

    const bruto = importeAirbnb(valor('ingreso bruto', 'precio total') ?? '')
    // Solo «gastos de limpieza»: a secas, «limpieza» casaría con la fila
    // «Comisión Soc + Limpieza 90€», que es otra cosa y mucho más dinero.
    const limpiezaHuesped = importeAirbnb(valor('gastos de limpieza') ?? '')
    const comisionAirbnb = importeAirbnb(valor('comision airbnb') ?? '')
    const comisionGestor = importeAirbnb(valor('comision soc', 'comision gestor') ?? '')
    const ajuste = importeAirbnb(valor('ajuste del precio') ?? '')

    const nochesInforme = Number(valor('noches')?.match(/\d+/)?.[0]) || 0
    const nochesFechas = getNights(checkIn, checkOut)
    if (nochesInforme && nochesInforme !== nochesFechas) {
      propio.push(`el informe dice ${nochesInforme} noches y de las fechas salen ${nochesFechas}`)
    }

    // La cuenta del propio informe: bruto − ajuste − comisiones = neto.
    if (bruto !== undefined) {
      const calculado = redondea(bruto - (ajuste ?? 0) - (comisionAirbnb ?? 0) - (comisionGestor ?? 0))
      if (Math.abs(calculado - neto) > 0.02) {
        propio.push(`sus propias cuentas dan ${calculado.toFixed(2)} € y pone ${neto.toFixed(2)} €`)
      }
    }

    const huesped = (tarjeta.querySelector('.guest-name')?.textContent
      ?? texto.split('\n').map(l => l.trim()).find(Boolean) ?? '')
      // Fuera la etiqueta del canal y los iconos con los que viene maquetado.
      .replace(/efectivo|airbnb|booking/gi, '').replace(/[\p{Emoji_Presentation}]/gu, '').trim()

    estancias.push({
      huesped,
      checkIn,
      checkOut,
      noches: nochesFechas || nochesInforme,
      bruto, limpiezaHuesped, comisionAirbnb, comisionGestor, ajuste,
      neto,
      enEfectivo: /efectivo|metalico|metálico/i.test(texto),
      avisos: propio,
    })
  }

  if (estancias.length === 0) {
    avisos.push('No se ha reconocido ninguna estancia. Debe ser el informe anual en HTML'
      + ' tal y como lo manda la gestora, sin reescribirlo.')
  }

  // Dos tarjetas con las mismas fechas serían la misma estancia contada dos
  // veces, y al cargarla duplicaría el importe. Mejor saberlo antes.
  const vistas = new Set<string>()
  for (const e of estancias) {
    const clave = `${e.checkIn}|${e.checkOut}`
    if (vistas.has(clave)) {
      avisos.push(`El informe trae dos veces la estancia del ${e.checkIn} al ${e.checkOut}.`)
    }
    vistas.add(clave)
  }

  return { estancias, anio, avisos }
}

// ─── Cuadre contra lo que ya hay en la aplicación ─────────────────────────────

/** Qué hay que hacerle a la reserva de una estancia del informe. */
export type AccionAirbnb =
  /** No existe: hay que crearla. */
  | 'nueva'
  /** Existe sin importe: es la laguna que viene a tapar el informe. */
  | 'rellena'
  /** Existe con otro importe: el informe manda, pero conviene mirarlo. */
  | 'cambia'
  /** Ya está igual: no se toca. */
  | 'igual'

export interface CasoAirbnb {
  estancia: EstanciaAirbnb
  /** La reserva que ya tiene la aplicación, si se ha encontrado. */
  reserva?: Reservation
  accion: AccionAirbnb
  /** Cobros ya colgados de esa reserva. */
  cobros: Payment[]
  /** Cobros sueltos del inmueble cuyo importe es justo el neto: se enlazan. */
  porEnlazar: Payment[]
  /** Suma de los dos grupos. */
  cobrado: number
  /** Neto − cobrado. Negativo si se cobró de más. */
  pendiente: number
  /** Diferencias que conviene mirar a mano. */
  avisos: string[]
}

export interface CuadreAirbnb {
  casos: CasoAirbnb[]
  /** Cobros del inmueble sin estancia del informe detrás. */
  huerfanos: Payment[]
  totales: {
    neto: number
    cobrado: number
    /** Lo que falta de estancias ya terminadas: dinero que debería estar. */
    pendienteVencido: number
    /** Lo que falta de estancias por venir: normal que no esté. */
    pendienteFuturo: number
    nuevas: number
    rellenadas: number
    cambiadas: number
    enlaces: number
  }
}

const cerca = (a: string, b: string, dias: number) =>
  Math.abs(getNights(a, b)) <= dias

/**
 * Empareja cada estancia del informe con lo que ya hay guardado.
 *
 * Primero por fechas exactas, y si no, admitiendo un par de días de baile: las
 * fechas del Excel vienen de lo que el gestor escribió a mano en la banda del
 * calendario («28//3 al 4/5 erik 7-N 2P») y alguna cojea. Ninguna reserva se
 * empareja dos veces.
 *
 * Los cobros se enlazan solo cuando el importe es **exactamente** el neto del
 * informe: es la firma del movimiento. Nada de aproximar, que es como se
 * acaban colgando cobros de la estancia equivocada.
 */
export function cuadraInformeAirbnb(
  estancias: EstanciaAirbnb[],
  apartmentId: string,
  reservations: Reservation[],
  payments: Payment[],
  hoy = new Date().toISOString().slice(0, 10),
): CuadreAirbnb {
  const delApt = reservations.filter(r => r.apartmentId === apartmentId)
  const aptDe = (p: Payment) =>
    p.apartmentId ?? reservations.find(r => r.id === p.reservationId)?.apartmentId
  const cobrosApt = payments.filter(p => aptDe(p) === apartmentId && p.received)

  const usadas = new Set<string>()
  const usados = new Set<string>()
  const casos: CasoAirbnb[] = []

  for (const e of estancias) {
    const libres = delApt.filter(r => !usadas.has(r.id) && r.status !== 'cancelada')
    const reserva =
      libres.find(r => r.checkIn === e.checkIn && r.checkOut === e.checkOut)
      ?? libres.find(r => r.checkIn === e.checkIn)
      ?? libres.find(r => cerca(r.checkIn, e.checkIn, 2) && cerca(r.checkOut, e.checkOut, 2))
    if (reserva) usadas.add(reserva.id)

    const avisos = [...e.avisos]
    if (reserva && (reserva.checkIn !== e.checkIn || reserva.checkOut !== e.checkOut)) {
      avisos.push(`en la aplicación está del ${reserva.checkIn} al ${reserva.checkOut}`
        + ' (se queda con las fechas del informe)')
    }

    const cobros = reserva ? cobrosApt.filter(p => p.reservationId === reserva.id) : []
    cobros.forEach(p => usados.add(p.id))

    // Un cobro suelto que coincide al céntimo con el neto es este cobro.
    const porEnlazar = cobrosApt.filter(p =>
      !usados.has(p.id)
      && !delApt.some(r => r.id === p.reservationId)
      && Math.abs(p.amount - e.neto) < 0.02)
    porEnlazar.forEach(p => usados.add(p.id))

    const cobrado = redondea([...cobros, ...porEnlazar].reduce((s, p) => s + p.amount, 0))
    const pendiente = redondea(e.neto - cobrado)

    if (e.enEfectivo && cobros.concat(porEnlazar).some(p => p.paymentMethod === 'transferencia')) {
      avisos.push('el informe lo da como pagado en efectivo y el cobro está anotado como transferencia')
    }

    const accion: AccionAirbnb = !reserva ? 'nueva'
      : !reserva.total ? 'rellena'
      : Math.abs(reserva.total - e.neto) > 0.02 ? 'cambia'
      : 'igual'

    casos.push({ estancia: e, reserva, accion, cobros, porEnlazar, cobrado, pendiente, avisos })
  }

  const huerfanos = cobrosApt.filter(p => !usados.has(p.id) && !delApt.some(r => r.id === p.reservationId))

  const totales = {
    neto: redondea(casos.reduce((s, c) => s + c.estancia.neto, 0)),
    cobrado: redondea(casos.reduce((s, c) => s + c.cobrado, 0)),
    pendienteVencido: redondea(casos
      .filter(c => c.estancia.checkOut <= hoy && c.pendiente > 0.02)
      .reduce((s, c) => s + c.pendiente, 0)),
    pendienteFuturo: redondea(casos
      .filter(c => c.estancia.checkOut > hoy && c.pendiente > 0.02)
      .reduce((s, c) => s + c.pendiente, 0)),
    nuevas: casos.filter(c => c.accion === 'nueva').length,
    rellenadas: casos.filter(c => c.accion === 'rellena').length,
    cambiadas: casos.filter(c => c.accion === 'cambia').length,
    enlaces: casos.reduce((s, c) => s + c.porEnlazar.length, 0),
  }

  return { casos, huerfanos, totales }
}

/** La cuenta del informe, escrita para dejarla en las observaciones. */
export function memoriaAirbnb(e: EstanciaAirbnb, anio?: number): string {
  const n = (x: number) => x.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const partes = [`Informe de Airbnb${anio ? ` ${anio}` : ''}`]
  if (e.huesped) partes.push(e.huesped)
  if (e.bruto !== undefined) {
    const cuenta = [`bruto ${n(e.bruto)} €`]
    if (e.ajuste) cuenta.push(`ajuste −${n(e.ajuste)} €`)
    if (e.comisionAirbnb) cuenta.push(`comisión Airbnb −${n(e.comisionAirbnb)} €`)
    if (e.comisionGestor) cuenta.push(`comisión gestora y limpieza −${n(e.comisionGestor)} €`)
    partes.push(`${cuenta.join(' ')} = ${n(e.neto)} € netos`)
  } else {
    partes.push(`${n(e.neto)} € netos`)
  }
  if (e.enEfectivo) partes.push('cobrado en efectivo')
  return partes.join(' · ')
}

/**
 * Quita la memoria de un informe anterior para no ir apilándolas.
 *
 * La memoria se añade siempre al final, así que desde donde empieza hasta el
 * final de la nota es suya; lo de delante —de dónde salió la reserva, la banda
 * del calendario tal y como estaba escrita— se conserva.
 */
export function sinMemoriaAirbnb(notas?: string): string {
  const texto = notas ?? ''
  const i = texto.search(/Informe de Airbnb/i)
  return (i < 0 ? texto : texto.slice(0, i)).replace(/[\s·]+$/, '').trim()
}

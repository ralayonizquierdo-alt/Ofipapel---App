import type { Payment, Reservation } from '../types'
import { getNights } from './dateUtils'

/**
 * Las siete estancias que se pisaban, tal y como las resolvió Luis.
 *
 * Salieron del volcado del calendario de colores: al pintar a mano una reserva
 * larga es fácil que la franja se solape con la de al lado, y quedaron siete
 * parejas imposibles (el mismo piso alquilado dos veces a la vez). Se le
 * mandaron en un Excel y contestó una por una; en cuatro de ellas la fecha de
 * salida estaba mal escrita —se veía porque el precio por noche salía absurdo,
 * 7 u 8 € cuando las de al lado iban a 50 o 60— y él confirmó las cuatro.
 *
 * Esto no es una regla de negocio, es un arreglo de datos de una sola vez. Va
 * aparte y en forma de lista precisamente para que se pueda leer y comprobar
 * sin bucear en el código, y para que se borre entero el día que sobre.
 *
 * Cada corrección dice a qué reserva apunta por inmueble y fechas actuales, no
 * por identificador: los identificadores los puso el volcado y no significan
 * nada para nadie.
 */

export interface Cobro {
  amount: number
  /** Fecha del cobro en ISO. */
  date: string
}

interface Comun {
  apt: string
  /** Cómo está hoy la reserva en la app: así se localiza. */
  checkIn: string
  checkOut: string
  /** Por qué se hace, en una línea. Se enseña en pantalla. */
  motivo: string
}

export type Correccion =
  /** La reserva no existió: fuera, con sus cobros. */
  | (Comun & { tipo: 'borrar' })
  /** La reserva existe pero con fechas o importe equivocados. */
  | (Comun & {
      tipo: 'corregir'
      nuevoCheckIn?: string
      nuevoCheckOut?: string
      total?: number
      cobros?: Cobro[]
    })
  /** Reserva que Luis da por buena y que puede faltar en la app. */
  | (Comun & { tipo: 'alta'; total: number; cobros?: Cobro[] })

/**
 * Las correcciones, agrupadas por el caso que resolvían. El orden importa
 * poco, pero se mantiene el de la hoja que se le mandó.
 */
export const CORRECCIONES: Correccion[] = [
  // ── 1. Apart. 203, enero–marzo 2022: ninguna de las dos existió ────────────
  {
    tipo: 'borrar', apt: '203', checkIn: '2022-01-03', checkOut: '2022-03-03',
    motivo: 'Luis: «NO EXISTE ESTA RESERVA»',
  },
  {
    tipo: 'borrar', apt: '203', checkIn: '2022-02-01', checkOut: '2022-02-03',
    motivo: 'Luis: «NO EXISTE ESTA RESERVA»',
  },

  // ── 2. Piso 3, otoño 2022: solo hubo la larga ──────────────────────────────
  // Los 1.100 € que dijo Luis son el precio del MES, no el de la estancia: el
  // calendario lo escribe cuatro veces («precio 1.100 € incluye luz y agua») y
  // al lado van los pagos mes a mes. Se toman los tres que constan con fecha.
  //
  // La salida se adelanta al 23/12: el contrato decía «hasta 31/12», pero ese
  // mismo día entra otra reserva de Navidad apuntada en la misma fila, en
  // diciembre no hay pago mensual, y la siguiente estancia larga empieza el
  // 07/01/2023. Todo apunta a que se fueron el 23.
  {
    tipo: 'corregir', apt: 'P3', checkIn: '2022-09-20', checkOut: '2022-12-31',
    nuevoCheckOut: '2022-12-23', total: 3340,
    cobros: [
      { amount: 1100, date: '2022-09-23' },
      { amount: 1100, date: '2022-10-25' },
      { amount: 1140, date: '2022-11-21' },
    ],
    motivo: 'Luis: «SOLO HAY ESTA RESERVA 1.100 €» — 1.100 €/mes, tres mensualidades cobradas',
  },
  {
    tipo: 'borrar', apt: 'P3', checkIn: '2022-12-02', checkOut: '2022-12-22',
    motivo: 'Luis: la única del periodo es la de 20/09 a 31/12',
  },

  // ── 3. Apart. 204, febrero–marzo 2023: salida mal escrita ──────────────────
  {
    tipo: 'corregir', apt: '204', checkIn: '2023-02-03', checkOut: '2023-03-13',
    nuevoCheckOut: '2023-02-13', total: 335,
    cobros: [{ amount: 335, date: '2023-02-06' }],
    motivo: 'Salía a 8,8 €/noche; 335 € al precio de al lado son 10 noches',
  },
  {
    tipo: 'corregir', apt: '204', checkIn: '2023-02-13', checkOut: '2023-03-16',
    total: 1035,
    cobros: [{ amount: 1035, date: '2023-02-16' }],
    motivo: 'Calendario: «31 días = 1.033 € PAGO 1.035»',
  },
  {
    tipo: 'alta', apt: '204', checkIn: '2023-03-19', checkOut: '2023-03-26',
    total: 400,
    cobros: [{ amount: 400, date: '2023-03-20' }],
    motivo: 'Calendario: «desde 19/03 al 26/03 7 = 400 €»',
  },

  // ── 4. Arenal 2-B, noviembre 2024: salida mal escrita ──────────────────────
  {
    tipo: 'corregir', apt: 'AP2B', checkIn: '2024-11-11', checkOut: '2024-12-15',
    nuevoCheckOut: '2024-11-15', total: 246.16,
    cobros: [{ amount: 246.16, date: '2024-11-13' }],
    motivo: 'Salía a 7 €/noche; con el 15/11 salen 61 €, como las de al lado',
  },
  {
    tipo: 'alta', apt: 'AP2B', checkIn: '2024-10-30', checkOut: '2024-11-10',
    total: 572,
    cobros: [{ amount: 572, date: '2024-11-05' }],
    motivo: 'Luis: «11 noches, PAGO 572 €»',
  },
  {
    tipo: 'alta', apt: 'AP2B', checkIn: '2024-11-19', checkOut: '2024-11-25',
    total: 323.76,
    cobros: [{ amount: 323.76, date: '2024-11-21' }],
    motivo: 'Luis: «PAGA 323,76 el 21/11/24»',
  },
  {
    tipo: 'alta', apt: 'AP2B', checkIn: '2024-11-25', checkOut: '2024-12-05',
    total: 603.12,
    cobros: [{ amount: 603.12, date: '2024-11-24' }],
    motivo: 'Luis: «PAGA 603,12 el 24/11/24»',
  },

  // ── 5. Apart. 105, octubre 2022: salida mal escrita ────────────────────────
  {
    tipo: 'corregir', apt: '105', checkIn: '2022-10-11', checkOut: '2022-11-17',
    nuevoCheckOut: '2022-10-17', total: 300,
    cobros: [{ amount: 300, date: '2022-12-13' }],
    motivo: 'Salía a 8 €/noche; con el 17/10 salen 50 €, como la siguiente',
  },
  {
    tipo: 'alta', apt: '105', checkIn: '2022-10-25', checkOut: '2022-11-01',
    total: 350,
    cobros: [{ amount: 350, date: '2022-10-26' }],
    motivo: 'Luis: «desde 25/10 al 01/11 PAGO 350»',
  },

  // ── 6. Apart. 203, octubre 2023: entrada mal escrita ───────────────────────
  {
    tipo: 'corregir', apt: '203', checkIn: '2023-10-06', checkOut: '2023-10-15',
    nuevoCheckIn: '2023-10-08', total: 312.65,
    cobros: [{ amount: 312.65, date: '2023-12-30' }],
    motivo: 'Luis dice «7 días» y del 06 al 15 hay 9; con el 08 quedan tres semanas seguidas',
  },
  {
    tipo: 'corregir', apt: '203', checkIn: '2023-10-01', checkOut: '2023-10-08',
    total: 340,
    cobros: [{ amount: 340, date: '2023-10-30' }],
    motivo: 'Luis: «01/10 al 08/10 = 7 días, 340 €»',
  },
  {
    tipo: 'alta', apt: '203', checkIn: '2023-10-15', checkOut: '2023-10-22',
    total: 417.35,
    cobros: [{ amount: 417.35, date: '2023-10-16' }],
    motivo: 'Luis: «15/10 al 22/10 = 7 días, PAGO 417,35»',
  },

  // ── 7. Ático 402, verano 2025: la corta era el arranque de la larga ────────
  {
    tipo: 'borrar', apt: '402', checkIn: '2025-07-29', checkOut: '2025-07-31',
    motivo: 'No era una reserva: es el arranque de la larga que acaba el 25/12',
  },
  {
    tipo: 'corregir', apt: '402', checkIn: '2025-07-29', checkOut: '2025-12-25',
    total: 6877,
    cobros: [
      { amount: 1360, date: '2025-07-30' },
      { amount: 1260, date: '2025-09-02' },
      { amount: 1485, date: '2025-09-29' },
      { amount: 1485, date: '2025-10-29' },
      { amount: 1287, date: '2025-12-01' },
    ],
    motivo: 'Luis: «entra 29/07/2025 y sale 25/12/2025», cinco pagos que suman 6.877 €',
  },
  {
    tipo: 'alta', apt: '402', checkIn: '2025-07-09', checkOut: '2025-07-16',
    total: 590,
    cobros: [{ amount: 590, date: '2025-07-10' }],
    motivo: 'Luis: «09/07/25 al 16/07/2025 PAGO 590 €»',
  },

  // ── 8. Apart. 204, febrero–marzo 2022: Anna Skripeland ─────────────────────
  // Ya está en la app, solo le faltaba el importe: el volcado la trajo a 0 €
  // porque 2022 no tiene tarifa cargada. Las fechas se dejan como las dio
  // Luis (hasta el 26/03); en el calendario hay un «1 día más» apuntado al
  // lado, pero eso lo decide él, no nosotros.
  {
    tipo: 'corregir', apt: '204', checkIn: '2022-02-08', checkOut: '2022-03-26',
    total: 1635,
    cobros: [
      { amount: 1000, date: '2022-02-08' },
      { amount: 635, date: '2022-03-08' },
    ],
    motivo: 'Luis: «ANNA SKRIPELAND 08/02/22 al 26/03/22, PAGO 1.000 + 635 €»',
  },
]

/** Estado de una corrección frente a lo que hay ahora mismo en la app. */
export type Estado = 'pendiente' | 'hecha' | 'sin-reserva'

export interface Paso {
  correccion: Correccion
  estado: Estado
  /** La reserva sobre la que se actúa, si se ha encontrado. */
  reserva?: Reservation
  /** Lo que se va a hacer, en cristiano. Vacío si no hay nada que hacer. */
  cambios: string[]
}

const dia = (iso: string) => iso.split('-').reverse().join('/')
const eur = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

/** ¿Están ya los cobros que pide la corrección? */
function faltanCobros(c: Correccion, r: Reservation | undefined, payments: Payment[]): Cobro[] {
  if (!r || !('cobros' in c) || !c.cobros) return []
  const suyos = payments.filter(p => p.reservationId === r.id)
  return c.cobros.filter(x =>
    !suyos.some(p => Math.abs(p.amount - x.amount) < 0.01 && p.paymentDate === x.date))
}

/**
 * Cobros de relleno que dejó el volcado del calendario: sin fecha y sin
 * cobrar, con el importe que salía de la tarifa. No son cobros de verdad, son
 * el hueco que abrió la importación para que cuadrara la reserva.
 *
 * Cuando Luis nos da los cobros reales hay que quitarlos, o el mismo dinero se
 * contaría dos veces y la reserva quedaría siempre como pendiente de cobro.
 */
function cobrosDeRelleno(c: Correccion, r: Reservation | undefined, payments: Payment[]): Payment[] {
  if (!r || !('cobros' in c) || !c.cobros?.length) return []
  return payments.filter(p => p.reservationId === r.id && !p.received && !p.paymentDate)
}

/**
 * Compara las correcciones con lo que hay guardado y dice, una a una, qué
 * queda por hacer. Se vuelve a calcular después de aplicar, así que una
 * corrección ya aplicada pasa a «hecha» sola y no se repite.
 */
export function planDe(reservations: Reservation[], payments: Payment[]): Paso[] {
  return CORRECCIONES.map((c): Paso => {
    // Se busca por las fechas de origen; si ya se corrigió, por las nuevas.
    const porFechas = (entrada: string, salida: string) => reservations.find(
      r => r.apartmentId === c.apt && r.checkIn === entrada && r.checkOut === salida)

    if (c.tipo === 'borrar') {
      const r = porFechas(c.checkIn, c.checkOut)
      return r
        ? { correccion: c, estado: 'pendiente', reserva: r, cambios: ['Se borra, con sus cobros'] }
        : { correccion: c, estado: 'hecha', cambios: [] }
    }

    const destinoEntrada = c.tipo === 'corregir' ? (c.nuevoCheckIn ?? c.checkIn) : c.checkIn
    const destinoSalida = c.tipo === 'corregir' ? (c.nuevoCheckOut ?? c.checkOut) : c.checkOut

    // Ya movida, o aún en su sitio original.
    const r = porFechas(destinoEntrada, destinoSalida) ?? porFechas(c.checkIn, c.checkOut)

    if (!r) {
      if (c.tipo === 'alta') {
        return {
          correccion: c, estado: 'pendiente',
          cambios: [`Se da de alta: ${dia(c.checkIn)} → ${dia(c.checkOut)}, ${eur(c.total)}`],
        }
      }
      return { correccion: c, estado: 'sin-reserva', cambios: [] }
    }

    const cambios: string[] = []
    if (r.checkIn !== destinoEntrada) cambios.push(`Entrada: ${dia(r.checkIn)} → ${dia(destinoEntrada)}`)
    if (r.checkOut !== destinoSalida) cambios.push(`Salida: ${dia(r.checkOut)} → ${dia(destinoSalida)}`)
    const total = 'total' in c ? c.total : undefined
    if (total !== undefined && Math.abs(r.total - total) >= 0.01) {
      cambios.push(`Importe: ${eur(r.total)} → ${eur(total)}`)
    }
    for (const f of faltanCobros(c, r, payments)) {
      cambios.push(`Cobro que falta: ${eur(f.amount)} del ${dia(f.date)}`)
    }
    for (const p of cobrosDeRelleno(c, r, payments)) {
      cambios.push(`Se quita el cobro provisional de ${eur(p.amount)} que dejó el volcado`)
    }

    return { correccion: c, estado: cambios.length ? 'pendiente' : 'hecha', reserva: r, cambios }
  })
}

/**
 * Los campos que hay que guardar en una reserva ya existente.
 *
 * Vale también para los pasos de alta cuya reserva ya estaba en la app: en ese
 * caso no hay que crearla, pero sí ponerle el importe que dijo Luis, que es lo
 * que le faltaba (el volcado del calendario las trajo sin precio).
 */
export function parcheDe(p: Paso): Partial<Reservation> | null {
  const c = p.correccion
  if (c.tipo === 'borrar' || !p.reserva) return null
  const checkIn = c.tipo === 'corregir' ? (c.nuevoCheckIn ?? p.reserva.checkIn) : p.reserva.checkIn
  const checkOut = c.tipo === 'corregir' ? (c.nuevoCheckOut ?? p.reserva.checkOut) : p.reserva.checkOut
  const parche: Partial<Reservation> = {}
  if (checkIn !== p.reserva.checkIn) parche.checkIn = checkIn
  if (checkOut !== p.reserva.checkOut) parche.checkOut = checkOut
  if (parche.checkIn || parche.checkOut) parche.nights = getNights(checkIn, checkOut)
  if (c.total !== undefined && Math.abs(p.reserva.total - c.total) >= 0.01) {
    // El precio lo pactó Luis en su día: manda sobre la tarifa, así que se
    // guarda como base y el total sale de ahí sin limpieza ni descuento.
    parche.basePrice = c.total
    parche.cleaningFee = 0
    parche.discountPct = 0
    parche.total = c.total
  }
  return Object.keys(parche).length ? parche : null
}

/** La reserva nueva que hay que crear en un paso de alta. */
export function altaDe(p: Paso): Omit<Reservation, 'id' | 'createdAt'> | null {
  const c = p.correccion
  if (c.tipo !== 'alta' || p.reserva) return null
  return {
    apartmentId: c.apt,
    checkIn: c.checkIn,
    checkOut: c.checkOut,
    nights: getNights(c.checkIn, c.checkOut),
    stayType: 'otro',
    channel: 'directo',
    basePrice: c.total,
    cleaningFee: 0,
    discountPct: 0,
    total: c.total,
    status: 'completada',
    notes: c.motivo,
  }
}

export { faltanCobros, cobrosDeRelleno }

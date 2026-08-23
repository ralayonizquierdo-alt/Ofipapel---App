import type {
  IngresoMensual, OcupacionMensual, Payment, Repair, Reservation, ReparacionMensual,
} from '../types'

/**
 * Descuadres entre el Excel (la fuente oficial del ejercicio) y lo que hay
 * registrado en la app.
 *
 * No corrigen nada ni cambian ningún cálculo: solo señalan la diferencia para
 * que alguien la revise, que es justo lo que pidió el propietario. Mientras no
 * se revise, cada pantalla sigue usando su fuente de siempre.
 */

export type TipoDescuadre = 'ingresos' | 'reparaciones' | 'ocupacion' | 'sinFecha' | 'solape' | 'sinImporte'

export interface Descuadre {
  id: string
  tipo: TipoDescuadre
  year: number
  titulo: string
  /** Diferencia en euros, con signo. 0 cuando el aviso no es de importe. */
  diferencia: number
  /** Desglose para poder comprobarlo, una línea por inmueble o por mes. */
  detalle: string[]
}

/** Diferencias por debajo de esto son redondeos, no descuadres. */
const UMBRAL = 1

const eur = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

function suma<T>(items: T[], f: (x: T) => number): number {
  return items.reduce((s, x) => s + (Number.isFinite(f(x)) ? f(x) : 0), 0)
}

function porInmueble<T>(items: T[], apt: (x: T) => string, val: (x: T) => number): Map<string, number> {
  const m = new Map<string, number>()
  for (const x of items) {
    const n = val(x)
    m.set(apt(x), (m.get(apt(x)) || 0) + (Number.isFinite(n) ? n : 0))
  }
  return m
}

export interface DatosDescuadre {
  incomes: IngresoMensual[]
  repairTotals: ReparacionMensual[]
  occupancies: OcupacionMensual[]
  payments: Payment[]
  reservations: Reservation[]
  repairs: Repair[]
  nombreApt: (id: string) => string
}

export function calculaDescuadres(d: DatosDescuadre): Descuadre[] {
  const avisos: Descuadre[] = []
  const nombre = d.nombreApt

  // A qué inmueble pertenece cada cobro: el cobro cuelga de la reserva.
  const aptDeReserva = new Map(d.reservations.map(r => [r.id, r.apartmentId]))
  const cobrados = d.payments.filter(p => p.received)

  // Años sobre los que hay algo declarado en el Excel. Sin Excel no hay con qué
  // comparar, así que no se inventa ningún aviso.
  const years = [...new Set([
    ...d.incomes.map(i => i.year),
    ...d.repairTotals.map(r => r.year),
    ...d.occupancies.map(o => o.year),
  ])].sort((a, b) => b - a)

  for (const year of years) {
    // ── Ingresos: lo declarado en el Excel contra lo cobrado en la app ────────
    const declarados = d.incomes.filter(i => i.year === year)
    if (declarados.length > 0) {
      const cobradosAno = cobrados.filter(p => p.paymentDate?.startsWith(String(year)))
      const totalDecl = suma(declarados, i => i.amount)
      const totalCobr = suma(cobradosAno, p => p.amount)
      const dif = Math.round((totalDecl - totalCobr) * 100) / 100

      if (Math.abs(dif) >= UMBRAL) {
        const decl = porInmueble(declarados, i => i.apartmentId, i => i.amount)
        const cobr = porInmueble(
          cobradosAno,
          p => aptDeReserva.get(p.reservationId) || '—',
          p => p.amount,
        )
        const detalle = [...new Set([...decl.keys(), ...cobr.keys()])]
          .map(apt => {
            const a = decl.get(apt) || 0
            const b = cobr.get(apt) || 0
            return { apt, a, b, dif: Math.round((a - b) * 100) / 100 }
          })
          .filter(x => Math.abs(x.dif) >= UMBRAL)
          .sort((x, y) => Math.abs(y.dif) - Math.abs(x.dif))
          .map(x => `${nombre(x.apt)}: Excel ${eur(x.a)} · cobrado ${eur(x.b)} → ${x.dif > 0 ? '+' : ''}${eur(x.dif)}`)

        avisos.push({
          id: `ingresos-${year}`,
          tipo: 'ingresos',
          year,
          titulo: `Ingresos ${year}: el Excel y los cobros no cuadran`,
          diferencia: dif,
          detalle: [
            `Excel ${eur(totalDecl)} · cobrado en la app ${eur(totalCobr)}`,
            ...detalle,
          ],
        })
      }
    }

    // ── Reparaciones: cifra del Excel contra las fichas de la app ─────────────
    const repDecl = d.repairTotals.filter(r => r.year === year)
    if (repDecl.length > 0) {
      const repApp = d.repairs.filter(r => r.repairDate?.startsWith(String(year)))
      const decl = porInmueble(repDecl, r => r.apartmentId, r => r.amount)
      const app = porInmueble(repApp, r => r.apartmentId, r => r.amount || 0)
      // Se compara inmueble a inmueble, no solo el total: las diferencias van
      // en los dos sentidos y al sumarlas se compensan entre sí, con lo que un
      // total casi cuadrado puede esconder desviaciones grandes por piso.
      const lineas = [...new Set([...decl.keys(), ...app.keys()])]
        .map(apt => {
          const a = decl.get(apt) || 0
          const b = app.get(apt) || 0
          return { apt, a, b, dif: Math.round((a - b) * 100) / 100 }
        })
        .filter(x => Math.abs(x.dif) >= UMBRAL)
        .sort((x, y) => Math.abs(y.dif) - Math.abs(x.dif))

      if (lineas.length > 0) {
        const totalDif = Math.round(suma(lineas, x => x.dif) * 100) / 100
        avisos.push({
          id: `reparaciones-${year}`,
          tipo: 'reparaciones',
          year,
          titulo: `Reparaciones ${year}: ${plural(lineas.length, 'inmueble no cuadra', 'inmuebles no cuadran')} con el Excel`,
          diferencia: totalDif,
          detalle: [
            `Diferencia neta ${totalDif > 0 ? '+' : ''}${eur(totalDif)} (las hay en los dos sentidos)`,
            ...lineas.map(x =>
              `${nombre(x.apt)}: Excel ${eur(x.a)} · app ${eur(x.b)} → ${x.dif > 0 ? '+' : ''}${eur(x.dif)}`),
          ],
        })
      }
    }

    // ── Ocupación imposible ──────────────────────────────────────────────────
    const imposibles = d.occupancies.filter(
      o => o.year === year && o.diasTotales > 0 && o.diasAlquilados > o.diasTotales,
    )
    if (imposibles.length > 0) {
      avisos.push({
        id: `ocupacion-${year}`,
        tipo: 'ocupacion',
        year,
        titulo: `Ocupación ${year}: ${plural(imposibles.length, 'mes', 'meses')} con más días alquilados que días tiene el mes`,
        diferencia: 0,
        detalle: imposibles.map(o =>
          `${nombre(o.apartmentId)} ${MESES[o.month - 1]}: ${o.diasAlquilados} de ${o.diasTotales} días`),
      })
    }
  }

  // ── Reservas que se pisan ──────────────────────────────────────────────────
  // Dos estancias a la vez en el mismo piso no pueden ser: o una está mal
  // apuntada o no llegó a ocurrir. Pisarse un solo día no cuenta: es el cambio
  // de huésped de siempre, uno sale por la mañana y otro entra por la tarde.
  const reservasPorInmueble = new Map<string, Reservation[]>()
  for (const r of d.reservations) {
    if (r.status === 'cancelada') continue
    if (!reservasPorInmueble.has(r.apartmentId)) reservasPorInmueble.set(r.apartmentId, [])
    reservasPorInmueble.get(r.apartmentId)!.push(r)
  }
  const solapes: { apt: string; a: Reservation; b: Reservation; dias: number }[] = []
  for (const [apt, lista] of reservasPorInmueble) {
    lista.sort((x, y) => x.checkIn.localeCompare(y.checkIn))
    for (let i = 1; i < lista.length; i++) {
      const dias = Math.round((+new Date(lista[i - 1].checkOut) - +new Date(lista[i].checkIn)) / 86400000)
      if (dias >= 2) solapes.push({ apt, a: lista[i - 1], b: lista[i], dias })
    }
  }
  if (solapes.length > 0) {
    solapes.sort((x, y) => y.dias - x.dias)
    const dia = (f: string) => f.split('-').reverse().join('/')
    avisos.push({
      id: 'solapes',
      tipo: 'solape',
      year: 0,
      titulo: `${plural(solapes.length, 'reserva se pisa', 'reservas se pisan')} con otra del mismo inmueble`,
      diferencia: 0,
      detalle: solapes.map(s =>
        `${nombre(s.apt)}: ${dia(s.a.checkIn)}–${dia(s.a.checkOut)} y ${dia(s.b.checkIn)}–${dia(s.b.checkOut)} (${s.dias} días)`),
    })
  }

  // ── Reservas sin importe ───────────────────────────────────────────────────
  // Pasa con las que vienen del calendario de años para los que no hay lista
  // de precios cargada: entran con las fechas bien pero a cero, y así no
  // cuentan en Analítica. Se arregla cargando la tarifa de esos años.
  const sinImporte = d.reservations.filter(r => r.status !== 'cancelada' && !(r.total > 0))
  if (sinImporte.length > 0) {
    const porAnio = new Map<string, number>()
    for (const r of sinImporte) {
      const a = r.checkIn.slice(0, 4)
      porAnio.set(a, (porAnio.get(a) || 0) + 1)
    }
    avisos.push({
      id: 'sin-importe',
      tipo: 'sinImporte',
      year: 0,
      titulo: `${plural(sinImporte.length, 'reserva', 'reservas')} sin importe`,
      diferencia: 0,
      detalle: [
        ...[...porAnio.entries()].sort().map(([a, n]) => `${a}: ${n}`),
        'Suele ser que falta la lista de precios de esos años: al cargarla en Precios se les puede poner el importe.',
      ],
    })
  }

  // ── Cobros sin fecha ───────────────────────────────────────────────────────
  // Un cobro sin fecha no entra en ningún ejercicio, así que desaparece de
  // cualquier comparación por años. Hay que decir a qué año pertenece.
  const sinFecha = cobrados.filter(p => !p.paymentDate)
  if (sinFecha.length > 0) {
    const total = suma(sinFecha, p => p.amount)
    avisos.push({
      id: 'sin-fecha',
      tipo: 'sinFecha',
      year: 0,
      titulo: `${plural(sinFecha.length, 'cobro marcado', 'cobros marcados')} como cobrado sin fecha de cobro`,
      diferencia: total,
      detalle: [
        `Suman ${eur(total)} y no cuentan en ningún ejercicio.`,
        'Hay que ponerles fecha para saber a qué año pertenecen.',
      ],
    })
  }

  return avisos
}

import type { Reservation } from '../types'
import { today } from './dateUtils'

/**
 * Reservas que se pisan: el mismo apartamento alquilado dos veces a la vez.
 *
 * Esto no es un descuadre de cuentas que uno revisa cuando puede: es un error
 * que no puede existir. Si dos estancias comparten una noche en el mismo piso,
 * o sobra una (una anulación que no se llegó a anular, un aviso subido dos
 * veces) o hay dos clientes a los que se les ha dado la misma llave.
 *
 * Nació de un caso real (26/10/2026): el Arenal salía con tres estancias
 * encima, y resultó ser una reserva anulada que nunca se marcó como anulada.
 * El planning lo enseñaba, pero había que ir a mirarlo; ahora salta solo.
 *
 * **Solo se mira de hoy en adelante** (decisión del propietario, 26/10/2026:
 * «olvida los años pasados porque si no no acabamos nunca»). Al encenderlo
 * contra los datos de verdad salieron 8 pares y todos eran de 2024 y 2025, y
 * casi todos **la misma estancia metida dos veces**: el calendario del Excel
 * se importó año a año, así que una estancia de diciembre a marzo quedó
 * cortada el 31 de diciembre en un apunte y entera en otro (el 203 lo dice en
 * su propia nota: «entra 03/12/2025 y sale 31/03/2026», guardado como
 * 03/12/2025 → 31/12/2025). Eso ya no se puede arreglar con nadie dentro, y un
 * aviso que no se puede cerrar nunca deja de mirarse: el día que haya un
 * solape de verdad no lo vería nadie. Lo que importa es lo que todavía puede
 * dejar a alguien en la puerta.
 *
 * Cuando sale uno, se clasifica (`tipo`) para decir si parece la misma
 * estancia apuntada dos veces o dos clientes distintos.
 *
 * Una salida y una entrada el mismo día NO se pisan: el `checkOut` es
 * exclusivo, esa noche ya no duerme nadie.
 */

export interface Solape {
  /** Identificador estable, para no repetir el mismo aviso. */
  id: string
  apartmentId: string
  a: Reservation
  b: Reservation
  /** Las noches que se comparten, en ISO. */
  desde: string
  hasta: string
  noches: number
  /**
   * `duplicada`: todo apunta a que es la misma estancia guardada dos veces
   * (una de ellas cortada o con una fecha mal leída). `solape`: dos estancias
   * distintas que se pisan, que es el caso grave.
   */
  tipo: 'duplicada' | 'solape'
  /** Qué nos hace pensar que es un duplicado, para enseñarlo tal cual. */
  motivo?: string
  /** La reserva que sobra, cuando está claro cuál es (la cortada). */
  sobra?: Reservation
}

const DIA = 86400000
const enDias = (iso: string) =>
  Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))

/** ¿Acaba justo el 31 de diciembre? Es la huella del corte por año del Excel. */
const finDeAno = (iso: string) => iso.slice(5) === '12-31'

/**
 * ¿Las dos son la misma estancia?
 *
 * Solo se dice que sí cuando una está **dentro** de la otra y además empiezan
 * (casi) o acaban el mismo día: es el patrón del apunte cortado —misma
 * entrada, salida recortada el 31 de diciembre— y el de una fecha mal leída
 * —misma salida, entrada a medias—. Dos estancias que se pisan por los
 * bordes, con entradas y salidas distintas, no se tocan: ésas son el caso
 * grave.
 *
 * La entrada se admite con hasta tres días de diferencia porque el calendario
 * del Excel se escribía a mano y el Arenal tiene la misma estancia apuntada
 * como 17/12 y como 18/12.
 */
function mismaEstancia(a: Reservation, b: Reservation): { sobra: Reservation; motivo: string } | null {
  const [larga, corta] = a.nights >= b.nights ? [a, b] : [b, a]
  const dentro = corta.checkIn >= larga.checkIn && corta.checkOut <= larga.checkOut
  if (!dentro) return null

  const mismaEntrada = corta.checkIn === larga.checkIn
  const entradaCerca = enDias(corta.checkIn) - enDias(larga.checkIn) <= 3 * DIA
  const mismaSalida = corta.checkOut === larga.checkOut
  // La copia cortada acaba el 31 de diciembre y la entera sigue al año
  // siguiente: es exactamente lo que dejó la importación año a año.
  const cortadaPorAno = entradaCerca && finDeAno(corta.checkOut) && larga.checkOut > corta.checkOut
  if (!mismaEntrada && !mismaSalida && !cortadaPorAno) return null

  if (cortadaPorAno) {
    return {
      sobra: corta,
      motivo: 'la misma estancia cortada el 31 de diciembre, de cuando el calendario se importó año a año',
    }
  }
  // La nota de la copia cortada suele traer las fechas de verdad escritas a
  // mano («entra 03/12/2025 y sale 31/03/2026»); si menciona la salida de la
  // larga, no hay más que hablar.
  const d = corta.notes ?? ''
  const [y, m, dd] = [larga.checkOut.slice(0, 4), larga.checkOut.slice(5, 7), larga.checkOut.slice(8, 10)]
  if (d.includes(`${dd}/${m}/${y}`) || d.includes(`${dd}/${m}/${y.slice(2)}`)) {
    return { sobra: corta, motivo: 'la nota de una de ellas trae las fechas de la otra: es el mismo alquiler apuntado dos veces' }
  }
  return {
    sobra: corta,
    motivo: mismaEntrada
      ? 'misma entrada y una salida más corta: parece el mismo alquiler apuntado dos veces'
      : 'misma salida y una entrada más tarde: parece el mismo alquiler apuntado dos veces',
  }
}

/**
 * Los pares de reservas que se pisan **de hoy en adelante**, del más próximo
 * al más lejano.
 *
 * Lo que ya pasó no entra: no se puede arreglar y taparía lo que sí importa
 * (ver la explicación de arriba). Una estancia en marcha sí cuenta, aunque
 * empezara el año pasado, porque ahí todavía hay alguien dentro.
 */
export function solapes(reservations: Reservation[]): Solape[] {
  const hoy = today()
  const vivas = reservations
    .filter(r => r.status !== 'cancelada' && r.checkIn && r.checkOut && r.checkIn < r.checkOut)
    // Las que ya terminaron no pueden pisar a nadie hoy.
    .filter(r => r.checkOut > hoy)
    .sort((x, y) => x.checkIn.localeCompare(y.checkIn))

  const porApto = new Map<string, Reservation[]>()
  for (const r of vivas) {
    const lista = porApto.get(r.apartmentId) ?? []
    lista.push(r)
    porApto.set(r.apartmentId, lista)
  }

  const fuera: Solape[] = []
  for (const [apartmentId, lista] of porApto) {
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        const a = lista[i], b = lista[j]
        // Ordenadas por entrada: en cuanto una empieza después de que acabe la
        // primera, ninguna de las siguientes puede pisarla.
        if (b.checkIn >= a.checkOut) break
        const desde = a.checkIn > b.checkIn ? a.checkIn : b.checkIn
        const hasta = a.checkOut < b.checkOut ? a.checkOut : b.checkOut
        const dup = mismaEstancia(a, b)
        fuera.push({
          id: [a.id, b.id].sort().join('|'),
          apartmentId, a, b, desde, hasta,
          noches: Math.max(1, Math.round((enDias(hasta) - enDias(desde)) / DIA)),
          tipo: dup ? 'duplicada' : 'solape',
          motivo: dup?.motivo,
          sobra: dup?.sobra,
        })
      }
    }
  }

  return fuera.sort((x, y) => x.desde.localeCompare(y.desde))
}

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import type { Apartment, Payment, Reservation } from '../types'
import { formatDate, getNights, today } from '../lib/dateUtils'
import { eur } from '../lib/formato'
import { ORDEN_APARTAMENTOS } from '../lib/apartamentos'
import PageHeader from '../components/ui/PageHeader'
import Modal from '../components/ui/Modal'

/**
 * Los edificios, de un vistazo.
 *
 * Es la misma información que las otras pantallas —quién está dentro, quién
 * entra, quién sale y qué falta por cobrar— pero mirada como se mira un
 * edificio desde la acera: una ventana por apartamento, encendida si hay
 * alguien. En diez segundos se ve el día entero sin leer una sola tabla.
 *
 * No calcula nada nuevo ni guarda nada: se dibuja a partir de las reservas y
 * los cobros que ya hay. Si algo no cuadra aquí, no cuadra en Reservas.
 *
 * Todo es SVG dibujado a mano, sin librerías: pesa lo que pesa un par de
 * iconos y se imprime sin romperse.
 */

// ─── Qué hay detrás de cada ventana ───────────────────────────────────────────

interface EstadoApto {
  apt: Apartment
  /** La estancia que ocupa ese día, si la hay. */
  reserva?: Reservation
  /** La que entra ese mismo día (la ventana se enciende al atardecer). */
  entra: boolean
  /** La que se va ese día: por la mañana el piso se queda vacío. */
  sale?: Reservation
  ocupado: boolean
  /** Lo que falta por cobrar de estancias ya terminadas de ese apartamento. */
  debe: number
}

function estadoDe(
  apt: Apartment, dia: string, reservations: Reservation[], payments: Payment[],
): EstadoApto {
  const suyas = reservations.filter(r => r.apartmentId === apt.id && r.status !== 'cancelada')
  const reserva = suyas.find(r => r.checkIn <= dia && r.checkOut > dia)
  const sale = suyas.find(r => r.checkOut === dia)
  const cobrado = (r: Reservation) =>
    payments.filter(p => p.reservationId === r.id && p.received).reduce((s, p) => s + p.amount, 0)
  const debe = suyas
    .filter(r => r.checkOut <= today() && r.checkIn >= '2026-01-01')
    .reduce((s, r) => s + Math.max(0, Math.round((r.total - cobrado(r)) * 100) / 100), 0)

  return {
    apt, reserva, sale,
    entra: reserva?.checkIn === dia,
    ocupado: !!reserva,
    debe: Math.round(debe * 100) / 100,
  }
}

/** Un número estable entre 0 y 1 a partir de un texto: para que cada ventana
 *  tenga su cortina, su figura y su parpadeo, y no parezcan todas la misma. */
function azar(semilla: string): number {
  let n = 0
  for (let i = 0; i < semilla.length; i++) n = (n * 31 + semilla.charCodeAt(i)) % 9973
  return n / 9973
}

// ─── La ventana ───────────────────────────────────────────────────────────────

const ANCHO = 74
const ALTO = 58

/**
 * Una ventana con su marco, su cristal, su barandilla y, si hay alguien, la
 * luz encendida y la silueta dentro.
 *
 * Los avisos van fuera del cristal, pegados al marco: una flecha verde si
 * entra ese día, azul si se va, y un aspa roja si ese apartamento tiene
 * estancias terminadas sin cobrar del todo.
 */
function Ventana({ e, x, y, noche, onClick }: {
  e: EstadoApto; x: number; y: number; noche: boolean; onClick: () => void
}) {
  const r = azar(e.apt.id)
  const luz = e.ocupado
  const cristal = luz ? `url(#encendida-${e.apt.id})` : (noche ? '#1e293b' : 'url(#apagada)')

  return (
    <g className="ventana" onClick={onClick} style={{ cursor: 'pointer' }}>
      <title>{`${e.apt.name} · ${e.ocupado ? 'ocupado' : 'libre'}`}</title>

      {/* Hueco en la fachada y marco */}
      <rect x={x - 3} y={y - 3} width={ANCHO + 6} height={ALTO + 6} rx="3" fill="#0f172a" opacity="0.18" />
      <rect x={x} y={y} width={ANCHO} height={ALTO} rx="2" fill="#f8fafc" />
      <rect x={x + 3} y={y + 3} width={ANCHO - 6} height={ALTO - 6} fill={cristal} />

      {/* Lo que se ve dentro: la lámpara del techo y quien esté */}
      {luz && (
        <g clipPath={`url(#dentro-${e.apt.id})`}>
          <ellipse cx={x + ANCHO / 2} cy={y + 6} rx="16" ry="9" fill="#fef3c7" opacity="0.75" />
          <Persona x={x + 14 + r * (ANCHO - 44)} y={y + ALTO - 8} semilla={e.apt.id} />
          {r > 0.55 && (
            // Un televisor encendido al fondo, con su parpadeo azulado.
            <rect x={x + ANCHO - 22} y={y + ALTO - 26} width="14" height="10" rx="1"
              fill="#93c5fd" className="tele" />
          )}
        </g>
      )}
      <clipPath id={`dentro-${e.apt.id}`}>
        <rect x={x + 3} y={y + 3} width={ANCHO - 6} height={ALTO - 6} />
      </clipPath>

      {/* Cortina recogida a un lado, distinta en cada piso */}
      <path d={`M${x + 3} ${y + 3} q ${8 + r * 6} ${ALTO / 2} 0 ${ALTO - 6} l -${0} 0 z`}
        fill="#e2e8f0" opacity={luz ? 0.55 : 0.3} />

      {/* Carpintería: un travesaño y el montante central */}
      <rect x={x + ANCHO / 2 - 1.5} y={y + 3} width="3" height={ALTO - 6} fill="#f1f5f9" />
      <rect x={x + 3} y={y + ALTO / 2 - 1.5} width={ANCHO - 6} height="3" fill="#f1f5f9" />
      {/* Reflejo del cielo en el cristal */}
      <path d={`M${x + 5} ${y + ALTO - 5} L${x + ANCHO / 2 - 4} ${y + 5} L${x + ANCHO / 2 + 4} ${y + 5} L${x + 13} ${y + ALTO - 5} Z`}
        fill="#fff" opacity={luz ? 0.07 : 0.16} />

      {/* Alféizar y barandilla */}
      <rect x={x - 5} y={y + ALTO} width={ANCHO + 10} height="4" rx="1" fill="#e2e8f0" />
      <g stroke="#94a3b8" strokeWidth="1.5" opacity="0.9">
        <rect x={x - 4} y={y + ALTO + 4} width={ANCHO + 8} height="14" fill="none" />
        {Array.from({ length: 7 }, (_, i) => (
          <line key={i} x1={x - 4 + ((ANCHO + 8) / 7) * (i + 0.5)} y1={y + ALTO + 4}
            x2={x - 4 + ((ANCHO + 8) / 7) * (i + 0.5)} y2={y + ALTO + 18} />
        ))}
      </g>

      {/* El número del apartamento, en su placa */}
      <rect x={x + ANCHO / 2 - 17} y={y + ALTO + 21} width="34" height="14" rx="7" fill="#0f172a" opacity="0.72" />
      <text x={x + ANCHO / 2} y={y + ALTO + 31} textAnchor="middle" fontSize="10"
        fontWeight="700" fill="#fff">{e.apt.id}</text>

      {/* Avisos del día */}
      <g transform={`translate(${x + ANCHO - 9}, ${y - 9})`}>
        {e.entra && <Aviso color="#16a34a" icono="▲" titulo="Entra hoy" />}
        {!e.entra && e.sale && <Aviso color="#2563eb" icono="▼" titulo="Sale hoy" />}
      </g>
      {e.debe > 0 && (
        <g transform={`translate(${x - 9}, ${y - 9})`}>
          <Aviso color="#dc2626" icono="€" titulo={`Sin cobrar: ${eur(e.debe)}`} />
        </g>
      )}
    </g>
  )
}

/** La chapa redonda de un aviso, pegada a la esquina de la ventana. */
function Aviso({ color, icono, titulo }: { color: string; icono: string; titulo: string }) {
  return (
    <g className="aviso">
      <title>{titulo}</title>
      <circle r="10" fill={color} />
      <circle r="10" fill="none" stroke="#fff" strokeWidth="2" />
      <text y="4" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">{icono}</text>
    </g>
  )
}

/** Una silueta en la ventana. Se mueve despacio, como quien pasa por el salón. */
function Persona({ x, y, semilla }: { x: number; y: number; semilla: string }) {
  const r = azar(semilla + 'p')
  const tono = ['#0f172a', '#1e293b', '#334155'][Math.floor(r * 3)]
  return (
    <g className="persona" style={{ animationDelay: `${(r * 6).toFixed(1)}s` }} opacity="0.82">
      <circle cx={x} cy={y - 26} r="5" fill={tono} />
      <path d={`M${x - 7} ${y} q 0 -18 7 -18 q 7 0 7 18 z`} fill={tono} />
    </g>
  )
}

// ─── Los edificios ────────────────────────────────────────────────────────────

/** Dónde va cada apartamento: edificio, planta (0 = la de abajo) y columna. */
const PLANO: Record<string, { edificio: 'principal' | 'piso3' | 'arenal'; planta: number; col: number }> = {
  '104': { edificio: 'principal', planta: 0, col: 0 },
  '105': { edificio: 'principal', planta: 0, col: 1 },
  '106': { edificio: 'principal', planta: 0, col: 2 },
  '203': { edificio: 'principal', planta: 1, col: 0 },
  '204': { edificio: 'principal', planta: 1, col: 1 },
  '402': { edificio: 'principal', planta: 2, col: 2 },
  'P3':   { edificio: 'piso3',    planta: 1, col: 0 },
  'AP2B': { edificio: 'arenal',   planta: 1, col: 0 },
}

/** La fachada de un edificio: muro, zócalo, portal, azotea y sus detalles. */
function Fachada({ x, y, ancho, alto, nombre, color, portal = true }: {
  x: number; y: number; ancho: number; alto: number; nombre: string; color: string; portal?: boolean
}) {
  return (
    <g>
      {/* Sombra en el suelo */}
      <ellipse cx={x + ancho / 2} cy={y + alto + 6} rx={ancho / 1.7} ry="10" fill="#0f172a" opacity="0.13" />
      {/* Cuerpo */}
      <rect x={x} y={y} width={ancho} height={alto} rx="4" fill={color} />
      {/* Esquina en sombra, para que no sea un rectángulo plano */}
      <rect x={x + ancho - 26} y={y} width="26" height={alto} fill="#0f172a" opacity="0.07" />
      <rect x={x} y={y} width="10" height={alto} fill="#fff" opacity="0.18" />
      {/* Cornisa y azotea */}
      <rect x={x - 8} y={y - 12} width={ancho + 16} height="12" rx="2" fill="#e2e8f0" />
      <rect x={x - 8} y={y - 20} width={ancho + 16} height="8" rx="2" fill="#cbd5e1" />
      {/* Dos aires acondicionados y una antena, que no falten */}
      <rect x={x + 18} y={y - 32} width="22" height="12" rx="2" fill="#f1f5f9" stroke="#cbd5e1" />
      <rect x={x + ancho - 54} y={y - 30} width="18" height="10" rx="2" fill="#f1f5f9" stroke="#cbd5e1" />
      <path d={`M${x + ancho / 2} ${y - 20} v -22`} stroke="#94a3b8" strokeWidth="2" />
      <circle cx={x + ancho / 2} cy={y - 44} r="4" fill="none" stroke="#94a3b8" strokeWidth="2" />
      {/* La caja de la escalera: ventanucos pequeños, uno por planta. Son de
          adorno, pero sin ellos la fachada parece un muro liso. */}
      <g>
        <rect x={x + ancho / 2 - 16} y={y + 10} width="32" height={alto - 64} rx="2"
          fill="#0f172a" opacity="0.05" />
        {Array.from({ length: Math.max(1, Math.floor((alto - 80) / 56)) }, (_, i) => (
          <rect key={i} x={x + ancho / 2 - 9} y={y + 24 + i * 56} width="18" height="26" rx="2"
            fill="#bae6fd" opacity="0.5" />
        ))}
      </g>

      {/* Zócalo */}
      <rect x={x - 4} y={y + alto - 26} width={ancho + 8} height="26" fill="#0f172a" opacity="0.10" />
      {portal && (
        <g>
          <rect x={x + ancho / 2 - 26} y={y + alto - 54} width="52" height="54" rx="3" fill="#1e293b" opacity="0.85" />
          <rect x={x + ancho / 2 - 22} y={y + alto - 50} width="44" height="50" fill="#38bdf8" opacity="0.25" />
          <line x1={x + ancho / 2} y1={y + alto - 50} x2={x + ancho / 2} y2={y + alto}
            stroke="#e2e8f0" strokeWidth="1.5" />
          <circle cx={x + ancho / 2 - 30} cy={y + alto - 58} r="5" fill="#fde68a" className="farol" />
        </g>
      )}
      {/* El rótulo del edificio */}
      <rect x={x + ancho / 2 - 62} y={y + alto + 14} width="124" height="22" rx="11" fill="#0f172a" opacity="0.8" />
      <text x={x + ancho / 2} y={y + alto + 29} textAnchor="middle" fontSize="12"
        fontWeight="700" fill="#fff" letterSpacing="0.5">{nombre}</text>
    </g>
  )
}

/**
 * Palmera, que esto son las Canarias.
 *
 * Va en dos grupos a propósito: el de fuera coloca y escala, el de dentro se
 * mece. Si se juntan, la animación CSS pisa el `transform` del SVG y las
 * palmeras se van todas a la esquina de arriba a la izquierda.
 */
function Palmera({ x, y, escala = 1 }: { x: number; y: number; escala?: number }) {
  return (
    <g transform={`translate(${x},${y}) scale(${escala})`}>
     <g className="palmera">
      <path d="M0 0 q -4 -34 2 -62" stroke="#92400e" strokeWidth="7" fill="none" strokeLinecap="round" />
      <g fill="#15803d">
        <path d="M2 -62 q -26 -10 -34 4 q 20 -2 34 2 z" />
        <path d="M2 -62 q 26 -12 36 2 q -22 -2 -36 4 z" />
        <path d="M2 -62 q -14 -22 -34 -22 q 16 10 32 24 z" />
        <path d="M2 -62 q 16 -22 36 -20 q -18 8 -34 24 z" />
        <path d="M2 -62 q 2 -24 -6 -34 q -2 18 2 36 z" opacity="0.9" />
      </g>
      <circle cx="0" cy="-58" r="3" fill="#a16207" />
     </g>
    </g>
  )
}

/** Un gato que cruza la acera como si tal cosa. */
function Gato({ y }: { y: number }) {
  return (
    <g transform={`translate(0,${y})`}>
     <g className="cruza-gato">
      <g fill="#475569">
        <ellipse cx="14" cy="-7" rx="13" ry="6" />
        <circle cx="26" cy="-13" r="5.5" />
        <path d="M22 -17 l 2 -6 l 4 4 z" /><path d="M29 -17 l 4 -5 l 1 6 z" />
        <path d="M1 -9 q -9 -4 -8 -14 q 5 7 9 11 z" />
        <rect x="6" y="-4" width="2.5" height="6" rx="1" /><rect x="12" y="-4" width="2.5" height="6" rx="1" />
        <rect x="18" y="-4" width="2.5" height="6" rx="1" /><rect x="23" y="-4" width="2.5" height="6" rx="1" />
      </g>
     </g>
    </g>
  )
}

/** Y el perro que va detrás, que nunca lo alcanza. */
function Perro({ y }: { y: number }) {
  return (
    <g transform={`translate(0,${y})`}>
     <g className="cruza-perro">
      <g fill="#92400e">
        <ellipse cx="18" cy="-10" rx="17" ry="8" />
        <circle cx="35" cy="-17" r="7" />
        <path d="M31 -23 l -1 -8 l 6 5 z" />
        <ellipse cx="41" cy="-16" rx="4" ry="3" fill="#78350f" />
        <path d="M2 -13 q -10 -6 -6 -16 q 4 8 8 13 z" />
        <rect x="7" y="-4" width="3.5" height="8" rx="1.5" /><rect x="14" y="-4" width="3.5" height="8" rx="1.5" />
        <rect x="23" y="-4" width="3.5" height="8" rx="1.5" /><rect x="29" y="-4" width="3.5" height="8" rx="1.5" />
      </g>
     </g>
    </g>
  )
}

/** Alguien bajando la acera en patinete. */
function Patinete({ y }: { y: number }) {
  return (
    <g transform={`translate(0,${y})`}>
     <g className="cruza-patinete">
      <g>
        {/* Patinete: dos ruedas, plataforma, mástil y manillar */}
        <circle cx="2" cy="-5" r="5" fill="#1e293b" /><circle cx="2" cy="-5" r="2" fill="#94a3b8" />
        <circle cx="40" cy="-5" r="5" fill="#1e293b" /><circle cx="40" cy="-5" r="2" fill="#94a3b8" />
        <path d="M2 -10 h 38" stroke="#334155" strokeWidth="4" strokeLinecap="round" />
        <path d="M40 -10 v -42" stroke="#64748b" strokeWidth="4" strokeLinecap="round" />
        <path d="M31 -52 h 16" stroke="#334155" strokeWidth="4.5" strokeLinecap="round" />
        {/* Quien lo lleva, de pie */}
        <circle cx="22" cy="-72" r="8" fill="#f1c27d" />
        <path d="M14 -80 q 8 -7 16 0 q -8 -3 -16 0 z" fill="#1e293b" />
        <path d="M22 -64 q -11 1 -10 20 l 20 0 q 1 -19 -10 -20 z" fill="#2563eb" />
        <path d="M17 -45 l -4 35 l 7 0 l 3 -30 z" fill="#1e293b" />
        <path d="M26 -45 l 2 35 l 6 0 l -2 -32 z" fill="#1e293b" />
        <path d="M28 -60 q 11 3 13 8" stroke="#f1c27d" strokeWidth="4" fill="none" strokeLinecap="round" />
      </g>
     </g>
    </g>
  )
}

/** La furgoneta de la limpieza, aparcada siempre al pie del edificio. */
function Furgoneta({ x, y, salidas, onClick }: {
  x: number; y: number; salidas: number; onClick: () => void
}) {
  return (
    <g transform={`translate(${x},${y})`} onClick={onClick} style={{ cursor: 'pointer' }}>
     <g className="furgo">
      <title>La limpieza · pincha para ver qué toca</title>
      <rect x="0" y="-34" width="86" height="34" rx="5" fill="#f59e0b" />
      <rect x="54" y="-30" width="30" height="16" rx="3" fill="#bae6fd" />
      <rect x="6" y="-26" width="40" height="16" rx="2" fill="#fff" opacity="0.65" />
      <text x="26" y="-14" textAnchor="middle" fontSize="9" fontWeight="700" fill="#b45309">LIMPIEZA</text>
      <circle cx="20" cy="2" r="7" fill="#1e293b" /><circle cx="20" cy="2" r="3" fill="#94a3b8" />
      <circle cx="68" cy="2" r="7" fill="#1e293b" /><circle cx="68" cy="2" r="3" fill="#94a3b8" />
      {/* Cuántas salidas hay ese día, en la chapa de siempre */}
      {salidas > 0 && (
        <g transform="translate(86,-34)">
          <circle r="11" fill="#dc2626" /><circle r="11" fill="none" stroke="#fff" strokeWidth="2" />
          <text y="4" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">{salidas}</text>
        </g>
      )}
     </g>
    </g>
  )
}

// ─── La pantalla ──────────────────────────────────────────────────────────────

export default function Edificios() {
  const { apartments, reservations, payments } = useData()
  const [dia, setDia] = useState(today())
  const [abierto, setAbierto] = useState<EstadoApto | null>(null)
  const [limpieza, setLimpieza] = useState(false)

  const hora = new Date().getHours()
  const noche = hora >= 20 || hora < 7

  const orden = (a: Apartment) => {
    const i = ORDEN_APARTAMENTOS.indexOf(a.id)
    return i < 0 ? 99 : i
  }
  const estados = useMemo(
    () => [...apartments].sort((a, b) => orden(a) - orden(b))
      .filter(a => PLANO[a.id])
      .map(a => estadoDe(a, dia, reservations, payments)),
    [apartments, dia, reservations, payments],
  )

  const ocupados = estados.filter(e => e.ocupado).length
  const entran = estados.filter(e => e.entra).length
  const salen = estados.filter(e => e.sale).length
  const debe = estados.reduce((s, e) => s + e.debe, 0)

  /** Mueve el día que se está mirando. */
  const mueve = (dias: number) => {
    const d = new Date(dia + 'T12:00:00')
    d.setDate(d.getDate() + dias)
    setDia(d.toISOString().slice(0, 10))
  }

  const dePlano = (ed: string) => estados.filter(e => PLANO[e.apt.id].edificio === ed)
  const sitio = (e: EstadoApto, base: { x: number; suelo: number }) => ({
    x: base.x + PLANO[e.apt.id].col * (ANCHO + 34),
    y: base.suelo - (PLANO[e.apt.id].planta + 1) * (ALTO + 56),
  })

  return (
    <div className="p-6">
      <PageHeader
        title="Edificios"
        subtitle={`${ocupados} de ${estados.length} ocupados`
          + (entran ? ` · ${entran} ${entran === 1 ? 'entrada' : 'entradas'}` : '')
          + (salen ? ` · ${salen} ${salen === 1 ? 'salida' : 'salidas'}` : '')
          + (debe > 0 ? ` · ${eur(debe)} sin cobrar` : '')}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => mueve(-1)}
              className="p-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
              <ChevronLeft size={16} />
            </button>
            <input type="date" value={dia} onChange={ev => setDia(ev.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" />
            <button onClick={() => mueve(1)}
              className="p-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
              <ChevronRight size={16} />
            </button>
            <button onClick={() => setDia(today())}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              <CalendarDays size={15} /> Hoy
            </button>
          </div>
        }
      />

      <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white">
        <svg viewBox="0 0 1240 700" className="w-full block" role="img"
          aria-label="Los tres edificios con sus apartamentos">
          <defs>
            {/* Cielo: de día tira a azul claro; de noche, a azul marino */}
            <linearGradient id="cielo" x1="0" y1="0" x2="0" y2="1">
              {noche ? (
                <>
                  <stop offset="0%" stopColor="#0f172a" />
                  <stop offset="70%" stopColor="#1e3a8a" />
                  <stop offset="100%" stopColor="#334155" />
                </>
              ) : (
                <>
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="60%" stopColor="#bae6fd" />
                  <stop offset="100%" stopColor="#fef9c3" />
                </>
              )}
            </linearGradient>
            <linearGradient id="apagada" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#64748b" />
              <stop offset="100%" stopColor="#334155" />
            </linearGradient>
            {estados.map(e => (
              <radialGradient key={e.apt.id} id={`encendida-${e.apt.id}`} cx="50%" cy="25%" r="85%">
                <stop offset="0%" stopColor="#fffbeb" />
                <stop offset="55%" stopColor="#fde68a" />
                <stop offset="100%" stopColor="#f59e0b" />
              </radialGradient>
            ))}
            <linearGradient id="mar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0ea5e9" />
              <stop offset="100%" stopColor="#0369a1" />
            </linearGradient>
          </defs>

          {/* Cielo, sol o luna, y nubes */}
          <rect width="1240" height="700" fill="url(#cielo)" />
          {noche
            ? <g><circle cx="1105" cy="86" r="26" fill="#fef9c3" /><circle cx="1094" cy="78" r="22" fill="#1e3a8a" /></g>
            : <circle cx="1105" cy="86" r="34" fill="#fde047" opacity="0.95" />}
          <g fill="#fff" opacity={noche ? 0.14 : 0.85}>
            <g className="nube">
              <ellipse cx="200" cy="80" rx="46" ry="20" /><ellipse cx="240" cy="72" rx="34" ry="24" />
              <ellipse cx="160" cy="88" rx="30" ry="16" />
            </g>
            <g className="nube lenta">
              <ellipse cx="760" cy="60" rx="40" ry="17" /><ellipse cx="795" cy="54" rx="28" ry="20" />
            </g>
          </g>

          {/* Gaviotas */}
          <g stroke={noche ? '#cbd5e1' : '#475569'} strokeWidth="2.5" fill="none"
            opacity="0.65" className="aves">
            <path d="M560 120 q 10 -8 20 0 q 10 -8 20 0" />
            <path d="M620 150 q 7 -6 14 0 q 7 -6 14 0" />
          </g>

          {/* El mar al fondo, a la altura del horizonte */}
          <path d="M842 552 L 872 488 H 1240 v 64 z" fill="url(#mar)" />
          <line x1="872" y1="488" x2="1240" y2="488" stroke="#bae6fd" strokeWidth="2" opacity="0.6" />
          {/* La orilla, que si no el mar acaba en un corte recto */}
          <path d="M842 552 L 872 488 l 16 0 L 862 552 z" fill="#fef3c7" opacity="0.8" />
          <g stroke="#e0f2fe" strokeWidth="2" opacity="0.55" fill="none">
            <path d="M884 508 q 12 -6 24 0 t 24 0" /><path d="M1150 504 q 12 -6 24 0 t 24 0" />
            <path d="M1176 528 q 12 -6 24 0 t 24 0" /><path d="M886 532 q 12 -6 24 0 t 24 0" />
          </g>
          {/* Un barquito en el horizonte */}
          <g className="barco">
            <path d="M1186 484 l 16 0 l -3 6 l -10 0 z" fill="#f8fafc" />
            <path d="M1194 484 v -10 l 8 10 z" fill="#f8fafc" />
          </g>

          {/* Suelo: acera y calle */}
          <rect y="550" width="1240" height="150" fill="#cbd5e1" />
          <rect y="596" width="1240" height="104" fill="#475569" />
          <g stroke="#e2e8f0" strokeWidth="4" strokeDasharray="34 26" opacity="0.8">
            <line x1="0" y1="650" x2="1240" y2="650" />
          </g>
          {/* Arena, delante del Arenal */}
          <path d="M856 550 h 384 v 46 h -384 z" fill="#fde68a" opacity="0.8" />

          {/* ── Edificio principal: 104, 105, 106 · 203, 204 · ático 402 ── */}
          <Fachada x={70} y={80} ancho={360} alto={470} nombre="EDIFICIO ALIZ" color="#e7e5e4" />
          {/* El local comercial de la planta baja */}
          <g>
            <rect x={92} y={470} width={230} height={80} rx="2" fill="#0f172a" opacity="0.75" />
            <rect x={98} y={476} width={218} height={74} fill="#fef3c7" opacity="0.92" />
            {/* Lo que se ve dentro del escaparate */}
            <g opacity="0.45" fill="#92400e">
              <rect x={112} y={500} width="30" height="46" rx="2" />
              <rect x={150} y={512} width="34" height="34" rx="2" />
              <rect x={192} y="494" width="26" height="52" rx="2" />
              <circle cx={246} cy={520} r="13" />
              <rect x={272} y={506} width="30" height="40" rx="2" />
            </g>
            {/* La puerta, a un lado */}
            <rect x={286} y={494} width={30} height={56} fill="#1e293b" opacity="0.5" />
            {/* Toldo a rayas */}
            {Array.from({ length: 10 }, (_, i) => (
              <path key={i} d={`M${92 + i * 23} 470 l 23 0 l -5 -18 l -23 0 z`}
                fill={i % 2 ? '#dc2626' : '#f8fafc'} />
            ))}
            <path d="M86 470 h 242 v 6 h -242 z" fill="#e2e8f0" />
            <rect x={116} y={424} width={182} height={24} rx="4" fill="#1e293b" />
            <text x={207} y={441} textAnchor="middle" fontSize="13" fontWeight="700"
              fill="#fde68a" letterSpacing="2">LOCAL</text>
          </g>

          {dePlano('principal').map(e => {
            const p = sitio(e, { x: 96, suelo: 440 })
            return <Ventana key={e.apt.id} e={e} x={p.x} y={p.y} noche={noche}
              onClick={() => setAbierto(e)} />
          })}
          {/* La terraza del ático: sombrilla, mesa y un par de macetas. Antes
              había una palmera plantada en el tejado, que no se sostenía. */}
          <g>
            <rect x="322" y="72" width="104" height="8" rx="2" fill="#cbd5e1" />
            <g>
              <path d="M352 72 v -26" stroke="#94a3b8" strokeWidth="3" />
              <path d="M330 46 q 22 -16 44 0 z" fill="#fb923c" />
              <path d="M330 46 q 11 -8 22 0 z" fill="#fdba74" />
              <rect x="344" y="64" width="16" height="4" rx="2" fill="#e2e8f0" />
            </g>
            <g>
              <rect x="394" y="60" width="12" height="12" rx="2" fill="#b45309" />
              <circle cx="400" cy="57" r="7" fill="#15803d" />
              <rect x="412" y="64" width="10" height="8" rx="2" fill="#b45309" />
              <circle cx="417" cy="61" r="5" fill="#15803d" />
            </g>
          </g>

          {/* ── Piso 3 ── */}
          <Fachada x={520} y={300} ancho={210} alto={250} nombre="PISO 3" color="#fde8d7" />
          {dePlano('piso3').map(e => {
            const p = sitio(e, { x: 588, suelo: 550 })
            return <Ventana key={e.apt.id} e={e} x={p.x} y={p.y} noche={noche}
              onClick={() => setAbierto(e)} />
          })}

          {/* ── Arenal 2B ── */}
          <Fachada x={930} y={290} ancho={210} alto={260} nombre="ARENAL 2B" color="#dbeafe" />
          {dePlano('arenal').map(e => {
            const p = sitio(e, { x: 998, suelo: 550 })
            return <Ventana key={e.apt.id} e={e} x={p.x} y={p.y} noche={noche}
              onClick={() => setAbierto(e)} />
          })}

          {/* Vegetación y mobiliario de calle */}
          <Palmera x={468} y={582} escala={1.15} />
          <Palmera x={790} y={578} />
          <Palmera x={898} y={586} escala={0.9} />
          <Palmera x={1190} y={582} escala={1.05} />
          <g>
            <rect x="760" y="510" width="5" height="76" fill="#64748b" />
            <circle cx="762" cy="506" r="9" fill={noche ? '#fde68a' : '#cbd5e1'} className={noche ? 'farol' : ''} />
          </g>

          {/* La furgoneta está siempre aparcada; la chapa roja dice cuántas
              salidas hay ese día, y al pincharla se abre lo que toca limpiar. */}
          <Furgoneta x={596} y={676} salidas={salen} onClick={() => setLimpieza(true)} />

          {/* La calle, con lo que pasa por ella */}
          <Gato y={590} />
          <Perro y={590} />
          <Patinete y={582} />

          {/* Cartel con el día que se está mirando */}
          <g transform="translate(40, 36)">
            <rect width="250" height="40" rx="20" fill="#0f172a" opacity="0.72" />
            <text x="20" y="25" fontSize="15" fontWeight="700" fill="#fff">
              {formatDate(dia)}
            </text>
            <text x="150" y="25" fontSize="13" fill="#e2e8f0">
              {ocupados}/{estados.length} ocupados
            </text>
          </g>
        </svg>

        {/* Qué significa cada cosa */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3 border-t border-slate-100 text-xs text-slate-600">
          <Leyenda color="#f59e0b">ventana encendida: ocupado</Leyenda>
          <Leyenda color="#16a34a">▲ entra ese día</Leyenda>
          <Leyenda color="#2563eb">▼ sale ese día</Leyenda>
          <Leyenda color="#dc2626">€ tiene estancias sin cobrar</Leyenda>
          <span className="text-slate-400">· pincha una ventana para ver la estancia</span>
        </div>
      </div>

      {abierto && (
        <FichaVentana estado={abierto} dia={dia} payments={payments} onClose={() => setAbierto(null)} />
      )}

      {limpieza && (
        <FichaLimpieza dia={dia} apartments={apartments} reservations={reservations}
          onClose={() => setLimpieza(false)} />
      )}

      {/* Lo que no cabe en el dibujo: el parpadeo de la luz, la nube que pasa
          y la silueta que se mueve. Va aquí porque es parte del dibujo, no del
          diseño de la aplicación. */}
      <style>{`
        .ventana:hover rect:nth-child(2) { stroke: #2563eb; stroke-width: 2; }
        .persona { animation: pasea 9s ease-in-out infinite; transform-box: fill-box; }
        @keyframes pasea { 0%,100% { transform: translateX(0) } 50% { transform: translateX(16px) } }
        .tele { animation: tele 2.6s steps(2) infinite; }
        @keyframes tele { 0%,100% { opacity: .95 } 50% { opacity: .55 } }
        .farol { animation: farol 4s ease-in-out infinite; }
        @keyframes farol { 0%,100% { opacity: 1 } 50% { opacity: .72 } }
        .nube { animation: nube 70s linear infinite; }
        .nube.lenta { animation-duration: 110s; }
        @keyframes nube { from { transform: translateX(-160px) } to { transform: translateX(1300px) } }
        .palmera { transform-origin: bottom center; animation: brisa 7s ease-in-out infinite; }
        @keyframes brisa { 0%,100% { transform: rotate(-0.6deg) } 50% { transform: rotate(0.8deg) } }
        .cruza-gato { animation: cruza 19s linear infinite; }
        .cruza-perro { animation: cruza 19s linear infinite; animation-delay: .9s; }
        .cruza-patinete { animation: cruza-vuelta 26s linear infinite; }
        @keyframes cruza { from { transform: translateX(-80px) } to { transform: translateX(1320px) } }
        @keyframes cruza-vuelta {
          from { transform: translateX(1320px) scaleX(-1) } to { transform: translateX(-80px) scaleX(-1) }
        }
        .furgo { animation: llega 1.2s ease-out; }
        .aves { animation: vuela 34s linear infinite; }
        @keyframes vuela { from { transform: translate(-120px, 20px) } to { transform: translate(760px, -10px) } }
        .barco { animation: navega 90s linear infinite; }
        @keyframes navega { from { transform: translateX(40px) } to { transform: translateX(-330px) } }
        @keyframes llega { from { transform: translateX(-260px) } to { transform: translateX(0) } }
        @media (prefers-reduced-motion: reduce) {
          .persona, .tele, .farol, .nube, .palmera, .furgo, .aves, .barco,
          .cruza-gato, .cruza-perro, .cruza-patinete { animation: none; }
        }
      `}</style>
    </div>
  )
}

function Leyenda({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-3 h-3 rounded-full" style={{ background: color }} />
      {children}
    </span>
  )
}

/** La ficha de la ventana que se ha pinchado: quién está y cómo va el cobro. */
function FichaVentana({ estado, dia, payments, onClose }: {
  estado: EstadoApto; dia: string; payments: Payment[]; onClose: () => void
}) {
  const { reserva, sale, apt } = estado
  const r = reserva ?? sale
  const cobrado = r
    ? payments.filter(p => p.reservationId === r.id && p.received).reduce((s, p) => s + p.amount, 0)
    : 0
  const falta = r ? Math.round((r.total - cobrado) * 100) / 100 : 0

  return (
    <Modal title={apt.name} onClose={onClose}>
      <div className="space-y-3 text-sm">
        {!r ? (
          <p className="text-slate-500">Libre el {formatDate(dia)}. No hay ninguna estancia ese día.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                estado.ocupado ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                {estado.ocupado ? 'ocupado' : 'libre'}
              </span>
              {estado.entra && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">entra hoy</span>}
              {sale && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">sale hoy</span>}
            </div>
            {r.guestName && <p className="font-medium text-slate-800">{r.guestName}</p>}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-slate-600" translate="no">
              <dt>Estancia</dt>
              <dd className="text-right text-slate-800">{formatDate(r.checkIn)} → {formatDate(r.checkOut)}</dd>
              <dt>Noches</dt>
              <dd className="text-right text-slate-800">{r.nights || getNights(r.checkIn, r.checkOut)}</dd>
              <dt>Importe</dt>
              <dd className="text-right text-slate-800 font-medium">{eur(r.total)}</dd>
              <dt>Cobrado</dt>
              <dd className="text-right text-slate-800">{eur(cobrado)}</dd>
              {Math.abs(falta) > 0.02 && (
                <>
                  <dt className={falta > 0 ? 'text-amber-700' : 'text-blue-700'}>
                    {falta > 0 ? 'Falta por cobrar' : 'Cobrado de más'}
                  </dt>
                  <dd className={`text-right font-semibold ${falta > 0 ? 'text-amber-700' : 'text-blue-700'}`}>
                    {eur(Math.abs(falta))}
                  </dd>
                </>
              )}
            </dl>
            {r.notes && <p className="text-xs text-slate-500 border-t border-slate-100 pt-2">{r.notes}</p>}
          </>
        )}
        {estado.debe > 0 && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
            Este apartamento tiene <b>{eur(estado.debe)}</b> sin cobrar de estancias ya terminadas.
          </p>
        )}
      </div>
    </Modal>
  )
}

/**
 * Lo que toca limpiar, que es lo que se pregunta al ver la furgoneta.
 *
 * Las salidas son las limpiezas: cuando alguien se va, el piso hay que
 * dejarlo listo para el siguiente. Se enseña el día que se está mirando y la
 * semana siguiente, para poder avisar con tiempo.
 *
 * El gasto de limpieza sale del parte semanal («LIMPIEZA Y REPARACIONES
 * OFIPAPEL.xlsx», pantalla «Subir limpieza»). Mientras ese parte no se suba
 * no hay cifras que enseñar, y decirlo aquí es más útil que un cero.
 */
function FichaLimpieza({ dia, apartments, reservations, onClose }: {
  dia: string
  apartments: Apartment[]
  reservations: Reservation[]
  onClose: () => void
}) {
  const nombre = (id: string) => apartments.find(a => a.id === id)?.name ?? id
  const activas = reservations.filter(r => r.status !== 'cancelada')
  const hoy = activas.filter(r => r.checkOut === dia)

  const masTarde = (d: string, n: number) => {
    const x = new Date(d + 'T12:00:00')
    x.setDate(x.getDate() + n)
    return x.toISOString().slice(0, 10)
  }
  const semana = activas
    .filter(r => r.checkOut > dia && r.checkOut <= masTarde(dia, 7))
    .sort((a, b) => a.checkOut.localeCompare(b.checkOut))

  return (
    <Modal title="Limpieza" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Salidas del {formatDate(dia)}
          </p>
          {hoy.length === 0 ? (
            <p className="text-slate-500">Ninguna. Hoy no hay que limpiar nada.</p>
          ) : (
            <ul className="space-y-1">
              {hoy.map(r => (
                <li key={r.id} className="flex justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                  <span className="font-medium text-amber-900">{nombre(r.apartmentId)}</span>
                  <span className="text-amber-800">{r.guestName || 'sale hoy'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Los siete días siguientes
          </p>
          {semana.length === 0 ? (
            <p className="text-slate-500">Sin salidas esta semana.</p>
          ) : (
            <ul className="space-y-1">
              {semana.map(r => (
                <li key={r.id} className="flex justify-between gap-3 text-slate-600 border-b border-slate-100 pb-1">
                  <span>{formatDate(r.checkOut)}</span>
                  <span className="font-medium text-slate-800">{nombre(r.apartmentId)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
          El coste de la limpieza no sale aquí porque el parte semanal todavía no se ha
          subido nunca. En cuanto se suelte en <b>Subir limpieza</b> el fichero
          <i> LIMPIEZA Y REPARACIONES OFIPAPEL.xlsx</i>, se puede enseñar lo que cuesta cada piso.
        </p>
      </div>
    </Modal>
  )
}

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Eye, Pencil } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import Modal from '../components/ui/Modal'
import type { Reservation } from '../types'
import { MONTH_NAMES_ES, DAY_NAMES_ES, getDaysInMonth, getSeason } from '../lib/dateUtils'

const APT_COLORS = [
  'bg-blue-400', 'bg-emerald-400', 'bg-violet-400', 'bg-amber-400',
  'bg-rose-400', 'bg-cyan-400', 'bg-lime-400', 'bg-orange-400', 'bg-pink-400',
]

export default function Planning() {
  const { reservations, payments, apartments: allApartments } = useData()
  const apartments = allApartments.filter(a => a.active)
  const navigate = useNavigate()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  /** La reserva que se está mirando con el ojo. */
  const [mirando, setMirando] = useState<Reservation | null>(null)

  const daysInMonth = getDaysInMonth(year, month)
  const season = getSeason(new Date(year, month - 1, 1))

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  function getResForDay(aptId: string, day: number): Reservation | null {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return reservations.find(r =>
      r.apartmentId === aptId &&
      r.status !== 'cancelada' &&
      r.checkIn <= date && r.checkOut > date
    ) || null
  }

  /**
   * La reserva cuya franja arranca ese día **en esta pantalla**.
   *
   * Incluye el día 1 para las que vienen del mes anterior: antes esas no
   * arrancaban en ninguna casilla, así que se pintaban como cuadraditos
   * sueltos y sin una sola letra — justo las estancias largas, que son las
   * que más importa reconocer de un vistazo.
   */
  function getResStart(aptId: string, day: number): Reservation | null {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return reservations.find(r =>
      r.apartmentId === aptId &&
      r.status !== 'cancelada' &&
      (r.checkIn === date || (day === 1 && r.checkIn < date && r.checkOut > date))
    ) || null
  }

  /** Lo cobrado de una reserva, para el detalle del ojo. */
  function cobradoDe(r: Reservation): number {
    return payments.filter(p => p.reservationId === r.id && p.received)
      .reduce((s, p) => s + p.amount, 0)
  }

  const colorMap: Record<string, string> = {}
  apartments.forEach((a, i) => { colorMap[a.id] = APT_COLORS[i % APT_COLORS.length] })

  /** El importe con sus céntimos, que es como se compara con el Excel. */
  const eur = (n: number) =>
    `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

  function fmtD(iso: string, withYear = false): string {
    const d = new Date(iso)
    const day = d.getDate()
    const mon = d.getMonth() + 1
    return withYear ? `${day}/${mon}/${String(d.getFullYear()).slice(2)}` : `${day}/${mon}`
  }

  const today = new Date()
  const isToday = (d: number) => year === today.getFullYear() && month === today.getMonth() + 1 && d === today.getDate()

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Planning de Reservas</h1>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full mt-1 inline-block ${season === 'VERANO' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
            Temporada de {season} {season === 'VERANO' ? '(May–Sep)' : '(Oct–Abr)'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-slate-200 text-slate-600"><ChevronLeft size={18} /></button>
          <span className="font-semibold text-slate-700 text-sm w-36 text-center capitalize">
            {MONTH_NAMES_ES[month - 1]} {year}
          </span>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-slate-200 text-slate-600"><ChevronRight size={18} /></button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-auto">
        <table className="w-full text-xs border-collapse min-w-[900px]">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-3 text-slate-500 font-medium w-28 sticky left-0 bg-white z-10">Apartamento</th>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                const dow = new Date(year, month - 1, d).getDay()
                const isWe = dow === 0 || dow === 6
                return (
                  <th key={d} className={`text-center py-2 font-medium w-8 ${isToday(d) ? 'bg-blue-50 text-blue-700' : isWe ? 'text-slate-400 bg-slate-50' : 'text-slate-500'}`}>
                    <div>{d}</div>
                    <div className="text-slate-400 font-normal">{DAY_NAMES_ES[(dow + 6) % 7]}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {apartments.map(apt => (
              <tr key={apt.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2 px-3 font-medium text-slate-700 sticky left-0 bg-white z-10 border-r border-slate-200">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${colorMap[apt.id]}`} />
                    {apt.name}
                  </div>
                </td>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                  const res = getResForDay(apt.id, d)
                  const startRes = getResStart(apt.id, d)
                  const isStart = !!startRes
                  const dow = new Date(year, month - 1, d).getDay()
                  const isWe = dow === 0 || dow === 6

                  // Calculate how many days the bar spans from the start day in this month view
                  let spanDays = 1
                  if (isStart && res) {
                    const co = new Date(res.checkOut)
                    const lastInView = (co.getFullYear() === year && co.getMonth() + 1 === month)
                      ? co.getDate() - 1  // checkOut is exclusive
                      : daysInMonth
                    spanDays = Math.max(1, lastInView - d + 1)
                  }
                  // Viene de antes del día 1: se marca con una flecha para no
                  // confundirla con una entrada de ese día.
                  const vieneDeAntes = isStart && !!res && res.checkIn < `${year}-${String(month).padStart(2, '0')}-01`

                  // Orden fijo, el que pidió el propietario: apartamento, fechas,
                  // noches e importe total. Antes iba el desglose precio+limpieza,
                  // que en una franja estrecha no se lee y no es lo que se mira.
                  const label = res
                    ? `${vieneDeAntes ? '◀ ' : ''}${apt.id} — ${fmtD(res.checkIn)} al ${fmtD(res.checkOut, true)}, `
                      + `${res.nights}-N, ${eur(res.total)}`
                    : ''
                  return (
                    <td
                      key={d}
                      title={label}
                      className={`h-9 p-0 relative ${isWe ? 'bg-slate-50' : ''} ${isToday(d) ? 'bg-blue-50' : ''}`}
                    >
                      {res && (
                        <div
                          className={`absolute inset-y-1 ${colorMap[apt.id]} opacity-80 rounded-sm flex items-center overflow-hidden ${isStart ? 'cursor-pointer hover:opacity-100' : ''}`}
                          style={isStart
                            ? { left: '2px', width: `calc(${spanDays} * 2rem - 2px)`, zIndex: 2 }
                            : { left: '0', right: '0' }}
                          onClick={isStart && res ? () => navigate(`/reservas?edit=${res.id}`) : undefined}
                        >
                          {isStart && res && (
                            <>
                              <span className="text-white font-semibold px-1 text-xs leading-none whitespace-nowrap overflow-hidden flex-1">
                                {label}
                              </span>
                              {/* El ojo: la franja estrecha no cabe entera y el
                                  aviso amarillo solo sale si aciertas a parar el
                                  ratón encima. Esto se pincha y se queda. */}
                              <button
                                onClick={e => { e.stopPropagation(); setMirando(res) }}
                                title="Ver los datos de esta reserva"
                                className="shrink-0 h-full px-1 flex items-center text-white/90 hover:text-white hover:bg-black/20">
                                <Eye size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mirando && (
        <DetalleReserva
          res={mirando}
          nombre={allApartments.find(a => a.id === mirando.apartmentId)?.name ?? mirando.apartmentId}
          cobrado={cobradoDe(mirando)}
          eur={eur}
          onEditar={() => navigate(`/reservas?edit=${mirando.id}`)}
          onClose={() => setMirando(null)}
        />
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3">
        {apartments.map(apt => (
          <div key={apt.id} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className={`w-3 h-3 rounded ${colorMap[apt.id]}`} />
            {apt.name}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Los datos de una reserva, al pinchar el ojo de su franja.
 *
 * Enseña lo que no cabe en la franja y lo que de verdad se pregunta uno
 * mirando el planning: qué días, cuántas noches, cuánto vale y si está
 * cobrada. Cuando han pagado de más, lo dice como saldo a favor en vez de
 * enseñar un «pendiente» en negativo, que no se entiende.
 */
function DetalleReserva({ res, nombre, cobrado, eur, onEditar, onClose }: {
  res: Reservation
  nombre: string
  cobrado: number
  eur: (n: number) => string
  onEditar: () => void
  onClose: () => void
}) {
  const saldo = Math.round((res.total - cobrado) * 100) / 100
  const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES',
    { day: 'numeric', month: 'long', year: 'numeric' })

  const filas: [string, string][] = [
    ['Apartamento', nombre],
    ['Entrada', fecha(res.checkIn)],
    ['Salida', fecha(res.checkOut)],
    ['Noches', `${res.nights}`],
    ['Canal', res.channel],
    ['Importe', eur(res.total)],
    ['Cobrado', eur(cobrado)],
  ]

  return (
    <Modal title={`Reserva · ${nombre}`} onClose={onClose}>
      <div className="space-y-4">
        <table className="w-full text-sm">
          <tbody>
            {filas.map(([k, v]) => (
              <tr key={k} className="border-b border-slate-100 last:border-0">
                <th scope="row" className="text-left py-2 font-normal text-slate-500 capitalize">{k}</th>
                <td className="py-2 text-right font-medium text-slate-800 tabular-nums">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {saldo > 0.005 && (
          <p className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm font-semibold text-amber-800">
            Falta por cobrar {eur(saldo)}
          </p>
        )}
        {saldo < -0.005 && (
          <p className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-sm font-semibold text-blue-800">
            Pagado de más {eur(-saldo)} · queda a favor del cliente
          </p>
        )}
        {Math.abs(saldo) <= 0.005 && res.total > 0 && (
          <p className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-sm font-semibold text-green-800">
            Cobrada del todo
          </p>
        )}

        {res.notes && <p className="text-xs text-slate-400 leading-relaxed">{res.notes}</p>}

        <div className="flex justify-end gap-3 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cerrar</button>
          <button onClick={onEditar}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
            <Pencil size={15} /> Abrir la reserva
          </button>
        </div>
      </div>
    </Modal>
  )
}

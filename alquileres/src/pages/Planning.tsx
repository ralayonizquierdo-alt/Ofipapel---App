import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { reservationStorage, apartmentStorage } from '../lib/storage'
import type { Reservation, Apartment } from '../types'
import { MONTH_NAMES_ES, DAY_NAMES_ES, getDaysInMonth, getSeason } from '../lib/dateUtils'

const APT_COLORS = [
  'bg-blue-400', 'bg-emerald-400', 'bg-violet-400', 'bg-amber-400',
  'bg-rose-400', 'bg-cyan-400', 'bg-lime-400', 'bg-orange-400', 'bg-pink-400',
]

export default function Planning() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [apartments, setApartments] = useState<Apartment[]>([])

  useEffect(() => {
    setReservations(reservationStorage.getAll())
    setApartments(apartmentStorage.getAll().filter(a => a.active))
  }, [])

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

  function getResStart(aptId: string, day: number): Reservation | null {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return reservations.find(r =>
      r.apartmentId === aptId &&
      r.status !== 'cancelada' &&
      r.checkIn === date
    ) || null
  }

  const colorMap: Record<string, string> = {}
  apartments.forEach((a, i) => { colorMap[a.id] = APT_COLORS[i % APT_COLORS.length] })

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

                  const label = res ? `${apt.id}, ${fmtD(res.checkIn)} al ${fmtD(res.checkOut, true)}, ${res.basePrice}+${res.cleaningFee} ${res.nights}-N` : ''
                  return (
                    <td
                      key={d}
                      title={label}
                      className={`h-9 p-0 relative ${isWe ? 'bg-slate-50' : ''} ${isToday(d) ? 'bg-blue-50' : ''}`}
                    >
                      {res && (
                        <div
                          className={`absolute inset-y-1 ${colorMap[apt.id]} opacity-80 rounded-sm flex items-center overflow-hidden`}
                          style={isStart
                            ? { left: '2px', width: `calc(${spanDays} * 2rem - 2px)`, zIndex: 2 }
                            : { left: '0', right: '0' }}
                        >
                          {isStart && (
                            <span className="text-white font-semibold px-1 text-xs leading-none whitespace-nowrap">
                              {label}
                            </span>
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

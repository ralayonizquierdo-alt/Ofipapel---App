import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { reservationStorage, paymentStorage, repairStorage, apartmentStorage } from '../lib/storage'
import type { Reservation, Payment, Repair, Apartment } from '../types'
import { MONTH_NAMES_ES } from '../lib/dateUtils'
import { calcIGIC } from '../lib/priceCalc'
import PageHeader from '../components/ui/PageHeader'

export default function Analytics() {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [repairs, setRepairs] = useState<Repair[]>([])
  const [apartments, setApartments] = useState<Apartment[]>([])
  const [year, setYear] = useState(new Date().getFullYear())

  useEffect(() => {
    setReservations(reservationStorage.getAll())
    setPayments(paymentStorage.getAll())
    setRepairs(repairStorage.getAll())
    setApartments(apartmentStorage.getAll().filter(a => a.active))
  }, [])

  // ── Occupancy per apartment ───────────────────────────────────────────────
  function getRentedDays(aptId: string): number {
    let days = 0
    reservations
      .filter(r => r.apartmentId === aptId && r.status !== 'cancelada')
      .forEach(r => {
        const ci = new Date(r.checkIn)
        const co = new Date(r.checkOut)
        if (ci.getFullYear() !== year && co.getFullYear() !== year) return
        // Count days in the year
        const start = new Date(Math.max(ci.getTime(), new Date(year, 0, 1).getTime()))
        const end = new Date(Math.min(co.getTime(), new Date(year, 11, 31, 23, 59).getTime()))
        if (end > start) {
          days += Math.round((end.getTime() - start.getTime()) / 86400000)
        }
      })
    return days
  }

  const daysInYear = 365
  const aptStats = apartments.map(apt => {
    const rented = getRentedDays(apt.id)
    const income = payments
      .filter(p => p.received && p.paymentDate?.startsWith(String(year)))
      .filter(p => reservations.find(r => r.id === p.reservationId && r.apartmentId === apt.id))
      .reduce((s, p) => s + p.amount, 0)
    const costs = repairs
      .filter(r => r.apartmentId === apt.id && r.repairDate?.startsWith(String(year)))
      .reduce((s, r) => s + (r.amount || 0), 0)
    return {
      apt,
      rented,
      free: daysInYear - rented,
      occupancyPct: Math.round((rented / daysInYear) * 100),
      income,
      costs,
      net: income - costs,
      igic: calcIGIC(income),
    }
  })

  // ── Monthly income chart ──────────────────────────────────────────────────
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const monthStr = `${year}-${String(month).padStart(2, '0')}`
    const income = payments
      .filter(p => p.received && p.paymentDate?.startsWith(monthStr))
      .reduce((s, p) => s + p.amount, 0)
    const costs = repairs
      .filter(r => r.repairDate?.startsWith(monthStr))
      .reduce((s, r) => s + (r.amount || 0), 0)
    return {
      month: MONTH_NAMES_ES[i].slice(0, 3),
      ingresos: Math.round(income),
      gastos: Math.round(costs),
      neto: Math.round(income - costs),
    }
  })

  const totalIncome = aptStats.reduce((s, a) => s + a.income, 0)
  const totalCosts = aptStats.reduce((s, a) => s + a.costs, 0)
  const totalNet = totalIncome - totalCosts

  const years = [...new Set([
    ...payments.map(p => p.paymentDate?.slice(0, 4)),
    ...repairs.map(r => r.repairDate?.slice(0, 4)),
  ].filter(Boolean))].sort((a, b) => b!.localeCompare(a!))

  return (
    <div className="p-6">
      <PageHeader
        title="Analítica y Rentabilidad"
        actions={
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
            {(years.length ? years : [String(year)]).map(y => <option key={y} value={y!}>{y}</option>)}
          </select>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500">Ingresos brutos {year}</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{totalIncome.toLocaleString('es-ES')} €</p>
          <p className="text-xs text-slate-400 mt-0.5">IGIC: {calcIGIC(totalIncome).toLocaleString('es-ES')} €</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500">Gastos reparaciones {year}</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{totalCosts.toLocaleString('es-ES')} €</p>
          <p className="text-xs text-slate-400 mt-0.5">{aptStats.filter(a => a.costs > 0).length} apartamentos con gastos</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500">Rentabilidad neta {year}</p>
          <p className={`text-2xl font-bold mt-1 ${totalNet >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{totalNet.toLocaleString('es-ES')} €</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Margen: {totalIncome > 0 ? Math.round((totalNet / totalIncome) * 100) : 0}%
          </p>
        </div>
      </div>

      {/* Monthly chart */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
        <h2 className="font-semibold text-slate-700 text-sm mb-4">Ingresos vs Gastos por mes ({year})</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={monthlyData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
            <Tooltip formatter={(v) => `${Number(v).toLocaleString('es-ES')} €`} />
            <Legend />
            <Bar dataKey="ingresos" name="Ingresos" fill="#22c55e" radius={[3, 3, 0, 0]} />
            <Bar dataKey="gastos" name="Gastos" fill="#ef4444" radius={[3, 3, 0, 0]} />
            <Bar dataKey="neto" name="Neto" fill="#3b82f6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Per apartment */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
          <h2 className="font-semibold text-slate-700 text-sm">Detalle por apartamento — {year}</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-3 px-4 font-medium text-slate-600">Apartamento</th>
              <th className="text-right py-3 px-4 font-medium text-slate-600">Días alquilado</th>
              <th className="text-right py-3 px-4 font-medium text-slate-600">Días libres</th>
              <th className="text-right py-3 px-4 font-medium text-slate-600">Ocupación</th>
              <th className="text-right py-3 px-4 font-medium text-green-700">Ingresos</th>
              <th className="text-right py-3 px-4 font-medium text-red-700">Gastos</th>
              <th className="text-right py-3 px-4 font-medium text-blue-700">Neto</th>
              <th className="text-right py-3 px-4 font-medium text-slate-500">IGIC 7%</th>
            </tr>
          </thead>
          <tbody>
            {aptStats.map(({ apt, rented, free, occupancyPct, income, costs, net, igic }) => (
              <tr key={apt.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-3 px-4 font-medium text-slate-700">{apt.name}</td>
                <td className="py-3 px-4 text-right text-slate-600">{rented}d</td>
                <td className="py-3 px-4 text-right text-amber-600">{free}d</td>
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 bg-slate-200 rounded-full h-1.5">
                      <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${occupancyPct}%` }} />
                    </div>
                    <span className={`text-xs font-medium ${occupancyPct >= 70 ? 'text-green-700' : occupancyPct >= 40 ? 'text-amber-700' : 'text-red-700'}`}>
                      {occupancyPct}%
                    </span>
                  </div>
                </td>
                <td className="py-3 px-4 text-right font-semibold text-green-700">{income.toLocaleString('es-ES')} €</td>
                <td className="py-3 px-4 text-right text-red-700">{costs > 0 ? `${costs.toLocaleString('es-ES')} €` : '—'}</td>
                <td className="py-3 px-4 text-right font-bold text-blue-700">{net.toLocaleString('es-ES')} €</td>
                <td className="py-3 px-4 text-right text-slate-500 text-xs">{igic.toLocaleString('es-ES')} €</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-200 bg-slate-50">
            <tr>
              <td className="py-3 px-4 font-bold text-slate-700">TOTAL</td>
              <td className="py-3 px-4 text-right font-semibold text-slate-700">{aptStats.reduce((s, a) => s + a.rented, 0)}d</td>
              <td className="py-3 px-4 text-right text-amber-700 font-semibold">{aptStats.reduce((s, a) => s + a.free, 0)}d</td>
              <td className="py-3 px-4 text-right">
                <span className="text-sm font-semibold text-blue-700">
                  {Math.round(aptStats.reduce((s, a) => s + a.occupancyPct, 0) / Math.max(aptStats.length, 1))}%
                </span>
              </td>
              <td className="py-3 px-4 text-right font-bold text-green-700">{totalIncome.toLocaleString('es-ES')} €</td>
              <td className="py-3 px-4 text-right font-bold text-red-700">{totalCosts.toLocaleString('es-ES')} €</td>
              <td className="py-3 px-4 text-right font-bold text-blue-700">{totalNet.toLocaleString('es-ES')} €</td>
              <td className="py-3 px-4 text-right font-semibold text-slate-600">{calcIGIC(totalIncome).toLocaleString('es-ES')} €</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

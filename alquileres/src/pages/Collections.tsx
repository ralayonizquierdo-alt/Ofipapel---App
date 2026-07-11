import { useState } from 'react'
import { useData } from '../contexts/DataContext'
import { calcIGIC } from '../lib/priceCalc'
import PageHeader from '../components/ui/PageHeader'
import { MONTH_NAMES_ES } from '../lib/dateUtils'

const QUARTERS = [
  { q: 1, months: [1, 2, 3], label: '1T (Ene–Mar)' },
  { q: 2, months: [4, 5, 6], label: '2T (Abr–Jun)' },
  { q: 3, months: [7, 8, 9], label: '3T (Jul–Sep)' },
  { q: 4, months: [10, 11, 12], label: '4T (Oct–Dic)' },
]

export default function Collections() {
  const { reservations, payments, apartments: allApartments } = useData()
  const apartments = allApartments.filter(a => a.active)
  const [year, setYear] = useState(new Date().getFullYear())

  const years = [...new Set(payments.map(p => p.paymentDate?.slice(0, 4)).filter(Boolean))].sort((a, b) => b!.localeCompare(a!))

  function getMonthAmount(aptId: string, month: number): number {
    const monthStr = `${year}-${String(month).padStart(2, '0')}`
    const aptReservationIds = reservations
      .filter(r => r.apartmentId === aptId && r.status !== 'cancelada')
      .map(r => r.id)
    return payments
      .filter(p => p.received && p.paymentDate?.startsWith(monthStr) && aptReservationIds.includes(p.reservationId))
      .reduce((s, p) => s + p.amount, 0)
  }

  function getQuarterTotal(aptId: string, months: number[]): number {
    return months.reduce((s, m) => s + getMonthAmount(aptId, m), 0)
  }

  const yearTotal = apartments.reduce((s, a) =>
    s + QUARTERS.reduce((q, qt) => q + getQuarterTotal(a.id, qt.months), 0), 0)

  function getAnnualBreakdown(aptId: string): { transferencia: number; efectivo: number; total: number } {
    const aptReservationIds = reservations
      .filter(r => r.apartmentId === aptId && r.status !== 'cancelada')
      .map(r => r.id)
    const yearStr = String(year)
    const aptPayments = payments.filter(p =>
      p.received && p.paymentDate?.startsWith(yearStr) && aptReservationIds.includes(p.reservationId)
    )
    let efectivo = 0
    let transferencia = 0
    for (const p of aptPayments) {
      if (p.paymentMethod) {
        if (p.paymentMethod === 'efectivo') efectivo += p.amount
        else if (p.paymentMethod === 'transferencia') transferencia += p.amount
        else transferencia += p.amount
      } else {
        const res = reservations.find(r => r.id === p.reservationId)
        if (res?.channel === 'directo') efectivo += p.amount
        else transferencia += p.amount
      }
    }
    return { transferencia, efectivo, total: efectivo + transferencia }
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Total Cobrado por Trimestres"
        subtitle="IGIC incluido al 7%"
        actions={
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
            {(years.length ? years : [String(year)]).map(y => <option key={y} value={y!}>{y}</option>)}
          </select>
        }
      />

      <div className="space-y-6">
        {QUARTERS.map(({ q, months, label }) => {
          const qTotal = apartments.reduce((s, a) => s + getQuarterTotal(a.id, months), 0)
          const qIGIC = calcIGIC(qTotal)
          const qWithIGIC = qTotal + qIGIC
          return (
            <div key={q} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-slate-700">
                <h3 className="font-semibold text-white">{label}</h3>
                <div className="text-right">
                  <span className="text-white font-bold">{qTotal.toLocaleString('es-ES')} €</span>
                  <span className="text-slate-300 text-xs ml-3">IGIC: {qIGIC.toLocaleString('es-ES')} €</span>
                </div>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left py-2.5 px-4 font-medium text-slate-600 w-40">Apartamento</th>
                      {months.map(m => (
                        <th key={m} className="text-right py-2.5 px-4 font-medium text-slate-600">
                          {MONTH_NAMES_ES[m - 1]}
                        </th>
                      ))}
                      <th className="text-right py-2.5 px-4 font-semibold text-slate-700 bg-slate-100">TRIMESTRE</th>
                      <th className="text-right py-2.5 px-4 font-medium text-slate-500">IGIC 7%</th>
                      <th className="text-right py-2.5 px-4 font-medium text-slate-700 bg-amber-50">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apartments.map(apt => {
                      const monthAmounts = months.map(m => getMonthAmount(apt.id, m))
                      const total = monthAmounts.reduce((s, a) => s + a, 0)
                      if (total === 0) return null
                      const igic = calcIGIC(total)
                      return (
                        <tr key={apt.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-2.5 px-4 font-medium text-slate-700 text-xs">{apt.name}</td>
                          {monthAmounts.map((amount, i) => (
                            <td key={i} className="py-2.5 px-4 text-right text-slate-600">
                              {amount > 0 ? `${amount.toLocaleString('es-ES')} €` : <span className="text-slate-300">—</span>}
                            </td>
                          ))}
                          <td className="py-2.5 px-4 text-right font-bold text-slate-800 bg-slate-50">
                            {total.toLocaleString('es-ES')} €
                          </td>
                          <td className="py-2.5 px-4 text-right text-slate-500 text-xs">
                            {igic.toLocaleString('es-ES')} €
                          </td>
                          <td className="py-2.5 px-4 text-right font-semibold text-amber-700 bg-amber-50 text-xs">
                            {(total + igic).toLocaleString('es-ES')} €
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-300 bg-slate-50">
                    <tr>
                      <td className="py-3 px-4 font-semibold text-slate-700">TOTAL {label.split(' ')[0]}</td>
                      {months.map(m => {
                        const mTotal = apartments.reduce((s, a) => s + getMonthAmount(a.id, m), 0)
                        return (
                          <td key={m} className="py-3 px-4 text-right font-semibold text-slate-700">
                            {mTotal > 0 ? `${mTotal.toLocaleString('es-ES')} €` : '—'}
                          </td>
                        )
                      })}
                      <td className="py-3 px-4 text-right font-bold text-slate-900 bg-slate-100">
                        {qTotal.toLocaleString('es-ES')} €
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-600">
                        {qIGIC.toLocaleString('es-ES')} €
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-amber-700 bg-amber-50">
                        {qWithIGIC.toLocaleString('es-ES')} €
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )
        })}

        {/* Annual summary by apartment */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 bg-slate-600">
            <h3 className="font-semibold text-white">Cobros Anuales {year} — Transferencia vs Efectivo</h3>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-2.5 px-4 font-medium text-slate-600">Apartamento</th>
                  <th className="text-right py-2.5 px-4 font-medium text-blue-700">Transferencia</th>
                  <th className="text-right py-2.5 px-4 font-medium text-green-700">Efectivo</th>
                  <th className="text-right py-2.5 px-4 font-semibold text-slate-700">Total</th>
                  <th className="text-right py-2.5 px-4 font-medium text-slate-500">IGIC 7%</th>
                  <th className="text-right py-2.5 px-4 font-medium text-amber-700 bg-amber-50">Total con IGIC</th>
                </tr>
              </thead>
              <tbody>
                {apartments.map(apt => {
                  const { transferencia, efectivo, total } = getAnnualBreakdown(apt.id)
                  if (total === 0) return null
                  const igic = calcIGIC(total)
                  return (
                    <tr key={apt.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-medium text-slate-700 text-xs">{apt.name}</td>
                      <td className="py-2.5 px-4 text-right text-blue-700">{transferencia > 0 ? `${transferencia.toLocaleString('es-ES')} €` : '—'}</td>
                      <td className="py-2.5 px-4 text-right text-green-700">{efectivo > 0 ? `${efectivo.toLocaleString('es-ES')} €` : '—'}</td>
                      <td className="py-2.5 px-4 text-right font-bold text-slate-800">{total.toLocaleString('es-ES')} €</td>
                      <td className="py-2.5 px-4 text-right text-slate-500 text-xs">{igic.toLocaleString('es-ES')} €</td>
                      <td className="py-2.5 px-4 text-right font-semibold text-amber-700 bg-amber-50">{(total + igic).toLocaleString('es-ES')} €</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="border-t-2 border-slate-300 bg-slate-50">
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-700">TOTAL ANUAL</td>
                  <td className="py-3 px-4 text-right font-bold text-blue-700">
                    {apartments.reduce((s, a) => s + getAnnualBreakdown(a.id).transferencia, 0).toLocaleString('es-ES')} €
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-green-700">
                    {apartments.reduce((s, a) => s + getAnnualBreakdown(a.id).efectivo, 0).toLocaleString('es-ES')} €
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900">{yearTotal.toLocaleString('es-ES')} €</td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-600">{calcIGIC(yearTotal).toLocaleString('es-ES')} €</td>
                  <td className="py-3 px-4 text-right font-bold text-amber-700 bg-amber-50">{(yearTotal + calcIGIC(yearTotal)).toLocaleString('es-ES')} €</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Annual total */}
        <div className="bg-slate-900 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-slate-300 text-sm">Total anual {year}</p>
            <p className="text-white text-3xl font-bold mt-1">{yearTotal.toLocaleString('es-ES')} €</p>
          </div>
          <div className="text-right">
            <p className="text-slate-400 text-xs">IGIC 7% a declarar</p>
            <p className="text-amber-400 text-xl font-bold mt-1">{calcIGIC(yearTotal).toLocaleString('es-ES')} €</p>
          </div>
        </div>
      </div>
    </div>
  )
}

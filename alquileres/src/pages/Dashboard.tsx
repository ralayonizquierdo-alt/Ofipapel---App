import { AlertTriangle, CalendarCheck, Euro, TrendingUp, Clock } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import type { Reservation } from '../types'
import { formatDate, formatDateShort, today } from '../lib/dateUtils'
import { calcIGIC } from '../lib/priceCalc'

export default function Dashboard() {
  const { reservations, payments, apartments, repairs } = useData()

  const todayStr = today()
  const now = new Date()

  const active = reservations.filter(r => r.status !== 'cancelada' && r.checkIn <= todayStr && r.checkOut > todayStr)
  const upcoming = reservations
    .filter(r => r.status !== 'cancelada' && r.checkIn > todayStr)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
    .slice(0, 5)

  const pendingPayment = reservations.filter(r => {
    if (r.status === 'cancelada') return false
    const paid = payments.filter(p => p.reservationId === r.id && p.received).reduce((s, p) => s + p.amount, 0)
    return paid < r.total && new Date(r.checkOut) >= now
  })

  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const monthStart = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`
  const monthEnd = `${currentYear}-${String(currentMonth).padStart(2, '0')}-31`

  const monthIncome = payments
    .filter(p => p.received && p.paymentDate && p.paymentDate >= monthStart && p.paymentDate <= monthEnd)
    .reduce((s, p) => s + p.amount, 0)

  const yearIncome = payments
    .filter(p => p.received && p.paymentDate && p.paymentDate.startsWith(String(currentYear)))
    .reduce((s, p) => s + p.amount, 0)

  const totalRepairs = repairs
    .filter(r => r.repairDate?.startsWith(String(currentYear)))
    .reduce((s, r) => s + (r.amount || 0), 0)

  const netYear = yearIncome - totalRepairs
  const isPriceRenewalMonth = currentMonth === 1

  function getApartmentName(id: string) {
    return apartments.find(a => a.id === id)?.name || id
  }

  function getPaidAmount(r: Reservation) {
    return payments.filter(p => p.reservationId === r.id && p.received).reduce((s, p) => s + p.amount, 0)
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-sm text-slate-500">{new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard icon={<CalendarCheck size={20} className="text-blue-600" />} label="Activas hoy" value={String(active.length)} sub={`de ${apartments.filter(a => a.active).length} aptos.`} color="blue" />
        <KpiCard icon={<Euro size={20} className="text-green-600" />} label="Cobrado este mes" value={`${monthIncome.toLocaleString('es-ES')} €`} sub={`IGIC: ${calcIGIC(monthIncome).toLocaleString('es-ES')} €`} color="green" />
        <KpiCard icon={<TrendingUp size={20} className="text-purple-600" />} label={`Neto ${currentYear}`} value={`${netYear.toLocaleString('es-ES')} €`} sub={`Ingresos: ${yearIncome.toLocaleString('es-ES')} €`} color="purple" />
        <KpiCard icon={<AlertTriangle size={20} className="text-amber-600" />} label="Pagos pendientes" value={String(pendingPayment.length)} sub="reservas sin cobrar" color="amber" />
      </div>

      {/* Alerts */}
      {(pendingPayment.length > 0 || isPriceRenewalMonth) && (
        <div className="mb-6 space-y-2">
          {isPriceRenewalMonth && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle size={18} className="text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-blue-800 text-sm">Renovación de precios</p>
                <p className="text-blue-700 text-xs mt-0.5">Enero es el mes para actualizar la lista de precios del próximo año. Recuerda revisar la sección <strong>Precios</strong>.</p>
              </div>
            </div>
          )}
          {pendingPayment.slice(0, 3).map(r => {
            const paid = getPaidAmount(r)
            const pending = r.total - paid
            return (
              <div key={r.id} className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3">
                <Clock size={16} className="text-amber-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-800">{getApartmentName(r.apartmentId)} — {formatDateShort(r.checkIn)} al {formatDateShort(r.checkOut)}</p>
                  <p className="text-xs text-amber-700">Pendiente: <strong>{pending.toFixed(2)} €</strong> (cobrado {paid.toFixed(2)} de {r.total.toFixed(2)} €)</p>
                </div>
              </div>
            )
          })}
          {pendingPayment.length > 3 && (
            <p className="text-xs text-slate-500 pl-1">+{pendingPayment.length - 3} pagos más pendientes</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activas hoy */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 text-sm mb-3 flex items-center gap-2">
            <CalendarCheck size={15} /> Ocupación actual
          </h2>
          {active.length === 0 ? (
            <p className="text-slate-400 text-sm">Ningún apartamento ocupado hoy</p>
          ) : (
            <div className="space-y-2">
              {active.map(r => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{getApartmentName(r.apartmentId)}</p>
                    <p className="text-xs text-slate-500">Sale {formatDate(r.checkOut)} · {r.nights} noches</p>
                  </div>
                  <span className="text-sm font-semibold text-green-700">{r.total.toLocaleString('es-ES')} €</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Próximas entradas */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 text-sm mb-3 flex items-center gap-2">
            <Clock size={15} /> Próximas entradas
          </h2>
          {upcoming.length === 0 ? (
            <p className="text-slate-400 text-sm">No hay reservas próximas</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map(r => {
                const daysUntil = Math.ceil((new Date(r.checkIn).getTime() - now.getTime()) / 86400000)
                return (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{getApartmentName(r.apartmentId)}</p>
                      <p className="text-xs text-slate-500">{formatDate(r.checkIn)} → {formatDate(r.checkOut)} · {r.nights}N</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${daysUntil <= 7 ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                      en {daysUntil}d
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: string }) {
  const bg = { blue: 'bg-blue-50', green: 'bg-green-50', purple: 'bg-purple-50', amber: 'bg-amber-50' }[color]
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center mb-3`}>{icon}</div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-xs font-medium text-slate-600 mt-0.5">{label}</p>
      <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
    </div>
  )
}

import { Package, Warehouse, ShoppingCart, TrendingUp } from 'lucide-react'

const KPIS = [
  { label: 'Referencias activas', value: '20.130', icon: Package, tone: 'text-blue-600 bg-blue-50' },
  { label: 'Ventas del mes', value: '186.420 €', icon: TrendingUp, tone: 'text-emerald-600 bg-emerald-50' },
  { label: 'Pedidos abiertos', value: '37', icon: ShoppingCart, tone: 'text-orange-600 bg-orange-50' },
  { label: 'Alertas de stock', value: '12', icon: Warehouse, tone: 'text-rose-600 bg-rose-50' },
]

const ACTIVITY = [
  ['Pedido P-2026-0343 creado', 'Ana Pérez', 'hace 6 min'],
  ['Factura F-2026-0512 emitida', 'Librería Montaña S.L.', 'hace 22 min'],
  ['Recepción de mercancía C-2026-0087', 'Global Office Supplies', 'hace 1 h'],
  ['Sincronización web completada', '19.842 productos publicados', 'hace 2 min'],
]

export default function Dashboard() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Panel principal</h1>
      <p className="text-sm text-slate-500 mb-6">Visión general del negocio — datos de ejemplo</p>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {KPIS.map((kpi) => {
          const Icon = kpi.icon
          return (
            <div key={kpi.label} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${kpi.tone}`}>
                <Icon size={16} />
              </div>
              <div className="text-lg font-semibold text-slate-900">{kpi.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{kpi.label}</div>
            </div>
          )
        })}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium text-slate-700">
          Actividad reciente
        </div>
        <div>
          {ACTIVITY.map(([title, sub, time]) => (
            <div key={title} className="flex items-center justify-between px-4 py-3 border-b border-slate-100 last:border-0">
              <div>
                <div className="text-sm text-slate-800">{title}</div>
                <div className="text-xs text-slate-400">{sub}</div>
              </div>
              <div className="text-xs text-slate-400">{time}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

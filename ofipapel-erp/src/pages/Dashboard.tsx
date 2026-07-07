import { useMemo } from 'react'
import { Package, Warehouse, ShoppingCart, TrendingUp, Receipt, Truck } from 'lucide-react'
import { useDatabase } from '../lib/DatabaseContext'
import StatCard from '../components/StatCard'
import Badge from '../components/Badge'
import { formatEUR, formatDate } from '../lib/format'

function daysSince(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / 86400000)
}

export default function Dashboard() {
  const { db } = useDatabase()

  const stats = useMemo(() => {
    const referenciasActivas = db.products.filter((p) => p.activo).length
    const ventasUltimos30 = db.sales.filter((s) => daysSince(s.fecha) <= 30).reduce((sum, s) => sum + s.total, 0)
    const facturacionPendiente = db.clients.reduce((sum, c) => sum + c.saldoPendiente, 0)
    const pedidosAbiertos = db.sales.filter((s) => s.estado !== 'Facturado').length
    const alertasStock = db.stock.filter((s) => s.unidades < s.minimo).length
    const furgones = db.vehicles.filter((v) => v.tipo === 'Furgón de reparto')
    const furgonesEnRuta = furgones.filter((v) => v.estado === 'En ruta').length

    const locationById = new Map(db.locations.map((l) => [l.id, l]))
    const alertasPorAlmacen = new Map<string, number>()
    db.stock
      .filter((s) => s.unidades < s.minimo)
      .forEach((s) => {
        const loc = locationById.get(s.locationId)
        if (!loc) return
        alertasPorAlmacen.set(loc.nombre, (alertasPorAlmacen.get(loc.nombre) ?? 0) + 1)
      })

    const clienteById = new Map(db.clients.map((c) => [c.id, c]))
    const recientes = [...db.sales]
      .filter((s) => daysSince(s.fecha) <= 10)
      .slice(0, 8)
      .map((s) => ({ sale: s, cliente: clienteById.get(s.clienteId) }))

    return { referenciasActivas, ventasUltimos30, facturacionPendiente, pedidosAbiertos, alertasStock, furgonesEnRuta, furgonesTotal: furgones.length, alertasPorAlmacen, recientes }
  }, [db])

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Panel principal</h1>
      <p className="text-sm text-slate-500 mb-6">Visión general del negocio — datos de ejemplo generados localmente</p>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        <StatCard icon={Package} label="Referencias activas" value={stats.referenciasActivas.toLocaleString('es-ES')} />
        <StatCard icon={TrendingUp} label="Ventas (30 días)" value={formatEUR(stats.ventasUltimos30)} tone="good" />
        <StatCard icon={Receipt} label="Facturación pendiente" value={formatEUR(stats.facturacionPendiente)} tone="warn" />
        <StatCard icon={ShoppingCart} label="Pedidos abiertos" value={String(stats.pedidosAbiertos)} />
        <StatCard icon={Warehouse} label="Alertas de stock" value={String(stats.alertasStock)} tone="warn" />
        <StatCard icon={Truck} label="Furgones en ruta" value={`${stats.furgonesEnRuta} / ${stats.furgonesTotal}`} tone="good" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium text-slate-700">Actividad reciente</div>
          <div>
            {stats.recientes.length === 0 && <div className="px-4 py-6 text-sm text-slate-400">Sin movimientos en los últimos días.</div>}
            {stats.recientes.map(({ sale, cliente }) => (
              <div key={sale.id} className="flex items-center justify-between px-4 py-3 border-b border-slate-100 last:border-0">
                <div>
                  <div className="text-sm text-slate-800">
                    {sale.id} · {cliente?.nombre ?? 'Cliente eliminado'}
                  </div>
                  <div className="text-xs text-slate-400">
                    {sale.canal} · {formatEUR(sale.total)}
                  </div>
                </div>
                <Badge label={sale.estado} />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium text-slate-700">Alertas de stock por ubicación</div>
          <div>
            {[...stats.alertasPorAlmacen.entries()].length === 0 && (
              <div className="px-4 py-6 text-sm text-slate-400">Sin alertas activas.</div>
            )}
            {[...stats.alertasPorAlmacen.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([nombre, count]) => (
                <div key={nombre} className="flex items-center justify-between px-4 py-3 border-b border-slate-100 last:border-0">
                  <span className="text-sm text-slate-700">{nombre}</span>
                  <span className="text-xs font-medium text-red-600">{count} ref.</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium text-slate-700">Equipo comercial y reparto</div>
          <div>
            {db.salesReps.map((rep) => {
              const van = db.vehicles.find((v) => v.id === rep.furgonId)
              return (
                <div key={rep.id} className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 last:border-0">
                  <div>
                    <div className="text-sm text-slate-800">{rep.nombre}</div>
                    <div className="text-xs text-slate-400">
                      {rep.zona} · {van?.matricula}
                    </div>
                  </div>
                  {van && <Badge label={van.estado} />}
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium text-slate-700">Clientes con mayor saldo pendiente</div>
          <div>
            {[...db.clients]
              .sort((a, b) => b.saldoPendiente - a.saldoPendiente)
              .slice(0, 6)
              .map((c) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 last:border-0">
                  <div>
                    <div className="text-sm text-slate-800">{c.nombre}</div>
                    <div className="text-xs text-slate-400">Últ. pedido {formatDate(c.ultimoPedido)}</div>
                  </div>
                  <span className="text-sm font-medium text-slate-700">{formatEUR(c.saldoPendiente)}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}

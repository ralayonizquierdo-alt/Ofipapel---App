import { useMemo } from 'react'
import { Globe, RefreshCw } from 'lucide-react'
import { useDatabase } from '../lib/DatabaseContext'
import DataTable, { type Column } from '../components/DataTable'
import Badge from '../components/Badge'
import StatCard from '../components/StatCard'
import { formatEUR, formatDate } from '../lib/format'
import type { SaleOrder } from '../types'

export default function TiendaWebPage() {
  const { db } = useDatabase()

  const clienteById = useMemo(() => new Map(db.clients.map((c) => [c.id, c])), [db.clients])
  const pedidosWeb = useMemo(() => db.sales.filter((s) => s.canal === 'Web'), [db.sales])
  const productosActivos = db.products.filter((p) => p.activo).length
  const productosPublicados = db.products.filter((p) => p.activo && p.publicadoWeb).length

  const columns: Column<SaleOrder>[] = [
    { key: 'id', label: 'Pedido web', sortValue: (s) => s.id },
    { key: 'cliente', label: 'Cliente', render: (s) => clienteById.get(s.clienteId)?.nombre ?? 'Cliente eliminado', sortValue: (s) => clienteById.get(s.clienteId)?.nombre ?? '' },
    { key: 'estado', label: 'Estado', render: (s) => <Badge label={s.estado} />, sortValue: (s) => s.estado },
    { key: 'total', label: 'Total', align: 'right', render: (s) => formatEUR(s.total), sortValue: (s) => s.total },
    { key: 'fecha', label: 'Fecha', render: (s) => formatDate(s.fecha), sortValue: (s) => s.fecha },
  ]

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
            <Globe size={20} className="text-slate-700" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Tienda web</h1>
        </div>
        <Badge label="Activo (Fase 1)" />
      </div>
      <p className="text-sm text-slate-500 mb-6 ml-[52px]">Sincronización de catálogo, stock y pedidos con la tienda online</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Globe} label="Productos publicados" value={`${productosPublicados.toLocaleString('es-ES')} / ${productosActivos.toLocaleString('es-ES')}`} tone="good" />
        <StatCard icon={RefreshCw} label="Última sincronización" value="hace 2 min" />
        <StatCard icon={Globe} label="Pedidos web totales" value={String(pedidosWeb.length)} />
        <StatCard
          icon={Globe}
          label="Facturación por web"
          value={formatEUR(pedidosWeb.reduce((sum, s) => sum + s.total, 0))}
          tone="good"
        />
      </div>

      <DataTable
        columns={columns}
        rows={pedidosWeb}
        rowKey={(s) => s.id}
        searchableText={(s) => `${s.id} ${clienteById.get(s.clienteId)?.nombre ?? ''}`}
        pageSize={14}
      />
    </div>
  )
}

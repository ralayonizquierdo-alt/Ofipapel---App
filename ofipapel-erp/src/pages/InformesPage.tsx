import { useMemo } from 'react'
import { BarChart3 } from 'lucide-react'
import { useDatabase } from '../lib/DatabaseContext'
import Badge from '../components/Badge'
import { formatEUR } from '../lib/format'

function daysSince(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / 86400000)
}

function BarRow({ label, value, max, formatted }: { label: string; value: number; max: number; formatted: string }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0
  return (
    <div className="py-2">
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-slate-700 truncate pr-2">{label}</span>
        <span className="text-slate-500 shrink-0">{formatted}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-slate-700 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function InformesPage() {
  const { db } = useDatabase()

  const productById = useMemo(() => new Map(db.products.map((p) => [p.id, p])), [db.products])
  const clienteById = useMemo(() => new Map(db.clients.map((c) => [c.id, c])), [db.clients])
  const repById = useMemo(() => new Map(db.salesReps.map((r) => [r.id, r])), [db.salesReps])

  const rankingProductos = useMemo(() => {
    const map = new Map<string, { unidades: number; importe: number; margen: number }>()
    db.sales.forEach((s) => {
      s.lineas.forEach((l) => {
        const acc = map.get(l.productoId) ?? { unidades: 0, importe: 0, margen: 0 }
        const producto = productById.get(l.productoId)
        acc.unidades += l.cantidad
        acc.importe += l.cantidad * l.precioUnit
        if (producto) acc.margen += l.cantidad * (l.precioUnit - producto.coste)
        map.set(l.productoId, acc)
      })
    })
    return [...map.entries()]
      .map(([productoId, v]) => ({ nombre: productById.get(productoId)?.nombre ?? 'Producto eliminado', ...v }))
      .sort((a, b) => b.importe - a.importe)
      .slice(0, 8)
  }, [db.sales, productById])

  const rankingClientes = useMemo(() => {
    const map = new Map<string, number>()
    db.sales.forEach((s) => map.set(s.clienteId, (map.get(s.clienteId) ?? 0) + s.total))
    return [...map.entries()]
      .map(([clienteId, total]) => ({ nombre: clienteById.get(clienteId)?.nombre ?? 'Cliente eliminado', total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
  }, [db.sales, clienteById])

  const rankingComerciales = useMemo(() => {
    const map = new Map<string, { total: number; pedidos: number }>()
    db.sales.forEach((s) => {
      const acc = map.get(s.comercialId) ?? { total: 0, pedidos: 0 }
      acc.total += s.total
      acc.pedidos += 1
      map.set(s.comercialId, acc)
    })
    return [...map.entries()]
      .map(([comercialId, v]) => ({ nombre: repById.get(comercialId)?.nombre ?? '—', ...v }))
      .sort((a, b) => b.total - a.total)
  }, [db.sales, repById])

  const rotacionPorCategoria = useMemo(() => {
    const vendidos = new Map<string, number>()
    db.sales
      .filter((s) => daysSince(s.fecha) <= 30)
      .forEach((s) =>
        s.lineas.forEach((l) => {
          const cat = productById.get(l.productoId)?.categoriaId
          if (!cat) return
          vendidos.set(cat, (vendidos.get(cat) ?? 0) + l.cantidad)
        }),
      )
    const stockPorCategoria = new Map<string, number>()
    db.stock.forEach((s) => {
      const cat = productById.get(s.productoId)?.categoriaId
      if (!cat) return
      stockPorCategoria.set(cat, (stockPorCategoria.get(cat) ?? 0) + s.unidades)
    })
    return db.categories
      .map((c) => {
        const stock = stockPorCategoria.get(c.id) ?? 0
        const vendido = vendidos.get(c.id) ?? 0
        return { nombre: c.nombre, stock, vendido, rotacion: stock > 0 ? vendido / stock : 0 }
      })
      .sort((a, b) => b.rotacion - a.rotacion)
  }, [db.sales, db.stock, db.categories, productById])

  const maxProducto = Math.max(...rankingProductos.map((p) => p.importe), 1)
  const maxCliente = Math.max(...rankingClientes.map((c) => c.total), 1)
  const maxComercial = Math.max(...rankingComerciales.map((c) => c.total), 1)
  const maxRotacion = Math.max(...rotacionPorCategoria.map((c) => c.rotacion), 0.01)

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
            <BarChart3 size={20} className="text-slate-700" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Informes avanzados</h1>
        </div>
        <Badge label="Activo (Fase 2)" />
      </div>
      <p className="text-sm text-slate-500 mb-6 ml-[52px]">Rentabilidad, ranking de ventas y rotación de stock, calculados sobre los datos actuales</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-sm font-medium text-slate-700 mb-1">Productos más vendidos (importe)</div>
          {rankingProductos.map((p) => (
            <BarRow key={p.nombre} label={p.nombre} value={p.importe} max={maxProducto} formatted={`${formatEUR(p.importe)} · margen ${formatEUR(p.margen)}`} />
          ))}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-sm font-medium text-slate-700 mb-1">Clientes por facturación</div>
          {rankingClientes.map((c) => (
            <BarRow key={c.nombre} label={c.nombre} value={c.total} max={maxCliente} formatted={formatEUR(c.total)} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-sm font-medium text-slate-700 mb-1">Ranking de comerciales</div>
          {rankingComerciales.map((c) => (
            <BarRow key={c.nombre} label={`${c.nombre} · ${c.pedidos} pedidos`} value={c.total} max={maxComercial} formatted={formatEUR(c.total)} />
          ))}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-sm font-medium text-slate-700 mb-1">Rotación de stock por categoría (últimos 30 días)</div>
          {rotacionPorCategoria.map((c) => (
            <BarRow key={c.nombre} label={c.nombre} value={c.rotacion} max={maxRotacion} formatted={`${c.vendido} vendidas / ${c.stock} stock`} />
          ))}
        </div>
      </div>
    </div>
  )
}

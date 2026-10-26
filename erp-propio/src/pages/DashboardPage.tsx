import { useEffect, useState } from 'react'
import { Package, Users, Truck, Warehouse, ShoppingCart, ClipboardList, Receipt, FileSpreadsheet, Lock, Unlock } from 'lucide-react'
import { supabase } from '../lib/supabase'

const TIENDA = '01'

function StatCard({ label, value, icon: Icon }: { label: string; value: number | null; icon: typeof Package }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <Icon size={18} className="text-indigo-400" />
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-800">{value ?? '—'}</div>
    </div>
  )
}

export function DashboardPage() {
  const [counts, setCounts] = useState<Record<string, number | null>>({
    articulo: null,
    cliente: null,
    proveedor: null,
    almacen: null,
    pedidosProveedorPendientes: null,
    pedidosClientePendientes: null,
    ventasHoy: null,
    facturas: null,
  })
  const [cajaAbierta, setCajaAbierta] = useState<boolean | null>(null)

  useEffect(() => {
    async function load() {
      const hoy = new Date().toISOString().slice(0, 10)
      const [articulo, cliente, proveedor, almacen, pedidosProveedor, pedidosCliente, ventasHoy, facturas, caja] = await Promise.all([
        supabase.from('articulo').select('*', { count: 'exact', head: true }),
        supabase.from('cliente').select('*', { count: 'exact', head: true }),
        supabase.from('proveedor').select('*', { count: 'exact', head: true }),
        supabase.from('almacen').select('*', { count: 'exact', head: true }),
        supabase.from('pedido_proveedor').select('*', { count: 'exact', head: true }).not('estado', 'in', '(recepcionado,liquidado)'),
        supabase.from('pedido_cliente').select('*', { count: 'exact', head: true }).eq('entregado', false).eq('anulado', false),
        supabase.from('venta').select('*', { count: 'exact', head: true }).eq('fecha', hoy),
        supabase.from('factura').select('*', { count: 'exact', head: true }),
        supabase
          .from('caja_apertura_cierre')
          .select('ejercicio')
          .eq('tienda_terminal_codigo', TIENDA)
          .eq('cerrado', false)
          .limit(1)
          .maybeSingle(),
      ])
      setCounts({
        articulo: articulo.count,
        cliente: cliente.count,
        proveedor: proveedor.count,
        almacen: almacen.count,
        pedidosProveedorPendientes: pedidosProveedor.count,
        pedidosClientePendientes: pedidosCliente.count,
        ventasHoy: ventasHoy.count,
        facturas: facturas.count,
      })
      setCajaAbierta(!!caja.data)
    }
    load()
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800">Resumen</h1>
      <p className="mt-1 text-sm text-slate-400">
        Datos en vivo desde Postgres (Supabase) — no son datos de ejemplo, es la base de datos real de las Fases 1-6.
      </p>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
        {cajaAbierta === null ? (
          <span className="text-slate-400">Comprobando caja…</span>
        ) : cajaAbierta ? (
          <>
            <Unlock size={16} className="text-emerald-600" />
            <span className="font-medium text-emerald-700">Caja abierta</span>
          </>
        ) : (
          <>
            <Lock size={16} className="text-slate-400" />
            <span className="text-slate-500">Caja cerrada</span>
          </>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Artículos" value={counts.articulo} icon={Package} />
        <StatCard label="Clientes" value={counts.cliente} icon={Users} />
        <StatCard label="Proveedores" value={counts.proveedor} icon={Truck} />
        <StatCard label="Almacenes" value={counts.almacen} icon={Warehouse} />
        <StatCard label="Pedidos a proveedor pendientes" value={counts.pedidosProveedorPendientes} icon={ShoppingCart} />
        <StatCard label="Pedidos de clientes pendientes" value={counts.pedidosClientePendientes} icon={ClipboardList} />
        <StatCard label="Ventas de hoy" value={counts.ventasHoy} icon={Receipt} />
        <StatCard label="Facturas emitidas" value={counts.facturas} icon={FileSpreadsheet} />
      </div>
    </div>
  )
}

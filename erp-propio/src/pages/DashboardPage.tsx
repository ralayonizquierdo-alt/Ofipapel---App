import { useEffect, useState } from 'react'
import { Package, Users, Truck, Warehouse } from 'lucide-react'
import { supabase } from '../lib/supabase'

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
  })

  useEffect(() => {
    async function load() {
      const tables = ['articulo', 'cliente', 'proveedor', 'almacen'] as const
      const results = await Promise.all(
        tables.map((t) => supabase.from(t).select('*', { count: 'exact', head: true })),
      )
      setCounts(Object.fromEntries(tables.map((t, i) => [t, results[i].count])))
    }
    load()
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800">Resumen</h1>
      <p className="mt-1 text-sm text-slate-400">
        Datos en vivo desde Postgres (Supabase) — no son datos de ejemplo, es la base de datos real de las Fases 1-6.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Artículos" value={counts.articulo} icon={Package} />
        <StatCard label="Clientes" value={counts.cliente} icon={Users} />
        <StatCard label="Proveedores" value={counts.proveedor} icon={Truck} />
        <StatCard label="Almacenes" value={counts.almacen} icon={Warehouse} />
      </div>
    </div>
  )
}

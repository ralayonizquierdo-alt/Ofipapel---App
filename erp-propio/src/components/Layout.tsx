import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  Users,
  Truck,
  Warehouse,
  ShoppingCart,
  ClipboardList,
  Receipt,
  FileSpreadsheet,
  LogOut,
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'

const nav = [
  { to: '/', label: 'Resumen', icon: LayoutDashboard, end: true },
  { to: '/articulos', label: 'Artículos', icon: Package },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/proveedores', label: 'Proveedores', icon: Truck },
  { to: '/stock', label: 'Stock', icon: Warehouse },
  { to: '/compras', label: 'Compras', icon: ShoppingCart },
  { to: '/pedidos', label: 'Pedidos de clientes', icon: ClipboardList },
  { to: '/ventas', label: 'Ventas / TPV', icon: Receipt },
  { to: '/facturacion', label: 'Facturación', icon: FileSpreadsheet },
]

export function Layout() {
  const { session, signOut } = useAuth()

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-60 flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-5">
          <div className="text-lg font-bold text-slate-800">Ofipapel ERP</div>
          <div className="text-xs text-slate-400">propio · en construcción</div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 px-5 py-4">
          <div className="truncate text-xs text-slate-500">{session?.user.email}</div>
          <button
            type="button"
            onClick={() => signOut()}
            className="mt-2 flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-red-600"
          >
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

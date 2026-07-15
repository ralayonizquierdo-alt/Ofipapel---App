import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Calendar, BedDouble, Tag, Wrench, PiggyBank, BarChart3, Settings, Menu, X, KeyRound, LogOut
} from 'lucide-react'
import { useMemo, useState } from 'react'
import LoginScreen from './components/LoginScreen'
import MigrateLocalData from './components/MigrateLocalData'
import ChangePasswordModal from './components/ChangePasswordModal'
import { useData } from './contexts/DataContext'
import Dashboard from './pages/Dashboard'
import Planning from './pages/Planning'
import Reservations from './pages/Reservations'
import Prices from './pages/Prices'
import Repairs from './pages/Repairs'
import Collections from './pages/Collections'
import Analytics from './pages/Analytics'
import ApartmentsConfig from './pages/ApartmentsConfig'

const NAV = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/planning',     icon: Calendar,        label: 'Planning' },
  { to: '/reservas',     icon: BedDouble,       label: 'Reservas' },
  { to: '/precios',      icon: Tag,             label: 'Precios' },
  { to: '/reparaciones', icon: Wrench,          label: 'Reparaciones' },
  { to: '/cobros',       icon: PiggyBank,       label: 'Cobros' },
  { to: '/analitica',    icon: BarChart3,       label: 'Analítica' },
  { to: '/config',       icon: Settings,        label: 'Apartamentos' },
]

function NavItems({ alerts, onClose }: { alerts: number; onClose?: () => void }) {
  return (
    <>
      {NAV.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onClose}
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              isActive
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`
          }
        >
          <Icon size={16} />
          {label}
          {label === 'Dashboard' && alerts > 0 && (
            <span className="ml-auto bg-amber-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
              {alerts}
            </span>
          )}
        </NavLink>
      ))}
    </>
  )
}

function Sidebar({ alerts, onChangePassword, onLogout }: { alerts: number; onChangePassword: () => void; onLogout: () => void }) {
  return (
    <aside className="w-56 min-h-screen bg-slate-900 flex flex-col shrink-0">
      <div className="px-4 py-5 border-b border-slate-700">
        <h1 className="text-white font-bold text-lg leading-tight">🏠 Alquileres</h1>
        <p className="text-slate-400 text-xs mt-0.5">Gestión vacacional</p>
      </div>
      <nav className="flex-1 py-4 space-y-0.5 px-2">
        <NavItems alerts={alerts} />
      </nav>
      <div className="px-4 py-3 border-t border-slate-700 space-y-1">
        <p className="text-slate-500 text-xs mb-2">Ofipapel © 2026</p>
        <button onClick={onChangePassword}
          className="flex items-center gap-2 text-slate-400 hover:text-white text-xs w-full py-1.5 px-2 rounded-lg hover:bg-slate-800 transition-colors">
          <KeyRound size={13} /> Cambiar contraseña
        </button>
        <button onClick={onLogout}
          className="flex items-center gap-2 text-slate-400 hover:text-red-400 text-xs w-full py-1.5 px-2 rounded-lg hover:bg-slate-800 transition-colors">
          <LogOut size={13} /> Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

function MobileHeader({ alerts, onMenuOpen }: { alerts: number; onMenuOpen: () => void }) {
  const location = useLocation()
  const current = NAV.find(n => location.pathname.startsWith(n.to))
  return (
    <header className="bg-slate-900 text-white flex items-center justify-between px-4 py-3 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <button onClick={onMenuOpen} className="p-1 rounded-lg hover:bg-slate-700">
          <Menu size={22} />
        </button>
        <span className="font-semibold text-sm">{current?.label ?? 'Alquileres'}</span>
      </div>
      {alerts > 0 && (
        <span className="bg-amber-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
          {alerts}
        </span>
      )}
    </header>
  )
}

function Drawer({ alerts, open, onClose, onChangePassword, onLogout }: { alerts: number; open: boolean; onClose: () => void; onChangePassword: () => void; onLogout: () => void }) {
  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 flex flex-col">
        <div className="px-4 py-5 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">🏠 Alquileres</h1>
            <p className="text-slate-400 text-xs mt-0.5">Gestión vacacional</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 py-4 space-y-0.5 px-2 overflow-y-auto">
          <NavItems alerts={alerts} onClose={onClose} />
        </nav>
        <div className="px-4 py-3 border-t border-slate-700 space-y-1">
          <p className="text-slate-500 text-xs mb-2">Ofipapel © 2026</p>
          <button onClick={() => { onClose(); onChangePassword() }}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-xs w-full py-1.5 px-2 rounded-lg hover:bg-slate-800 transition-colors">
            <KeyRound size={13} /> Cambiar contraseña
          </button>
          <button onClick={() => { onClose(); onLogout() }}
            className="flex items-center gap-2 text-slate-400 hover:text-red-400 text-xs w-full py-1.5 px-2 rounded-lg hover:bg-slate-800 transition-colors">
            <LogOut size={13} /> Cerrar sesión
          </button>
        </div>
      </div>
    </>
  )
}

export default function App() {
  const { loading, reservations, payments } = useData()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState<string | null>(null)
  const [showChangePassword, setShowChangePassword] = useState(false)

  const alertCount = useMemo(() => {
    const today = new Date()
    return reservations.filter(r => {
      if (r.status === 'cancelada') return false
      if (new Date(r.checkOut) < today) return false
      const paid = payments
        .filter(p => p.reservationId === r.id && p.received)
        .reduce((s, p) => s + p.amount, 0)
      return paid < r.total
    }).length
  }, [reservations, payments])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <p className="text-slate-500 text-sm">Cargando...</p>
    </div>
  )

  if (!currentUser) return (
    <LoginScreen onLogin={(user) => {
      localStorage.setItem('aq_current_user', user)
      setCurrentUser(user)
    }} />
  )

  return (
    <BrowserRouter basename="/Ofipapel---App/alquileres">
      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
      <div className="flex min-h-screen bg-slate-100">
        {/* Desktop sidebar */}
        <div className="hidden md:flex">
          <Sidebar
            alerts={alertCount}
            onChangePassword={() => setShowChangePassword(true)}
            onLogout={() => { localStorage.removeItem('aq_current_user'); setCurrentUser(null) }}
          />
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile header */}
          <div className="md:hidden">
            <MobileHeader alerts={alertCount} onMenuOpen={() => setDrawerOpen(true)} />
          </div>

          {/* Mobile drawer */}
          <Drawer
            alerts={alertCount}
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            onChangePassword={() => setShowChangePassword(true)}
            onLogout={() => { localStorage.removeItem('aq_current_user'); setCurrentUser(null) }}
          />

          <MigrateLocalData />
          <main className="flex-1 overflow-auto">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/planning" element={<Planning />} />
              <Route path="/reservas" element={<Reservations />} />
              <Route path="/precios" element={<Prices />} />
              <Route path="/reparaciones" element={<Repairs />} />
              <Route path="/cobros" element={<Collections />} />
              <Route path="/analitica" element={<Analytics />} />
              <Route path="/config" element={<ApartmentsConfig />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}

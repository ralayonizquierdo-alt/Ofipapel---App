import { useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import {
  CalendarDays, Music2, Cat, Briefcase, Stethoscope, Menu, X,
} from 'lucide-react'

const nav = [
  { to: '/agenda',  icon: CalendarDays, label: 'Agenda',   color: '#c9a96e' },
  { to: '/turnos',  icon: Stethoscope,  label: 'Turnos',   color: '#5b8dd9' },
  { to: '/empresa', icon: Briefcase,    label: 'Empresa',  color: '#9b6bb5' },
  { to: '/musica',  icon: Music2,       label: 'Música',   color: '#e05252' },
  { to: '/limon',   icon: Cat,          label: 'Limón 🍋', color: '#6db56d' },
]

export default function Layout() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  const currentNav = nav.find(n => location.pathname.startsWith(n.to))

  return (
    <div className="flex h-full min-h-screen bg-[#0a0a0a]">
      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-20 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:static top-0 left-0 h-full z-30
          w-64 flex-shrink-0 flex flex-col
          bg-[#111111] border-r border-[#2a2a2a]
          transform transition-transform duration-300
          ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Logo */}
        <div className="px-6 pt-8 pb-6 border-b border-[#2a2a2a]">
          <h1 className="font-display text-2xl font-bold text-gold-gradient">
            Joe's World
          </h1>
          <p className="text-[#888] text-xs mt-1 font-light tracking-widest uppercase">
            tu espacio personal
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-6 space-y-1">
          {nav.map(({ to, icon: Icon, label, color }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                  isActive
                    ? 'bg-[#1a1a1a] border border-[#3a3a3a]'
                    : 'hover:bg-[#1a1a1a]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={20}
                    style={{ color: isActive ? color : '#666' }}
                    className="transition-colors duration-200 group-hover:opacity-90"
                  />
                  <span
                    className="text-sm font-medium transition-colors duration-200"
                    style={{ color: isActive ? '#e0e0e0' : '#666' }}
                  >
                    {label}
                  </span>
                  {isActive && (
                    <div
                      className="ml-auto w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#2a2a2a]">
          <p className="text-[#444] text-xs text-center font-light">
            ♪ hecho con amor ♪
          </p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Top bar mobile */}
        <header className="md:hidden flex items-center gap-3 px-4 py-4 bg-[#111111] border-b border-[#2a2a2a]">
          <button
            onClick={() => setOpen(!open)}
            className="text-[#888] hover:text-[#c9a96e] transition-colors"
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
          <span className="font-display text-lg font-semibold text-[#c9a96e]">
            {currentNav?.label ?? "Joe's World"}
          </span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import {
  CalendarDays, Music2, Cat, Briefcase, Stethoscope, Menu, X, Sparkles,
} from 'lucide-react'
import { MusicNotesBg } from './RockBackground'

const nav = [
  { to: '/agenda',  icon: CalendarDays, label: 'Agenda',   color: '#c9a96e' },
  { to: '/turnos',  icon: Stethoscope,  label: 'Turnos',   color: '#5b8dd9' },
  { to: '/empresa', icon: Briefcase,    label: 'Empresa',  color: '#9b6bb5' },
  { to: '/musica',  icon: Music2,       label: 'Música',   color: '#e05252' },
  { to: '/limon',      icon: Cat,      label: 'Limón 🍋',    color: '#6db56d' },
  { to: '/coisinhas', icon: Sparkles, label: 'Coisinhas ✨', color: '#d4609e' },
]

/* SVG decorativo - púa de guitarra */
function GuitarPick({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 48" className={className} fill="currentColor">
      <path d="M20 2C10 2 2 10 2 20c0 8 6 16 18 26 12-10 18-18 18-26C38 10 30 2 20 2z" />
    </svg>
  )
}

export default function Layout() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  const currentNav = nav.find(n => location.pathname.startsWith(n.to))

  return (
    <div className="flex h-full min-h-screen" style={{ background: '#0a0a0a' }}>
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
          w-64 flex-shrink-0 flex flex-col overflow-hidden
          transform transition-transform duration-300
          ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        style={{
          background: 'linear-gradient(180deg, #141414 0%, #0f0f0f 100%)',
          borderRight: '1px solid #222',
        }}
      >
        {/* Decoración top — picks de guitarra */}
        <div className="absolute top-0 right-0 w-24 h-24 pointer-events-none opacity-[0.04]">
          <GuitarPick className="absolute top-2 right-2 w-10 h-12 text-[#c9a96e] rotate-12" />
          <GuitarPick className="absolute top-6 right-8 w-6 h-8 text-[#c9a96e] -rotate-6" />
        </div>

        {/* Logo */}
        <div className="relative px-6 pt-8 pb-6" style={{ borderBottom: '1px solid #1e1e1e' }}>
          <div className="flex items-center gap-3 mb-1">
            {/* Vinilo decorativo */}
            <div className="relative w-8 h-8 flex-shrink-0">
              <div className="absolute inset-0 rounded-full border-2 border-[#c9a96e30]" />
              <div className="absolute inset-1 rounded-full border border-[#c9a96e20]" />
              <div className="absolute inset-[10px] rounded-full bg-[#c9a96e]" />
            </div>
            <h1 className="font-display text-2xl font-bold text-gold-gradient leading-none">
              Joe's World
            </h1>
          </div>
          <p className="text-[#999] text-[10px] mt-2 font-light tracking-[0.3em] uppercase ml-11">
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
                `flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 group ${
                  isActive ? 'border border-[#2a2a2a]' : 'hover:bg-[#1e1e1e] border border-transparent'
                }`
              }
              style={({ isActive }) => isActive ? { background: `linear-gradient(135deg, ${color}15, ${color}08)` } : {}}
            >
              {({ isActive }) => (
                <>
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200"
                    style={isActive ? { backgroundColor: color + '25' } : { backgroundColor: '#222' }}
                  >
                    <Icon
                      size={20}
                      style={{ color: isActive ? color : '#aaa' }}
                    />
                  </div>
                  <span
                    className="text-base font-medium transition-colors duration-200"
                    style={{ color: isActive ? '#f0f0f0' : '#aaa' }}
                  >
                    {label}
                  </span>
                  {isActive && (
                    <div
                      className="ml-auto w-1.5 h-5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Limón photo in sidebar */}
        <div className="absolute bottom-20 right-0 w-32 pointer-events-none select-none" style={{ opacity: 0.28 }}>
          <img src={`${import.meta.env.BASE_URL}limon.png`} alt="" className="w-full" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, #141414 0%, transparent 45%)' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, #141414 0%, transparent 35%)' }} />
        </div>

        {/* Footer con notas musicales */}
        <div className="px-6 py-5 relative" style={{ borderTop: '1px solid #1a1a1a' }}>
          <div className="flex items-center justify-center gap-2">
            <span className="text-[#c9a96e30] text-base">♩</span>
            <p className="text-[#333] text-[11px] font-light tracking-widest">hecho con amor</p>
            <span className="text-[#c9a96e30] text-base">♪</span>
          </div>
          <p className="text-[#222] text-[9px] text-center mt-1 tracking-widest">
            ★ ROCK & ROLL ★
          </p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Top bar mobile */}
        <header
          className="md:hidden flex items-center gap-3 px-5 py-4"
          style={{ background: '#111', borderBottom: '1px solid #2a2a2a' }}
        >
          <button
            onClick={() => setOpen(!open)}
            className="p-2 rounded-lg transition-colors"
            style={{ color: '#bbb' }}
          >
            {open ? <X size={26} /> : <Menu size={26} />}
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: currentNav?.color ?? '#c9a96e' }} />
            <span className="font-display text-xl font-semibold" style={{ color: currentNav?.color ?? '#c9a96e' }}>
              {currentNav?.label ?? "Joe's World"}
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 relative">
          {/* Fondo musical: notas + ondas por toda la pantalla */}
          <div className="fixed inset-0 pointer-events-none text-[#c9a96e]" style={{ zIndex: 0 }}>
            <MusicNotesBg className="w-full h-full" />
          </div>
          <div className="relative z-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

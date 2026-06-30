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

/* SVG decorativo — silueta botánica floral */
function FloralDecoration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 110" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      {/* Ramas principales */}
      <path d="M256 0 C210 25 170 48 140 78 C120 96 105 108 88 110"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.7"/>
      <path d="M256 35 C220 50 190 62 165 80"
        stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
      <path d="M200 0 C180 28 162 44 148 60"
        stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.45"/>
      <path d="M256 70 C238 78 222 88 210 100"
        stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" opacity="0.4"/>
      {/* Hojas */}
      <path d="M195 30 C199 20 210 24 207 34 C202 38 193 35 195 30Z" fill="currentColor" opacity="0.55"/>
      <path d="M168 52 C173 42 184 47 180 57 C175 61 166 58 168 52Z" fill="currentColor" opacity="0.5"/>
      <path d="M148 68 C153 59 163 63 160 73 C155 77 146 74 148 68Z" fill="currentColor" opacity="0.5"/>
      <path d="M222 18 C226 10 235 14 232 22 C228 26 220 23 222 18Z" fill="currentColor" opacity="0.45"/>
      <path d="M238 52 C241 44 249 47 247 55 C244 59 236 56 238 52Z" fill="currentColor" opacity="0.4"/>
      <path d="M175 78 C178 70 187 73 184 81 C181 85 173 82 175 78Z" fill="currentColor" opacity="0.45"/>
      <path d="M140 88 C143 80 151 83 149 91 C146 95 138 92 140 88Z" fill="currentColor" opacity="0.4"/>
      {/* Flores — pétalos circulares */}
      <circle cx="140" cy="78" r="4.5" fill="currentColor" opacity="0.35"/>
      <circle cx="140" cy="69" r="4"   fill="currentColor" opacity="0.22"/>
      <circle cx="148" cy="73" r="4"   fill="currentColor" opacity="0.22"/>
      <circle cx="148" cy="82" r="4"   fill="currentColor" opacity="0.22"/>
      <circle cx="140" cy="87" r="4"   fill="currentColor" opacity="0.22"/>
      <circle cx="132" cy="82" r="4"   fill="currentColor" opacity="0.22"/>
      <circle cx="132" cy="73" r="4"   fill="currentColor" opacity="0.22"/>

      <circle cx="165" cy="80" r="3.5" fill="currentColor" opacity="0.3"/>
      <circle cx="165" cy="72" r="3"   fill="currentColor" opacity="0.18"/>
      <circle cx="172" cy="76" r="3"   fill="currentColor" opacity="0.18"/>
      <circle cx="172" cy="84" r="3"   fill="currentColor" opacity="0.18"/>
      <circle cx="158" cy="84" r="3"   fill="currentColor" opacity="0.18"/>
      <circle cx="158" cy="76" r="3"   fill="currentColor" opacity="0.18"/>

      <circle cx="210" cy="100" r="3"   fill="currentColor" opacity="0.28"/>
      <circle cx="210" cy="93"  r="2.5" fill="currentColor" opacity="0.16"/>
      <circle cx="216" cy="96"  r="2.5" fill="currentColor" opacity="0.16"/>
      <circle cx="216" cy="103" r="2.5" fill="currentColor" opacity="0.16"/>
      <circle cx="204" cy="103" r="2.5" fill="currentColor" opacity="0.16"/>
      <circle cx="204" cy="96"  r="2.5" fill="currentColor" opacity="0.16"/>
      {/* Puntitos / bayas */}
      <circle cx="88"  cy="110" r="2.5" fill="currentColor" opacity="0.4"/>
      <circle cx="148" cy="60"  r="2"   fill="currentColor" opacity="0.32"/>
      <circle cx="200" cy="0"   r="1.8" fill="currentColor" opacity="0.28"/>
      <circle cx="245" cy="88"  r="1.5" fill="currentColor" opacity="0.22"/>
      <circle cx="185" cy="95"  r="1.5" fill="currentColor" opacity="0.22"/>
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
        {/* Logo + decoración floral */}
        <div className="relative px-6 pt-8 pb-6 overflow-hidden" style={{ borderBottom: '1px solid #1e1e1e' }}>
          {/* Silueta botánica */}
          <FloralDecoration className="absolute inset-0 w-full h-full text-[#c9a96e] pointer-events-none" />
          <div className="flex items-center gap-3 mb-1 relative z-10">
            {/* Logo J */}
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, #c9a96e 0%, #8a6020 100%)',
                boxShadow: '0 0 0 2px #c9a96e22, 0 2px 10px #c9a96e28',
              }}>
              <span className="font-display text-lg font-black leading-none select-none"
                style={{ color: '#0a0a0a' }}>J</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-gold-gradient leading-none relative z-10">
              Joe's World
            </h1>
          </div>
          <p className="text-[#999] text-[10px] mt-2 font-light tracking-[0.3em] uppercase ml-12 relative z-10">
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

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
  { to: '/coisinhas', icon: Sparkles, label: 'Minhas Coisinhas ✨', color: '#d4609e' },
]

/* SVG decorativo — silueta botánica floral, cubre toda la barra lateral */
function FloralDecoration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 800" fill="none" preserveAspectRatio="xMidYMid slice"
      className={className} xmlns="http://www.w3.org/2000/svg">
      {/* Rama principal: de arriba-derecha a abajo-izquierda */}
      <path d="M256 0 C215 80 175 165 140 255 C105 345 75 435 50 545 C30 625 15 705 0 800"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Ramas laterales derecha */}
      <path d="M256 115 C235 140 210 162 185 188" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      <path d="M256 315 C238 335 218 352 198 372" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      <path d="M256 515 C240 532 222 548 205 565" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
      <path d="M256 695 C242 708 226 720 210 732" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
      {/* Ramas laterales izquierda */}
      <path d="M0 255 C20 272 42 290 60 312" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      <path d="M0 455 C18 470 38 486 55 505" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
      <path d="M0 648 C16 662 33 675 50 688" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
      {/* Hojas — rama principal */}
      <path d="M228 38 C232 28 242 31 240 41C237 46 226 43 228 38Z" fill="currentColor"/>
      <path d="M205 78 C209 68 219 71 217 81C214 86 203 83 205 78Z" fill="currentColor"/>
      <path d="M182 122 C186 112 196 115 194 125C191 130 180 127 182 122Z" fill="currentColor"/>
      <path d="M162 168 C166 158 176 161 174 171C171 176 160 173 162 168Z" fill="currentColor"/>
      <path d="M143 218 C147 208 157 211 155 221C152 226 141 223 143 218Z" fill="currentColor"/>
      <path d="M122 275 C126 265 136 268 134 278C131 283 120 280 122 275Z" fill="currentColor"/>
      <path d="M100 342 C104 332 114 335 112 345C109 350 98 347 100 342Z" fill="currentColor"/>
      <path d="M78 418 C82 408 92 411 90 421C87 426 76 423 78 418Z" fill="currentColor"/>
      <path d="M58 498 C62 488 72 491 70 501C67 506 56 503 58 498Z" fill="currentColor"/>
      <path d="M40 578 C44 568 54 571 52 581C49 586 38 583 40 578Z" fill="currentColor"/>
      <path d="M22 658 C26 648 36 651 34 661C31 666 20 663 22 658Z" fill="currentColor"/>
      {/* Hojas — lateral derecha */}
      <path d="M240 148 C244 140 252 143 250 151C247 155 238 153 240 148Z" fill="currentColor"/>
      <path d="M210 180 C214 172 222 175 220 183C217 187 208 185 210 180Z" fill="currentColor"/>
      <path d="M238 345 C242 337 250 340 248 348C245 352 236 350 238 345Z" fill="currentColor"/>
      <path d="M208 368 C212 360 220 363 218 371C215 375 206 373 208 368Z" fill="currentColor"/>
      <path d="M242 545 C246 537 254 540 252 548C249 552 240 550 242 545Z" fill="currentColor"/>
      <path d="M212 565 C216 557 224 560 222 568C219 572 210 570 212 565Z" fill="currentColor"/>
      <path d="M240 715 C244 707 252 710 250 718C247 722 238 720 240 715Z" fill="currentColor"/>
      {/* Hojas — lateral izquierda */}
      <path d="M15 268 C10 261 19 256 24 263C24 269 17 273 15 268Z" fill="currentColor"/>
      <path d="M47 298 C42 291 51 286 56 293C56 299 49 303 47 298Z" fill="currentColor"/>
      <path d="M17 468 C12 461 21 456 26 463C26 469 19 473 17 468Z" fill="currentColor"/>
      <path d="M47 490 C42 483 51 478 56 485C56 491 49 495 47 490Z" fill="currentColor"/>
      <path d="M17 660 C12 653 21 648 26 655C26 661 19 665 17 660Z" fill="currentColor"/>
      <path d="M47 685 C42 678 51 673 56 680C56 686 49 690 47 685Z" fill="currentColor"/>
      {/* Flores */}
      <circle cx="140" cy="255" r="5"/><circle cx="140" cy="246" r="4.5"/>
      <circle cx="148" cy="250" r="4.5"/><circle cx="148" cy="260" r="4.5"/>
      <circle cx="140" cy="264" r="4.5"/><circle cx="132" cy="260" r="4.5"/>
      <circle cx="132" cy="250" r="4.5"/>
      <circle cx="185" cy="188" r="4"/><circle cx="185" cy="180" r="3.5"/>
      <circle cx="192" cy="184" r="3.5"/><circle cx="192" cy="192" r="3.5"/>
      <circle cx="185" cy="196" r="3.5"/><circle cx="178" cy="192" r="3.5"/>
      <circle cx="178" cy="184" r="3.5"/>
      <circle cx="78" cy="418" r="4.5"/><circle cx="78" cy="409" r="4"/>
      <circle cx="86" cy="413" r="4"/><circle cx="86" cy="423" r="4"/>
      <circle cx="78" cy="427" r="4"/><circle cx="70" cy="423" r="4"/>
      <circle cx="70" cy="413" r="4"/>
      <circle cx="198" cy="372" r="3.5"/><circle cx="198" cy="364" r="3"/>
      <circle cx="205" cy="368" r="3"/><circle cx="205" cy="376" r="3"/>
      <circle cx="191" cy="376" r="3"/><circle cx="191" cy="368" r="3"/>
      <circle cx="35" cy="598" r="4"/><circle cx="35" cy="590" r="3.5"/>
      <circle cx="42" cy="594" r="3.5"/><circle cx="42" cy="602" r="3.5"/>
      <circle cx="35" cy="606" r="3.5"/><circle cx="28" cy="602" r="3.5"/>
      <circle cx="28" cy="594" r="3.5"/>
      <circle cx="205" cy="565" r="3"/><circle cx="205" cy="558" r="2.5"/>
      <circle cx="211" cy="561" r="2.5"/><circle cx="211" cy="569" r="2.5"/>
      <circle cx="199" cy="569" r="2.5"/><circle cx="199" cy="561" r="2.5"/>
      <circle cx="210" cy="732" r="3"/><circle cx="210" cy="725" r="2.5"/>
      <circle cx="216" cy="728" r="2.5"/><circle cx="216" cy="736" r="2.5"/>
      <circle cx="204" cy="736" r="2.5"/><circle cx="204" cy="728" r="2.5"/>
      {/* Puntitos / bayas */}
      <circle cx="245" cy="52" r="2"/><circle cx="172" cy="638" r="2"/>
      <circle cx="105" cy="548" r="1.8"/><circle cx="165" cy="468" r="2"/>
      <circle cx="220" cy="458" r="1.8"/><circle cx="235" cy="648" r="1.8"/>
      <circle cx="120" cy="698" r="2"/><circle cx="82" cy="748" r="1.5"/>
      <circle cx="178" cy="778" r="1.5"/><circle cx="60" cy="312" r="2"/>
      <circle cx="55" cy="505" r="1.8"/><circle cx="50" cy="688" r="2"/>
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
        {/* Decoración floral: cubre toda la barra lateral */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0, opacity: 0.065 }}>
          <FloralDecoration className="w-full h-full text-[#c9a96e]" />
        </div>

        {/* Logo + decoración floral */}
        <div className="relative px-6 pt-8 pb-6" style={{ borderBottom: '1px solid #1e1e1e', zIndex: 1 }}>
          <div className="flex items-center gap-3 mb-1 relative z-10">
            {/* Logo J */}
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, #c9a96e 0%, #8a6020 100%)',
                boxShadow: '0 0 0 2px #c9a96e22, 0 2px 10px #c9a96e28',
              }}>
              <span className="font-display text-lg font-black select-none"
                style={{ color: '#0a0a0a', lineHeight: '1', transform: 'translateY(-1px)', display: 'block' }}>J</span>
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
        <nav className="flex-1 px-3 py-6 space-y-1 relative" style={{ zIndex: 1 }}>
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

        {/* Footer con notas musicales */}
        <div className="px-6 py-5 relative" style={{ borderTop: '1px solid #1a1a1a', zIndex: 1 }}>
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

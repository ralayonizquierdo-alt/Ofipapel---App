import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { GwAppIcon, GwWindow } from './gw'
import { MenuBar } from './shell/MenuBar'
import { QuickBar } from './shell/QuickBar'
import { MENUS, isEnabled, windowTitle, type MenuEntry, type MenuItem } from './shell/menus'

// Ventana principal con el aspecto de GeminisWin: franja de título, barra de menús,
// barra lateral de accesos rápidos, área MDI gris con la ventana activa y barra de estado.
export function Layout() {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [empresa, setEmpresa] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const title = windowTitle(pathname)

  useEffect(() => {
    supabase
      .from('empresa')
      .select('nombre')
      .order('codigo')
      .limit(1)
      .then(({ data }) => setEmpresa(data?.[0]?.nombre ?? ''))
  }, [])

  function runMenu(i: MenuItem) {
    if (i.to) navigate(i.to)
    else if (i.action === 'signout') signOut()
    else if (i.action === 'close-window') navigate('/')
    else if (i.action) document.execCommand(i.action)
  }

  useEffect(() => {
    const shortcuts = new Map<string, MenuItem>()
    const collect = (entries: MenuEntry[]) => {
      for (const e of entries) {
        if (e === 'sep') continue
        if (e.shortcut && (e.to || e.action === 'signout')) shortcuts.set(e.shortcut.toLowerCase(), e)
        if (e.children) collect(e.children)
      }
    }
    MENUS.forEach((m) => collect(m.items))
    const onKey = (ev: KeyboardEvent) => {
      const combo = [ev.ctrlKey && 'ctrl', ev.altKey && 'alt', ev.key.toLowerCase()].filter(Boolean).join('+')
      const hit = shortcuts.get(combo)
      if (hit && isEnabled(hit)) {
        ev.preventDefault()
        runMenu(hit)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--gw-face)]">
      <div className="flex h-[24px] flex-none items-center gap-1.5 bg-white px-2 text-[12px]">
        <GwAppIcon size={16} />
        <span className="truncate">
          Ofipapel ERP, Periodo: Periodo {new Date().getFullYear()} Empresa: {empresa}
        </span>
      </div>
      <MenuBar onRun={runMenu} onHover={setHint} activeWindow={title} />
      <div className="flex min-h-0 flex-1">
        <QuickBar
          onHover={setHint}
          onRun={(q) => {
            if (q.to) navigate(q.to)
            else if (q.action === 'signout') signOut()
          }}
        />
        <div className="relative min-w-0 flex-1 bg-[var(--gw-mdi)]">
          <Watermark />
          {pathname !== '/' && (
            <GwWindow
              title={title}
              onClose={() => navigate('/')}
              className="absolute inset-1 z-10 [&>div:last-child]:min-h-0 [&>div:last-child]:overflow-auto"
            >
              <Outlet />
            </GwWindow>
          )}
        </div>
      </div>
      <StatusBar text={hint ?? title} email={session?.user.email ?? ''} />
    </div>
  )
}

function Watermark() {
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-0 flex select-none flex-col items-stretch border border-[#9aa8bb] bg-white px-1 pt-0.5 shadow-sm">
      <span className="text-center text-[30px] font-black italic leading-[32px] tracking-tight text-[#2f5fb3] [text-shadow:2px_2px_0_#b9c4d6]">
        OE
      </span>
      <span className="bg-[#1f4e9c] px-1.5 text-[11px] font-bold leading-[15px] text-white">Ofipapel ERP</span>
    </div>
  )
}

function StatusBar({ text, email }: { text: string; email: string }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const panel = 'flex h-[16px] items-center border border-t-[#a0a0a0] border-l-[#a0a0a0] border-b-white border-r-white px-1.5'
  return (
    <div className="flex h-[22px] flex-none items-center gap-[3px] border-t border-[var(--gw-border-light)] bg-[var(--gw-face)] px-[3px] text-[11px]">
      <span className="min-w-0 flex-1 truncate px-1">{text}</span>
      <span className={`${panel} max-w-[220px] truncate`}>{email}</span>
      <span className={`${panel} w-[48px] justify-center`}>NUM</span>
      <span className={`${panel} w-[64px] justify-center tabular-nums`}>{now.toLocaleTimeString('es-ES')}</span>
    </div>
  )
}

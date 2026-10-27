import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { GwAppIcon, GwWindow } from './gw'
import { MenuBar } from './shell/MenuBar'
import { QuickBar } from './shell/QuickBar'
import { MENUS, isEnabled, windowTitle, type MenuEntry, type MenuItem } from './shell/menus'
import { NexaAsistente } from '../nexa/NexaAsistente'

// Ventana principal con el aspecto de GeminisWin: franja de título, barra de menús,
// barra lateral de accesos rápidos, área MDI gris con la ventana activa y barra de estado.
export function Layout() {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [empresa, setEmpresa] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const [ayuda, setAyuda] = useState<string | null>(null)
  const title = windowTitle(pathname)

  // Al entrar (iniciar sesión o abrir la aplicación en «/») se abre el Panel de Control. Solo al
  // montar: cerrar la ventana deja el escritorio vacío y «/» ya no lo vuelve a abrir.
  useEffect(() => {
    if (pathname === '/') navigate('/resumen', { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    // Compras → Generar Petición: lo abre GenerarPeticionHost (App.tsx), que también recoge CTRL+P.
    else if (i.action === 'generar-peticion') window.dispatchEvent(new Event('gw:generar-peticion'))
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

  // Ayuda del campo con el foco en la barra de estado (como GeminisWin): los campos que la
  // tienen la declaran en data-gw-ayuda («Intro: buscar · Ctrl+Intro: lista ordenada»).
  // Y Ctrl+A fuera de un campo no selecciona toda la página: en un programa de escritorio no pasa.
  useEffect(() => {
    const enCampo = (el: EventTarget | null) =>
      el instanceof HTMLElement && (el.closest('input, textarea, [contenteditable=""], [contenteditable="true"]') != null)
    const alEntrar = (ev: FocusEvent) => {
      const el = ev.target instanceof HTMLElement ? ev.target.closest<HTMLElement>('[data-gw-ayuda]') : null
      setAyuda(el ? `${el.title ? `${el.title.split(' · ')[0]}: ` : ''}${el.dataset.gwAyuda}` : null)
    }
    const alSalir = () => setAyuda(null)
    const teclas = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'a' && !enCampo(ev.target)) {
        const sel = window.getSelection()
        if (!sel || !sel.anchorNode || !(sel.anchorNode.parentElement?.closest('.gw-seleccionable'))) ev.preventDefault()
      }
    }
    document.addEventListener('focusin', alEntrar)
    document.addEventListener('focusout', alSalir)
    document.addEventListener('keydown', teclas)
    return () => {
      document.removeEventListener('focusin', alEntrar)
      document.removeEventListener('focusout', alSalir)
      document.removeEventListener('keydown', teclas)
    }
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
          {/* Entrada / Salida en caja: diálogo suelto sobre el escritorio, sin ventana detrás (como GeminisWin). */}
          {(pathname === '/caja/entrada' || pathname === '/caja/salida') && <Outlet />}
          {pathname !== '/' && pathname !== '/caja/entrada' && pathname !== '/caja/salida' && (
            <GwWindow
              title={title}
              onClose={() => navigate('/')}
              className="absolute inset-1 z-10 [&>div:last-child]:min-h-0 [&>div:last-child]:overflow-auto"
            >
              <Outlet />
            </GwWindow>
          )}
          {/* NEXA: avatar flotante + panel de conversación, disponible en todas las pantallas */}
          <NexaAsistente />
        </div>
      </div>
      <StatusBar text={hint ?? ayuda ?? title} email={session?.user.email ?? ''} />
    </div>
  )
}

function Watermark() {
  return (
    <img
      src={`${import.meta.env.BASE_URL}marca/logo-ofipapel.png`}
      alt="Ofipapel — Suministros de Oficina"
      className="pointer-events-none absolute bottom-4 right-4 z-0 w-[260px] select-none opacity-90"
      draggable={false}
    />
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
    // pr-[92px]: la esquina derecha queda libre para el avatar flotante de NEXA.
    <div className="flex h-[22px] flex-none items-center gap-[3px] border-t border-[var(--gw-border-light)] bg-[var(--gw-face)] pl-[3px] pr-[92px] text-[11px]">
      <span className="min-w-0 flex-1 truncate px-1">{text}</span>
      <span className={`${panel} max-w-[220px] truncate`}>{email}</span>
      <span className={`${panel} w-[48px] justify-center`}>NUM</span>
      <span className={`${panel} w-[64px] justify-center tabular-nums`}>{now.toLocaleTimeString('es-ES')}</span>
    </div>
  )
}

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { MENUS, isEnabled, type MenuEntry, type MenuItem } from './menus'
import { usePermisos } from '../../lib/PermisosContext'
import { LETRA_MENU, letraDeEvento, mnemonicos, posicionLetra } from './mnemonicos'
import { modalAlPulsar, normalizarAtajo, textoAtajo } from '../gw/teclado'

const NOT_AVAILABLE = 'Aún no disponible en el ERP propio'
const SIN_PERMISO = 'Sin permiso: tu grupo de acceso no tiene esta opción'

// Barra de menús con teclado de Windows (tabla en docs/ATAJOS_TECLADO.md):
// - Alt+letra subrayada abre el menú superior; pulsar y soltar Alt (o F10) activa la barra.
// - Con la barra activa: ← → cambian de menú, ↓ / Intro lo abren, la letra lo abre, Esc sale.
// - Con un menú abierto: ↑ ↓ (e Inicio/Fin) recorren las opciones, → abre el submenú o pasa al
//   menú siguiente, ← cierra el submenú o pasa al anterior, Intro/Espacio eligen, la letra
//   subrayada elige la opción, Esc cierra un nivel.
// Mientras la barra está activa o un menú abierto, las teclas son del menú (no llegan a la ficha).

/** Etiqueta con la letra subrayada (siempre visible, como en el Windows clásico de GeminisWin). */
function Rotulo({ label, pos }: { label: string; pos: number | undefined }) {
  if (pos == null || pos < 0) return <>{label}</>
  const chars = [...label]
  return (
    <>
      {chars.slice(0, pos).join('')}
      <u className="underline decoration-1 underline-offset-[2px]">{chars[pos]}</u>
      {chars.slice(pos + 1).join('')}
    </>
  )
}

export function MenuBar({
  onRun,
  onHover,
  activeWindow,
  windows,
}: {
  onRun: (item: MenuItem) => void
  onHover: (text: string | null) => void
  activeWindow: string
  /** Ventanas abiertas en la sesión (menú Ventana: «1 Artículos», «2 Clientes»…). */
  windows?: { label: string; to: string }[]
}) {
  // open: menú superior desplegado. activa: barra activada con el teclado (Alt o F10) sin desplegar.
  // foco: menú superior resaltado. camino[k]: opción resaltada en el nivel k (−1 = ninguna); hay
  // submenú abierto en el nivel k si camino tiene un nivel k+1.
  const [open, setOpen] = useState<number | null>(null)
  const [activa, setActiva] = useState(false)
  const [foco, setFoco] = useState(0)
  const [camino, setCamino] = useState<number[]>([])
  const ref = useRef<HTMLDivElement>(null)
  const { puedeOpcion } = usePermisos()

  const abiertas: MenuItem[] = useMemo(
    () =>
      windows?.length
        ? windows.map((w, n) => ({ label: `${n + 1} ${w.label}`, to: w.to, checked: w.label === activeWindow }))
        : activeWindow
          ? [{ label: `1 ${activeWindow}`, checked: true }]
          : [],
    [windows, activeWindow],
  )
  const itemsDe = (idx: number): MenuEntry[] => {
    const m = MENUS[idx]
    return m.label === 'Ventana' && abiertas.length ? [...m.items, 'sep' as const, ...abiertas] : m.items
  }
  const posTop = useMemo(() => MENUS.map((m) => posicionLetra(m.label, LETRA_MENU[m.label] ?? '')), [])
  const habilitada = (it: MenuItem) => isEnabled(it) && puedeOpcion(it)

  /** Listas de cada nivel abierto según el camino: [nivel 0, submenú, sub-submenú…]. */
  function niveles(idx: number, cam: number[]): MenuEntry[][] {
    const res: MenuEntry[][] = [itemsDe(idx)]
    for (let k = 0; k < cam.length - 1; k++) {
      const it = res[k][cam[k]]
      if (!it || it === 'sep' || !it.children) break
      res.push(it.children)
    }
    return res
  }

  function cerrarTodo() {
    setOpen(null)
    setActiva(false)
    setCamino([])
    onHover(null)
  }
  function abrir(idx: number, resaltarPrimera: boolean) {
    setOpen(idx)
    setFoco(idx)
    setActiva(true)
    setCamino(resaltarPrimera ? [primera(itemsDe(idx))] : [-1])
  }
  function run(i: MenuItem) {
    cerrarTodo()
    onRun(i)
  }

  // Estado actual para los manejadores de teclado (se registran una vez).
  const st = useRef({ open, activa, foco, camino })
  st.current = { open, activa, foco, camino }
  const altSolo = useRef(false)

  // Ratón fuera: cierra.
  useEffect(() => {
    if (open == null && !activa) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cerrarTodo()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activa])

  // Barra de estado: descripción de la opción resaltada con el teclado.
  useEffect(() => {
    if (open == null) return
    const lv = niveles(open, camino)
    const k = Math.min(camino.length, lv.length) - 1
    const it = k >= 0 ? lv[k][camino[k]] : undefined
    if (!it || it === 'sep') return
    const motivo = isEnabled(it) ? SIN_PERMISO : (it.description ?? NOT_AVAILABLE)
    onHover(habilitada(it) ? (it.description ?? it.label) : `${it.label} — ${motivo}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, camino])

  const teclas = useRef<{ captura: (e: KeyboardEvent) => void; burbuja: (e: KeyboardEvent) => void; suelta: (e: KeyboardEvent) => void }>(null!)
  teclas.current = {
    // Fase de captura: Alt solo, F10 y todo lo que se pulse con la barra activa.
    captura(e) {
      if (e.key === 'Alt') {
        altSolo.current = !e.ctrlKey && !e.shiftKey && !e.metaKey && !e.repeat
        return
      }
      altSolo.current = false
      const { open: o, activa: a } = st.current
      if (o == null && !a) {
        if (e.key === 'F10' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && !modalAlPulsar(e)) {
          e.preventDefault()
          e.stopImmediatePropagation()
          setActiva(true)
          setFoco(0)
        }
        return
      }
      // Ctrl/Meta + tecla: cierra el menú y deja pasar el atajo.
      if (e.ctrlKey || e.metaKey) {
        cerrarTodo()
        return
      }
      if (['Shift', 'Control', 'Meta', 'CapsLock'].includes(e.key)) return
      e.preventDefault()
      e.stopImmediatePropagation()
      teclaMenu(e)
    },
    // Fase de burbuja: Alt+letra con la barra inactiva (los diálogos con «&Aceptar» la usan antes).
    burbuja(e) {
      const { open: o, activa: a } = st.current
      if (o != null || a || e.defaultPrevented || !e.altKey || e.ctrlKey || e.metaKey) return
      if (modalAlPulsar(e)) return
      const letra = letraDeEvento(e)
      const idx = MENUS.findIndex((m) => LETRA_MENU[m.label] === letra)
      if (idx < 0) return
      e.preventDefault()
      abrir(idx, true)
    },
    // Soltar Alt sin haber pulsado otra tecla: activa/desactiva la barra (y el navegador no la usa).
    suelta(e) {
      if (e.key !== 'Alt') return
      const solo = altSolo.current
      altSolo.current = false
      if (!solo) return
      e.preventDefault()
      const { open: o, activa: a } = st.current
      if (o != null || a) cerrarTodo()
      else if (!document.querySelector('.fixed.inset-0, [data-gw-modal]')) {
        setActiva(true)
        setFoco(0)
      }
    },
  }

  function primera(items: MenuEntry[]) {
    return items.findIndex((x) => x !== 'sep')
  }
  function mover(items: MenuEntry[], desde: number, paso: number) {
    if (!items.some((x) => x !== 'sep')) return desde
    let i = desde
    for (let n = 0; n < items.length; n++) {
      i = (i + paso + items.length) % items.length
      if (items[i] !== 'sep') return i
    }
    return desde
  }

  function teclaMenu(e: KeyboardEvent) {
    const { open: o, foco: f, camino: cam } = st.current
    const n = MENUS.length
    if (o == null) {
      // Barra activa sin desplegar.
      if (e.key === 'ArrowRight') setFoco((f + 1) % n)
      else if (e.key === 'ArrowLeft') setFoco((f - 1 + n) % n)
      else if (e.key === 'Home') setFoco(0)
      else if (e.key === 'End') setFoco(n - 1)
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') abrir(f, true)
      else if (e.key === 'Escape' || e.key === 'F10' || e.key === 'Tab') cerrarTodo()
      else {
        const idx = MENUS.findIndex((m) => LETRA_MENU[m.label] === letraDeEvento(e))
        if (idx >= 0) abrir(idx, true)
      }
      return
    }
    // Alt+letra con un menú abierto: cambia de menú superior.
    if (e.altKey) {
      const idx = MENUS.findIndex((m) => LETRA_MENU[m.label] === letraDeEvento(e))
      if (idx >= 0) abrir(idx, true)
      return
    }
    const lv = niveles(o, cam)
    const k = Math.min(cam.length, lv.length) - 1
    const items = lv[k]
    const sel = cam[k]
    const actual = sel >= 0 ? items[sel] : undefined
    const conCamino = (nuevo: number) => setCamino([...cam.slice(0, k), nuevo])
    const activar = (i: number) => {
      const it = items[i]
      if (!it || it === 'sep') return
      if (it.children && habilitada(it)) setCamino([...cam.slice(0, k), i, primera(it.children)])
      else if (habilitada(it) || (it.checked && it.to)) run(it)
      else conCamino(i)
    }
    switch (e.key) {
      case 'ArrowDown':
        conCamino(sel < 0 ? primera(items) : mover(items, sel, 1))
        break
      case 'ArrowUp':
        conCamino(sel < 0 ? mover(items, items.length, -1) : mover(items, sel, -1))
        break
      case 'Home':
        conCamino(primera(items))
        break
      case 'End':
        conCamino(mover(items, items.length, -1))
        break
      case 'ArrowRight':
        if (actual && actual !== 'sep' && actual.children && habilitada(actual)) setCamino([...cam.slice(0, k), sel, primera(actual.children)])
        else abrir((o + 1) % n, true)
        break
      case 'ArrowLeft':
        if (k > 0) setCamino(cam.slice(0, k))
        else abrir((o - 1 + n) % n, true)
        break
      case 'Enter':
      case ' ':
        if (sel >= 0) activar(sel)
        break
      case 'Escape':
        if (k > 0) setCamino(cam.slice(0, k))
        else {
          // Como Windows: el primer Esc cierra el desplegable y deja la barra activa.
          setOpen(null)
          setCamino([])
          setFoco(o)
          onHover(null)
        }
        break
      case 'Tab':
      case 'F10':
        cerrarTodo()
        break
      default: {
        const letra = letraDeEvento(e)
        const mn = mnemonicos(items)
        const coinciden = mn.map((m, i) => (m?.letra === letra ? i : -1)).filter((i) => i >= 0)
        if (coinciden.length === 1) activar(coinciden[0])
        else if (coinciden.length > 1) conCamino(coinciden.find((i) => i > sel) ?? coinciden[0])
      }
    }
  }

  useEffect(() => {
    const c = (e: KeyboardEvent) => teclas.current.captura(e)
    const b = (e: KeyboardEvent) => teclas.current.burbuja(e)
    const s = (e: KeyboardEvent) => teclas.current.suelta(e)
    window.addEventListener('keydown', c, true)
    window.addEventListener('keydown', b)
    window.addEventListener('keyup', s, true)
    return () => {
      window.removeEventListener('keydown', c, true)
      window.removeEventListener('keydown', b)
      window.removeEventListener('keyup', s, true)
    }
  }, [])

  return (
    <div
      ref={ref}
      data-gw-menubar
      className="relative z-40 flex h-[20px] select-none items-stretch border-b border-[var(--gw-border-light)] bg-white text-[12px]"
    >
      {MENUS.map((m, idx) => {
        const items = itemsDe(idx)
        const resaltada = open === idx || (activa && open == null && foco === idx)
        return (
          <div key={m.label} className="relative">
            <button
              type="button"
              tabIndex={-1}
              className={`h-full px-[7px] ${open === idx ? 'bg-[#cce8ff]' : resaltada ? 'bg-[#e5f3ff] outline outline-1 -outline-offset-1 outline-[#99d1ff]' : 'hover:bg-[#e5f3ff]'}`}
              title={`Alt+${(LETRA_MENU[m.label] ?? '').toUpperCase()}`}
              onMouseDown={(e) => {
                e.preventDefault()
                if (open === idx) cerrarTodo()
                else abrir(idx, false)
              }}
              onMouseEnter={() => open != null && open !== idx && abrir(idx, false)}
            >
              <Rotulo label={m.label} pos={posTop[idx]} />
            </button>
            {open === idx && (
              <MenuList
                items={items}
                nivel={0}
                camino={camino}
                setCamino={setCamino}
                habilitada={habilitada}
                onRun={run}
                onHover={onHover}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function MenuList({
  items,
  nivel,
  camino,
  setCamino,
  habilitada,
  onRun,
  onHover,
}: {
  items: MenuEntry[]
  nivel: number
  camino: number[]
  setCamino: (c: number[]) => void
  habilitada: (it: MenuItem) => boolean
  onRun: (i: MenuItem) => void
  onHover: (text: string | null) => void
}) {
  const mn = mnemonicos(items)
  const sel = camino[nivel] ?? -1
  const subAbierto = camino.length > nivel + 1
  return (
    <div
      role="menu"
      className={`absolute min-w-[230px] border border-[#a0a0a0] bg-[#f2f2f2] py-[2px] shadow-[2px_2px_4px_rgba(0,0,0,0.3)] ${
        nivel > 0 ? 'left-full top-[-3px]' : 'left-0 top-full'
      }`}
    >
      {items.map((it, i) => {
        if (it === 'sep') return <div key={i} className="mx-[2px] my-[3px] border-t border-[#d7d7d7]" />
        // En gris: opciones aún no construidas y las que el grupo de acceso no permite.
        const construida = isEnabled(it)
        const enabled = habilitada(it)
        const motivo = construida ? SIN_PERMISO : (it.description ?? NOT_AVAILABLE)
        const hasChildren = it.children !== undefined
        const resaltada = sel === i
        return (
          <Fragment key={i}>
            <div
              className="relative"
              onMouseEnter={() => {
                setCamino([...camino.slice(0, nivel), i, ...(hasChildren && enabled ? [-1] : [])])
                onHover(enabled ? (it.description ?? it.label) : `${it.label} — ${motivo}`)
              }}
              onMouseLeave={() => onHover(null)}
            >
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={!enabled && !it.checked}
                title={enabled || it.checked ? undefined : motivo}
                onClick={() => enabled && !hasChildren && onRun(it)}
                className={`flex h-[22px] w-full items-center whitespace-nowrap pl-6 pr-3 text-left ${
                  enabled || it.checked ? 'text-black' : 'text-[#6d6d6d]'
                } ${resaltada ? 'bg-[#91c9f7]' : enabled || it.checked ? 'hover:bg-[#91c9f7]' : ''}`}
              >
                {it.checked && <span className="absolute left-2">✓</span>}
                <span className="flex-1">
                  <Rotulo label={it.label} pos={mn[i]?.pos} />
                </span>
                {/* Rotulado uniforme («CTRL+F12» y «ALT+F6» de menus.ts se ven Ctrl+F12, Alt+F6) */}
                {it.shortcut && <span className="ml-8">{textoAtajo(normalizarAtajo(it.shortcut))}</span>}
                {hasChildren && <span className="ml-6 text-[9px]">▶</span>}
              </button>
              {resaltada && subAbierto && hasChildren && enabled && (
                <MenuList
                  items={it.children!}
                  nivel={nivel + 1}
                  camino={camino}
                  setCamino={setCamino}
                  habilitada={habilitada}
                  onRun={onRun}
                  onHover={onHover}
                />
              )}
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { MENUS, isEnabled, type MenuEntry, type MenuItem } from './menus'
import { usePermisos } from '../../lib/PermisosContext'

const NOT_AVAILABLE = 'Aún no disponible en el ERP propio'
const SIN_PERMISO = 'Sin permiso: tu grupo de acceso no tiene esta opción'

export function MenuBar({
  onRun,
  onHover,
  activeWindow,
}: {
  onRun: (item: MenuItem) => void
  onHover: (text: string | null) => void
  activeWindow: string
}) {
  const [open, setOpen] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open == null) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function run(i: MenuItem) {
    setOpen(null)
    onHover(null)
    onRun(i)
  }

  return (
    <div ref={ref} className="relative z-40 flex h-[20px] select-none items-stretch border-b border-[var(--gw-border-light)] bg-white text-[12px]">
      {MENUS.map((m, idx) => {
        const items =
          m.label === 'Ventana' && activeWindow
            ? [...m.items, 'sep' as const, { label: `1 ${activeWindow}`, checked: true } satisfies MenuItem]
            : m.items
        return (
          <div key={m.label} className="relative">
            <button
              type="button"
              className={`h-full px-[7px] ${open === idx ? 'bg-[#cce8ff]' : 'hover:bg-[#e5f3ff]'}`}
              onMouseDown={(e) => {
                e.preventDefault()
                setOpen(open === idx ? null : idx)
              }}
              onMouseEnter={() => open != null && setOpen(idx)}
            >
              {m.label}
            </button>
            {open === idx && <MenuList items={items} onRun={run} onHover={onHover} />}
          </div>
        )
      })}
    </div>
  )
}

function MenuList({
  items,
  onRun,
  onHover,
  sub,
}: {
  items: MenuEntry[]
  onRun: (i: MenuItem) => void
  onHover: (text: string | null) => void
  sub?: boolean
}) {
  const [openSub, setOpenSub] = useState<number | null>(null)
  const { puedeOpcion } = usePermisos()
  return (
    <div
      className={`absolute min-w-[230px] border border-[#a0a0a0] bg-[#f2f2f2] py-[2px] shadow-[2px_2px_4px_rgba(0,0,0,0.3)] ${
        sub ? 'left-full top-[-3px]' : 'left-0 top-full'
      }`}
    >
      {items.map((it, i) => {
        if (it === 'sep') return <div key={i} className="mx-[2px] my-[3px] border-t border-[#d7d7d7]" />
        // En gris: opciones aún no construidas y las que el grupo de acceso no permite.
        const construida = isEnabled(it)
        const enabled = construida && puedeOpcion(it)
        const motivo = construida ? SIN_PERMISO : NOT_AVAILABLE
        const hasChildren = it.children !== undefined
        return (
          <div
            key={i}
            className="relative"
            onMouseEnter={() => {
              setOpenSub(hasChildren ? i : null)
              onHover(enabled ? (it.description ?? it.label) : `${it.label} — ${motivo}`)
            }}
            onMouseLeave={() => onHover(null)}
          >
            <button
              type="button"
              disabled={!enabled && !it.checked}
              title={enabled || it.checked ? undefined : motivo}
              onClick={() => enabled && !hasChildren && onRun(it)}
              className={`flex h-[22px] w-full items-center whitespace-nowrap pl-6 pr-3 text-left ${
                enabled || it.checked ? 'text-black hover:bg-[#91c9f7]' : 'text-[#6d6d6d]'
              } ${openSub === i && hasChildren ? 'bg-[#91c9f7]' : ''}`}
            >
              {it.checked && <span className="absolute left-2">✓</span>}
              <span className="flex-1">{it.label}</span>
              {it.shortcut && <span className="ml-8">{it.shortcut}</span>}
              {hasChildren && <span className="ml-6 text-[9px]">▶</span>}
            </button>
            {openSub === i && hasChildren && enabled && (
              <MenuList items={it.children!} onRun={onRun} onHover={onHover} sub />
            )}
          </div>
        )
      })}
    </div>
  )
}

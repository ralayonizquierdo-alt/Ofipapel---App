import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GwCheck, GwInput, GwWindow } from '../gw'
import { supabase } from '../../lib/supabase'
import { usePermisos } from '../../lib/PermisosContext'

// Menú Edición (Pegar, Encontrar Ctrl+F, Reemplazar Ctrl+H) y Archivo → Cambiar Grupo de Acceso
// (Ctrl+O). Layout manda las acciones del menú con el evento «gw:edicion»; los atajos de teclado
// los recoge este mismo componente. Todo trabaja sobre la ventana activa ([data-gw-ventana]).

export type AccionEdicion = 'paste' | 'find' | 'replace' | 'cambiar-grupo'
export const EVENTO_EDICION = 'gw:edicion'

export function lanzarEdicion(a: AccionEdicion) {
  window.dispatchEvent(new CustomEvent<AccionEdicion>(EVENTO_EDICION, { detail: a }))
}

type Campo = HTMLInputElement | HTMLTextAreaElement
const TIPOS_TEXTO = new Set(['', 'text', 'search', 'email', 'tel', 'url'])

function esCampoTexto(el: Element | null): el is Campo {
  if (el instanceof HTMLTextAreaElement) return true
  return el instanceof HTMLInputElement && TIPOS_TEXTO.has(el.type)
}
const editable = (el: Campo) => !el.disabled && !el.readOnly && el.offsetParent !== null
const ventana = () => document.querySelector<HTMLElement>('[data-gw-ventana]')

/** Cambia el valor de un campo controlado por React como si se hubiera tecleado. */
function ponerValor(el: Campo, valor: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, valor)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function EdicionHerramientas() {
  const [abierto, setAbierto] = useState<null | 'find' | 'replace' | 'cambiar-grupo'>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  // Último campo de texto con el foco: el menú se lo quita al abrirse, y Pegar va ahí.
  const ultimoCampo = useRef<Campo | null>(null)

  useEffect(() => {
    const alEntrar = (ev: FocusEvent) => {
      const t = ev.target as Element | null
      if (esCampoTexto(t) && !t.closest('[data-gw-edicion]')) ultimoCampo.current = t
    }
    const alAccion = (ev: Event) => ejecutar((ev as CustomEvent<AccionEdicion>).detail)
    const teclas = (ev: KeyboardEvent) => {
      if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return
      const k = ev.key.toLowerCase()
      if (k === 'f' || k === 'h' || k === 'o') {
        ev.preventDefault()
        ejecutar(k === 'f' ? 'find' : k === 'h' ? 'replace' : 'cambiar-grupo')
      }
    }
    document.addEventListener('focusin', alEntrar)
    window.addEventListener(EVENTO_EDICION, alAccion)
    window.addEventListener('keydown', teclas)
    return () => {
      document.removeEventListener('focusin', alEntrar)
      window.removeEventListener(EVENTO_EDICION, alAccion)
      window.removeEventListener('keydown', teclas)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 4000)
    return () => clearTimeout(t)
  }, [aviso])

  async function pegar() {
    const el = ultimoCampo.current
    if (!el || !el.isConnected || !editable(el)) return setAviso('Pegar: pon el cursor en un campo que se pueda escribir.')
    let texto: string
    try {
      texto = await navigator.clipboard.readText()
    } catch {
      return setAviso('El navegador no deja leer el portapapeles: usa Ctrl+V en el campo.')
    }
    el.focus()
    const ini = el.selectionStart ?? el.value.length
    const fin = el.selectionEnd ?? el.value.length
    ponerValor(el, el.value.slice(0, ini) + texto + el.value.slice(fin))
    el.setSelectionRange?.(ini + texto.length, ini + texto.length)
  }

  function ejecutar(a: AccionEdicion) {
    if (a === 'paste') void pegar()
    else setAbierto(a)
  }

  return (
    <>
      {aviso && (
        <div className="fixed bottom-7 left-1/2 z-[60] -translate-x-1/2 border border-[var(--gw-border)] bg-[#ffffe1] px-3 py-1 text-[12px] shadow">{aviso}</div>
      )}
      {abierto === 'find' && <DialogoBuscar onClose={() => setAbierto(null)} />}
      {abierto === 'replace' && <DialogoReemplazar onClose={() => setAbierto(null)} />}
      {abierto === 'cambiar-grupo' && <DialogoGrupo onClose={() => setAbierto(null)} />}
    </>
  )
}

function Dialogo({ titulo, onClose, ancho, children }: { titulo: string; onClose: () => void; ancho: number; children: React.ReactNode }) {
  // Sin velo: como el «Buscar» de Windows, deja ver la rejilla mientras se busca.
  return createPortal(
    <div data-gw-edicion className="fixed right-6 top-24 z-[55]" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title={titulo} onClose={onClose}>
        <div style={{ width: ancho }} className="flex flex-col gap-1.5 text-[13px]">
          {children}
        </div>
      </GwWindow>
    </div>,
    document.body,
  )
}

const btn = 'gw-btn !h-[24px] !w-[120px] !text-[13px]'

/** Edición → Encontrar: busca el texto en las filas visibles de las rejillas de la ventana activa. */
function DialogoBuscar({ onClose }: { onClose: () => void }) {
  const [texto, setTexto] = useState('')
  const [mayus, setMayus] = useState(false)
  const [estado, setEstado] = useState<string>('')
  const ultima = useRef<HTMLTableRowElement | null>(null)

  useEffect(() => () => ultima.current?.classList.remove('gw-encontrada'), [])

  function siguiente() {
    const t = texto.trim()
    if (!t) return setEstado('Escribe el texto a buscar.')
    const raiz = ventana()
    const filas = raiz ? [...raiz.querySelectorAll<HTMLTableRowElement>('table tbody tr')].filter((r) => r.offsetParent !== null && r.cells.length > 0) : []
    if (!filas.length) return setEstado('La ventana activa no tiene ninguna rejilla con filas.')
    const norm = (s: string) => (mayus ? s : s.toLocaleLowerCase('es'))
    const buscado = norm(t)
    const valor = (r: HTMLTableRowElement) =>
      norm([...r.cells].map((c) => [c.innerText, ...[...c.querySelectorAll<HTMLInputElement>('input, textarea, select')].map((i) => i.value)].join(' ')).join(' | '))
    const desde = ultima.current ? filas.indexOf(ultima.current) + 1 : 0
    for (let k = 0; k < filas.length; k++) {
      const i = (desde + k) % filas.length
      if (valor(filas[i]).includes(buscado)) {
        ultima.current?.classList.remove('gw-encontrada')
        const f = filas[i]
        ultima.current = f
        f.classList.add('gw-encontrada')
        f.scrollIntoView({ block: 'nearest' })
        f.click() // las rejillas seleccionan la fila al hacer clic
        const vuelta = desde > 0 && i < desde
        return setEstado(`Fila ${i + 1} de ${filas.length}${vuelta ? ' (se ha vuelto al principio)' : ''}.`)
      }
    }
    setEstado(`No se encuentra «${t}» en las ${filas.length} filas visibles.`)
  }

  return (
    <Dialogo titulo="Buscar" onClose={onClose} ancho={380}>
      <label className="flex items-center gap-2">
        <span className="w-[60px]">Buscar:</span>
        <GwInput
          autoFocus
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            ultima.current = null
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'F3') {
              e.preventDefault()
              siguiente()
            }
          }}
        />
      </label>
      <GwCheck label="Coincidir mayúsculas y minúsculas" checked={mayus} onChange={setMayus} />
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-[12px] text-[#1a4fd0]">{estado}</span>
        <button type="button" className={btn} onClick={siguiente}>
          Buscar siguiente
        </button>
        <button type="button" className={`${btn} !w-[80px]`} onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Dialogo>
  )
}

/**
 * Edición → Reemplazar: solo en los campos de texto que se pueden escribir de la ficha activa,
 * es decir, con la ficha en Modificar o Nuevo. El cambio entra por el mismo camino que si se
 * tecleara (y se guarda o se cancela con la barra de la ficha). No toca rejillas ni campos de
 * solo lectura.
 */
function DialogoReemplazar({ onClose }: { onClose: () => void }) {
  const [buscar, setBuscar] = useState('')
  const [por, setPor] = useState('')
  const [mayus, setMayus] = useState(false)
  const [estado, setEstado] = useState('')

  const campos = () => {
    const raiz = ventana()
    return raiz ? [...raiz.querySelectorAll<Campo>('input, textarea')].filter((el) => esCampoTexto(el) && editable(el) && !el.closest('table')) : []
  }
  const regex = () => new RegExp(escapar(buscar), mayus ? 'g' : 'gi')

  function reemplazarTodo() {
    if (!buscar) return setEstado('Escribe el texto a buscar.')
    const cs = campos()
    if (!cs.length) return setEstado('No hay campos que se puedan modificar: pulsa «Modificar» en la ficha.')
    let n = 0
    let enCampos = 0
    for (const el of cs) {
      const m = el.value.match(regex())
      if (!m) continue
      n += m.length
      enCampos++
      ponerValor(el, el.value.replace(regex(), por))
    }
    setEstado(n ? `${n} reemplazo(s) en ${enCampos} campo(s). Guarda la ficha para conservarlos.` : `No se encuentra «${buscar}» en los campos modificables.`)
  }

  function siguiente() {
    if (!buscar) return setEstado('Escribe el texto a buscar.')
    const cs = campos()
    if (!cs.length) return setEstado('No hay campos que se puedan modificar: pulsa «Modificar» en la ficha.')
    const activo = document.activeElement as Campo | null
    const ini = activo && cs.includes(activo) ? cs.indexOf(activo) : 0
    for (let k = 0; k <= cs.length; k++) {
      const el = cs[(ini + k) % cs.length]
      const desde = k === 0 && el === activo ? (el.selectionEnd ?? 0) : 0
      const r = regex()
      r.lastIndex = desde
      const m = r.exec(el.value)
      if (m) {
        el.focus()
        el.setSelectionRange(m.index, m.index + m[0].length)
        return setEstado('Encontrado: pulsa «Reemplazar» para cambiarlo.')
      }
    }
    setEstado(`No se encuentra «${buscar}» en los campos modificables.`)
  }

  function reemplazarUno() {
    const el = document.activeElement as Campo | null
    const cs = campos()
    if (el && cs.includes(el) && el.selectionStart != null && el.selectionEnd != null) {
      const sel = el.value.slice(el.selectionStart, el.selectionEnd)
      if (sel && (mayus ? sel === buscar : sel.toLocaleLowerCase('es') === buscar.toLocaleLowerCase('es'))) {
        const ini = el.selectionStart
        ponerValor(el, el.value.slice(0, ini) + por + el.value.slice(el.selectionEnd))
        el.setSelectionRange(ini + por.length, ini + por.length)
      }
    }
    siguiente()
  }

  return (
    <Dialogo titulo="Reemplazar" onClose={onClose} ancho={500}>
      <label className="flex items-center gap-2">
        <span className="w-[110px] flex-none">Buscar:</span>
        <GwInput autoFocus value={buscar} onChange={(e) => setBuscar(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && siguiente()} />
      </label>
      <label className="flex items-center gap-2">
        <span className="w-[110px] flex-none">Reemplazar por:</span>
        <GwInput value={por} onChange={(e) => setPor(e.target.value)} />
      </label>
      <GwCheck label="Coincidir mayúsculas y minúsculas" checked={mayus} onChange={setMayus} />
      <span className="text-[11px] text-[#6d6d6d]">Solo en los campos de texto de la ficha en modificación (no en rejillas ni campos bloqueados).</span>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <span className="min-w-0 basis-full text-[12px] text-[#1a4fd0]">{estado}</span>
        <button type="button" className={`${btn} !w-[120px]`} onMouseDown={(e) => e.preventDefault()} onClick={siguiente}>
          Buscar siguiente
        </button>
        <button type="button" className={`${btn} !w-[90px]`} onMouseDown={(e) => e.preventDefault()} onClick={reemplazarUno}>
          Reemplazar
        </button>
        <button type="button" className={`${btn} !w-[130px]`} onMouseDown={(e) => e.preventDefault()} onClick={reemplazarTodo}>
          Reemplazar todo
        </button>
        <button type="button" className={`${btn} !w-[70px]`} onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Dialogo>
  )
}

interface Rol {
  id: number
  codigo: string | null
  nombre: string | null
  es_administrador: boolean | null
}

/**
 * Archivo → Cambiar Grupo de Acceso. En GeminisWin un usuario con varios grupos elige con cuál
 * trabaja; aquí cada empleado tiene un solo grupo (empleado.rol_id), así que lo que se ofrece es
 * que un administrador vea el programa «como» otro grupo para comprobar qué le sale permitido.
 * Solo cambia la interfaz (menús, barra lateral, Panel, NEXA): los datos siguen con su sesión, y
 * como el administrador ya lo puede todo nunca gana permisos.
 */
function DialogoGrupo({ onClose }: { onClose: () => void }) {
  const { realAdmin, verComo, setVerComo } = usePermisos()
  const [roles, setRoles] = useState<Rol[]>([])
  const [elegido, setElegido] = useState<number | null>(verComo?.id ?? null)

  useEffect(() => {
    supabase
      .from('rol')
      .select('id, codigo, nombre, es_administrador')
      .order('nombre')
      .then(({ data }) => setRoles((data ?? []) as Rol[]))
  }, [])

  if (!realAdmin)
    return (
      <Dialogo titulo="Cambiar Grupo de Acceso" onClose={onClose} ancho={380}>
        <p>Cada empleado trabaja con un único grupo de acceso (se elige en Archivo → Empleados → Seguridad).</p>
        <p>Solo un administrador puede ver el programa como otro grupo para comprobar sus permisos.</p>
        <div className="flex justify-end">
          <button type="button" className={`${btn} !w-[90px]`} onClick={onClose} autoFocus>
            Aceptar
          </button>
        </div>
      </Dialogo>
    )

  const rol = roles.find((r) => r.id === elegido)
  return (
    <Dialogo titulo="Cambiar Grupo de Acceso" onClose={onClose} ancho={480}>
      <p>Ver el programa como otro grupo (solo cambia lo que se ve; no da permisos nuevos):</p>
      <div className="max-h-[240px] overflow-auto border border-[var(--gw-border)] bg-white">
        {roles.map((r) => (
          <label key={r.id} className={`flex cursor-default items-center gap-2 px-1.5 py-0.5 ${r.id === elegido ? 'bg-[var(--gw-select)] text-white' : ''}`}>
            <input type="radio" name="gw-grupo" checked={r.id === elegido} onChange={() => setElegido(r.id)} />
            <span className="flex-1 truncate">{r.nombre ?? r.codigo}</span>
            {r.es_administrador && <span className="text-[11px]">(administrador)</span>}
          </label>
        ))}
      </div>
      {verComo && (
        <p className="text-[#b35c00]">
          Ahora estás viendo el programa como <b>{verComo.nombre}</b>.
        </p>
      )}
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          className={`${btn} !w-[150px]`}
          disabled={!rol}
          onClick={() => {
            if (rol) setVerComo({ id: rol.id, nombre: rol.nombre ?? rol.codigo ?? String(rol.id) })
            onClose()
          }}
        >
          Ver como este grupo
        </button>
        <button
          type="button"
          className={`${btn} !w-[150px]`}
          disabled={!verComo}
          onClick={() => {
            setVerComo(null)
            onClose()
          }}
        >
          Volver a mi grupo
        </button>
        <button type="button" className={`${btn} !w-[80px]`} onClick={onClose}>
          Cancelar
        </button>
      </div>
    </Dialogo>
  )
}

/** Aviso en la barra de estado mientras un administrador ve el programa como otro grupo. */
export function IndicadorVerComo() {
  const { verComo, setVerComo } = usePermisos()
  if (!verComo) return null
  return (
    <span className="flex h-[16px] items-center gap-1 border border-[#b35c00] bg-[#fff1d6] px-1.5 text-[#7a3d00]">
      Viendo como: <b className="max-w-[160px] truncate">{verComo.nombre}</b>
      <button type="button" className="ml-1 underline" onClick={() => setVerComo(null)} title="Volver a mi grupo de acceso">
        Volver
      </button>
    </span>
  )
}

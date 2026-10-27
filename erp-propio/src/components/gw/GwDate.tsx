import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

// Fecha al estilo GeminisWin (Visual FoxPro, SET DATE BRITISH): siempre «dd/mm/aaaa» y,
// vacía, «  /  /    ». Se teclea sobre una máscara: los dígitos rellenan los huecos
// saltando las barras, Retroceso borra el anterior y se puede pegar «27/10/2026»,
// «27-10-26» o «271026». Hacia fuera trabaja con ISO 'AAAA-MM-DD' (o null), que es lo que
// guardan las pantallas en Supabase.
//
// Teclas: «+»/«-» suman/restan un día, «H»/«T» ponen hoy, «/» o «.» saltan a la parte
// siguiente, Esc deshace, F4 / Alt+↓ / doble clic abren un calendario.
// Al salir del campo se valida: si la fecha no existe (31/02…) queda en rojo y el valor
// no cambia hasta que se corrija o se pulse Esc.

/** Posición en el texto de cada uno de los 8 huecos (dd mm aaaa). */
const POS = [0, 1, 3, 4, 6, 7, 8, 9]
const VACIO = '        '

const pad2 = (n: number) => String(n).padStart(2, '0')
const isoDe = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const hoyIso = () => isoDe(new Date())

/** 'AAAA-MM-DD…' → huecos 'ddmmaaaa' (o vacío). */
function huecosDeIso(v: string | null | undefined): string {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v) : null
  return m ? `${m[3]}${m[2]}${m[1]}` : VACIO
}

function mostrar(h: string) {
  return `${h.slice(0, 2)}/${h.slice(2, 4)}/${h.slice(4, 8)}`
}

function anio(txt: string) {
  return txt.length === 2 ? 2000 + Number(txt) : Number(txt)
}

/** Interpreta texto libre (pegado, autocompletado…) y devuelve los huecos, o null si no se entiende. */
function huecosDeTexto(raw: string): string | null {
  const t = raw.trim()
  if (t === '' || /^[\s/]*$/.test(t)) return VACIO
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  if (m) return `${m[3]}${m[2]}${m[1]}`
  m = /^(\d{1,2})\s*[/\-.\s]\s*(\d{1,2})\s*[/\-.\s]\s*(\d{2}|\d{4})$/.exec(t)
  if (m) return `${pad2(Number(m[1]))}${pad2(Number(m[2]))}${anio(m[3])}`
  m = /^(\d{1,2})\s*[/\-.\s]\s*(\d{1,2})$/.exec(t)
  if (m) return `${pad2(Number(m[1]))}${pad2(Number(m[2]))}${new Date().getFullYear()}`
  if (/^\d{8}$/.test(t)) return t
  if (/^\d{6}$/.test(t)) return `${t.slice(0, 4)}${anio(t.slice(4))}`
  if (/^\d{4}$/.test(t)) return `${t}${new Date().getFullYear()}`
  // Último recurso: el propio formato de la máscara con huecos («27/1 /2026», etc.).
  m = /^([\d ]{0,2})\/([\d ]{0,2})\/([\d ]{0,4})$/.exec(raw)
  if (m) return `${m[1].padEnd(2)}${m[2].padEnd(2)}${m[3].padEnd(4)}`
  return null
}

type Validacion = { ok: true; iso: string | null } | { ok: false }

function validar(h: string): Validacion {
  if (h.trim() === '') return { ok: true, iso: null }
  const dd = h.slice(0, 2).trim()
  const mm = h.slice(2, 4).trim()
  const yy = h.slice(4, 8)
  if (!/^\d{1,2}$/.test(dd) || !/^\d{1,2}$/.test(mm)) return { ok: false }
  let y: number
  if (/^\d{4}$/.test(yy)) y = Number(yy)
  else if (/^\d{2} {2}$/.test(yy)) y = 2000 + Number(yy.slice(0, 2))
  else if (yy.trim() === '') y = new Date().getFullYear()
  else return { ok: false }
  const d = Number(dd)
  const mo = Number(mm)
  const f = new Date(y, mo - 1, d)
  if (y < 1 || f.getFullYear() !== y || f.getMonth() !== mo - 1 || f.getDate() !== d) return { ok: false }
  return { ok: true, iso: `${String(y).padStart(4, '0')}-${pad2(mo)}-${pad2(d)}` }
}

/** Hueco que queda a partir de una posición del cursor (8 = al final). */
function huecoEn(pos: number) {
  const i = POS.findIndex((p) => p >= pos)
  return i < 0 ? 8 : i
}

function sumarDias(iso: string, dias: number) {
  const [y, m, d] = iso.split('-').map(Number)
  return isoDe(new Date(y, m - 1, d + dias))
}

export interface GwDateProps {
  value: string | null | undefined
  onChange?: (v: string | null) => void
  disabled?: boolean
  readOnly?: boolean
  className?: string
  title?: string
  style?: CSSProperties
  id?: string
  name?: string
  required?: boolean
  autoFocus?: boolean
}

export function GwDate({ value, onChange, disabled, readOnly, className = '', title, style, id, name, required, autoFocus }: GwDateProps) {
  const ro = readOnly || !onChange
  const inputRef = useRef<HTMLInputElement>(null)
  const caret = useRef<number | null>(null)
  // null = no se está editando: se enseña `value` tal cual.
  const [huecos, setHuecos] = useState<string | null>(null)
  const [mal, setMal] = useState(false)
  const [foco, setFoco] = useState(false)
  const [cal, setCal] = useState<{ x: number; y: number } | null>(null)
  const [prev, setPrev] = useState(value)
  if (prev !== value) {
    // Cambio desde fuera (otro registro, Cancelar…): se descarta lo que hubiera a medias.
    setPrev(value)
    if (!foco) {
      setHuecos(null)
      setMal(false)
    }
  }

  useLayoutEffect(() => {
    if (caret.current != null && inputRef.current && document.activeElement === inputRef.current) {
      inputRef.current.setSelectionRange(caret.current, caret.current)
    }
    caret.current = null
  })

  const actual = huecos ?? huecosDeIso(value)
  const valorIso = value ? value.slice(0, 10) : null

  const confirmar = (iso: string | null) => {
    if (iso !== valorIso) onChange?.(iso)
  }

  /** Cambia los huecos mientras se teclea; si ya forman una fecha completa y válida, la confirma. */
  const editar = (h: string, pos: number) => {
    setHuecos(h)
    setMal(false)
    caret.current = pos
    // Si el texto no cambia (un «2» tecleado sobre otro «2») React no vuelve a pintar y el
    // efecto no llega a mover el cursor: se mueve aquí también.
    inputRef.current?.setSelectionRange(pos, pos)
    if (/^\d{8}$/.test(h)) {
      const v = validar(h)
      if (v.ok) confirmar(v.iso)
    }
  }

  const fijar = (iso: string | null) => {
    setHuecos(null)
    setMal(false)
    confirmar(iso)
  }

  const cerrarEdicion = () => {
    if (huecos == null) return true
    const v = validar(huecos)
    if (!v.ok) {
      setMal(true)
      return false
    }
    setHuecos(null)
    setMal(false)
    confirmar(v.iso)
    return true
  }

  const abrirCalendario = () => {
    if (ro || disabled || !inputRef.current) return
    const r = inputRef.current.getBoundingClientRect()
    const alto = 214
    const y = r.bottom + alto > window.innerHeight ? Math.max(0, r.top - alto) : r.bottom
    setCal({ x: Math.min(r.left, window.innerWidth - 196), y })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'F4' || (e.altKey && e.key === 'ArrowDown')) {
      e.preventDefault()
      abrirCalendario()
      return
    }
    if (ro || disabled) return
    if (e.ctrlKey || e.metaKey) return // copiar/pegar/cortar, deshacer… los lleva el navegador
    const el = e.currentTarget
    const ini = el.selectionStart ?? 0
    const fin = el.selectionEnd ?? ini
    const conSeleccion = fin - ini > 1
    const k = e.key

    if (k === 'Escape') {
      if (huecos != null || mal || cal) {
        e.preventDefault()
        e.stopPropagation()
        setHuecos(null)
        setMal(false)
        setCal(null)
      }
      return
    }
    if (k === 'Enter') {
      cerrarEdicion()
      return
    }
    if (/^\d$/.test(k)) {
      e.preventDefault()
      let h = actual
      let s = huecoEn(ini)
      if (conSeleccion) {
        const a = huecoEn(ini)
        const b = huecoEn(fin)
        h = h.slice(0, a) + ' '.repeat(b - a) + h.slice(b)
        s = a
      }
      if (s >= 8) return
      h = h.slice(0, s) + k + h.slice(s + 1)
      editar(h, s + 1 >= 8 ? 10 : POS[s + 1])
      return
    }
    if (k === 'Backspace' || k === 'Delete') {
      e.preventDefault()
      let h = actual
      if (conSeleccion || (k === 'Delete' && fin > ini)) {
        const a = huecoEn(ini)
        const b = huecoEn(fin)
        h = h.slice(0, a) + ' '.repeat(b - a) + h.slice(b)
        editar(h, POS[Math.min(a, 7)])
        return
      }
      if (k === 'Backspace') {
        let s = -1
        for (let i = 7; i >= 0; i--) if (POS[i] < ini) { s = i; break }
        if (s < 0) return
        editar(h.slice(0, s) + ' ' + h.slice(s + 1), POS[s])
      } else {
        const s = huecoEn(ini)
        if (s >= 8) return
        editar(h.slice(0, s) + ' ' + h.slice(s + 1), POS[s])
      }
      return
    }
    if (k === '/' || k === '.' || k === ',') {
      // Salta a la parte siguiente; «1/» deja el día como «01».
      e.preventDefault()
      const s = huecoEn(ini)
      if (s >= 4) return
      const inicio = s < 2 ? 0 : 2
      let h = actual
      const parte = h.slice(inicio, inicio + 2)
      if (/^\d $/.test(parte)) h = h.slice(0, inicio) + '0' + parte[0] + h.slice(inicio + 2)
      editar(h, POS[inicio + 2])
      return
    }
    if (k === '+' || k === '-') {
      e.preventDefault()
      const v = validar(actual)
      const base = v.ok && v.iso ? v.iso : hoyIso()
      fijar(v.ok && v.iso ? sumarDias(base, k === '+' ? 1 : -1) : base)
      return
    }
    if (k === 'h' || k === 'H' || k === 't' || k === 'T') {
      e.preventDefault()
      fijar(hoyIso())
      return
    }
    if (k.length === 1 && !e.altKey) e.preventDefault() // cualquier otra letra no entra en una fecha
  }

  const texto = mostrar(actual)
  const estiloMal: CSSProperties = mal ? { color: '#c00000', borderColor: '#c00000', WebkitTextFillColor: '#c00000' } : {}

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        name={name}
        required={required}
        autoFocus={autoFocus}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        size={10}
        className={`gw-input gw-date ${className}`}
        style={{ ...style, ...estiloMal }}
        title={mal ? 'Fecha no válida (Esc para deshacer)' : title}
        aria-invalid={mal || undefined}
        disabled={disabled}
        readOnly={ro}
        value={texto}
        onFocus={(e) => {
          setFoco(true)
          if (!ro) e.currentTarget.select()
        }}
        onBlur={() => {
          setFoco(false)
          cerrarEdicion()
        }}
        onKeyDown={onKeyDown}
        onDoubleClick={abrirCalendario}
        onPaste={(e) => {
          if (ro || disabled) return
          e.preventDefault()
          const h = huecosDeTexto(e.clipboardData.getData('text'))
          if (h == null) {
            setMal(true)
            return
          }
          const v = validar(h)
          if (v.ok) fijar(v.iso)
          else {
            setHuecos(h)
            setMal(true)
          }
        }}
        onChange={(e) => {
          // Solo llega aquí lo que no pasa por el teclado (autocompletar, cortar, herramientas de prueba…).
          if (ro) return
          const h = huecosDeTexto(e.target.value)
          if (h != null) editar(h, e.target.selectionStart ?? 10)
        }}
      />
      {cal &&
        createPortal(
          <Calendario
            x={cal.x}
            y={cal.y}
            valor={(() => {
              const v = validar(actual)
              return v.ok ? v.iso : null
            })()}
            onElegir={(iso) => {
              setCal(null)
              fijar(iso)
              inputRef.current?.focus()
            }}
            onCerrar={() => setCal(null)}
          />,
          document.body,
        )}
    </>
  )
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function Calendario({
  x,
  y,
  valor,
  onElegir,
  onCerrar,
}: {
  x: number
  y: number
  valor: string | null
  onElegir: (iso: string) => void
  onCerrar: () => void
}) {
  const base = valor ?? hoyIso()
  const [mes, setMes] = useState(() => {
    const [a, m] = base.split('-').map(Number)
    return { a, m: m - 1 }
  })
  const primero = new Date(mes.a, mes.m, 1)
  const desfase = (primero.getDay() + 6) % 7 // semana de lunes a domingo
  const dias = Array.from({ length: 42 }, (_, i) => new Date(mes.a, mes.m, i - desfase + 1))
  const hoy = hoyIso()
  const mover = (n: number) => setMes(({ a, m }) => ({ a: a + Math.floor((m + n) / 12), m: (((m + n) % 12) + 12) % 12 }))

  return (
    <>
      <div className="fixed inset-0 z-[999]" onMouseDown={onCerrar} />
      <div
        className="fixed z-[1000] w-[196px] select-none border border-[#6f6f6f] bg-white p-1 text-[12px] shadow-[2px_2px_6px_rgba(0,0,0,0.35)]"
        style={{ left: x, top: y }}
        onMouseDown={(e) => e.preventDefault()}
      >
        <div className="mb-1 flex items-center justify-between bg-[#dbe6f4] px-1">
          <button type="button" className="px-1 font-bold" onClick={() => mover(-1)} title="Mes anterior">
            ‹
          </button>
          <span className="font-bold">
            {MESES[mes.m]} {mes.a}
          </span>
          <button type="button" className="px-1 font-bold" onClick={() => mover(1)} title="Mes siguiente">
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 text-center">
          {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
            <span key={d} className="text-[#555]">
              {d}
            </span>
          ))}
          {dias.map((d) => {
            const iso = isoDe(d)
            const fuera = d.getMonth() !== mes.m
            const sel = iso === valor
            return (
              <button
                key={iso}
                type="button"
                onClick={() => onElegir(iso)}
                className={`h-[22px] ${fuera ? 'text-[#aaa]' : ''} ${sel ? 'bg-[#0078d7] text-white' : 'hover:bg-[#e5f1fb]'} ${
                  iso === hoy && !sel ? 'outline outline-1 outline-[#0078d7]' : ''
                }`}
              >
                {d.getDate()}
              </button>
            )
          })}
        </div>
        <div className="mt-1 text-right">
          <button type="button" className="gw-btn px-2" onClick={() => onElegir(hoy)}>
            Hoy
          </button>
        </div>
      </div>
    </>
  )
}

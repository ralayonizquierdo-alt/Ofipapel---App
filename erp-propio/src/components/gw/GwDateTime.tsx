import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Calendario } from './GwDate'

// Fecha y hora al estilo GeminisWin: «dd/mm/aaaa hh:mm» sobre una máscara, con las mismas
// teclas que GwDate (dígitos que rellenan huecos saltando separadores, Retroceso/Supr,
// «/» o «.» saltan a la parte siguiente, espacio salta a la hora, «:» a los minutos,
// «+»/«-» suman/restan un día, «H»/«T» ponen ahora, Esc deshace, F4 / Alt+↓ / doble clic
// abren el calendario, que cambia el día sin tocar la hora).
//
// Hacia fuera trabaja con un ISO completo (timestamptz, `toISOString()`) o null: lo que guardan
// las pantallas en Supabase. Los segundos del valor original se conservan.

/** Posición en el texto de cada uno de los 12 huecos (dd mm aaaa hh mm). */
const POS = [0, 1, 3, 4, 6, 7, 8, 9, 11, 12, 14, 15]
const N = POS.length
const LARGO = 16
const VACIO = ' '.repeat(N)

const pad2 = (n: number) => String(n).padStart(2, '0')
const isoDia = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

function huecosDeFecha(d: Date) {
  return `${pad2(d.getDate())}${pad2(d.getMonth() + 1)}${d.getFullYear()}${pad2(d.getHours())}${pad2(d.getMinutes())}`
}

function huecosDeValor(v: string | null | undefined): string {
  if (!v) return VACIO
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? VACIO : huecosDeFecha(d)
}

const mostrar = (h: string) => `${h.slice(0, 2)}/${h.slice(2, 4)}/${h.slice(4, 8)} ${h.slice(8, 10)}:${h.slice(10, 12)}`

/** Texto pegado («27/10/2026 13:05», «27-10-26 9:30», «2026-10-27T13:05»…) → huecos, o null. */
function huecosDeTexto(raw: string): string | null {
  const t = raw.trim()
  if (t === '' || /^[\s/:]*$/.test(t)) return VACIO
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const d = new Date(t.length === 10 ? `${t}T00:00` : t)
    return Number.isNaN(d.getTime()) ? null : huecosDeFecha(d)
  }
  const m = /^(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{2}|\d{4})(?:[\sT]+(\d{1,2})(?:[:.](\d{1,2}))?)?$/.exec(t)
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return `${pad2(Number(m[1]))}${pad2(Number(m[2]))}${y}${pad2(Number(m[4] ?? 0))}${pad2(Number(m[5] ?? 0))}`
  }
  if (/^\d{12}$/.test(t)) return t
  if (/^\d{8}$/.test(t)) return `${t}0000`
  // El propio formato de la máscara con huecos.
  const k = /^([\d ]{2})\/([\d ]{2})\/([\d ]{4}) ([\d ]{2}):([\d ]{2})$/.exec(raw)
  if (k) return k.slice(1).join('')
  return null
}

type Validacion = { ok: true; fecha: Date | null } | { ok: false }

function validar(h: string, segundos: number): Validacion {
  if (h.trim() === '') return { ok: true, fecha: null }
  const dd = h.slice(0, 2).trim()
  const mm = h.slice(2, 4).trim()
  const yy = h.slice(4, 8)
  const hh = h.slice(8, 10).trim()
  const mi = h.slice(10, 12).trim()
  if (!/^\d{1,2}$/.test(dd) || !/^\d{1,2}$/.test(mm)) return { ok: false }
  let y: number
  if (/^\d{4}$/.test(yy)) y = Number(yy)
  else if (/^\d{2} {2}$/.test(yy)) y = 2000 + Number(yy.slice(0, 2))
  else if (yy.trim() === '') y = new Date().getFullYear()
  else return { ok: false }
  if ((hh && !/^\d{1,2}$/.test(hh)) || (mi && !/^\d{1,2}$/.test(mi))) return { ok: false }
  const d = Number(dd)
  const mo = Number(mm)
  const ho = hh ? Number(hh) : 0
  const mn = mi ? Number(mi) : 0
  if (ho > 23 || mn > 59) return { ok: false }
  const f = new Date(y, mo - 1, d, ho, mn, segundos)
  if (y < 1 || f.getFullYear() !== y || f.getMonth() !== mo - 1 || f.getDate() !== d) return { ok: false }
  return { ok: true, fecha: f }
}

/** Hueco que queda a partir de una posición del cursor (N = al final). */
function huecoEn(pos: number) {
  const i = POS.findIndex((p) => p >= pos)
  return i < 0 ? N : i
}

export interface GwDateTimeProps {
  /** ISO (timestamptz) o null. */
  value: string | null | undefined
  /** Recibe el ISO (`toISOString()`) o null. */
  onChange?: (v: string | null) => void
  disabled?: boolean
  readOnly?: boolean
  className?: string
  title?: string
  style?: CSSProperties
  id?: string
  autoFocus?: boolean
}

export function GwDateTime({ value, onChange, disabled, readOnly, className = '', title, style, id, autoFocus }: GwDateTimeProps) {
  const ro = readOnly || !onChange
  const inputRef = useRef<HTMLInputElement>(null)
  const caret = useRef<number | null>(null)
  const [huecos, setHuecos] = useState<string | null>(null)
  const [mal, setMal] = useState(false)
  const [foco, setFoco] = useState(false)
  const [cal, setCal] = useState<{ x: number; y: number } | null>(null)
  const [prev, setPrev] = useState(value)
  if (prev !== value) {
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

  const original = value ? new Date(value) : null
  const segundos = original && !Number.isNaN(original.getTime()) ? original.getSeconds() : 0
  const actual = huecos ?? huecosDeValor(value)

  const confirmar = (f: Date | null) => {
    const iso = f ? f.toISOString() : null
    const antes = original && !Number.isNaN(original.getTime()) ? original.toISOString() : null
    if (iso !== antes) onChange?.(iso)
  }

  const editar = (h: string, pos: number) => {
    setHuecos(h)
    setMal(false)
    caret.current = pos
    inputRef.current?.setSelectionRange(pos, pos)
    if (/^\d{12}$/.test(h)) {
      const v = validar(h, segundos)
      if (v.ok) confirmar(v.fecha)
    }
  }

  const fijar = (f: Date | null) => {
    setHuecos(null)
    setMal(false)
    confirmar(f)
  }

  const cerrarEdicion = () => {
    if (huecos == null) return true
    const v = validar(huecos, segundos)
    if (!v.ok) {
      setMal(true)
      return false
    }
    setHuecos(null)
    setMal(false)
    confirmar(v.fecha)
    return true
  }

  const abrirCalendario = () => {
    if (ro || disabled || !inputRef.current) return
    const r = inputRef.current.getBoundingClientRect()
    const alto = 214
    const y = r.bottom + alto > window.innerHeight ? Math.max(0, r.top - alto) : r.bottom
    setCal({ x: Math.min(r.left, window.innerWidth - 196), y })
  }

  const borrarRango = (h: string, a: number, b: number) => h.slice(0, a) + ' '.repeat(b - a) + h.slice(b)

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'F4' || (e.altKey && e.key === 'ArrowDown')) {
      e.preventDefault()
      abrirCalendario()
      return
    }
    if (ro || disabled) return
    if (e.ctrlKey || e.metaKey) return
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
        h = borrarRango(h, a, huecoEn(fin))
        s = a
      }
      if (s >= N) return
      h = h.slice(0, s) + k + h.slice(s + 1)
      editar(h, s + 1 >= N ? LARGO : POS[s + 1])
      return
    }
    if (k === 'Backspace' || k === 'Delete') {
      e.preventDefault()
      const h = actual
      if (conSeleccion || (k === 'Delete' && fin > ini)) {
        const a = huecoEn(ini)
        editar(borrarRango(h, a, huecoEn(fin)), POS[Math.min(a, N - 1)])
        return
      }
      if (k === 'Backspace') {
        let s = -1
        for (let i = N - 1; i >= 0; i--)
          if (POS[i] < ini) {
            s = i
            break
          }
        if (s < 0) return
        editar(h.slice(0, s) + ' ' + h.slice(s + 1), POS[s])
      } else {
        const s = huecoEn(ini)
        if (s >= N) return
        editar(h.slice(0, s) + ' ' + h.slice(s + 1), POS[s])
      }
      return
    }
    // Saltar a la parte siguiente: «/» «.» «,» (día → mes → año → hora → minutos), espacio
    // (a la hora) y «:» (a los minutos). «1/» deja el día como «01»; «9:» la hora como «09».
    if (k === '/' || k === '.' || k === ',' || k === ' ' || k === ':') {
      e.preventDefault()
      const s = huecoEn(ini)
      const partes = [0, 2, 4, 8, 10, N] // inicio de cada parte (el año tiene 4 huecos)
      let p = partes.findIndex((x, i) => s >= x && s < partes[i + 1])
      if (p < 0) p = 4
      let destino = k === ' ' ? 3 : k === ':' ? 4 : p + 1
      if (destino <= p) destino = p + 1
      if (destino >= 5) return
      let h = actual
      const ini2 = partes[p]
      const parte = h.slice(ini2, ini2 + 2)
      if (p !== 2 && /^\d $/.test(parte)) h = h.slice(0, ini2) + '0' + parte[0] + h.slice(ini2 + 2)
      editar(h, POS[partes[destino]])
      return
    }
    if (k === '+' || k === '-') {
      e.preventDefault()
      const v = validar(actual, segundos)
      if (v.ok && v.fecha) {
        const f = new Date(v.fecha)
        f.setDate(f.getDate() + (k === '+' ? 1 : -1))
        fijar(f)
      } else fijar(new Date())
      return
    }
    if (k === 'h' || k === 'H' || k === 't' || k === 'T') {
      e.preventDefault()
      fijar(new Date())
      return
    }
    if (k.length === 1 && !e.altKey) e.preventDefault()
  }

  const estiloMal: CSSProperties = mal ? { color: '#c00000', borderColor: '#c00000', WebkitTextFillColor: '#c00000' } : {}
  const valCal = validar(actual, segundos)

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        autoFocus={autoFocus}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        size={16}
        className={`gw-input gw-date ${className}`}
        style={{ ...style, ...estiloMal }}
        title={mal ? 'Fecha u hora no válida (Esc para deshacer)' : title}
        aria-invalid={mal || undefined}
        disabled={disabled}
        readOnly={ro}
        value={mostrar(actual)}
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
          const v = validar(h, segundos)
          if (v.ok) fijar(v.fecha)
          else {
            setHuecos(h)
            setMal(true)
          }
        }}
        onChange={(e) => {
          if (ro) return
          const h = huecosDeTexto(e.target.value)
          if (h != null) editar(h, e.target.selectionStart ?? LARGO)
        }}
      />
      {cal &&
        createPortal(
          <Calendario
            x={cal.x}
            y={cal.y}
            valor={valCal.ok && valCal.fecha ? isoDia(valCal.fecha) : null}
            onElegir={(iso) => {
              setCal(null)
              // Cambia el día y conserva la hora (la actual si no había ninguna).
              const [y, m, d] = iso.split('-').map(Number)
              const base = valCal.ok && valCal.fecha ? valCal.fecha : new Date()
              fijar(new Date(y, m - 1, d, base.getHours(), base.getMinutes(), valCal.ok && valCal.fecha ? segundos : base.getSeconds()))
              inputRef.current?.focus()
            }}
            onCerrar={() => setCal(null)}
          />,
          document.body,
        )}
    </>
  )
}

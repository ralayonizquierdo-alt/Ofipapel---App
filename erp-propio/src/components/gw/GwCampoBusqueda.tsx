import { useState, type InputHTMLAttributes } from 'react'

/**
 * Campo de búsqueda de una ficha, como en GeminisWin:
 *
 * - `editable` (alta o modificación): un campo normal que cambia el registro con `onChange`.
 * - Sin `editable` (consulta): se puede escribir igualmente, pero lo escrito NO modifica el
 *   registro: es lo que se busca. Al pulsar Intro (o salir del campo) se llama a `onBuscar`
 *   con el texto; después el campo vuelve a mostrar el valor del registro (el de la ficha a la
 *   que se haya saltado, o el anterior si no se encontró). Esc deshace lo escrito.
 * - Ctrl+Intro, en cualquier modo, llama a `onLista` (la lista ordenada por este campo) con
 *   el texto escrito, o null si no se ha escrito nada distinto del valor del registro.
 * - `disabled`: bloqueado del todo (p. ej. el código mientras se modifica la ficha).
 *
 * La ayuda («Intro: buscar · Ctrl+Intro: lista ordenada») sale en la barra de estado al
 * entrar en el campo y en el tooltip, detrás del nombre del campo de GeminisWin.
 */
export function GwCampoBusqueda({
  value,
  editable = false,
  disabled,
  onChange,
  onBuscar,
  onLista,
  title,
  className = '',
  ...resto
}: {
  value: string | null | undefined
  editable?: boolean
  disabled?: boolean
  onChange?: (v: string) => void
  onBuscar?: (texto: string) => void | Promise<unknown>
  onLista?: (texto: string | null) => void
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'disabled'>) {
  const [texto, setTexto] = useState<string | null>(null)
  const actual = value ?? ''
  const buscable = !editable && !disabled && (!!onBuscar || !!onLista)
  const mostrado = editable ? actual : (texto ?? actual)

  const partes = [
    buscable && onBuscar ? 'Intro: buscar' : null,
    !disabled && onLista ? 'Ctrl+Intro: lista ordenada' : null,
  ].filter(Boolean)
  const ayuda = partes.join(' · ')

  function lanzar() {
    if (!buscable || texto == null) return
    const t = texto.trim()
    setTexto(null)
    if (t && t !== actual.trim()) void onBuscar?.(t)
  }

  return (
    <input
      {...resto}
      className={`gw-input ${className}`}
      value={mostrado}
      disabled={disabled || (!editable && !buscable)}
      readOnly={!editable && buscable && !onBuscar}
      title={[title, ayuda].filter(Boolean).join(' · ') || undefined}
      data-gw-ayuda={ayuda || undefined}
      onChange={(e) => (editable ? onChange?.(e.target.value) : setTexto(e.target.value))}
      onBlur={(e) => {
        lanzar()
        resto.onBlur?.(e)
      }}
      data-gw-intro="avanza"
      onKeyDown={(e) => {
        resto.onKeyDown?.(e)
        if (e.defaultPrevented) return
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          if (!onLista || disabled) return
          e.preventDefault()
          const escrito = editable ? actual.trim() : (texto ?? '').trim()
          setTexto(null)
          onLista(escrito && (editable || escrito !== actual.trim()) ? escrito : null)
          return
        }
        if (!buscable) return
        if (e.key === 'Enter') {
          e.preventDefault()
          lanzar()
        } else if (e.key === 'Escape' && texto != null) {
          e.preventDefault()
          e.stopPropagation()
          setTexto(null)
        }
      }}
    />
  )
}

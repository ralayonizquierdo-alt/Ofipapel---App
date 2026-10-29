import { useCallback, useLayoutEffect, useRef, type MouseEvent } from 'react'

/**
 * Selecciona todo el contenido al entrar en un campo numérico (como `SelectOnEntry` de FoxPro).
 *
 * Los números se muestran formateados («1,000») y al entrar pasan a texto en bruto («1»). Ese
 * cambio de valor hace que el navegador pierda la selección que pone al entrar con Tab (o la de
 * Playwright al rellenar), y lo tecleado se añadía detrás: «2» en una cantidad 1 daba 12.
 *
 * `editando` es el texto en edición del campo (null fuera de él). Al entrar, llamar a `entrar()`
 * antes de fijarlo; tras pintarse el valor en bruto se selecciona todo. Con `seleccionAlPulsar` /
 * `seleccionAlSoltar` el clic que da el foco tampoco la deshace; un clic con el campo ya
 * enfocado coloca el cursor como siempre.
 */
export function useSeleccionAlEntrar(editando: string | null) {
  const ref = useRef<HTMLInputElement>(null)
  const pendiente = useRef(false)
  useLayoutEffect(() => {
    if (editando != null && pendiente.current) {
      pendiente.current = false
      ref.current?.select()
    }
  }, [editando])
  const campo = useCallback((el: HTMLInputElement | null) => {
    ref.current = el
  }, [])
  return {
    /** Para el `ref` del campo. */
    campo,
    entrar: () => {
      pendiente.current = true
    },
  }
}

// `onMouseDown` / `onMouseUp` del campo: el clic que da el foco no deshace la selección de entrada.
// La marca va en el propio campo (no en un ref) para poder pasarlos tal cual en el render.
export function seleccionAlPulsar(e: MouseEvent<HTMLInputElement>) {
  const el = e.currentTarget
  if (document.activeElement !== el) el.dataset.gwClicEntrada = '1'
  else delete el.dataset.gwClicEntrada
}

export function seleccionAlSoltar(e: MouseEvent<HTMLInputElement>) {
  const el = e.currentTarget
  if (el.dataset.gwClicEntrada !== '1') return
  delete el.dataset.gwClicEntrada
  e.preventDefault()
  el.select()
}

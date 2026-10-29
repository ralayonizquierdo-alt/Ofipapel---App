import { useCallback, useLayoutEffect, useRef, type MouseEvent } from 'react'

/**
 * Selecciona todo el contenido de un campo numérico mientras no se ha tecleado nada en él
 * (como `SelectOnEntry` de FoxPro): lo que se escribe sustituye al valor.
 *
 * Los números se muestran formateados («1,000») y al entrar pasan a texto en bruto («1»). Ese
 * cambio de valor hace que el navegador pierda la selección que pone al entrar con Tab (o la de
 * Playwright al rellenar), y lo tecleado se añadía detrás: «2» en una cantidad 1 daba 12. Lo
 * mismo si el valor cambia con el campo enfocado (llega el precio del artículo): se vuelve a
 * seleccionar.
 *
 * `sinTeclear` es true con el campo enfocado y aún sin teclear; `valor`, el texto que muestra.
 * Devuelve el `ref` (de función) del campo. Con `seleccionAlPulsar` / `seleccionAlSoltar` el clic
 * que da el foco tampoco deshace la selección; un clic con el campo ya enfocado coloca el cursor
 * como siempre.
 */
export function useSeleccionAlEntrar(sinTeclear: boolean, valor: string) {
  const ref = useRef<HTMLInputElement | null>(null)
  useLayoutEffect(() => {
    if (sinTeclear && ref.current && document.activeElement === ref.current) ref.current.select()
  }, [sinTeclear, valor])
  return useCallback((el: HTMLInputElement | null) => {
    ref.current = el
  }, [])
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

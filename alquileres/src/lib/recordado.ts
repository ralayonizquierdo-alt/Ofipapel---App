import { useEffect, useRef, useState } from 'react'

/**
 * Un `useState` que se acuerda de lo último que se eligió.
 *
 * «Prefiero que las aplicaciones se abran en la última que estuviste, siempre
 * volver a la última pestaña en la que hemos estado» (propietario, 26/10/2026):
 * se entraba en «Cobros según reserva», se iba uno a mirar otra cosa, y al
 * volver la pantalla estaba otra vez en «Trimestres (4 tablas)».
 *
 * Se guarda en el navegador de cada uno (`localStorage`), no en Firestore: es
 * una comodidad de quien está mirando, no un dato del negocio, y Luis y Rober
 * no tienen por qué compartir en qué pestaña se quedaron. Si el navegador no
 * deja guardar (ventana privada, permisos), sigue funcionando como un
 * `useState` normal: se pierde al salir y no se rompe nada.
 */
export function useRecordado<T>(clave: string, inicial: T): [T, (v: T) => void] {
  const k = `alquileres:${clave}`
  const [valor, setValor] = useState<T>(() => {
    try {
      const guardado = localStorage.getItem(k)
      return guardado === null ? inicial : (JSON.parse(guardado) as T)
    } catch { return inicial }
  })
  useEffect(() => {
    try { localStorage.setItem(k, JSON.stringify(valor)) } catch { /* sin sitio o sin permiso: da igual */ }
  }, [k, valor])
  return [valor, setValor]
}

/**
 * Vuelve a la misma altura de la pantalla al regresar a ella.
 *
 * Se miraba noviembre en Cobros, se iba al Dashboard y al volver la pantalla
 * estaba arriba del todo, en enero y febrero (Luis, 11/11/2026: «creo que esto
 * lo habíamos arreglado» — se arregló la vista elegida, no la altura). Se
 * guarda mientras se desplaza y se recupera al volver, esperando a que la
 * tabla tenga ya altura para llegar. Es de esta sesión del navegador
 * (`sessionStorage`): al abrir la app otro día, empieza arriba.
 *
 * Devuelve una `ref` para cualquier elemento de la pantalla; lo que se
 * desplaza es el `<main>` que lo contiene.
 */
export function useVuelveALaAltura<T extends HTMLElement>(clave: string) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const main = ref.current?.closest('main')
    if (!main) return
    const k = `alquileres:altura:${clave}`
    let guardada = 0
    try { guardada = Number(sessionStorage.getItem(k)) || 0 } catch { /* sin permiso: empieza arriba */ }
    let intentos = 0
    let marco = 0
    const intenta = () => {
      if (main.scrollHeight - main.clientHeight >= guardada || intentos++ > 120) {
        main.scrollTop = guardada
        return
      }
      marco = requestAnimationFrame(intenta)
    }
    if (guardada > 0) intenta()
    const alDesplazar = () => {
      try { sessionStorage.setItem(k, String(Math.round(main.scrollTop))) } catch { /* da igual */ }
    }
    main.addEventListener('scroll', alDesplazar, { passive: true })
    return () => { cancelAnimationFrame(marco); main.removeEventListener('scroll', alDesplazar) }
  }, [clave])
  return ref
}

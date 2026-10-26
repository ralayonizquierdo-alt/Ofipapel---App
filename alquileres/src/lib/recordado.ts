import { useEffect, useState } from 'react'

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

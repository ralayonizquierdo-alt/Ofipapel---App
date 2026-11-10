import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Volver atrás paso a paso, a la pantalla tal como estaba (Luis, 06/11/2026:
 * «no hay medios para volver… bajar escalonadamente así atrás según por donde
 * subiste… en todas las pantallas»).
 *
 * El botón «← Volver» (`components/BotonVolver.tsx`) hace lo mismo que la
 * flecha de atrás del navegador. Para que al volver la pantalla salga como se
 * dejó —el año y el apartamento que se miraban, la ficha que estaba abierta—,
 * cada pantalla apunta esas cosas en la propia entrada del historial con
 * `useEnHistorial`, y las recupera cuando se vuelve a ella.
 */

/** Lo que el enrutador guarda en cada entrada del historial; lo nuestro va en `usr`. */
type EntradaHistorial = { usr?: Record<string, unknown> | null } & Record<string, unknown>

/**
 * Guarda `valor` en la entrada del historial en la que se está y, al volver a
 * ella con «← Volver» (o la flecha del navegador), lo devuelve con `aplicar`.
 *
 * Se escribe directamente sobre la entrada actual, sin navegar: así no se crea
 * un paso nuevo cada vez que se cambia un filtro.
 */
export function useEnHistorial<T>(clave: string, valor: T, aplicar: (v: T) => void) {
  const location = useLocation()
  const tipo = useNavigationType()
  const aplicarRef = useRef(aplicar)
  useEffect(() => { aplicarRef.current = aplicar })

  // Al llegar volviendo atrás: lo que se dejó apuntado en esta entrada.
  useEffect(() => {
    if (tipo !== 'POP') return
    const guardado = (location.state as Record<string, unknown> | null)?.[clave]
    if (guardado !== undefined) aplicarRef.current(guardado as T)
  }, [location.key, tipo, clave, location.state])

  // Mientras se está aquí: se va apuntando lo que hay.
  const texto = JSON.stringify(valor ?? null)
  useEffect(() => {
    const actual = (window.history.state ?? {}) as EntradaHistorial
    const usr = { ...(actual.usr ?? {}), [clave]: JSON.parse(texto) }
    window.history.replaceState({ ...actual, usr }, '')
  }, [clave, texto])
}

/** El nombre de cada pantalla, para el botón: «← Volver a Cobros». */
export const NOMBRE_PANTALLA: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/planning': 'Planning',
  '/edificios': 'Edificios',
  '/reservas': 'Reservas',
  '/precios': 'Precios',
  '/cobros': 'Cobros',
  '/gastos': 'Gastos',
  '/analitica': 'Analítica',
  '/asesoria': 'Asesoría',
  '/registro': 'Registro',
  '/config': 'Apartamentos',
  '/subir': 'Subir reservas y gastos',
  '/limpieza': 'Subir limpieza',
}

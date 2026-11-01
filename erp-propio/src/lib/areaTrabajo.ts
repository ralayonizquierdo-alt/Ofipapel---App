// Áreas de trabajo (Luis, 01/11/2026): al entrar en el ERP se elige el área con 4 botones grandes
// (Gestión, Contabilidad, Web y AVATAR = todo) y después se pide la clave. Es el mismo ERP y la misma
// base de datos: el área solo decide qué menús se ven y qué pantallas se abren, para que los
// contables trabajen con «su programa» sin ver la gestión. Lo que cada uno puede usar dentro de un
// área lo siguen decidiendo los Grupos de Acceso; si no tiene nada de esa área, no entra en ella.
// El área elegida vale solo mientras el programa está abierto (en memoria): cada vez que se abre o
// se vuelve a entrar salen otra vez los botones (Luis: «cuando salgas y vuelvas, a los 3 botones»).
// Cambiar de área recarga la página y pasa el área por un aviso de un solo uso (sessionStorage).

import { MENUS, type MenuEntry, type MenuItem, type TopMenu } from '../components/shell/menus'

export type Area = 'gestion' | 'contabilidad' | 'web' | 'avatar'

const CLAVE = 'erp.area'
const COMUNES = ['Archivo', 'Edición', 'Ventana', '?']

/** Menús propios de cada área (además de Archivo, Edición, Ventana y ?). null = todos. */
const PROPIOS: Record<Area, string[] | null> = {
  gestion: MENUS.map((m) => m.label).filter((l) => !COMUNES.includes(l) && l !== 'Contabilidad' && l !== 'Web'),
  contabilidad: ['Contabilidad'],
  web: ['Web'],
  avatar: null,
}

const PENDIENTE = 'erp.area.pendiente'
const valida = (a: string | null): a is Area => a === 'gestion' || a === 'contabilidad' || a === 'web' || a === 'avatar'

// Área de esta carga del programa: solo la que se acaba de elegir al cambiar de área (antes de recargar).
let enMemoria: Area | null = (() => {
  try {
    const a = sessionStorage.getItem(PENDIENTE)
    sessionStorage.removeItem(PENDIENTE)
    return valida(a) ? a : null
  } catch {
    return null
  }
})()

/** Área elegida en esta apertura del programa, o null si todavía no se ha elegido. */
export const areaElegida = (): Area | null => enMemoria

export const areaActual = (): Area => enMemoria ?? 'avatar'

/** Elige el área (al entrar). Se recuerda solo para marcarla en el selector la próxima vez. */
export function fijarArea(a: Area) {
  enMemoria = a
  try {
    localStorage.setItem(CLAVE, a)
  } catch {
    /* sin almacenamiento */
  }
}

/** Cambia de área con el programa abierto: recarga la página y entra directamente en la nueva. */
export function cambiarAreaYRecargar(a: Area) {
  fijarArea(a)
  try {
    sessionStorage.setItem(PENDIENTE, a)
  } catch {
    /* sin almacenamiento: tras recargar volverá a preguntar */
  }
  window.location.assign(import.meta.env.BASE_URL)
}

/** Última área elegida en este ordenador (para marcarla en el selector). */
export function ultimaArea(): Area | null {
  try {
    const a = localStorage.getItem(CLAVE)
    return valida(a) ? a : null
  } catch {
    return null
  }
}

/** Menús que se ven en el área. */
export function menusDeArea(a: Area): TopMenu[] {
  const propios = PROPIOS[a]
  return propios ? MENUS.filter((m) => COMUNES.includes(m.label) || propios.includes(m.label)) : MENUS
}

function opciones(entradas: MenuEntry[]): MenuItem[] {
  return entradas.flatMap((e) => (e === 'sep' ? [] : [e, ...(e.children ? opciones(e.children) : [])]))
}

/** Opciones con pantalla de los menús propios del área (sin los comunes). */
export function opcionesPropias(a: Area): MenuItem[] {
  const propios = PROPIOS[a]
  const menus = propios ? MENUS.filter((m) => propios.includes(m.label)) : MENUS.filter((m) => !COMUNES.includes(m.label))
  return opciones(menus.flatMap((m) => m.items)).filter((i) => i.to)
}

const rutaDe = (to: string) => to.split('?')[0]

/** ¿Se puede abrir esta pantalla en el área? (las de sus menús, incluidos los comunes). */
export function rutaEnArea(a: Area, pathname: string): boolean {
  if (a === 'avatar' || pathname === '/' || pathname === '/resumen' || pathname === '/cambiar-clave') return true
  return opciones(menusDeArea(a).flatMap((m) => m.items))
    .filter((i) => i.to)
    .some((i) => {
      const r = rutaDe(i.to!)
      // /contabilidad/diario abre todo /contabilidad/…; /web/x todo /web/…
      const raiz = '/' + r.split('/')[1]
      return pathname === r || pathname.startsWith(r + '/') || (raiz !== '/' && ['/contabilidad', '/web'].includes(raiz) && pathname.startsWith(raiz + '/'))
    })
}

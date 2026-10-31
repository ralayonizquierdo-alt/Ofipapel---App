// Áreas de trabajo (Luis, 01/11/2026): al entrar en el ERP se elige el área con 4 botones grandes
// (Gestión, Contabilidad, Web y AVATAR = todo) y después se pide la clave. Es el mismo ERP y la misma
// base de datos: el área solo decide qué menús se ven y qué pantallas se abren, para que los
// contables trabajen con «su programa» sin ver la gestión. Lo que cada uno puede usar dentro de un
// área lo siguen decidiendo los Grupos de Acceso; si no tiene nada de esa área, no entra en ella.
// El área elegida vale para esta sesión del navegador (pestaña); cambiar de área recarga.

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

/** Área elegida en esta sesión del navegador, o null si todavía no se ha elegido. */
export function areaElegida(): Area | null {
  try {
    const a = sessionStorage.getItem(CLAVE)
    if (a === 'gestion' || a === 'contabilidad' || a === 'web' || a === 'avatar') return a
  } catch {
    return 'avatar' // sin almacenamiento: todo, sin preguntar
  }
  return null
}

export const areaActual = (): Area => areaElegida() ?? 'avatar'

export function fijarArea(a: Area) {
  try {
    sessionStorage.setItem(CLAVE, a)
    localStorage.setItem(CLAVE, a)
  } catch {
    /* sin almacenamiento */
  }
}

/** Última área elegida en este ordenador (para marcarla en el selector). */
export function ultimaArea(): Area | null {
  try {
    const a = localStorage.getItem(CLAVE)
    return a === 'gestion' || a === 'contabilidad' || a === 'web' || a === 'avatar' ? a : null
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

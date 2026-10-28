// Permisos por grupo de acceso, como en GeminisWin: cada empleado pertenece a un grupo (tabla
// rol) y solo puede usar las opciones de menú marcadas para su grupo (rol_permiso); las demás
// salen en gris. Los grupos administradores (rol.es_administrador) lo pueden todo siempre.
//
// Cada opción de menú construida es un permiso (tabla permiso, tipo 'menu'). Su código es
// estable y sale de la propia opción:
//   - opción con ruta  → la ruta sin «/nuevo» ni «?…»  (p. ej. «/caja/movimientos»)
//   - opción con acción → «accion:<acción>»            (p. ej. «accion:generar-peticion»)
// Un permiso de ruta da acceso a esa ruta y a todo lo que cuelga de ella («/clientes» abre
// también «/clientes/00123» y «/clientes/lista»).
//
// La misma comprobación de rutas está copiada en la Edge Function «nexa» (abrir_pantalla):
// si cambias LIBRES o REDIRECCIONES, cámbialas también allí.

import { MENUS, type MenuEntry, type MenuItem } from '../components/shell/menus'

/** Rutas que cualquier empleado con sesión puede abrir, tenga o no grupo. */
export const LIBRES = ['/', '/resumen', '/cambiar-clave']

/**
 * Rutas que solo redirigen a otra pantalla: se permiten si se puede abrir el destino. Y quien
 * tiene el permiso de la ruta de la izquierda puede abrir también el destino (Apertura de Caja
 * abre la ventana de Aperturas y Cierres, como en GeminisWin).
 */
export const REDIRECCIONES: Record<string, string> = {
  '/caja': '/caja/aperturas',
  '/caja/apertura': '/caja/aperturas',
  '/caja/cierre': '/caja/aperturas',
  '/compras': '/pedidos-proveedor',
  '/pagos': '/pagos-proveedor',
  '/stock': '/almacen/listados-articulos',
}

/** Acciones de menú que no necesitan permiso (salir, ventana, edición). */
const ACCIONES_LIBRES = new Set(['signout', 'close-window', 'undo', 'redo', 'cut', 'copy', 'delete', 'selectAll', 'hide-window', 'show-all', 'cycle-window', 'about', 'cambio-tienda', 'seleccionar-periodo', 'eliminar-temporales', 'paste', 'find', 'replace', 'cambiar-grupo', 'preparar-pagina', 'presentacion-preliminar', 'elegir-impresora'])

export interface OpcionPermiso {
  codigo: string
  /** Menú superior (Archivo, Ventas…): se guarda como permiso.modulo. */
  modulo: string
  /** Etiqueta con su camino dentro del menú: «Listados › List. Ventas › List. de Ventas». */
  descripcion: string
  /** Etiqueta sola, para el árbol de la pantalla de grupos. */
  etiqueta: string
  /** Nivel de anidamiento dentro del menú (0 = opción directa). */
  nivel: number
  /** Submenú en el que está («Listados › List. Ventas»), vacío si es opción directa. */
  grupo: string
}

/** Código de permiso de una opción de menú, o null si no necesita permiso. */
export function codigoPermiso(i: Pick<MenuItem, 'to' | 'action'>): string | null {
  if (i.to) {
    const ruta = i.to.split('?')[0].replace(/\/nuevo$/, '')
    return LIBRES.includes(ruta) ? null : ruta
  }
  if (i.action && !ACCIONES_LIBRES.has(i.action)) return `accion:${i.action}`
  return null
}

/** Todas las opciones de menú construidas, en el orden del menú, con su código de permiso. */
export function catalogoPermisos(menus = MENUS): OpcionPermiso[] {
  const out: OpcionPermiso[] = []
  const vistos = new Set<string>()
  const recorrer = (modulo: string, entradas: MenuEntry[], camino: string[]) => {
    for (const e of entradas) {
      if (e === 'sep') continue
      const codigo = codigoPermiso(e)
      if (codigo && !vistos.has(codigo)) {
        vistos.add(codigo)
        out.push({ codigo, modulo, descripcion: [...camino, e.label].join(' › '), etiqueta: e.label, nivel: camino.length, grupo: camino.join(' › ') })
      }
      if (e.children) recorrer(modulo, e.children, [...camino, e.label])
    }
  }
  for (const m of menus) recorrer(m.label, m.items, [])
  return out
}

const cubre = (codigo: string, ruta: string) => ruta === codigo || ruta.startsWith(codigo + '/')

/** ¿Puede abrir esta ruta quien tiene estos permisos? (ruta sin «?…»). */
export function rutaPermitida(rutaCompleta: string, codigos: ReadonlySet<string>, admin: boolean): boolean {
  if (admin) return true
  const ruta = (rutaCompleta.split(/[?#]/)[0] || '/').replace(/(.)\/+$/, '$1')
  if (LIBRES.includes(ruta)) return true
  for (const c of codigos) {
    if (!c.startsWith('/')) continue
    if (cubre(c, ruta)) return true
    const destino = REDIRECCIONES[c]
    if (destino && cubre(destino, ruta)) return true
  }
  const destino = REDIRECCIONES[ruta]
  return destino ? rutaPermitida(destino, codigos, admin) : false
}

/** ¿Puede usar esta opción de menú? Las que tienen submenú, si puede alguna de sus hijas. */
export function opcionPermitida(i: MenuItem, codigos: ReadonlySet<string>, admin: boolean): boolean {
  if (admin) return true
  if (i.to) return rutaPermitida(i.to, codigos, admin)
  if (i.action) return ACCIONES_LIBRES.has(i.action) || codigos.has(`accion:${i.action}`)
  if (i.children && i.children.length) return i.children.some((c) => c !== 'sep' && opcionPermitida(c, codigos, admin))
  return true
}

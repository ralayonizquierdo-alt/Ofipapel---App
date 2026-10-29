/**
 * Línea de documento en edición (pedidos de cliente, presupuestos, pedidos a proveedor).
 *
 * Al teclear el código, los datos del artículo (descripción, precio, dto., IGIC…) llegan de la base
 * de datos un momento después. Quien escribe deprisa ya ha puesto cantidad y precio en ese
 * momento, y antes la carga del artículo pisaba lo escrito (cantidad 2 y precio 10 se guardaban
 * con los del artículo). Por eso se apuntan los campos que el usuario toca (`tocados`) y, al
 * aplicar el artículo, esos campos se conservan.
 */
export interface LineaEnEdicion<L> {
  idx: number | 'nuevo'
  l: L
  /** Campos cambiados a mano desde que se aplicó el último artículo. */
  tocados?: readonly string[]
}

/** Cambio tecleado por el usuario en la línea: se aplica y se apunta como tocado. */
export function tocarLinea<L extends object>(e: LineaEnEdicion<L> | null, p: Partial<L>): LineaEnEdicion<L> | null {
  if (!e) return e
  return { ...e, l: { ...e.l, ...p }, tocados: [...new Set([...(e.tocados ?? []), ...Object.keys(p)])] }
}

/**
 * Aplica la línea calculada a partir del artículo sobre la que se está editando, conservando
 * los campos tocados a mano y los de `conservar` (p. ej. las cantidades al cambiar de artículo).
 */
export function aplicarArticulo<L extends object>(
  e: LineaEnEdicion<L> | null,
  nueva: L,
  conservar: readonly (keyof L)[] = [],
): LineaEnEdicion<L> | null {
  if (!e) return e
  const quedan: Partial<L> = {}
  for (const k of [...conservar, ...((e.tocados ?? []) as (keyof L)[])]) quedan[k] = e.l[k]
  return { ...e, l: { ...nueva, ...quedan }, tocados: [] }
}

/** El usuario ha tocado ese campo de la línea mientras se cargaba el artículo. */
export function tocado<L>(e: LineaEnEdicion<L> | null, campo: keyof L & string) {
  return !!e?.tocados?.includes(campo)
}

import { supabase } from '../../lib/supabase'
import { hoy } from './comun'

/**
 * «Eliminar» de los maestros con baja lógica (Códigos Postales, Bancos, Monedas, Tipo Cliente):
 * el registro no se elimina, se marca `activo = false` (y `fecha_baja` si la tabla la tiene).
 * Sobre un registro ya dado de baja, ofrece reactivarlo. Devuelve el error o null; true si no
 * se hizo nada (el usuario canceló).
 */
export async function bajaOReactivar({
  tabla,
  clave,
  activo,
  descripcion,
  conFechaBaja = false,
}: {
  tabla: string
  clave: Record<string, string>
  activo: boolean
  descripcion: string
  conFechaBaja?: boolean
}): Promise<string | null | true> {
  const pregunta = activo
    ? `¿Dar de baja ${descripcion}? Queda marcado como baja, no se borra.`
    : `${descripcion} está dado de baja. ¿Reactivarlo?`
  if (!confirm(pregunta)) return true
  const cambios: Record<string, unknown> = { activo: !activo }
  if (conFechaBaja) cambios.fecha_baja = activo ? hoy() : null
  let q = supabase.from(tabla).update(cambios)
  for (const [k, v] of Object.entries(clave)) q = q.eq(k, v)
  const { error } = await q
  return error ? error.message : null
}

/** Aviso rojo bajo la cabecera de la ficha cuando el registro está dado de baja. */
export const TEXTO_BAJA = 'Dado de baja. Pulsa Eliminar para reactivarlo.'

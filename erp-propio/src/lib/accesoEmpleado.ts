// Límites del empleado conectado (Archivo → Parámetros → Control de Accesos, tabla
// empleado_acceso). Se cargan al entrar (UtilidadesHost) y se leen de forma síncrona. Los
// administradores no tienen límites. La tienda y el descuento máximo los impone además la base de
// datos; aquí sirven para que la pantalla no ofrezca lo que luego no se podrá grabar.

import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'

export interface MiAcceso {
  admin: boolean
  tiendas: string[] | null
  almacenes: string[] | null
  dto_maximo_pct: number | null
  puede_modificar_precio: boolean
  puede_vender_sin_caja: boolean
  puede_anular: boolean
  puede_ver_costes: boolean
  solo_datos_tienda: boolean
  horario: { dias: number[]; desde: string; hasta: string } | null
}

const SIN_LIMITES: MiAcceso = {
  admin: false,
  tiendas: null,
  almacenes: null,
  dto_maximo_pct: null,
  puede_modificar_precio: true,
  puede_vender_sin_caja: true,
  puede_anular: true,
  puede_ver_costes: true,
  solo_datos_tienda: false,
  horario: null,
}

let actual: MiAcceso = SIN_LIMITES
const oyentes = new Set<() => void>()

export async function cargarMiAcceso(): Promise<MiAcceso> {
  const [yo, adm] = await Promise.all([supabase.rpc('fn_empleado_actual'), supabase.rpc('fn_es_administrador')])
  const admin = adm.data === true
  let a: Partial<MiAcceso> = {}
  if (!admin && typeof yo.data === 'string') {
    const { data } = await supabase.from('empleado_acceso').select('*').eq('empleado_codigo', yo.data).maybeSingle()
    if (data) a = { ...(data as Partial<MiAcceso>), dto_maximo_pct: data.dto_maximo_pct == null ? null : Number(data.dto_maximo_pct) }
  }
  actual = admin ? { ...SIN_LIMITES, admin } : { ...SIN_LIMITES, ...a, admin }
  oyentes.forEach((f) => f())
  return actual
}

export const miAcceso = () => actual

export function useMiAcceso(): MiAcceso {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f)
      return () => oyentes.delete(f)
    },
    () => actual,
  )
}

/** ¿Puede trabajar en esta tienda? */
export const tiendaPermitida = (codigo: string) => actual.tiendas == null || actual.tiendas.includes(codigo)

/** ¿Está dentro de su horario ahora? (sin horario o administrador: siempre). */
export function dentroDeHorario(a: MiAcceso = actual, ahora = new Date()): boolean {
  const h = a.horario
  if (a.admin || !h) return true
  const dia = ((ahora.getDay() + 6) % 7) + 1 // 1 = lunes … 7 = domingo
  const hm = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`
  return h.dias.includes(dia) && hm >= h.desde && hm <= h.hasta
}

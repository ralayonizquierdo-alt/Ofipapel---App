import { supabase } from '../lib/supabase'

// ¿Ha fichado hoy el repartidor? Fichaje vive en el ERP (/fichaje, migración 20261103_fichaje.sql): se pregunta al
// servidor con el token de la app (fn_app_rep_fichaje). La regla (Rober, 03/11/2026): sin fichar la entrada no se
// puede entregar; ver, comprobar u ordenar la ruta, sí. El servidor lo vuelve a comprobar al marcar (fn_app_rep_marcar).
// «sin_vinculo»: en Archivo → Fichaje → Personas nadie tiene enlazado este repartidor (no se bloquea; la app lo avisa).

export type EstadoFichaje = 'trabajando' | 'pausa' | 'sin_fichar' | 'salida' | 'sin_vinculo'

const K_ULTIMO = 'reparto.fichaje.ultimo'

export const hoyCanarias = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Atlantic/Canary', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

export async function estadoFichaje(token: string, repartidor: string): Promise<EstadoFichaje> {
  const { data, error } = await supabase.rpc('fn_app_rep_fichaje', { p_token: token })
  if (error) throw new Error(error.message)
  const estado = data as EstadoFichaje
  try {
    localStorage.setItem(K_ULTIMO, JSON.stringify({ repartidor, dia: hoyCanarias(), estado }))
  } catch {
    /* sin almacenamiento */
  }
  return estado
}

/** Último estado comprobado hoy (para seguir sin cobertura si ya había fichado). */
export function estadoGuardado(repartidor: string): EstadoFichaje | null {
  try {
    const u = JSON.parse(localStorage.getItem(K_ULTIMO) ?? 'null') as { repartidor: string; dia: string; estado: EstadoFichaje } | null
    return u && u.repartidor === repartidor && u.dia === hoyCanarias() ? u.estado : null
  } catch {
    return null
  }
}

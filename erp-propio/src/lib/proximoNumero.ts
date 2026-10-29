// Número que tendrá un documento nuevo (petición de Rober, 29/10/2026): al pulsar Agregar, la
// ficha enseña ya el próximo número libre de la tienda (y serie) elegidos, y lo recalcula si se
// cambian. Solo se CONSULTA (fn_proximo_numero, que no modifica nada): el número de verdad se
// sigue asignando al guardar con fn_siguiente_numero, que es atómico, así dos puestos a la vez
// nunca duplican y cancelar no deja huecos. Si al guardar sale otro número (otro puesto cogió
// antes el que se enseñaba), la ficha lo avisa con `avisoNumero`.

import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

/** Próximo número de un tipo de documento, sin reservarlo. */
export async function proximoNumero(tienda: string, tipo: string, serie = ''): Promise<number | null> {
  const { data, error } = await supabase.rpc('fn_proximo_numero', { p_tienda: tienda, p_tipo_documento: tipo, p_serie: serie })
  if (error || data == null) return null
  return Number(data)
}

/**
 * Próximo número del documento mientras `activo` (la ficha está en alta) y hay tienda. Se vuelve
 * a pedir al cambiar la tienda, el tipo o la serie, y al cambiar `refresco` (p. ej. tras guardar).
 * Devuelve null mientras no se sabe o fuera de alta.
 */
export function useProximoNumero(activo: boolean, tienda: string | null | undefined, tipo: string, serie = '', refresco: unknown = 0): number | null {
  return useNumeroConsultado(activo && tienda ? `${tienda}|${tipo}|${serie}|${String(refresco)}` : null, () => proximoNumero(tienda!, tipo, serie))
}

/**
 * Número de la próxima apertura de caja de la tienda. No sale de secuencia_numeracion: fn_caja_abrir
 * da el último ejercicio de la tienda + 1 (con bloqueo), así que se calcula igual.
 */
export function useProximaAperturaCaja(activo: boolean, tienda: string | null | undefined): number | null {
  return useNumeroConsultado(activo && tienda ? `apertura|${tienda}` : null, async () => {
    const { data, error } = await supabase
      .from('caja_apertura_cierre')
      .select('ejercicio')
      .eq('tienda_terminal_codigo', tienda!)
      .order('ejercicio', { ascending: false })
      .limit(1)
    if (error) return null
    return Number(data?.[0]?.ejercicio ?? 0) + 1
  })
}

/** Pide el número cuando cambia `clave` (null = no hace falta) y descarta respuestas viejas. */
function useNumeroConsultado(clave: string | null, consultar: () => Promise<number | null>): number | null {
  const [res, setRes] = useState<{ clave: string; numero: number | null } | null>(null)
  const consultarActual = useRef(consultar)
  useEffect(() => {
    consultarActual.current = consultar
  })
  useEffect(() => {
    if (!clave) return
    let cancel = false
    consultarActual.current().then((numero) => {
      if (!cancel) setRes({ clave, numero })
    })
    return () => {
      cancel = true
    }
  }, [clave])
  return clave && res?.clave === clave ? res.numero : null
}

/** Aviso para la barra de mensajes si el número asignado al guardar no es el que se enseñaba. */
export function avisoNumero(asignado: number | null | undefined, mostrado: number | null | undefined): string | null {
  if (asignado == null || mostrado == null || Number(asignado) === Number(mostrado)) return null
  return `Se ha guardado con el nº ${asignado} (el ${mostrado} lo usó otro puesto)`
}

// Las fichas que, al guardar un alta, navegan a la URL del documento nuevo vuelven a cargarlo y
// limpian la barra de mensajes. Dejan el aviso aquí y la carga lo recoge en lugar de limpiar.
let avisoPendiente: string | null = null

/** Deja un aviso para que lo enseñe la próxima carga de la ficha (ver `tomarAvisoNumero`). */
export function dejarAvisoNumero(aviso: string | null) {
  avisoPendiente = aviso
}

/** Devuelve (y olvida) el aviso pendiente; null si no hay. */
export function tomarAvisoNumero(): string | null {
  const a = avisoPendiente
  avisoPendiente = null
  return a
}

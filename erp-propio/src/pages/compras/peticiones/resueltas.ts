// Globo rojo de las peticiones resueltas sin imprimir (Rober, 23/11/2026: «que cada vez que haya peticiones nuevas salga
// un globo rojo con el número dentro, como las notificaciones de WhatsApp… estar mandando emails no»).

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

/** Aviso entre pantallas: se han marcado peticiones como impresas (el globo rojo se actualiza al momento). */
export const EVENTO_RESUELTAS = 'erp:peticiones-resueltas'

/** Número del globo rojo: resueltas de los últimos 60 días sin imprimir. Se refresca cada 2 minutos. */
export function useResueltasNuevas() {
  const [n, setN] = useState(0)
  useEffect(() => {
    let vivo = true
    const leer = () =>
      supabase.rpc('fn_peticiones_resueltas_nuevas').then(({ data, error }) => {
        if (vivo && !error) setN(Number(data ?? 0))
      })
    void leer()
    const t = window.setInterval(leer, 120000)
    window.addEventListener(EVENTO_RESUELTAS, leer)
    return () => {
      vivo = false
      window.clearInterval(t)
      window.removeEventListener(EVENTO_RESUELTAS, leer)
    }
  }, [])
  return n
}

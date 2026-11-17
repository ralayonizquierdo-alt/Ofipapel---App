// Áreas de solo consulta mientras manda GeminisWin (Rober, 17/11/2026). El espejo trae cada pocos minutos
// los datos de GeminisWin; mientras él sea el dueño de un área, en el ERP se consulta pero no se cambia.
// Quién manda en cada área está en la tabla area_dueno (supabase/migrations/20261117_areas_solo_consulta.sql);
// la base de datos rechaza el cambio aunque la pantalla lo dejara pasar. Ver docs/PLAN_ESPEJO_GEMINISWIN.md.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Area = 'articulos' | 'clientes' | 'proveedores' | 'stock'

let cache: Promise<Map<string, string>> | null = null
let leidoEn = 0

function leer() {
  // Se vuelve a preguntar cada 5 minutos: abrir un área no obliga a nadie a recargar la página.
  if (!cache || Date.now() - leidoEn > 300_000) {
    leidoEn = Date.now()
    cache = Promise.resolve(supabase.from('area_dueno').select('area, dueno')).then(({ data }) => new Map((data ?? []).map((a) => [a.area as string, a.dueno as string])))
  }
  return cache
}

/** Aviso para la ficha si el área es de GeminisWin (solo consulta); null si en el ERP se puede trabajar. */
export function useSoloConsulta(area: Area): string | null {
  const [bloqueada, setBloqueada] = useState(false)
  useEffect(() => {
    let vivo = true
    void leer().then((m) => vivo && setBloqueada(m.get(area) === 'geminiswin'))
    return () => {
      vivo = false
    }
  }, [area])
  return bloqueada ? 'Estos datos vienen de GeminisWin: aquí solo se consultan. Los cambios se hacen en GeminisWin y aparecen aquí en unos minutos.' : null
}

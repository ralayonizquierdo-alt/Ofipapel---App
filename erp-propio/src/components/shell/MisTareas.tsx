// Mis tareas pendientes (Luis, 02/11/2026: «¿dónde ponemos las tareas pendientes para consultarlas
// fácilmente?»). Salen del Registro de incidencias (tipo «tarea», abiertas o en curso) y a cada uno le
// cuentan las suyas y las compartidas («Luis / Rober» le sale a Luis y a Rober). Dos accesos:
//  · Globo 📌 en la cabecera, con el número; al pulsarlo abre el Registro filtrado con lo suyo.
//  · Recuadro «Mis tareas pendientes» en el Panel de Control (las 5 primeras).
// Si no tiene ninguna, no se ve nada.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export interface Tarea {
  id: number
  titulo: string
  asignado: string | null
  estado: 'abierta' | 'en_curso'
  prioridad: 'alta' | 'normal' | 'baja'
}

const CADA_MS = 10 * 60 * 1000 // antes 5 min
const ORDEN = { alta: 0, normal: 1, baja: 2 }

/** Nombre corto del empleado conectado, como se usa en «Le toca a…» (Luis, Rober, David…). */
async function miNombre(): Promise<string | null> {
  const { data: codigo } = await supabase.rpc('fn_empleado_actual')
  if (typeof codigo !== 'string') return null
  const { data } = await supabase.from('empleado').select('nombre').eq('codigo', codigo).maybeSingle()
  const n = (data?.nombre as string | undefined)?.trim().split(/\s+/)[0]
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : null
}

export function useMisTareas() {
  const [nombre, setNombre] = useState<string | null>(null)
  const [tareas, setTareas] = useState<Tarea[]>([])
  useEffect(() => {
    let vivo = true
    let yo: string | null = null
    const mirar = async () => {
      yo ??= await miNombre()
      if (!yo) return
      const { data } = await supabase
        .from('incidencia')
        .select('id, titulo, asignado, estado, prioridad')
        .eq('tipo', 'tarea')
        .in('estado', ['abierta', 'en_curso'])
      if (!vivo) return
      const mias = ((data ?? []) as Tarea[])
        .filter((t) => (t.asignado ?? '').split(' / ').some((a) => a.trim().toLowerCase() === yo!.toLowerCase()))
        .sort((a, b) => ORDEN[a.prioridad] - ORDEN[b.prioridad] || a.id - b.id)
      setNombre(yo)
      setTareas(mias)
    }
    void mirar()
    const t = setInterval(() => document.visibilityState === 'visible' && void mirar(), CADA_MS)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [])
  return { nombre, tareas }
}

const rutaMias = (nombre: string) => `/archivo/incidencias?tipo=tarea&quien=${encodeURIComponent(nombre)}`

/** Globo 📌 de la cabecera. */
export function GloboTareas() {
  const navigate = useNavigate()
  const { nombre, tareas } = useMisTareas()
  if (!nombre || !tareas.length) return null
  return (
    <button
      type="button"
      className="relative flex h-[18px] flex-none items-center rounded border border-[#d0d7e2] bg-white px-1 text-[12px] leading-none hover:bg-[#fff4ce]"
      onClick={() => navigate(rutaMias(nombre))}
      title={`Tus tareas pendientes (${tareas.length}): ${tareas.map((t) => t.titulo).join(' · ')}`}
      aria-label={`${tareas.length} tareas pendientes`}
    >
      📌
      <span className="absolute -right-1.5 -top-1.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-[#b07d0a] px-[3px] text-[9px] font-bold text-white">
        {tareas.length}
      </span>
    </button>
  )
}

/** Recuadro del Panel de Control. */
export function RecuadroMisTareas() {
  const navigate = useNavigate()
  const { nombre, tareas } = useMisTareas()
  if (!nombre || !tareas.length) return null
  return (
    <div className="flex flex-col gap-0.5 border border-[#adadad] bg-[#fffbea] px-2 py-1">
      <div className="flex items-center gap-2">
        <b className="text-[13px] text-[#8a5a00]">📌 Mis tareas pendientes ({tareas.length})</b>
        <button type="button" className="ml-auto text-[12px] text-[#1d3a8a] hover:underline" onClick={() => navigate(rutaMias(nombre))}>
          Ver todas
        </button>
      </div>
      {tareas.slice(0, 5).map((t) => (
        <button
          key={t.id}
          type="button"
          className="flex items-center gap-1.5 text-left hover:underline"
          onClick={() => navigate(`${rutaMias(nombre)}&id=${t.id}`)}
        >
          <span className="w-[14px]">{t.prioridad === 'alta' ? '🔴' : t.estado === 'en_curso' ? '🔵' : '•'}</span>
          <span className="flex-1 truncate">{t.titulo}</span>
          {t.asignado && t.asignado.includes('/') && <span className="text-[11px] text-[#777]">({t.asignado})</span>}
        </button>
      ))}
    </div>
  )
}

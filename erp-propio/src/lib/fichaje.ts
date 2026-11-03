// Fichaje (registro horario) dentro del ERP: tipos y cálculos comunes a la pantalla de fichar (/fichaje) y a la
// gestión (Archivo → Fichaje). Datos en Supabase (migración 20261103_fichaje.sql).

export type TipoFichaje = 'entrada' | 'pausa_inicio' | 'pausa_fin' | 'salida'
export type EstadoFichaje = 'trabajando' | 'pausa' | 'salida' | 'sin_fichar'

export const TIPOS_FICHAJE: Record<TipoFichaje, string> = {
  entrada: 'Entrada',
  pausa_inicio: 'Inicio de pausa',
  pausa_fin: 'Fin de pausa',
  salida: 'Salida',
}
export const ESTADOS_FICHAJE: Record<EstadoFichaje, string> = {
  trabajando: '🟢 Trabajando',
  pausa: '🟡 En pausa',
  salida: '⚪ Jornada terminada',
  sin_fichar: '🔴 Sin fichar',
}

export interface EventoFichaje {
  id: number
  empleado: string
  nombre: string
  nombre_completo: string
  numero: string | null
  departamento: string | null
  tipo: TipoFichaje
  en: string
  dia: string
  origen: 'fichaje' | 'correccion'
  motivo: string | null
  corregido_por: string | null
  corrige_id: number | null
  anulado_por: number | null
  fuera_de_sitio: boolean
  fuera_de_horario: boolean
  lat: number | null
  lng: number | null
}

export const ZONA = 'Atlantic/Canary'
export const horaCan = (v: string | null | undefined) => (v ? new Date(v).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: ZONA }) : '')
export const fechaCan = (dia: string) => {
  const [a, m, d] = dia.split('-')
  return `${d}/${m}/${a}`
}
export const hoyCan = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
export const diaSemana = (dia: string) => new Date(dia + 'T12:00:00Z').toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' })

/** «AAAA-MM-DDTHH:MM» en hora de Canarias → instante (ISO) — para las correcciones. */
export function canariasAIso(local: string): string {
  const [d, t] = local.split('T')
  const [a, m, dd] = d.split('-').map(Number)
  const [h, mi] = t.split(':').map(Number)
  const guess = Date.UTC(a, m - 1, dd, h, mi)
  const enCan = new Date(new Date(guess).toLocaleString('en-US', { timeZone: ZONA }))
  const enUtc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' }))
  return new Date(guess - (enCan.getTime() - enUtc.getTime())).toISOString()
}

/** Minutos → «7 h 45 min». */
export const duracion = (min: number) => {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}

export interface Jornada {
  empleado: string
  nombre: string
  dia: string
  entrada: string | null
  salida: string | null
  pausaMin: number
  trabajadoMin: number
  /** Le falta la salida (o sigue en pausa) — en el día de hoy es normal; en días pasados es un olvido. */
  abierta: boolean
  fueraHorario: boolean
  fueraSitio: boolean
  corregida: boolean
  eventos: EventoFichaje[]
}

/** Agrupa los fichajes válidos (no anulados) por persona y día y calcula la jornada. */
export function jornadas(eventos: EventoFichaje[]): Jornada[] {
  const grupos = new Map<string, EventoFichaje[]>()
  for (const e of eventos) {
    if (e.anulado_por != null) continue
    const k = `${e.empleado}|${e.dia}`
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k)!.push(e)
  }
  const ahora = Date.now()
  const hoy = hoyCan()
  return [...grupos.values()]
    .map((evs) => {
      evs.sort((a, b) => a.en.localeCompare(b.en) || a.id - b.id)
      let trabajado = 0
      let pausa = 0
      let desde: number | null = null
      let pausaDesde: number | null = null
      for (const e of evs) {
        const t = new Date(e.en).getTime()
        if (e.tipo === 'entrada' || e.tipo === 'pausa_fin') {
          if (e.tipo === 'pausa_fin' && pausaDesde != null) pausa += t - pausaDesde
          pausaDesde = null
          desde = t
        } else {
          if (desde != null) trabajado += t - desde
          desde = null
          if (e.tipo === 'pausa_inicio') pausaDesde = t
        }
      }
      const ultimo = evs[evs.length - 1]
      // Hoy y aún trabajando: cuenta hasta ahora.
      if (desde != null && evs[0].dia === hoy) trabajado += ahora - desde
      return {
        empleado: evs[0].empleado,
        nombre: evs[0].nombre,
        dia: evs[0].dia,
        entrada: evs.find((e) => e.tipo === 'entrada')?.en ?? null,
        salida: ultimo.tipo === 'salida' ? ultimo.en : null,
        pausaMin: pausa / 60000,
        trabajadoMin: trabajado / 60000,
        abierta: ultimo.tipo !== 'salida',
        fueraHorario: evs.some((e) => e.fuera_de_horario),
        fueraSitio: evs.some((e) => e.fuera_de_sitio),
        corregida: evs.some((e) => e.origen === 'correccion'),
        eventos: evs,
      }
    })
    .sort((a, b) => a.dia.localeCompare(b.dia) || a.nombre.localeCompare(b.nombre))
}

// Dos juegos de frases (Rober, 03/11/2026): al entrar, ánimo para el día; al salir, gracias por el trabajo.
// Cambian cada día. Se ven en verde, destacadas.
export const FRASES_ENTRADA = [
  'Hoy es un buen día para hacerlo genial. ¡A por ello!',
  'Un buen día empieza con una sonrisa al primer cliente.',
  'Lo pequeño bien hecho es lo que más se nota. ¡Ánimo!',
  'Juntos somos más fuertes: echa una mano y te la echarán.',
  'Cada pedido bien preparado es un cliente que vuelve.',
  'Tu energía se contagia: que hoy sea un gran día.',
  'Empieza con ganas: lo que haces hoy cuenta mucho.',
]
export const FRASES_SALIDA = [
  'Gracias por tu trabajo de hoy: Ofipapel funciona porque estás tú.',
  'Gracias por tu esfuerzo y por cuidar los detalles. ¡A descansar!',
  'Hoy has sumado mucho al equipo. ¡Gracias y hasta mañana!',
  'Gracias por dar lo mejor de ti. Desconecta y disfruta.',
  'Un día más, gracias. Lo que haces se nota, aunque no siempre se diga.',
  'Gracias por tu trabajo. Descansa, que te lo has ganado.',
  'Misión cumplida por hoy. ¡Gracias de corazón!',
]
export const delDia = (l: string[]) => l[Math.floor(Date.now() / 86_400_000) % l.length]

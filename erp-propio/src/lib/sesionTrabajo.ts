// Sesión de trabajo del puesto (como en GeminisWin): tienda/terminal, fecha (y hora) de trabajo y
// periodo o ejercicio. ÚNICO sitio que lo decide: TPV, caja, pedidos, compras… leen de aquí.
//
//  · Tienda: Utilidades → Cambio de Tienda. Se recuerda en el navegador (localStorage
//    «tpv.tienda», la misma clave que usaba el TPV, para no perder lo ya elegido).
//  · Fecha de trabajo: Utilidades → Cambio de Fecha / Cambio de Fecha y Hora. Se guarda como un
//    desfase respecto al reloj real en sessionStorage: vale para esta pestaña y se olvida al
//    cerrarla, para que nadie se quede grabando con otra fecha sin darse cuenta. NO se usa para
//    VeriFactu: la fecha y hora de generación del registro la pone la base de datos
//    (clock_timestamp()).
//  · Periodo: se trabaja siempre en el periodo EN CURSO (ejercicio.activo). Archivo →
//    Seleccionar Periodo solo abre periodos CERRADOS, para consultarlos (super administradores,
//    con contraseña); mientras tanto todo es solo consulta (la base de datos tampoco deja grabar
//    en ellos). Se guarda en sessionStorage: al cerrar la pestaña se vuelve al periodo en curso.
//
// Es un almacén externo (useSyncExternalStore): no necesita Provider y se puede leer también
// fuera de React (modelos de documento como ventaModel o cajaModel).

import { useSyncExternalStore } from 'react'

export interface EjercicioTrabajo {
  anio: number
  desde: string // AAAA-MM-DD
  hasta: string
  descripcion?: string | null
}

interface Estado {
  tienda: string | null
  /** Desfase en ms respecto al reloj real (0 = trabajando con la fecha de hoy). */
  desfaseMs: number
  /** true = Cambio de Fecha (la hora sigue siendo la real); false = Cambio de Fecha y Hora. */
  soloFecha: boolean
  /** Periodo cerrado que se está consultando (solo consulta); null = el periodo en curso. */
  consulta: EjercicioTrabajo | null
  /** Ejercicio marcado «activo» en la base de datos (lo carga SesionTrabajoHost al entrar). */
  ejercicioActivo: EjercicioTrabajo | null
}

const K_TIENDA = 'tpv.tienda'
const K_FECHA = 'erp.fechaTrabajo'
const K_EJERCICIO_ANTIGUO = 'erp.ejercicio' // antes: periodo elegido por puesto (ya no se usa)
const K_CONSULTA = 'erp.periodoConsulta'

/**
 * ¿Es una clave del navegador que «Eliminar Ficheros Temporales» debe respetar? La sesión de
 * Supabase (sb-…, si no se cerraría la sesión), la tienda, el periodo y la fecha de trabajo, la
 * voz de NEXA, el lado de la barra de accesos y las opciones guardadas de cada puesto (gestores, panel).
 */
export function esPreferencia(clave: string): boolean {
  return (
    clave.startsWith('sb-') ||
    [K_TIENDA, K_FECHA, 'nexa.voz.v1', 'erp.barraAccesos.lado'].includes(clave) ||
    clave.startsWith('panel.') ||
    /^gw\..*\.opciones$/.test(clave)
  )
}

function leer(s: Storage | undefined, k: string): string | null {
  try {
    return s?.getItem(k) ?? null
  } catch {
    return null
  }
}
function escribir(s: Storage | undefined, k: string, v: string | null) {
  try {
    if (v == null) s?.removeItem(k)
    else s?.setItem(k, v)
  } catch {
    /* sin almacenamiento local: vale solo para esta sesión */
  }
}
const ls = () => (typeof window !== 'undefined' ? window.localStorage : undefined)
const ss = () => (typeof window !== 'undefined' ? window.sessionStorage : undefined)

function estadoInicial(): Estado {
  let desfaseMs = 0
  let soloFecha = true
  try {
    const f = JSON.parse(leer(ss(), K_FECHA) ?? 'null') as { desfaseMs?: number; soloFecha?: boolean } | null
    if (f && Number.isFinite(f.desfaseMs)) {
      desfaseMs = Number(f.desfaseMs)
      soloFecha = f.soloFecha !== false
    }
  } catch {
    /* valor estropeado: fecha real */
  }
  escribir(ls(), K_EJERCICIO_ANTIGUO, null)
  let consulta: EjercicioTrabajo | null = null
  try {
    const e = JSON.parse(leer(ss(), K_CONSULTA) ?? 'null') as EjercicioTrabajo | null
    if (e && Number.isInteger(e.anio) && e.desde && e.hasta) consulta = e
  } catch {
    consulta = null
  }
  return { tienda: leer(ls(), K_TIENDA), desfaseMs, soloFecha, consulta, ejercicioActivo: null }
}

let estado: Estado = estadoInicial()
const oyentes = new Set<() => void>()

function cambiar(parcial: Partial<Estado>) {
  estado = { ...estado, ...parcial }
  oyentes.forEach((f) => f())
}

function suscribir(f: () => void) {
  oyentes.add(f)
  return () => oyentes.delete(f)
}

const pad2 = (n: number) => String(n).padStart(2, '0')
/** Date → 'AAAA-MM-DD' en hora local. */
export const isoLocal = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

/* ------------------------------------------------------------------ lectura (fuera de React) */

export function sesionTrabajo(): Estado {
  return estado
}

/** Fecha y hora de trabajo (el reloj real más el desfase elegido). */
export function ahoraTrabajo(): Date {
  return new Date(Date.now() + estado.desfaseMs)
}

/** 'AAAA-MM-DD' de la fecha de trabajo. Úsese como fecha por defecto de los documentos nuevos. */
export function fechaTrabajo(): string {
  return isoLocal(ahoraTrabajo())
}

/** 'HH:MM' de la hora de trabajo. */
export function horaTrabajo(): string {
  const d = ahoraTrabajo()
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** ¿Se está trabajando con otra fecha u hora distinta de la real? */
export function fechaCambiada(): boolean {
  return estado.desfaseMs !== 0
}

/** Tienda del puesto: la elegida si existe en la lista; si no, la primera. */
export function tiendaDeTrabajo(tiendas: { codigo: string }[]): string {
  const t = estado.tienda
  return tiendas.find((x) => x.codigo === t)?.codigo ?? tiendas[0]?.codigo ?? ''
}

/** Periodo en vigor: el cerrado que se consulta, el periodo en curso o el año de la fecha de trabajo. */
export function ejercicioTrabajo(): EjercicioTrabajo {
  if (estado.consulta) return estado.consulta
  if (estado.ejercicioActivo) return estado.ejercicioActivo
  const a = ahoraTrabajo().getFullYear()
  return { anio: a, desde: `${a}-01-01`, hasta: `${a}-12-31` }
}

/**
 * Fecha de referencia para los rangos por defecto de listados y gestores («Este mes», «Este
 * año»…): la fecha de trabajo si cae dentro del ejercicio elegido; si no, el último día del
 * ejercicio (así, al seleccionar el periodo 2025 los filtros proponen fechas de 2025).
 */
export function fechaReferencia(): Date {
  const e = ejercicioTrabajo()
  const f = fechaTrabajo()
  if (f >= e.desde && f <= e.hasta) return ahoraTrabajo()
  const [y, m, d] = (f < e.desde ? e.desde : e.hasta).split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0)
}

/* ------------------------------------------------------------------ cambios */

export function elegirTienda(codigo: string) {
  escribir(ls(), K_TIENDA, codigo || null)
  cambiar({ tienda: codigo || null })
}

/** Cambio de Fecha: misma hora real, otro día. `iso` = 'AAAA-MM-DD'. */
export function elegirFecha(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const hoy = new Date()
  const hoy0 = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const dias = Math.round((Date.UTC(y, m - 1, d) - hoy0) / 86400000)
  guardarDesfase(dias * 86400000, true)
}

/** Cambio de Fecha y Hora: `d` pasa a ser «ahora» y el reloj sigue corriendo desde ahí. */
export function elegirFechaHora(d: Date) {
  guardarDesfase(d.getTime() - Date.now(), false)
}

/** Vuelve a la fecha y hora reales. */
export function restablecerFecha() {
  guardarDesfase(0, true)
}

function guardarDesfase(ms: number, soloFecha: boolean) {
  // Por debajo de un minuto es «ahora»: no se marca la barra de estado por segundos de diferencia.
  const desfaseMs = Math.abs(ms) < 60000 ? 0 : ms
  escribir(ss(), K_FECHA, desfaseMs === 0 ? null : JSON.stringify({ desfaseMs, soloFecha }))
  cambiar({ desfaseMs, soloFecha })
}

/** ¿Se está consultando un periodo cerrado? (todo es solo consulta). */
export function soloConsultaPeriodo(): boolean {
  return estado.consulta != null
}

/** Entra a consultar un periodo cerrado (la contraseña ya se ha comprobado). */
export function entrarPeriodoCerrado(e: EjercicioTrabajo) {
  escribir(ss(), K_CONSULTA, JSON.stringify(e))
  cambiar({ consulta: e })
}

/** Vuelve al periodo en curso. */
export function volverPeriodoEnCurso() {
  escribir(ss(), K_CONSULTA, null)
  cambiar({ consulta: null })
}

export function fijarEjercicioActivo(e: EjercicioTrabajo | null) {
  cambiar({ ejercicioActivo: e })
}

/* ------------------------------------------------------------------ React */

/** Estado de la sesión de trabajo; la pantalla se repinta cuando cambia. */
export function useSesionTrabajo(): Estado {
  return useSyncExternalStore(suscribir, sesionTrabajo, sesionTrabajo)
}

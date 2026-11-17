import { supabase } from '../lib/supabase'

// App de repartidores: todo pasa por las funciones fn_app_rep_* (migración 20261103_reparto_app.sql).
// El repartidor no tiene cuenta del ERP: su «sesión» es un token que da fn_app_rep_login con su PIN.
// Sin cobertura: lo que marca se guarda en una cola (localStorage) y se envía al volver la señal.

export interface Sesion {
  token: string
  repartidor: string
  nombre: string
  puede_cambiar_ruta: boolean
  /** Entrada «OFICINA»: ve todas las rutas, solo lectura. */
  supervisor?: boolean
  caduca: number
}

export interface RepartoApp {
  tienda: string
  numero: number
  fecha: string
  ruta: string | null
  ruta_nombre: string | null
  mio?: boolean
  manana?: boolean
  pedidos?: number
  pendientes?: number
  repartidor?: string | null
}

export interface LineaApp {
  vt: string
  vn: number
  estado: string
  orden: number | null
  prioritario: boolean
  antes: string | null
  cliente: string
  cliente_codigo: string | null
  contacto: string | null
  direccion: string | null
  poblacion: string | null
  cp: string | null
  telefono: string | null
  total: number | null
  pagado: number | null
  factura: number | string | null
  /** Solo en repartos traídos de GeminisWin por el puente. */
  contado?: boolean | null
  forma_pago?: string | null
  bultos: number | null
  incidencia: string | null
  motivo: string | null
  nota: string | null
  intento1: string | null
  intento2: string | null
  entregado_en: string | null
  comprobado: boolean
  /** El repartidor ha puesto otro teléfono para esta entrega (telefono_original es el que venía). */
  telefono_cambiado?: boolean
  /** El teléfono no es de esta entrega: se guardó para este cliente en una entrega anterior. */
  telefono_recordado?: boolean
  telefono_original?: string | null
  /** Reparto al que pertenece de verdad el pedido (distinto del abierto si me lo han pasado). */
  rt?: string
  rn?: number
  /** Me lo han pasado desde otra ruta: «Ruta X · Repartidor». */
  viene_de?: string | null
  /** Pedido mío que he ofrecido (propuesto) o que ya lleva otro (aceptado). */
  traspaso?: { id: number; estado: 'propuesto' | 'aceptado'; a: string } | null
}

const K_SESION = 'reparto.sesion'
const K_COLA = 'reparto.cola'
const K_CACHE = 'reparto.cache.'

export const leer = <T>(k: string): T | null => {
  try {
    const v = localStorage.getItem(k)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}
export const guardar = (k: string, v: unknown) => {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* sin almacenamiento: sigue en memoria */
  }
}

export function sesionGuardada(): Sesion | null {
  const s = leer<Sesion>(K_SESION)
  return s && s.caduca > Date.now() ? s : null
}
export const guardarSesion = (s: Sesion | null) => guardar(K_SESION, s)

export class ErrorApp extends Error {
  red: boolean
  caducada: boolean
  constructor(mensaje: string, red = false, caducada = false) {
    super(mensaje)
    this.red = red
    this.caducada = caducada
  }
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  let res
  try {
    res = await supabase.rpc(fn, args)
  } catch (e) {
    throw new ErrorApp(String((e as Error).message ?? e), true)
  }
  if (res.error) {
    const m = res.error.message ?? ''
    if (/sesion_caducada/.test(m)) throw new ErrorApp('Tu sesión ha caducado: vuelve a poner el PIN.', false, true)
    if (!res.error.code && /fetch|network|load failed|conexi/i.test(m)) throw new ErrorApp('Sin conexión', true)
    throw new ErrorApp(m || 'Error')
  }
  return res.data as T
}

export const repartidores = () => rpc<{ codigo: string; nombre: string }[]>('fn_app_rep_repartidores', {})

/** Entra con el PIN. Si debeCambiar, la sesión NO se guarda todavía: antes hay que poner un PIN nuevo (cambiarPin + guardarSesion). */
export async function entrar(repartidor: string, pin: string): Promise<{ sesion: Sesion; debeCambiar: boolean }> {
  const r = await rpc<{ ok: boolean; error?: string; token: string; repartidor: string; nombre: string; puede_cambiar_ruta: boolean; supervisor?: boolean; debe_cambiar?: boolean }>(
    'fn_app_rep_login',
    { p_repartidor: repartidor, p_pin: pin, p_dispositivo: navigator.userAgent.slice(0, 200) },
  )
  if (!r.ok) throw new ErrorApp(r.error ?? 'PIN incorrecto.')
  const s: Sesion = {
    token: r.token,
    repartidor: r.repartidor,
    nombre: r.nombre,
    puede_cambiar_ruta: r.puede_cambiar_ruta,
    supervisor: r.supervisor === true,
    caduca: Date.now() + 15.5 * 3600_000,
  }
  const debeCambiar = r.debe_cambiar === true
  if (!debeCambiar) guardarSesion(s)
  return { sesion: s, debeCambiar }
}

/** Entrada directa desde Fichaje (/fichaje → «🚚 Mi reparto» abre /repartidor?t=token): el PIN ya lo puso allí. */
export async function entrarDesdeFichaje(token: string): Promise<Sesion> {
  const r = await rpc<{ ok: boolean; token: string; repartidor: string; nombre: string; puede_cambiar_ruta: boolean } | null>('fn_app_rep_sesion_datos', { p_token: token })
  if (!r?.ok) throw new ErrorApp('El enlace de Fichaje ha caducado: entra con tu PIN.')
  const s: Sesion = { token: r.token, repartidor: r.repartidor, nombre: r.nombre, puede_cambiar_ruta: r.puede_cambiar_ruta, caduca: Date.now() + 15.5 * 3600_000 }
  guardarSesion(s)
  return s
}

export const repartos = (token: string) => rpc<RepartoApp[]>('fn_app_rep_repartos', { p_token: token })
export const rutasDestino = (token: string) => rpc<RepartoApp[]>('fn_app_rep_rutas_destino', { p_token: token })

export async function lineas(token: string, tienda: string, numero: number) {
  const r = await rpc<{ reparto: RepartoApp; lineas: LineaApp[] }>('fn_app_rep_lineas', { p_token: token, p_tienda: tienda, p_numero: numero })
  guardar(K_CACHE + tienda + '-' + numero, r)
  return r
}
export const lineasEnCache = (tienda: string, numero: number) => leer<{ reparto: RepartoApp; lineas: LineaApp[] }>(K_CACHE + tienda + '-' + numero)
export const guardarCache = (tienda: string, numero: number, datos: { reparto: RepartoApp; lineas: LineaApp[] }) => guardar(K_CACHE + tienda + '-' + numero, datos)

export const cambiarRuta = (token: string, tienda: string, numero: number, vt: string, vn: number, destTienda: string, destNumero: number, motivo: string) =>
  rpc<{ ok: boolean }>('fn_app_rep_cambiar_ruta', {
    p_token: token,
    p_tienda: tienda,
    p_numero: numero,
    p_vt: vt,
    p_vn: vn,
    p_dest_tienda: destTienda,
    p_dest_numero: destNumero,
    p_motivo: motivo,
  })

// ------------------------------------------------------------ Fichar desde la app de reparto
export type TipoFichaje = 'entrada' | 'pausa_inicio' | 'pausa_fin' | 'salida'
export interface FichajeHoy {
  estado: 'trabajando' | 'pausa' | 'sin_fichar' | 'salida' | 'sin_vinculo'
  hoy: { tipo: TipoFichaje; en: string }[]
}
export const fichajeHoy = (token: string) => rpc<FichajeHoy>('fn_app_rep_fichaje_hoy', { p_token: token })
export async function fichar(token: string, tipo: TipoFichaje, pos: { lat: number; lng: number; precision: number | null } | null): Promise<FichajeHoy> {
  const r = await rpc<{ ok: boolean; error?: string } & FichajeHoy>('fn_app_rep_fichar', {
    p_token: token,
    p_tipo: tipo,
    p_lat: pos?.lat ?? null,
    p_lng: pos?.lng ?? null,
    p_precision: pos?.precision ?? null,
    p_dispositivo: navigator.userAgent.slice(0, 150),
  })
  if (!r.ok) throw new ErrorApp(r.error ?? 'No se pudo fichar.')
  return r
}

/** «No es mi ruta»: la deja libre para que la coja otro repartidor. */
export const soltarRuta = (token: string, tienda: string, numero: number) => rpc<{ ok: boolean }>('fn_app_rep_soltar', { p_token: token, p_tienda: tienda, p_numero: numero })

/** Pone (o quita, con '') otro teléfono para esta entrega. Hace falta cobertura. */
export async function cambiarTelefono(token: string, tienda: string, numero: number, vt: string, vn: number, telefono: string) {
  const r = await rpc<{ ok: boolean; error?: string; telefono: string | null }>('fn_app_rep_telefono', { p_token: token, p_tienda: tienda, p_numero: numero, p_vt: vt, p_vn: vn, p_telefono: telefono })
  if (!r.ok) throw new ErrorApp(r.error ?? 'No se pudo guardar el teléfono.')
  return r.telefono
}

// ------------------------------------------------------------ Pasar un pedido a otro repartidor
export interface TraspasoRecibido {
  id: number
  de: string
  ruta_origen: string | null
  ruta_destino: string | null
  cliente: string
  direccion: string | null
  poblacion: string | null
  motivo: string | null
}
export interface TraspasoRespuesta {
  id: number
  estado: 'aceptado' | 'rechazado'
  a: string
  cliente: string
  respuesta: string | null
}
export const proponerTraspaso = (token: string, tienda: string, numero: number, vt: string, vn: number, destTienda: string, destNumero: number, motivo: string) =>
  rpc<{ ok: boolean }>('fn_app_rep_traspaso_proponer', {
    p_token: token,
    p_tienda: tienda,
    p_numero: numero,
    p_vt: vt,
    p_vn: vn,
    p_dest_tienda: destTienda,
    p_dest_numero: destNumero,
    p_motivo: motivo || null,
  })
export const traspasos = (token: string) => rpc<{ recibidos: TraspasoRecibido[]; respuestas: TraspasoRespuesta[] }>('fn_app_rep_traspasos', { p_token: token })
export async function responderTraspaso(token: string, id: number, aceptar: boolean) {
  const r = await rpc<{ ok: boolean; error?: string }>('fn_app_rep_traspaso_responder', { p_token: token, p_id: id, p_aceptar: aceptar, p_nota: null })
  if (!r.ok) throw new ErrorApp(r.error ?? 'No se pudo responder.')
}
export const cancelarTraspaso = (token: string, id: number) => rpc<{ ok: boolean }>('fn_app_rep_traspaso_cancelar', { p_token: token, p_id: id })

// ------------------------------------------------------------ Oficina: todas las rutas (solo lectura)
export interface RutaOficina {
  tienda: string
  numero: number
  fecha: string
  estado: number
  ruta: string | null
  ruta_nombre: string | null
  repartidor: string | null
  total: number
  entregados: number
  incidencias: number
  no_entregados: number
  pendientes: number
  ultimo: string | null
}
export interface LineaOficina {
  vt: string
  vn: number
  /** «liquidado»: el repartidor ya pagó la factura en administración (estado 5 de GeminisWin). */
  estado: 'entregado' | 'liquidado' | 'incidencia' | 'no_entregado' | 'pendiente'
  cliente: string
  poblacion: string | null
  factura: number | string | null
  total: number | null
  pagado: number | null
  contado: boolean | null
  /** Forma de pago de GeminisWin, tal cual: «Remesa Bancaria 30-dias», «Transferencia INMEDIATA»… */
  forma_pago?: string | null
  incidencia: string | null
  motivo: string | null
  nota: string | null
  hora: string | null
  /** Teléfono que el repartidor puso porque el que venía no era el bueno. */
  telefono_repartidor?: string | null
}
export const todasLasRutas = (token: string) => rpc<{ supervisor: boolean; hoy?: string; rutas?: RutaOficina[] }>('fn_app_rep_todas', { p_token: token })
export const lineasOficina = (token: string, tienda: string, numero: number) =>
  rpc<LineaOficina[]>('fn_app_rep_todas_lineas', { p_token: token, p_tienda: tienda, p_numero: numero })

/** Aviso de ubicación: ¿lo ha leído ya este repartidor? Con aceptar = true deja constancia de la lectura. */
export const avisoUbicacion = (token: string, version: string, aceptar = false) =>
  rpc<{ leido: boolean; leido_en: string | null }>('fn_app_rep_aviso', { p_token: token, p_version: version, p_aceptar: aceptar, p_dispositivo: navigator.userAgent.slice(0, 200) })

export async function cambiarPin(token: string, actual: string, nuevo: string) {
  const r = await rpc<{ ok: boolean; error?: string }>('fn_app_rep_cambiar_pin', { p_token: token, p_actual: actual, p_nuevo: nuevo })
  if (!r.ok) throw new ErrorApp(r.error ?? 'No se pudo cambiar el PIN.')
}

export const posicion = (token: string, tienda: string, numero: number, lat: number, lng: number, precision: number | null) =>
  rpc('fn_app_rep_posicion', { p_token: token, p_tienda: tienda, p_numero: numero, p_lat: lat, p_lng: lng, p_precision: precision })

// ------------------------------------------------------------ Cola (sin cobertura)
export interface Accion {
  id: string
  fn: 'fn_app_rep_marcar' | 'fn_app_rep_orden' | 'fn_app_rep_comprobar'
  args: Record<string, unknown>
}

export const cola = (): Accion[] => leer<Accion[]>(K_COLA) ?? []

export function encolar(fn: Accion['fn'], args: Record<string, unknown>) {
  const c = cola()
  // Un reordenado nuevo sustituye al anterior pendiente del mismo reparto.
  const filtrada = fn === 'fn_app_rep_orden' ? c.filter((a) => !(a.fn === fn && a.args.p_tienda === args.p_tienda && a.args.p_numero === args.p_numero)) : c
  filtrada.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, fn, args })
  guardar(K_COLA, filtrada)
}

let enviando = false
/** Envía lo pendiente, en orden. Devuelve los errores de negocio (lo que el servidor rechaza) para avisar. */
export async function enviarCola(token: string): Promise<{ pendientes: number; errores: string[]; caducada: boolean }> {
  if (enviando) return { pendientes: cola().length, errores: [], caducada: false }
  enviando = true
  const errores: string[] = []
  try {
    for (;;) {
      const c = cola()
      if (!c.length) break
      const a = c[0]
      try {
        await rpc(a.fn, { ...a.args, p_token: token })
      } catch (e) {
        const err = e as ErrorApp
        if (err.red) break
        if (err.caducada) return { pendientes: c.length, errores, caducada: true }
        errores.push(err.message)
      }
      guardar(K_COLA, cola().filter((x) => x.id !== a.id))
    }
  } finally {
    enviando = false
  }
  return { pendientes: cola().length, errores, caducada: false }
}

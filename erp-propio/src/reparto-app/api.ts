import { supabase } from '../lib/supabase'

// App de repartidores: todo pasa por las funciones fn_app_rep_* (migración 20261103_reparto_app.sql).
// El repartidor no tiene cuenta del ERP: su «sesión» es un token que da fn_app_rep_login con su PIN.
// Sin cobertura: lo que marca se guarda en una cola (localStorage) y se envía al volver la señal.

export interface Sesion {
  token: string
  repartidor: string
  nombre: string
  puede_cambiar_ruta: boolean
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
  factura: number | null
  bultos: number | null
  incidencia: string | null
  motivo: string | null
  nota: string | null
  intento1: string | null
  intento2: string | null
  entregado_en: string | null
  comprobado: boolean
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

export async function entrar(repartidor: string, pin: string): Promise<Sesion> {
  const r = await rpc<{ ok: boolean; error?: string; token: string; repartidor: string; nombre: string; puede_cambiar_ruta: boolean}>('fn_app_rep_login', {
    p_repartidor: repartidor,
    p_pin: pin,
    p_dispositivo: navigator.userAgent.slice(0, 200),
  })
  if (!r.ok) throw new ErrorApp(r.error ?? 'PIN incorrecto.')
  const s: Sesion = {
    token: r.token,
    repartidor: r.repartidor,
    nombre: r.nombre,
    puede_cambiar_ruta: r.puede_cambiar_ruta,
    caduca: Date.now() + 15.5 * 3600_000,
  }
  guardarSesion(s)
  return s
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

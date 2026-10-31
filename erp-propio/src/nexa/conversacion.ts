// Conversación con NEXA: estado global (no vive en ninguna pantalla), así que se conserva al
// navegar entre ventanas y, gracias a sessionStorage, al recargar la página.
//
// La IA está en el servidor (Edge Function «nexa»); aquí solo se manda el historial y el
// contexto de pantalla, y se gobiernan los estados visuales de NEXA.

import { useSyncExternalStore } from 'react'
import { supabase } from '../lib/supabase'
import { setNexaLevel, setNexaState } from './estado'
import type { ContextoNexa } from './contexto'
import type { ResultadoListado } from '../lib/listados/resultado'

export interface RutaPropuesta {
  ruta: string
  etiqueta: string
}

/** Un cambio que NEXA ha preparado (simulado) y espera confirmación: tarjeta con «Sí, hazlo» / «No». */
export interface PropuestaNexa {
  id: number
  /** 2 leve · 3 normal · 4 masivo o con dinero · 5 crítico o legal. */
  nivel: number
  resumen: string
  /** Palabra de confirmación (nivel 4-5). */
  palabra: string | null
  caduca_en: string
  filas: number
  requiere: { si: boolean; palabra: boolean; motivo: boolean; contrasena: boolean }
  cambios: { total: number; por_tabla: { tabla: string; operacion: string; filas: number }[]; detalle: CambioNexa[] }
  /** Marcada aquí al pulsar «No» (el servidor también la cancela). */
  cancelada?: boolean
}
export interface CambioNexa {
  tabla: string
  operacion: string
  pk: string
  nombre: string | null
  campos: string[] | null
  antes: Record<string, unknown> | null
  despues: Record<string, unknown> | null
}
/** Una propuesta ya ejecutada. */
export interface EjecucionNexa {
  id: number
  nivel: number
  resumen: string
  filas: number
  motivo: string | null
  por_tabla: { tabla: string; operacion: string; filas: number }[]
}

export interface MensajeNexa {
  id: string
  rol: 'usuario' | 'nexa' | 'error'
  texto: string
  rutas?: RutaPropuesta[]
  /** Listado que NEXA ha sacado (se enseña como tabla con Excel, PDF y «Abrir en el Generador»). */
  listado?: ResultadoListado
  /** Cambio preparado, pendiente de confirmar. */
  propuesta?: PropuestaNexa
  /** Cambio hecho. */
  ejecucion?: EjecucionNexa
  hora: number
}

export interface EstadoConversacion {
  mensajes: MensajeNexa[]
  pensando: boolean
  /** Panel visible. */
  abierto: boolean
  /** Ancho grande (≈70 %) para tablas. */
  ampliado: boolean
  /** Lectura en voz alta de las respuestas. */
  voz: boolean
  /** Ha llegado una respuesta con el panel cerrado. */
  sinLeer: boolean
}

const CLAVE = 'nexa.conversacion.v1'
const CLAVE_VOZ = 'nexa.voz.v1'

/** Preferencia de voz del navegador: activada salvo que el usuario la haya silenciado. */
function vozGuardada() {
  try {
    return localStorage.getItem(CLAVE_VOZ) !== 'no'
  } catch {
    return true
  }
}

function cargar(): EstadoConversacion {
  const base: EstadoConversacion = { mensajes: [], pensando: false, abierto: false, ampliado: false, voz: vozGuardada(), sinLeer: false }
  try {
    const raw = sessionStorage.getItem(CLAVE)
    if (!raw) return base
    const g = JSON.parse(raw) as Partial<EstadoConversacion>
    return {
      ...base,
      mensajes: Array.isArray(g.mensajes) ? g.mensajes.slice(-200) : [],
      abierto: Boolean(g.abierto),
      ampliado: Boolean(g.ampliado),
    }
  } catch {
    return base
  }
}

let estado = cargar()
const oyentes = new Set<() => void>()

function guardar() {
  try {
    const { abierto, ampliado, voz } = estado
    // Las filas de los listados pesan: solo se guardan las de los 3 últimos.
    const conListado = estado.mensajes.filter((m) => m.listado).slice(-3)
    const mensajes = estado.mensajes.map((m) => (m.listado && !conListado.includes(m) ? { ...m, listado: { ...m.listado, filas: [], truncado: true } } : m))
    sessionStorage.setItem(CLAVE, JSON.stringify({ mensajes, abierto, ampliado, voz }))
  } catch {
    // sessionStorage lleno o bloqueado: la conversación sigue en memoria.
  }
}

function cambiar(parcial: Partial<EstadoConversacion>) {
  estado = { ...estado, ...parcial }
  guardar()
  for (const o of oyentes) o()
}

export function useConversacion() {
  return useSyncExternalStore(
    (o) => {
      oyentes.add(o)
      return () => oyentes.delete(o)
    },
    () => estado,
  )
}

export const getConversacion = () => estado

// ---------------------------------------------------------------- Panel

export function abrirPanel() {
  cambiar({ abierto: true, sinLeer: false })
  if (!estado.mensajes.length && !estado.pensando) void saludar()
}
/** Cierra (o minimiza) el panel. Cerrar además corta la voz. */
export function cerrarPanel(opciones: { callar?: boolean } = {}) {
  if (opciones.callar) callar()
  cambiar({ abierto: false })
}
export function alternarPanel() {
  if (estado.abierto) cerrarPanel()
  else abrirPanel()
}
export function setAmpliado(ampliado: boolean) {
  cambiar({ ampliado })
}
export function setVoz(voz: boolean) {
  if (!voz) callar()
  try {
    localStorage.setItem(CLAVE_VOZ, voz ? 'si' : 'no')
  } catch {
    // sin almacenamiento: la preferencia dura lo que la sesión
  }
  cambiar({ voz })
}
export function nuevaConversacion() {
  callar()
  terminarHabla()
  cambiar({ mensajes: [], sinLeer: false })
  if (estado.abierto) void saludar()
}

// ---------------------------------------------------------------- Saludo

/** Nombre del empleado conectado (ficha de empleado; si no, el usuario de acceso). */
async function nombreUsuario() {
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user
  if (!user) return ''
  const { data: emp } = await supabase.from('empleado').select('nombre').eq('auth_user_id', user.id).maybeSingle()
  const nombre = (emp?.nombre as string | undefined) ?? (user.email ?? '').split('@')[0]
  return nombre ? nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase() : ''
}

/** Saludo al empezar cada conversación: por la hora de Canarias y con el nombre del empleado. */
async function saludar() {
  const hora = Number(new Intl.DateTimeFormat('es-ES', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Atlantic/Canary' }).format(new Date()))
  const franja = hora >= 6 && hora < 13 ? 'Buenos días' : hora >= 13 && hora < 21 ? 'Buenas tardes' : 'Buenas noches'
  const nombre = await nombreUsuario().catch(() => '')
  const coletillas = ['¿En qué te ayudo?', '¿Qué necesitas saber?', 'Dime qué quieres consultar.']
  const texto = `${franja}${nombre ? `, ${nombre}` : ''}. Soy NEXA. ${coletillas[Math.floor(Math.random() * coletillas.length)]}`
  if (estado.mensajes.length) return // ya ha empezado a escribir
  cambiar({ mensajes: [{ id: `saludo-${Date.now()}`, rol: 'nexa', texto, hora: Date.now() }] })
  hablar(texto)
}

// ---------------------------------------------------------------- Estados visuales

let temporizador = 0

function terminarHabla() {
  window.clearTimeout(temporizador)
  if (!estado.pensando) setNexaState('idle')
  setNexaLevel(null)
}

/** 'speaking' unos segundos proporcionales al texto (o mientras lo lee en voz alta). */
function hablar(texto: string) {
  window.clearTimeout(temporizador)
  setNexaState('speaking')
  setNexaLevel(null)
  if (estado.voz && leerEnVoz(texto)) return
  const ms = Math.min(9000, Math.max(1600, texto.length * 28))
  temporizador = window.setTimeout(() => setNexaState('idle'), ms)
}

function alerta() {
  window.clearTimeout(temporizador)
  setNexaState('alert')
  temporizador = window.setTimeout(() => setNexaState('idle'), 2600)
}

// ---------------------------------------------------------------- Voz de NEXA (speechSynthesis)

export const vozDisponible = () => typeof window !== 'undefined' && 'speechSynthesis' in window

function textoParaLeer(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .split('\n')
    .filter((l) => !/^\s*\|/.test(l)) // las tablas no se leen
    .join('\n')
    .replace(/[*_`#>]/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\n{2,}/g, '. ')
    .trim()
}

/** La voz española más natural disponible (las «Natural»/«Online» de Edge y las de Google suenan mucho mejor). */
function vozEspanola() {
  const voces = window.speechSynthesis.getVoices()
  const es = voces.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith('es'))
  const espana = es.filter((v) => /es-es/i.test(v.lang.replace('_', '-')))
  const natural = (lista: SpeechSynthesisVoice[]) => lista.find((v) => /natural|online|neural/i.test(v.name))
  return natural(espana) ?? espana.find((v) => /google/i.test(v.name)) ?? natural(es) ?? espana[0] ?? es[0] ?? null
}

// Chrome carga la lista de voces después de arrancar: se pide pronto para tenerla al saludar.
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.getVoices()
  window.speechSynthesis.addEventListener?.('voiceschanged', () => window.speechSynthesis.getVoices())
}

function leerEnVoz(md: string) {
  if (!vozDisponible()) return false
  const texto = textoParaLeer(md)
  if (!texto) return false
  const synth = window.speechSynthesis
  synth.cancel()
  const u = new SpeechSynthesisUtterance(texto.slice(0, 3000))
  u.lang = 'es-ES'
  const v = vozEspanola()
  if (v) u.voice = v
  u.rate = 1.04
  u.onend = () => terminarHabla()
  u.onerror = () => terminarHabla()
  synth.speak(u)
  return true
}

export function callar() {
  if (vozDisponible()) window.speechSynthesis.cancel()
}

// ---------------------------------------------------------------- Enviar

let contador = 0
const nuevoId = () => `${Date.now().toString(36)}-${(contador++).toString(36)}`

interface RespuestaFuncion {
  ok: boolean
  texto?: string
  rutas?: RutaPropuesta[]
  listados?: ResultadoListado[]
  propuestas?: PropuestaNexa[]
  ejecuciones?: EjecucionNexa[]
  codigo?: string
  error?: string
}

/** Estado HTTP de un error de supabase.functions.invoke (si lo tiene). */
function estadoHttp(error: unknown): number | null {
  const ctx = (error as { context?: Response })?.context
  return ctx && typeof ctx.status === 'number' ? ctx.status : null
}
const espera = (ms: number) => new Promise((r) => window.setTimeout(r, ms))

/**
 * Llama a la función «nexa» reintentando cuando Supabase no llega a arrancarla: 503 (BOOT_ERROR:
 * con muchas peticiones a la vez, el plan gratuito no levanta más copias de la función en 10 s) o
 * 429 (límite). En esos casos la función no ha hecho nada, así que repetir es seguro. Dos
 * reintentos, con 2 y 5 segundos de espera.
 */
async function invocarNexa(body: Record<string, unknown>) {
  const esperas = [2000, 5000]
  for (let intento = 0; ; intento++) {
    const r = await supabase.functions.invoke<RespuestaFuncion>('nexa', { body })
    const st = r.error ? estadoHttp(r.error) : null
    if (!r.error || (st !== 503 && st !== 429) || intento >= esperas.length) return r
    await espera(esperas[intento])
  }
}

async function mensajeDeError(error: unknown): Promise<string> {
  // FunctionsHttpError lleva la respuesta original (p. ej. 401 sin sesión).
  const ctx = (error as { context?: Response })?.context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const cuerpo = (await ctx.json()) as RespuestaFuncion
      if (cuerpo?.error) return cuerpo.error
    } catch {
      // sin cuerpo JSON
    }
    if (ctx.status === 401) return 'Tu sesión ha caducado. Vuelve a iniciar sesión.'
    if (ctx.status === 404) return 'La función de NEXA no está desplegada en Supabase.'
    if (ctx.status === 503 || ctx.status === 429) return 'NEXA está muy ocupada ahora mismo (demasiadas preguntas a la vez). Espera unos segundos y vuelve a preguntar.'
  }
  const msg = error instanceof Error ? error.message : String(error)
  if (/fetch|network|Failed to send/i.test(msg)) return 'No se pudo conectar con NEXA. Revisa la conexión a Internet.'
  return msg || 'Error desconocido.'
}

/** Lo que NEXA necesita recordar de un listado enseñado (sin las filas). */
function listadoMostrado(l: ResultadoListado) {
  return JSON.stringify({ codigo: l.codigo, titulo: l.titulo, fuente: l.fuente, definicion: l.definicion, total: l.total })
}

/** Estado de una propuesta visto desde la conversación. */
export function estadoPropuesta(p: PropuestaNexa, mensajes: MensajeNexa[] = estado.mensajes): 'pendiente' | 'ejecutada' | 'cancelada' | 'caducada' {
  if (mensajes.some((m) => m.ejecucion?.id === p.id)) return 'ejecutada'
  if (p.cancelada) return 'cancelada'
  if (p.caduca_en && Date.parse(p.caduca_en) < Date.now()) return 'caducada'
  return 'pendiente'
}

/** Lo que va al servidor de cada mensaje de NEXA: su texto y la memoria de listados y propuestas. */
function textoParaHistorial(m: MensajeNexa, mensajes: MensajeNexa[]) {
  let t = m.texto
  if (m.listado) t += `\n\n<listado_mostrado>${listadoMostrado(m.listado)}</listado_mostrado>`
  if (m.propuesta) {
    const p = m.propuesta
    t += `\n\n<propuesta_mostrada>${JSON.stringify({ id: p.id, nivel: p.nivel, palabra: p.palabra, resumen: p.resumen, estado: estadoPropuesta(p, mensajes) })}</propuesta_mostrada>`
  }
  if (m.ejecucion) t += `\n\n<cambio_ejecutado>${JSON.stringify({ id: m.ejecucion.id, nivel: m.ejecucion.nivel, registros: m.ejecucion.filas })}</cambio_ejecutado>`
  return t
}

/** «No» en la tarjeta: se cancela en el servidor y aquí, sin gastar una pregunta a la IA. */
export async function cancelarPropuesta(id: number) {
  await supabase.rpc('fn_nexa_propuesta_cancelar', { p_id: id })
  const mensajes = estado.mensajes.map((m) => (m.propuesta?.id === id ? { ...m, propuesta: { ...m.propuesta, cancelada: true } } : m))
  cambiar({ mensajes: [...mensajes, { id: nuevoId(), rol: 'nexa', texto: 'Cancelado: no he cambiado nada.', hora: Date.now() }] })
}

export interface OpcionesEnvio {
  /**
   * Contraseña para confirmar un cambio de nivel 5. Viaja SOLO en esta petición: no entra en el
   * historial ni en sessionStorage, y el servidor la comprueba con Supabase Auth sin guardarla.
   */
  credencial?: { propuesta: number; contrasena: string }
}

export async function enviarMensaje(texto: string, contexto: ContextoNexa, opciones: OpcionesEnvio = {}) {
  const limpio = texto.trim()
  if (!limpio || estado.pensando) return
  callar()
  const mensajes = [...estado.mensajes, { id: nuevoId(), rol: 'usuario' as const, texto: limpio, hora: Date.now() }]
  cambiar({ mensajes, pensando: true })
  window.clearTimeout(temporizador)
  setNexaState('thinking')

  // Al servidor solo va la conversación real (los avisos de error no).
  // De los listados enseñados va su definición, para que NEXA pueda guardarlo si se lo piden.
  const historial = mensajes.filter((m) => m.rol !== 'error').map((m) => ({ rol: m.rol, texto: textoParaHistorial(m, mensajes) }))

  let respuesta: MensajeNexa
  try {
    const { data, error } = await invocarNexa({ mensajes: historial, contexto, ...(opciones.credencial ? { credencial: opciones.credencial } : {}) })
    if (error) throw error
    if (!data?.ok) {
      respuesta = { id: nuevoId(), rol: 'error', texto: data?.error ?? 'NEXA no ha podido responder.', hora: Date.now() }
    } else {
      const listado = data.listados?.length ? data.listados[data.listados.length - 1] : undefined
      const propuesta = data.propuestas?.length ? data.propuestas[data.propuestas.length - 1] : undefined
      const ejecucion = data.ejecuciones?.length ? data.ejecuciones[data.ejecuciones.length - 1] : undefined
      respuesta = {
        id: nuevoId(),
        rol: 'nexa',
        texto: data.texto ?? '',
        rutas: data.rutas?.length ? data.rutas : undefined,
        listado,
        propuesta,
        ejecucion,
        hora: Date.now(),
      }
    }
  } catch (e) {
    respuesta = { id: nuevoId(), rol: 'error', texto: await mensajeDeError(e), hora: Date.now() }
  }

  // Un listado se ve mejor con el panel ampliado.
  cambiar({ mensajes: [...estado.mensajes, respuesta], pensando: false, sinLeer: !estado.abierto, ...(respuesta.listado ? { ampliado: true } : {}) })
  if (respuesta.rol === 'error') alerta()
  else hablar(respuesta.texto)
}

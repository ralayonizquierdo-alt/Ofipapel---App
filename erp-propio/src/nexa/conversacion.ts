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

export interface MensajeNexa {
  id: string
  rol: 'usuario' | 'nexa' | 'error'
  texto: string
  rutas?: RutaPropuesta[]
  /** Listado que NEXA ha sacado (se enseña como tabla con Excel, PDF y «Abrir en el Generador»). */
  listado?: ResultadoListado
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
  codigo?: string
  error?: string
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
  }
  const msg = error instanceof Error ? error.message : String(error)
  if (/fetch|network|Failed to send/i.test(msg)) return 'No se pudo conectar con NEXA. Revisa la conexión a Internet.'
  return msg || 'Error desconocido.'
}

/** Lo que NEXA necesita recordar de un listado enseñado (sin las filas). */
function listadoMostrado(l: ResultadoListado) {
  return JSON.stringify({ codigo: l.codigo, titulo: l.titulo, fuente: l.fuente, definicion: l.definicion, total: l.total })
}

export async function enviarMensaje(texto: string, contexto: ContextoNexa) {
  const limpio = texto.trim()
  if (!limpio || estado.pensando) return
  callar()
  const mensajes = [...estado.mensajes, { id: nuevoId(), rol: 'usuario' as const, texto: limpio, hora: Date.now() }]
  cambiar({ mensajes, pensando: true })
  window.clearTimeout(temporizador)
  setNexaState('thinking')

  // Al servidor solo va la conversación real (los avisos de error no).
  // De los listados enseñados va su definición, para que NEXA pueda guardarlo si se lo piden.
  const historial = mensajes
    .filter((m) => m.rol !== 'error')
    .map((m) => ({ rol: m.rol, texto: m.listado ? `${m.texto}\n\n<listado_mostrado>${listadoMostrado(m.listado)}</listado_mostrado>` : m.texto }))

  let respuesta: MensajeNexa
  try {
    const { data, error } = await supabase.functions.invoke<RespuestaFuncion>('nexa', { body: { mensajes: historial, contexto } })
    if (error) throw error
    if (!data?.ok) {
      respuesta = { id: nuevoId(), rol: 'error', texto: data?.error ?? 'NEXA no ha podido responder.', hora: Date.now() }
    } else {
      const listado = data.listados?.length ? data.listados[data.listados.length - 1] : undefined
      respuesta = { id: nuevoId(), rol: 'nexa', texto: data.texto ?? '', rutas: data.rutas?.length ? data.rutas : undefined, listado, hora: Date.now() }
    }
  } catch (e) {
    respuesta = { id: nuevoId(), rol: 'error', texto: await mensajeDeError(e), hora: Date.now() }
  }

  // Un listado se ve mejor con el panel ampliado.
  cambiar({ mensajes: [...estado.mensajes, respuesta], pensando: false, sinLeer: !estado.abierto, ...(respuesta.listado ? { ampliado: true } : {}) })
  if (respuesta.rol === 'error') alerta()
  else hablar(respuesta.texto)
}

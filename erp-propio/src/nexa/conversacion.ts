// Conversación con NEXA: estado global (no vive en ninguna pantalla), así que se conserva al
// navegar entre ventanas y, gracias a sessionStorage, al recargar la página.
//
// La IA está en el servidor (Edge Function «nexa»); aquí solo se manda el historial y el
// contexto de pantalla, y se gobiernan los estados visuales de NEXA.

import { useSyncExternalStore } from 'react'
import { supabase } from '../lib/supabase'
import { setNexaLevel, setNexaState } from './estado'
import type { ContextoNexa } from './contexto'

export interface RutaPropuesta {
  ruta: string
  etiqueta: string
}

export interface MensajeNexa {
  id: string
  rol: 'usuario' | 'nexa' | 'error'
  texto: string
  rutas?: RutaPropuesta[]
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

function cargar(): EstadoConversacion {
  const base: EstadoConversacion = { mensajes: [], pensando: false, abierto: false, ampliado: false, voz: false, sinLeer: false }
  try {
    const raw = sessionStorage.getItem(CLAVE)
    if (!raw) return base
    const g = JSON.parse(raw) as Partial<EstadoConversacion>
    return {
      ...base,
      mensajes: Array.isArray(g.mensajes) ? g.mensajes.slice(-200) : [],
      abierto: Boolean(g.abierto),
      ampliado: Boolean(g.ampliado),
      voz: Boolean(g.voz),
    }
  } catch {
    return base
  }
}

let estado = cargar()
const oyentes = new Set<() => void>()

function guardar() {
  try {
    const { mensajes, abierto, ampliado, voz } = estado
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
  cambiar({ voz })
}
export function nuevaConversacion() {
  callar()
  terminarHabla()
  cambiar({ mensajes: [], sinLeer: false })
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

function vozEspanola() {
  const voces = window.speechSynthesis.getVoices()
  return voces.find((v) => v.lang === 'es-ES') ?? voces.find((v) => v.lang.startsWith('es')) ?? null
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

export async function enviarMensaje(texto: string, contexto: ContextoNexa) {
  const limpio = texto.trim()
  if (!limpio || estado.pensando) return
  callar()
  const mensajes = [...estado.mensajes, { id: nuevoId(), rol: 'usuario' as const, texto: limpio, hora: Date.now() }]
  cambiar({ mensajes, pensando: true })
  window.clearTimeout(temporizador)
  setNexaState('thinking')

  // Al servidor solo va la conversación real (los avisos de error no).
  const historial = mensajes.filter((m) => m.rol !== 'error').map((m) => ({ rol: m.rol, texto: m.texto }))

  let respuesta: MensajeNexa
  try {
    const { data, error } = await supabase.functions.invoke<RespuestaFuncion>('nexa', { body: { mensajes: historial, contexto } })
    if (error) throw error
    if (!data?.ok) {
      respuesta = { id: nuevoId(), rol: 'error', texto: data?.error ?? 'NEXA no ha podido responder.', hora: Date.now() }
    } else {
      respuesta = { id: nuevoId(), rol: 'nexa', texto: data.texto ?? '', rutas: data.rutas?.length ? data.rutas : undefined, hora: Date.now() }
    }
  } catch (e) {
    respuesta = { id: nuevoId(), rol: 'error', texto: await mensajeDeError(e), hora: Date.now() }
  }

  cambiar({ mensajes: [...estado.mensajes, respuesta], pensando: false, sinLeer: !estado.abierto })
  if (respuesta.rol === 'error') alerta()
  else hablar(respuesta.texto)
}

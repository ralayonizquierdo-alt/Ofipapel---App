// Dictado por voz (Web Speech API, SpeechRecognition) en español de España.
// Mientras escucha, NEXA pasa a 'listening' y el volumen del micrófono mueve las partículas.

import { escucharMicrofono, type FuenteAudio } from './audio'
import { setNexaState } from './estado'

interface ResultadoReconocimiento {
  isFinal: boolean
  0: { transcript: string }
}
interface EventoReconocimiento {
  resultIndex: number
  results: ArrayLike<ResultadoReconocimiento>
}
interface Reconocedor {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: EventoReconocimiento) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type ConstructorReconocedor = new () => Reconocedor

function constructor(): ConstructorReconocedor | null {
  const w = window as unknown as { SpeechRecognition?: ConstructorReconocedor; webkitSpeechRecognition?: ConstructorReconocedor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const dictadoDisponible = () => typeof window !== 'undefined' && constructor() !== null

export interface Dictado {
  parar: () => void
}

/**
 * Empieza a escuchar. `alTexto` recibe el texto dictado hasta ahora (final + provisional);
 * `alTerminar` se llama al acabar (por silencio, por `parar()` o por error).
 */
export function empezarDictado(alTexto: (texto: string) => void, alTerminar: (error?: string) => void): Dictado | null {
  const C = constructor()
  if (!C) return null
  const rec = new C()
  rec.lang = 'es-ES'
  rec.continuous = true
  rec.interimResults = true

  let finalTexto = ''
  let mic: FuenteAudio | null = null
  let terminado = false
  let errorTexto: string | undefined

  setNexaState('listening')
  escucharMicrofono()
    .then((m) => {
      if (terminado) m.parar()
      else mic = m
    })
    .catch(() => {
      // Sin nivel de micrófono: las partículas siguen con el ritmo genérico.
    })

  rec.onresult = (e) => {
    let provisional = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) finalTexto += r[0].transcript
      else provisional += r[0].transcript
    }
    alTexto((finalTexto + provisional).trim())
  }
  rec.onerror = (e) => {
    errorTexto =
      e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'No hay permiso para usar el micrófono.'
        : e.error === 'no-speech'
          ? undefined
          : e.error === 'audio-capture'
            ? 'No se encuentra ningún micrófono.'
            : `Error del dictado (${e.error}).`
  }
  rec.onend = () => {
    if (terminado) return
    terminado = true
    mic?.parar()
    setNexaState('idle')
    alTerminar(errorTexto)
  }
  try {
    rec.start()
  } catch {
    terminado = true
    setNexaState('idle')
    return null
  }
  return { parar: () => rec.stop() }
}

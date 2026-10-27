// Audio-reactividad: convierte un audio (micrófono hoy; la voz de NEXA mañana) en un nivel 0..1
// que mueve las partículas en tiempo real (`setNexaLevel`).

import { setNexaLevel } from './estado'

export interface FuenteAudio {
  parar: () => void
}

function medirNivel(analizador: AnalyserNode) {
  const datos = new Float32Array(analizador.fftSize)
  let raf = 0
  const bucle = () => {
    analizador.getFloatTimeDomainData(datos)
    let suma = 0
    for (let i = 0; i < datos.length; i++) suma += datos[i] * datos[i]
    const rms = Math.sqrt(suma / datos.length)
    // Escala perceptiva: voz normal ≈ 0,02–0,15 de RMS
    setNexaLevel(Math.min(1, Math.max(0, (Math.log10(rms + 1e-4) + 2.6) / 1.8)))
    raf = requestAnimationFrame(bucle)
  }
  raf = requestAnimationFrame(bucle)
  return () => cancelAnimationFrame(raf)
}

/** Micrófono → nivel. Para escuchar al usuario. */
export async function escucharMicrofono(): Promise<FuenteAudio> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const ctx = new AudioContext()
  const analizador = ctx.createAnalyser()
  analizador.fftSize = 1024
  ctx.createMediaStreamSource(stream).connect(analizador)
  const pararBucle = medirNivel(analizador)
  return {
    parar: () => {
      pararBucle()
      stream.getTracks().forEach((t) => t.stop())
      void ctx.close()
      setNexaLevel(null)
    },
  }
}

/** Un elemento <audio> (la voz de NEXA) → nivel, sin dejar de oírse. */
export function seguirAudio(elemento: HTMLAudioElement): FuenteAudio {
  const ctx = new AudioContext()
  const analizador = ctx.createAnalyser()
  analizador.fftSize = 1024
  const fuente = ctx.createMediaElementSource(elemento)
  fuente.connect(analizador)
  analizador.connect(ctx.destination)
  const pararBucle = medirNivel(analizador)
  return {
    parar: () => {
      pararBucle()
      void ctx.close()
      setNexaLevel(null)
    },
  }
}

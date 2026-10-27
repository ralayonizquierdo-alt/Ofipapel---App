// Estado de NEXA, independiente de cualquier pantalla.
//
// Cualquier parte del programa puede hacer `setNexaState('thinking')` sin conocer el motor
// visual; los avatares que estén montados se suscriben y reaccionan. Más adelante la conversación,
// la voz y las alertas usarán esta misma API.

import type { EstadoNexa } from './visual/NexaMotor'

export type { EstadoNexa }

type Oyente = (estado: EstadoNexa) => void
type OyenteNivel = (nivel: number | null) => void

let estadoActual: EstadoNexa = 'idle'
const oyentes = new Set<Oyente>()
const oyentesNivel = new Set<OyenteNivel>()

export function setNexaState(estado: EstadoNexa) {
  estadoActual = estado
  for (const o of oyentes) o(estado)
}

export function getNexaState() {
  return estadoActual
}

export function onNexaState(o: Oyente) {
  oyentes.add(o)
  return () => {
    oyentes.delete(o)
  }
}

/** Nivel de audio 0..1 (voz de NEXA o micrófono). `null` = ritmo genérico. */
export function setNexaLevel(nivel: number | null) {
  for (const o of oyentesNivel) o(nivel)
}

export function onNexaLevel(o: OyenteNivel) {
  oyentesNivel.add(o)
  return () => {
    oyentesNivel.delete(o)
  }
}

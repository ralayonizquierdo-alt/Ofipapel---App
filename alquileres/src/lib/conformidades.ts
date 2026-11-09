import type { Reservation } from '../types'

/**
 * Conformidades por enviar (Luis, 09/11/2026).
 *
 * Cada reserva que entra por la Entrada rápida del Dashboard tiene que ir a la
 * asesoría con su «Conformidad de la reserva». No sale sola: a las
 * HORAS_ESPERA de entrar, avisa en el Dashboard y con un globo en el icono de
 * Alquileres del hub, y se prepara con un clic desde la ficha. El aviso se va
 * en cuanto se prepara el correo o el WhatsApp (`conformidadPreparada`).
 */
export const HORAS_ESPERA = 2

/** Dónde deja la app la lista para el globo del hub (inicio.html, mismo sitio). */
export const CLAVE_HUB = 'ofipapel:alquileres:conformidades'

export interface ConformidadPendiente {
  r: Reservation
  /** Desde cuándo avisa: la hora de entrada más HORAS_ESPERA, en ISO. */
  aviso: string
}

/** Todas las que faltan por preparar, avisen ya o todavía no. */
export function conformidadesPendientes(reservations: Reservation[]): ConformidadPendiente[] {
  return reservations
    .filter(r => r.pideConformidad && !r.conformidadPreparada && r.status !== 'cancelada' && r.createdAt)
    .map(r => ({ r, aviso: new Date(Date.parse(r.createdAt) + HORAS_ESPERA * 3600_000).toISOString() }))
    .sort((a, b) => a.aviso.localeCompare(b.aviso))
}

/** Las que ya tienen que avisar. */
export function conformidadesPorEnviar(reservations: Reservation[], ahora = new Date()): ConformidadPendiente[] {
  const ya = ahora.toISOString()
  return conformidadesPendientes(reservations).filter(p => p.aviso <= ya)
}

/**
 * Deja la lista para el hub. Solo las horas de aviso: el hub cuenta las que ya
 * han llegado, así el globo aparece a su hora aunque Alquileres esté cerrado.
 */
export function publicaParaElHub(reservations: Reservation[]) {
  try {
    localStorage.setItem(CLAVE_HUB, JSON.stringify({
      actualizado: new Date().toISOString(),
      avisos: conformidadesPendientes(reservations).map(p => p.aviso),
    }))
  } catch { /* modo privado: el hub se queda sin globo */ }
}

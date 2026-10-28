// Preferencias de impresión del puesto (Archivo → Preparar página… / Elegir Impresora…) y la
// «Presentación preliminar» común. SIN CAPTURA de GeminisWin.
//
// El navegador no deja elegir la impresora ni imprimir sin su diálogo: lo que se guarda aquí son
// los márgenes, el tamaño y la orientación del papel (se aplican con @page a todo lo que se
// imprime) y el NOMBRE de la impresora de A4 y de la de tickets, que se recuerda al imprimir para
// elegirla en el diálogo del navegador. Se guarda en este navegador (localStorage
// «gw.impresion.opciones», que «Eliminar Ficheros Temporales» respeta).
//
// Presentación preliminar: la ventana activa que tenga vista previa la registra con
// `registrarVistaPrevia` (GwListado y las fichas con botón Imprimir lo hacen solas); el menú
// llama a la última registrada.

import { useSyncExternalStore } from 'react'

export type Orientacion = 'auto' | 'portrait' | 'landscape'
export type TamanoPapel = 'A4' | 'A5' | 'letter' | 'legal'

export interface PrefsImpresion {
  tamano: TamanoPapel
  orientacion: Orientacion
  margenSup: number
  margenInf: number
  margenIzq: number
  margenDer: number
  impresoraA4: string
  impresoraTickets: string
  /** Ancho del rollo de la impresora de tickets (mm). */
  anchoTicket: number
}

export const PREFS_DEFECTO: PrefsImpresion = {
  tamano: 'A4',
  orientacion: 'auto',
  margenSup: 10,
  margenInf: 10,
  margenIzq: 10,
  margenDer: 10,
  impresoraA4: '',
  impresoraTickets: '',
  anchoTicket: 80,
}

const K = 'gw.impresion.opciones'
const oyentes = new Set<() => void>()
let prefs: PrefsImpresion = leer()

function leer(): PrefsImpresion {
  try {
    return { ...PREFS_DEFECTO, ...(JSON.parse(localStorage.getItem(K) ?? '{}') as Partial<PrefsImpresion>) }
  } catch {
    return { ...PREFS_DEFECTO }
  }
}

export const prefsImpresion = () => prefs

export function guardarPrefsImpresion(p: PrefsImpresion) {
  prefs = p
  try {
    localStorage.setItem(K, JSON.stringify(p))
  } catch {
    /* sin almacenamiento: vale para esta sesión */
  }
  oyentes.forEach((f) => f())
}

export function usePrefsImpresion(): PrefsImpresion {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f)
      return () => oyentes.delete(f)
    },
    () => prefs,
  )
}

/**
 * Regla @page con las preferencias. `apaisado` es lo que pide el documento (un listado ancho);
 * la orientación elegida en Preparar página manda si no es «automática».
 */
export function cssPagina(apaisado?: boolean, p: PrefsImpresion = prefs): string {
  const ori = p.orientacion === 'auto' ? (apaisado == null ? '' : apaisado ? ' landscape' : ' portrait') : ` ${p.orientacion}`
  return `@page { size: ${p.tamano}${ori}; margin: ${p.margenSup}mm ${p.margenDer}mm ${p.margenInf}mm ${p.margenIzq}mm; }`
}

/* ---------------- Presentación preliminar ---------------- */

type Manejador = () => void
const pila: { id: number; fn: () => Manejador }[] = []
let sig = 0

/**
 * La ventana activa ofrece «Presentación preliminar». `obtener` devuelve la función a ejecutar
 * (se lee en el momento, así vale con la versión actual del componente). Devuelve la baja.
 */
export function registrarVistaPrevia(obtener: () => Manejador): () => void {
  const id = ++sig
  pila.push({ id, fn: obtener })
  return () => {
    const i = pila.findIndex((x) => x.id === id)
    if (i >= 0) pila.splice(i, 1)
  }
}

/** Ejecuta la presentación preliminar de la ventana activa; false si no tiene. */
export function abrirPresentacionPreliminar(): boolean {
  const ult = pila[pila.length - 1]
  if (!ult) return false
  ult.fn()()
  return true
}

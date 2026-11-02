// Registro de uso (Luis, 01/11/2026): qué pantallas se abren, cuántos minutos se usa de verdad el
// programa (teclado o ratón) y qué datos salen fuera (descargas e impresiones). Lo guarda la base de
// datos en la auditoría (fn_uso_evento) y en uso_actividad (fn_uso_latido); solo lo ven los super
// administradores (Archivo → Uso por Operario). Vale para todos, también administradores. Los
// empleados lo aceptan al entrar (Archivo → Textos legales). No se graba lo que se escribe.

import { supabase } from './supabase'

/** Área de una pantalla: lo de /contabilidad es Contabilidad aunque se haya entrado por AVATAR. */
export function areaDeRuta(pathname: string): string {
  if (pathname.startsWith('/contabilidad')) return 'contabilidad'
  if (pathname.startsWith('/web')) return 'web'
  return 'gestion'
}

let rutaActual = '/'
let tituloActual = ''

export function apuntarPantalla(pathname: string, titulo: string) {
  rutaActual = pathname
  tituloActual = titulo
  if (pathname === '/') return
  void supabase.rpc('fn_uso_evento', { p_tipo: 'PANTALLA', p_area: areaDeRuta(pathname), p_ruta: pathname, p_titulo: titulo })
}

export function apuntarSalida(tipo: 'EXPORTA' | 'IMPRIME', detalle: string) {
  void supabase.rpc('fn_uso_evento', { p_tipo: tipo, p_area: areaDeRuta(rutaActual), p_ruta: rutaActual, p_titulo: tituloActual, p_detalle: detalle })
}

let instalado = false

/** Minutos con actividad, descargas e impresiones. Devuelve la función para desinstalarlo. */
export function instalarRegistroUso(): () => void {
  if (instalado) return () => {}
  instalado = true
  let ultimaActividad = 0
  const actividad = () => {
    ultimaActividad = Date.now()
  }
  const eventos = ['keydown', 'mousedown', 'wheel', 'touchstart', 'mousemove'] as const
  eventos.forEach((e) => window.addEventListener(e, actividad, { passive: true, capture: true }))
  const latido = setInterval(() => {
    if (Date.now() - ultimaActividad < 60_000 && document.visibilityState === 'visible') void supabase.rpc('fn_uso_latido', { p_area: areaDeRuta(rutaActual) })
  }, 60_000)

  // Descargas: Excel, PDF, XML… salen todas por un enlace con «download».
  const clickOriginal = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (this.download) apuntarSalida('EXPORTA', this.download)
    return clickOriginal.call(this)
  }
  const pulsar = (e: MouseEvent) => {
    const a = (e.target as HTMLElement | null)?.closest?.('a[download]') as HTMLAnchorElement | null
    if (a) apuntarSalida('EXPORTA', a.download || a.href.slice(0, 120))
  }
  document.addEventListener('click', pulsar, true)
  const imprimir = () => apuntarSalida('IMPRIME', document.title)
  window.addEventListener('beforeprint', imprimir)

  return () => {
    eventos.forEach((e) => window.removeEventListener(e, actividad, { capture: true }))
    clearInterval(latido)
    HTMLAnchorElement.prototype.click = clickOriginal
    document.removeEventListener('click', pulsar, true)
    window.removeEventListener('beforeprint', imprimir)
    instalado = false
  }
}

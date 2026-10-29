// Teclado común del ERP, como en GeminisWin. Tabla completa de atajos en docs/ATAJOS_TECLADO.md.
//
// - Normaliza atajos («CTRL+F12», «Alt+F6», «Supr») y teclas pulsadas al mismo formato.
// - Foto del momento de la pulsación (`instantanea`): qué diálogo modal había abierto ANTES de que
//   los manejadores de React reaccionen. Sin ella, un Esc que cierra un diálogo llegaría después a
//   la ficha de debajo (ya sin diálogo en pantalla) y la cerraría también.
// - Intro avanza al siguiente campo y Mayús+Intro retrocede (FoxPro), donde el campo no tenga ya
//   su propia tecla Intro (búsquedas, aceptar diálogos…).
// - Teclas de las rejillas: flechas, AvPág/RePág e Inicio/Fin.

/** Diálogos modales: la capa que tapa la ventana (`fixed inset-0`) o los marcados a mano. */
export const SELECTOR_MODAL = '.fixed.inset-0, [data-gw-modal]'

function modalSuperior(): Element | null {
  const ms = document.querySelectorAll(SELECTOR_MODAL)
  return ms.length ? ms[ms.length - 1] : null
}

const fotos = new WeakMap<Event, { modal: Element | null }>()
if (typeof window !== 'undefined') {
  // Captura en window: se ejecuta antes que cualquier manejador de React o de las pantallas.
  window.addEventListener('keydown', (e) => fotos.set(e, { modal: modalSuperior() }), true)
}

/** Diálogo modal abierto en el momento en que se pulsó la tecla (null si no había). */
export function modalAlPulsar(e: Event): Element | null {
  return fotos.has(e) ? fotos.get(e)!.modal : modalSuperior()
}

/** La tecla va a otra cosa que la ventana activa: buscar/reemplazar de Edición o NEXA. */
export function teclaDeHerramienta(e: Event) {
  const t = e.target
  return t instanceof Element && t.closest('[data-gw-edicion], [data-nexa]') != null
}

const ALIAS: Record<string, string> = {
  control: 'ctrl',
  mayús: 'shift',
  mayus: 'shift',
  supr: 'delete',
  suprimir: 'delete',
  intro: 'enter',
  esc: 'escape',
  avpág: 'pagedown',
  avpag: 'pagedown',
  repág: 'pageup',
  repag: 'pageup',
  inicio: 'home',
  fin: 'end',
  retroceso: 'backspace',
  espacio: ' ',
  insert: 'insert',
  ins: 'insert',
}
const MODS = ['ctrl', 'alt', 'shift']

/** «CTRL+F12 », «Ctrl+F12» y «ctrl+f12» → «ctrl+f12»; «Supr» → «delete». */
export function normalizarAtajo(texto: string) {
  const partes = texto
    .split('+')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .map((p) => ALIAS[p] ?? p)
  const mods = MODS.filter((m) => partes.includes(m))
  const tecla = partes.filter((p) => !MODS.includes(p)).join('+')
  return [...mods, tecla].join('+')
}

/** La tecla pulsada en el mismo formato que `normalizarAtajo` (letras por posición: Ctrl+E en cualquier teclado). */
export function comboDeEvento(e: KeyboardEvent) {
  let tecla = e.key.toLowerCase()
  if ((e.ctrlKey || e.altKey || e.metaKey) && /^Key[A-Z]$/.test(e.code)) tecla = e.code.slice(3).toLowerCase()
  if (tecla === 'spacebar') tecla = ' '
  const mods = [e.ctrlKey && 'ctrl', e.altKey && 'alt', e.shiftKey && !(tecla.length === 1 && !e.ctrlKey && !e.altKey) && 'shift']
  return [...mods.filter(Boolean), tecla].join('+')
}

/** Para mostrar: «ctrl+f12» → «Ctrl+F12», «pagedown» → «AvPág». */
export function textoAtajo(norm: string) {
  const NOMBRE: Record<string, string> = {
    ctrl: 'Ctrl',
    alt: 'Alt',
    shift: 'Mayús',
    delete: 'Supr',
    enter: 'Intro',
    escape: 'Esc',
    pagedown: 'AvPág',
    pageup: 'RePág',
    home: 'Inicio',
    end: 'Fin',
    backspace: 'Retroceso',
    ' ': 'Espacio',
  }
  return norm
    .split('+')
    .map((p) => NOMBRE[p] ?? (p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)))
    .join('+')
}

export function esTextarea(t: EventTarget | null) {
  return t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable)
}

// ---------------- Intro = siguiente campo (FoxPro) ----------------

/** El elemento tiene su propio onKeyDown de React (búsqueda con Intro, aceptar un diálogo…). */
function tieneTeclaPropia(el: Element) {
  const k = Object.keys(el).find((x) => x.startsWith('__reactProps$'))
  const props = k ? (el as unknown as Record<string, { onKeyDown?: unknown } | undefined>)[k] : undefined
  return typeof props?.onKeyDown === 'function'
}

function esCampo(el: Element): el is HTMLInputElement | HTMLSelectElement {
  if (el instanceof HTMLSelectElement) return true
  if (!(el instanceof HTMLInputElement)) return false
  return !['button', 'submit', 'reset', 'file', 'hidden', 'image', 'range', 'color'].includes(el.type)
}

function enfocable(el: HTMLInputElement | HTMLSelectElement) {
  if (el.disabled || el.tabIndex < 0) return false
  if (el instanceof HTMLInputElement && el.readOnly) return false
  return el.getClientRects().length > 0
}

/** Pasa el foco al campo siguiente (o anterior) de la misma ventana o diálogo. */
export function avanzarCampo(desde: Element, atras = false) {
  const zona = desde.closest(`${SELECTOR_MODAL}, [data-gw-ventana], form`) ?? document.body
  const campos = Array.from(zona.querySelectorAll('input, select')).filter(esCampo).filter(enfocable)
  const i = campos.indexOf(desde as HTMLInputElement)
  if (i < 0) return false
  const sig = campos[atras ? i - 1 : i + 1]
  if (!sig) return false
  sig.focus()
  if (sig instanceof HTMLInputElement && typeof sig.select === 'function') {
    try {
      sig.select()
    } catch {
      /* number/date sin selección */
    }
  }
  return true
}

let introInstalado = false
/**
 * Intro / Mayús+Intro en un campo de la ventana activa: siguiente / anterior campo. No actúa si la
 * pantalla ya ha usado el Intro (preventDefault), si el campo tiene su propia tecla (salvo los
 * marcados `data-gw-intro="avanza"`: fechas, números, campos de búsqueda en modificación), en
 * áreas de texto ni dentro de un diálogo modal (allí Intro = Aceptar).
 */
export function instalarIntroAvanza() {
  if (introInstalado) return
  introInstalado = true
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return
    const t = e.target
    if (!(t instanceof Element) || !t.isConnected || !esCampo(t)) return
    if (modalAlPulsar(e) || teclaDeHerramienta(e) || !t.closest('[data-gw-ventana]')) return
    if (tieneTeclaPropia(t) && (t as HTMLElement).dataset.gwIntro !== 'avanza') return
    if (avanzarCampo(t, e.shiftKey)) e.preventDefault()
  })
}

// ---------------- Rejillas ----------------

/**
 * Nueva fila seleccionada para una tecla de rejilla, o null si la tecla no es de rejilla.
 * Flechas: una fila · AvPág/RePág: una página · Inicio/Fin: primera/última (dentro de un campo
 * de texto, solo con Ctrl, para no quitarle Inicio/Fin al cursor).
 */
export function filaPorTecla(e: { key: string; ctrlKey: boolean; target: EventTarget | null }, sel: number, total: number, porPagina = 10): number | null {
  if (total <= 0) return null
  const enTexto = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
  const ult = total - 1
  const s = Math.max(0, Math.min(sel, ult))
  switch (e.key) {
    case 'ArrowDown':
      return Math.min(sel < 0 ? 0 : s + 1, ult)
    case 'ArrowUp':
      return Math.max(s - 1, 0)
    case 'PageDown':
      return Math.min(s + porPagina, ult)
    case 'PageUp':
      return Math.max(s - porPagina, 0)
    case 'Home':
      return enTexto && !e.ctrlKey ? null : 0
    case 'End':
      return enTexto && !e.ctrlKey ? null : ult
    default:
      return null
  }
}

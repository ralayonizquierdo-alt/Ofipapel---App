/**
 * Copia un trozo de pantalla **con su formato** —tablas, negritas, colores—
 * para pegarlo en un correo con Ctrl+V (Luis, 08/11/2026: «yo quería que se
 * copiara el cuadro tal cual», y no como texto suelto).
 *
 * El enlace que abre Outlook solo deja pasar texto llano; el portapapeles sí
 * lleva HTML. Pero un correo no entiende las clases de Tailwind, así que a cada
 * elemento se le escribe su estilo ya calculado dentro (`style="…"`), y los
 * colores, que Tailwind 4 da en `oklch()`, se pasan a `rgb()`, que es lo que
 * entienden los programas de correo.
 *
 * Lo que es solo de pantalla (`print:hidden`: botones, pestañas, casillas) no
 * se copia, y lo que es solo de papel (`print:!block`: el título, el pie, el
 * mensaje de la conformidad) sí: se copia lo mismo que se imprime.
 */

const PROPIEDADES = [
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
  'text-align', 'vertical-align', 'white-space', 'text-decoration-line',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-bottom',
  'border-top-width', 'border-top-style', 'border-right-width', 'border-right-style',
  'border-bottom-width', 'border-bottom-style', 'border-left-width', 'border-left-style',
  'border-radius',
]
const COLORES = [
  'color', 'background-color',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
]

/** Cualquier color que entienda el navegador, en `rgb()`/`rgba()`. */
const cache = new Map<string, string>()
function aRgb(color: string): string {
  if (!color || /^rgba?\(/.test(color)) return color
  const ya = cache.get(color)
  if (ya) return ya
  const lienzo = document.createElement('canvas')
  lienzo.width = lienzo.height = 1
  const ctx = lienzo.getContext('2d', { willReadFrequently: true })
  if (!ctx) return color
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  const rgb = a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(2)})`
  cache.set(color, rgb)
  return rgb
}

/** Medidas que se encogen con la escala: letra y espacios, no el grosor de las líneas. */
const SE_ESCALAN = new Set([
  'font-size', 'line-height', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-bottom', 'border-radius',
])
/** «12px» × 0,75 → «9px». Lo que no son píxeles («normal», «0») se queda igual. */
function escalaPx(valor: string, escala: number): string {
  return escala === 1 ? valor : valor.replace(/(-?\d+(?:\.\d+)?)px/g, (_, n) => `${+(Number(n) * escala).toFixed(2)}px`)
}

/**
 * El HTML de `raiz` con los estilos escritos dentro, listo para un correo.
 * `escala` lo encoge: en Outlook salía muy grande (Luis, 08/11/2026: «hazlo
 * con un 75 %»), y el ancho se fija al de la ventana por esa escala, para que
 * no se estire a todo el correo.
 */
export function htmlConEstilos(raiz: HTMLElement, escala = 1): string {
  const copia = raiz.cloneNode(true) as HTMLElement
  const originales = [raiz, ...raiz.querySelectorAll<HTMLElement>('*')]
  const copias = [copia, ...copia.querySelectorAll<HTMLElement>('*')]
  const quitar: HTMLElement[] = []
  /** Filas «texto … cifra» (flex con los dos extremos): Outlook no entiende flex y las pegaba. */
  const filasAExtremos: HTMLElement[] = []

  originales.forEach((o, i) => {
    const d = copias[i]
    const clases = o.getAttribute('class') ?? ''
    const soloPantalla = /(^|\s)print:hidden(\s|$)/.test(clases)
    const soloPapel = /(^|\s)print:!block(\s|$)/.test(clases)
    const cs = getComputedStyle(o)
    if (soloPantalla || o.tagName === 'TEXTAREA' || o.tagName === 'BUTTON'
      || (cs.display === 'none' && !soloPapel)) {
      quitar.push(d)
      return
    }
    const estilo = [
      ...PROPIEDADES.map(p => `${p}:${SE_ESCALAN.has(p) ? escalaPx(cs.getPropertyValue(p), escala) : cs.getPropertyValue(p)}`),
      ...COLORES.map(p => `${p}:${aRgb(cs.getPropertyValue(p))}`),
    ]
    // El ancho de la ventana normal, aunque esté ampliada: si no, el cuadro
    // copiado desde la ventana grande saldría el doble de ancho.
    if (o === raiz) estilo.push(`width:${Math.round(Math.min(o.getBoundingClientRect().width, 640) * escala)}px`, 'max-width:100%')
    if (cs.display === 'flex' && cs.justifyContent === 'space-between' && o.children.length === 2) filasAExtremos.push(d)
    if (o.tagName === 'TABLE') estilo.push('border-collapse:collapse', 'width:100%')
    // Lo que en pantalla se pincha (la tarifa) en el correo es una cifra más.
    if (o.getAttribute('role') === 'link') {
      estilo.push('color:inherit', 'text-decoration-line:none', 'background-color:transparent')
    }
    if (soloPapel) estilo.push('display:block')
    else if (cs.display === 'flex') {
      estilo.push('display:flex', `justify-content:${cs.justifyContent}`, `align-items:${cs.alignItems}`, `gap:${cs.gap}`)
    }
    d.setAttribute('style', estilo.join(';'))
    d.removeAttribute('class')
    d.removeAttribute('role')
    d.removeAttribute('tabindex')
    d.removeAttribute('title')
  })
  for (const q of quitar) q.remove()
  // «IMPORTE BRUTO DE LA RESERVA ……… 3.291,00 €»: en vez de flex, una tabla de
  // una fila con el texto a la izquierda y la cifra a la derecha.
  for (const fila of filasAExtremos) {
    const [izq, der] = [...fila.children] as HTMLElement[]
    if (!izq || !der) continue
    const tabla = document.createElement('table')
    tabla.setAttribute('style', 'width:100%;border-collapse:collapse')
    tabla.setAttribute('role', 'presentation')
    const tr = tabla.insertRow()
    const a = tr.insertCell()
    const b = tr.insertCell()
    a.setAttribute('style', 'padding:0;text-align:left')
    b.setAttribute('style', 'padding:0;text-align:right;white-space:nowrap')
    a.append(izq)
    b.append(der)
    fila.replaceChildren(tabla)
    fila.style.display = 'block'
  }
  return copia.outerHTML
}

/**
 * Lo pone en el portapapeles como HTML y, para donde no se pueda pegar con
 * formato, también como texto llano.
 */
export async function copiarConFormato(html: string, textoLlano: string | null): Promise<void> {
  // Sin texto llano (`null`), lo copiado solo se puede pegar con formato. Es lo
  // que va al correo: Outlook abre con el cursor en «Para», y al pegar ahí el
  // texto llano se troceaba en veinte «correos no válidos» (Luis, 08/11/2026);
  // sin él, en «Para» no se pega nada y en el cuerpo sale el cuadro.
  const partes: Record<string, Blob> = { 'text/html': new Blob([html], { type: 'text/html' }) }
  if (textoLlano !== null) partes['text/plain'] = new Blob([textoLlano], { type: 'text/plain' })
  await navigator.clipboard.write([new ClipboardItem(partes)])
}

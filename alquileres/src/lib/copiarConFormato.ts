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

/** El HTML de `raiz` con los estilos escritos dentro, listo para un correo. */
export function htmlConEstilos(raiz: HTMLElement): string {
  const copia = raiz.cloneNode(true) as HTMLElement
  const originales = [raiz, ...raiz.querySelectorAll<HTMLElement>('*')]
  const copias = [copia, ...copia.querySelectorAll<HTMLElement>('*')]
  const quitar: HTMLElement[] = []

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
      ...PROPIEDADES.map(p => `${p}:${cs.getPropertyValue(p)}`),
      ...COLORES.map(p => `${p}:${aRgb(cs.getPropertyValue(p))}`),
    ]
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
  return copia.outerHTML
}

/**
 * Lo pone en el portapapeles como HTML y, para donde no se pueda pegar con
 * formato, también como texto llano.
 */
export async function copiarConFormato(html: string, textoLlano: string): Promise<void> {
  await navigator.clipboard.write([
    new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([textoLlano], { type: 'text/plain' }),
    }),
  ])
}

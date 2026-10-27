// Códigos de barras en SVG sin dependencias: EAN-13 (y EAN-8) para los códigos de barras de
// los artículos y Code 128 (juegos B y C) para el resto (códigos internos, códigos raros).

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const R = L.map((p) => p.replace(/./g, (c) => (c === '0' ? '1' : '0')))
const G = R.map((p) => p.split('').reverse().join(''))
const PARIDAD = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']

/** Dígito de control EAN/UPC de los dígitos sin el de control. */
export function digitoControlEan(sinControl: string): number {
  let s = 0
  const n = sinControl.length
  for (let i = 0; i < n; i++) s += Number(sinControl[n - 1 - i]) * (i % 2 === 0 ? 3 : 1)
  return (10 - (s % 10)) % 10
}

export function esEan13(c: string) {
  return /^\d{13}$/.test(c) && digitoControlEan(c.slice(0, 12)) === Number(c[12])
}
export function esEan8(c: string) {
  return /^\d{8}$/.test(c) && digitoControlEan(c.slice(0, 7)) === Number(c[7])
}

/** Módulos (1 = barra) de un EAN-13 válido. */
export function modulosEan13(c: string): string {
  const par = PARIDAD[Number(c[0])]
  let m = '101'
  for (let i = 1; i <= 6; i++) m += (par[i - 1] === 'L' ? L : G)[Number(c[i])]
  m += '01010'
  for (let i = 7; i <= 12; i++) m += R[Number(c[i])]
  return m + '101'
}

export function modulosEan8(c: string): string {
  let m = '101'
  for (let i = 0; i < 4; i++) m += L[Number(c[i])]
  m += '01010'
  for (let i = 4; i < 8; i++) m += R[Number(c[i])]
  return m + '101'
}

// Code 128: anchos barra/espacio de los valores 0…106 (106 = parada).
const C128 = (
  '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 ' +
  '123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 ' +
  '232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 ' +
  '313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 ' +
  '111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 ' +
  '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 ' +
  '114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'
).split(' ')

function anchosAModulos(a: string) {
  let m = ''
  for (let i = 0; i < a.length; i++) m += (i % 2 === 0 ? '1' : '0').repeat(Number(a[i]))
  return m
}

/** Módulos de un Code 128 (C para pares de dígitos, B para el resto). Caracteres fuera de ASCII imprimible: «?». */
export function modulosCode128(texto: string): string {
  const valores: number[] = []
  const t = texto.replace(/[^\x20-\x7e]/g, '?')
  let i = 0
  let juego: 'B' | 'C' = /^\d{4,}/.test(t) ? 'C' : 'B'
  valores.push(juego === 'C' ? 105 : 104)
  while (i < t.length) {
    const resto = t.slice(i)
    const digitos = /^\d*/.exec(resto)![0].length
    if (juego === 'B' && digitos >= 6 && digitos % 2 === 0) {
      valores.push(99)
      juego = 'C'
    } else if (juego === 'C' && digitos < 2) {
      valores.push(100)
      juego = 'B'
    }
    if (juego === 'C') {
      valores.push(Number(t.slice(i, i + 2)))
      i += 2
    } else {
      valores.push(t.charCodeAt(i) - 32)
      i += 1
    }
  }
  let suma = valores[0]
  for (let k = 1; k < valores.length; k++) suma += valores[k] * k
  valores.push(suma % 103)
  valores.push(106)
  return valores.map((v) => anchosAModulos(C128[v])).join('')
}

export type TipoBarras = 'ean13' | 'ean8' | 'code128'

/** Elige la simbología: EAN-13/EAN-8 si el código es válido (12 dígitos: se calcula el control), si no Code 128. */
export function prepararCodigo(c: string): { tipo: TipoBarras; texto: string } {
  const s = c.trim()
  if (/^\d{12}$/.test(s)) return { tipo: 'ean13', texto: s + digitoControlEan(s) }
  if (esEan13(s)) return { tipo: 'ean13', texto: s }
  if (esEan8(s)) return { tipo: 'ean8', texto: s }
  return { tipo: 'code128', texto: s }
}

/** Código de barras en SVG (ancho y alto en mm, para imprimir a tamaño real). */
export function CodigoBarras({ codigo, ancho, alto, conTexto = true }: { codigo: string; ancho: number; alto: number; conTexto?: boolean }) {
  if (!codigo.trim()) return null
  const { tipo, texto } = prepararCodigo(codigo)
  const mod = tipo === 'ean13' ? modulosEan13(texto) : tipo === 'ean8' ? modulosEan8(texto) : modulosCode128(texto)
  const quiet = tipo === 'code128' ? 10 : 9
  const total = mod.length + quiet * 2
  const hTexto = conTexto ? 9 : 0
  const hBarra = 50
  const rects: string[] = []
  for (let i = 0; i < mod.length; ) {
    if (mod[i] === '1') {
      let j = i
      while (j < mod.length && mod[j] === '1') j++
      rects.push(`M${quiet + i},0h${j - i}v${hBarra}h-${j - i}z`)
      i = j
    } else i++
  }
  return (
    <svg
      viewBox={`0 0 ${total} ${hBarra + hTexto}`}
      width={`${ancho}mm`}
      height={`${alto}mm`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Código de barras ${texto}`}
    >
      <rect width={total} height={hBarra + hTexto} fill="#fff" />
      <path d={rects.join('')} fill="#000" />
      {conTexto && (
        <text x={total / 2} y={hBarra + hTexto - 1} textAnchor="middle" fontSize={8.5} fontFamily="Arial, sans-serif" fill="#000" textLength={Math.min(total - 4, texto.length * 6)} lengthAdjust="spacingAndGlyphs">
          {texto}
        </text>
      )}
    </svg>
  )
}

import { unzipSync, strFromU8 } from 'fflate'

/**
 * Lee una hoja de Excel con el color de relleno de cada casilla.
 *
 * Hace falta para el calendario de reservas, donde cada estancia es una franja
 * pintada de un color: sin los colores no hay reservas que sacar. Las
 * librerías normales de Excel dan los valores pero no los rellenos, así que se
 * abre el fichero a mano — un .xlsx no es más que un zip con XML dentro.
 */

export interface CeldaXlsx {
  /** Texto de la casilla, vacío si no tiene. */texto: string
  /** Color de relleno en RRGGBB, o null si no tiene. */color: string | null
}

export interface HojaXlsx {
  nombre: string
  /** filas[fila][columna], ambas empezando en 1. Puede haber huecos. */
  filas: Map<number, Map<number, CeldaXlsx>>
  ultimaFila: number
}

/** «BC12» → { fila: 12, columna: 55 } */
function refA(ref: string): { fila: number; col: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)
  if (!m) return null
  let col = 0
  for (const c of m[1]) col = col * 26 + (c.charCodeAt(0) - 64)
  return { fila: Number(m[2]), col }
}

function texto(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml')
}

/**
 * Colores por índice del formato antiguo de Excel. Solo hacen falta los que
 * aparecen de verdad en los calendarios; el resto se ignora y esa casilla se
 * trata como sin pintar.
 */
const INDEXADOS: Record<number, string> = {
  0: '000000', 1: 'FFFFFF', 2: 'FF0000', 3: '00FF00', 4: '0000FF', 5: 'FFFF00',
  6: 'FF00FF', 7: '00FFFF', 8: '000000', 9: 'FFFFFF', 10: 'FF0000', 11: '00FF00',
  12: '0000FF', 13: 'FFFF00', 14: 'FF00FF', 15: '00FFFF',
}

export function leeXlsxConColores(datos: ArrayBuffer): HojaXlsx {
  const zip = unzipSync(new Uint8Array(datos))
  const lee = (ruta: string) => (zip[ruta] ? strFromU8(zip[ruta]) : '')

  // 1. Cadenas compartidas: el texto de las casillas suele vivir aquí.
  const compartidas: string[] = []
  const ss = lee('xl/sharedStrings.xml')
  if (ss) {
    for (const si of texto(ss).getElementsByTagName('si')) {
      // Un texto con varios formatos viene troceado en varios <t>.
      compartidas.push([...si.getElementsByTagName('t')].map(t => t.textContent || '').join(''))
    }
  }

  // 2. Estilos: del índice de estilo de la casilla al color de su relleno.
  const colorDeEstilo: (string | null)[] = []
  const st = lee('xl/styles.xml')
  if (st) {
    const doc = texto(st)
    const rellenos: (string | null)[] = []
    for (const fill of doc.getElementsByTagName('fill')) {
      const patron = fill.getElementsByTagName('patternFill')[0]
      const fg = patron?.getElementsByTagName('fgColor')[0]
      const tipo = patron?.getAttribute('patternType')
      if (!fg || !tipo || tipo === 'none') { rellenos.push(null); continue }
      const rgb = fg.getAttribute('rgb')
      const indexed = fg.getAttribute('indexed')
      rellenos.push(
        rgb ? rgb.slice(-6).toUpperCase()
          : indexed ? (INDEXADOS[Number(indexed)] ?? null)
            : null,
      )
    }
    const xfs = doc.getElementsByTagName('cellXfs')[0]
    for (const xf of xfs ? xf_hijos(xfs) : []) {
      const id = Number(xf.getAttribute('fillId') ?? -1)
      colorDeEstilo.push(rellenos[id] ?? null)
    }
  }

  // 3. La hoja: valor y estilo de cada casilla.
  const nombre = (() => {
    const wb = lee('xl/workbook.xml')
    return wb ? texto(wb).getElementsByTagName('sheet')[0]?.getAttribute('name') || 'Hoja 1' : 'Hoja 1'
  })()

  const rutaHoja = Object.keys(zip).find(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
  if (!rutaHoja) throw new Error('El fichero no parece un Excel con hojas dentro')
  const doc = texto(lee(rutaHoja))

  const filas = new Map<number, Map<number, CeldaXlsx>>()
  let ultimaFila = 0
  for (const c of doc.getElementsByTagName('c')) {
    const pos = refA(c.getAttribute('r') || '')
    if (!pos) continue

    const tipo = c.getAttribute('t')
    const valor = tipo === 'inlineStr'
      ? [...c.getElementsByTagName('t')].map(t => t.textContent || '').join('')
      : (() => {
        const v = c.getElementsByTagName('v')[0]?.textContent ?? ''
        return tipo === 's' ? (compartidas[Number(v)] ?? '') : v
      })()

    const s = c.getAttribute('s')
    const color = s !== null ? (colorDeEstilo[Number(s)] ?? null) : null
    if (!valor && !color) continue

    if (!filas.has(pos.fila)) filas.set(pos.fila, new Map())
    filas.get(pos.fila)!.set(pos.col, { texto: valor.trim(), color })
    if (pos.fila > ultimaFila) ultimaFila = pos.fila
  }

  return { nombre, filas, ultimaFila }
}

/** Los hijos directos de <cellXfs> son los <xf> que interesan. */
function xf_hijos(cellXfs: Element): Element[] {
  return [...cellXfs.children].filter(e => e.tagName === 'xf')
}

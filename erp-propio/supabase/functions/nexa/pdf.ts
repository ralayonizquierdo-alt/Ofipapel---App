// Generador de PDF de NEXA (listados en tabla y textos). Sin dependencias del resto de la función.
// Usa solo las fuentes estándar del PDF (Helvetica), que cubren el español; lo que no entra se cambia por «?».

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'npm:pdf-lib@1.17.1'

export interface ColumnaPdf {
  clave: string
  etiqueta: string
  tipo: string // texto | num | fecha | bool
  dec?: number
  suma?: boolean
}

export interface EntradaPdf {
  titulo: string
  /** Línea bajo el título (qué incluye, filtros…). */
  subtitulo?: string
  /** Quién lo saca y cuándo (sale arriba y en el pie). */
  firma?: string
  columnas?: ColumnaPdf[]
  filas?: Record<string, unknown>[]
  /** Clave de columna: un título y una hoja por cada valor. */
  separar?: string
  etiquetaSeparar?: string
  /** Texto libre (si no hay tabla): líneas; «# » = título, «- » = viñeta. */
  texto?: string
}

/** Mismo criterio que src/lib/listados/resultado.ts (resaltesResultado): mes azul, año amarillo, mejor cifra en negrita. */
function resaltes(columnas: ColumnaPdf[], filas: Record<string, unknown>[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const c of columnas) {
    if (c.tipo === 'num' && /pct|porc|variaci|crec/i.test(c.clave)) filas.forEach((f, i) => { const v = Number(f[c.clave]); if (v > 0) out.set(`${i}:${c.clave}`, 'sube'); else if (v < 0) out.set(`${i}:${c.clave}`, 'baja') })
  }
  const medidas = columnas.filter((c) => c.tipo === 'num' && !['numero', 'n_factura', 'anio', 'tarifa', 'registros'].includes(c.clave))
  if (!medidas.length || filas.length < 2) return out
  const principal = medidas.find((c) => /importe|total|venta|base|facturaci/i.test(c.clave)) ?? medidas[0]
  const tiempos = columnas.filter((c) => c.clave === 'mes' || c.clave === 'anio')
  const dims = columnas.filter((c) => c.tipo !== 'num' && c.clave !== 'mes' && c.clave !== 'anio')
  const num = (v: unknown) => Number(v) || 0
  for (const t of tiempos) {
    const grupos = new Map<string, number[]>()
    filas.forEach((f, i) => {
      const k = dims.map((d) => String(f[d.clave] ?? '')).join('|')
      grupos.set(k, [...(grupos.get(k) ?? []), i])
    })
    for (const idx of grupos.values()) {
      if (idx.length < 2) continue
      const mejor = idx.reduce((a, b) => (num(filas[b][principal.clave]) > num(filas[a][principal.clave]) ? b : a))
      out.set(`${mejor}:${t.clave}`, t.clave === 'mes' ? 'mes' : 'anio')
      out.set(`${mejor}:${principal.clave}`, 'max')
    }
  }
  return out
}

const VERDE = rgb(0.102, 0.361, 0.102)
const VERDE_CLARO = rgb(0.949, 0.973, 0.949)
const GRIS = rgb(0.35, 0.35, 0.35)
const MARGEN = 36

function numero(v: unknown, dec: number) {
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function celda(v: unknown, c: ColumnaPdf): string {
  if (v === null || v === undefined || v === '') return ''
  if (c.tipo === 'bool') return v === true || v === 'true' || v === 't' ? 'Sí' : 'No'
  if (c.tipo === 'num') return numero(v, c.dec ?? 2)
  if (c.tipo === 'fecha') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v))
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v)
  }
  return String(v)
}

export async function crearPdf(e: EntradaPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const normal = await doc.embedFont(StandardFonts.Helvetica)
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold)
  const juego = new Set(normal.getCharacterSet())
  const limpio = (s: string) => Array.from(s.replace(/[\r\n\t]+/g, ' ')).map((ch) => (juego.has(ch.codePointAt(0)!) ? ch : '?')).join('')

  const columnas = e.columnas ?? []
  const apaisado = columnas.length > 6
  const ANCHO = apaisado ? 841.89 : 595.28
  const ALTO = apaisado ? 595.28 : 841.89
  const util = ANCHO - MARGEN * 2
  const paginas: PDFPage[] = []
  let pag!: PDFPage
  let y = 0

  const nuevaPagina = () => {
    pag = doc.addPage([ANCHO, ALTO])
    paginas.push(pag)
    y = ALTO - MARGEN
  }

  // Ajuste de texto por palabras al ancho dado.
  const lineas = (texto: string, fuente: PDFFont, tam: number, ancho: number, maxLineas = 99): string[] => {
    const palabras = limpio(texto).split(' ').filter(Boolean)
    const out: string[] = []
    let actual = ''
    for (const p of palabras) {
      let w = p
      // palabra más larga que la celda: se trocea
      while (fuente.widthOfTextAtSize(w, tam) > ancho && w.length > 1) {
        let k = w.length - 1
        while (k > 1 && fuente.widthOfTextAtSize(w.slice(0, k), tam) > ancho) k--
        if (actual) {
          out.push(actual)
          actual = ''
        }
        out.push(w.slice(0, k))
        w = w.slice(k)
      }
      const prueba = actual ? `${actual} ${w}` : w
      if (fuente.widthOfTextAtSize(prueba, tam) <= ancho) actual = prueba
      else {
        if (actual) out.push(actual)
        actual = w
      }
    }
    if (actual) out.push(actual)
    if (out.length > maxLineas) {
      const rec = out.slice(0, maxLineas)
      rec[maxLineas - 1] = rec[maxLineas - 1].replace(/.{0,2}$/, '') + '..'
      return rec
    }
    return out.length ? out : ['']
  }

  const cabecera = () => {
    pag.drawText(limpio(e.titulo), { x: MARGEN, y: y - 16, size: 15, font: negrita, color: VERDE })
    y -= 22
    for (const l of [e.subtitulo, e.firma]) {
      if (!l) continue
      for (const ln of lineas(l, normal, 8.5, util, 3)) {
        pag.drawText(ln, { x: MARGEN, y: y - 9, size: 8.5, font: normal, color: GRIS })
        y -= 11
      }
    }
    pag.drawLine({ start: { x: MARGEN, y: y - 3 }, end: { x: ANCHO - MARGEN, y: y - 3 }, thickness: 1.2, color: VERDE })
    y -= 12
  }

  // ---- Tabla
  const TAM = 8
  const INT = 3
  const anchos = (() => {
    if (!columnas.length) return []
    const muestra = (e.filas ?? []).slice(0, 200)
    const pesos = columnas.map((c) => {
      let m = limpio(c.etiqueta).length
      for (const f of muestra) m = Math.max(m, Math.min(40, celda(f[c.clave], c).length))
      return Math.max(6, Math.min(40, m))
    })
    const total = pesos.reduce((a, b) => a + b, 0)
    return pesos.map((p) => (p / total) * util)
  })()

  const filaCabecera = () => {
    const alto = 15
    pag.drawRectangle({ x: MARGEN, y: y - alto, width: util, height: alto, color: VERDE })
    let x = MARGEN
    columnas.forEach((c, i) => {
      const t = lineas(c.etiqueta, negrita, TAM, anchos[i] - 2 * INT, 1)[0]
      const w = negrita.widthOfTextAtSize(t, TAM)
      pag.drawText(t, { x: c.tipo === 'num' ? x + anchos[i] - INT - w : x + INT, y: y - alto + 5, size: TAM, font: negrita, color: rgb(1, 1, 1) })
      x += anchos[i]
    })
    y -= alto
  }

  const dibujarFila = (f: Record<string, unknown>, par: boolean, forzarTotal = false) => {
    const celdas = columnas.map((c, i) => lineas(forzarTotal ? String(f[c.clave] ?? '') : celda(f[c.clave], c), forzarTotal ? negrita : normal, TAM, anchos[i] - 2 * INT, 3))
    const alto = Math.max(...celdas.map((l) => l.length)) * (TAM + 2) + 5
    if (y - alto < MARGEN + 14) {
      nuevaPagina()
      filaCabecera()
    }
    if (par || forzarTotal) pag.drawRectangle({ x: MARGEN, y: y - alto, width: util, height: alto, color: VERDE_CLARO })
    let x = MARGEN
    const marca = marcas.get(f)
    columnas.forEach((c, i) => {
      const z = marca?.get(c.clave)
      if (z === 'mes') pag.drawRectangle({ x, y: y - alto, width: anchos[i], height: alto, color: rgb(0.81, 0.89, 0.98) })
      if (z === 'anio') pag.drawRectangle({ x, y: y - alto, width: anchos[i], height: alto, color: rgb(1, 0.95, 0.69) })
      celdas[i].forEach((ln, k) => {
        const w = normal.widthOfTextAtSize(ln, TAM)
        pag.drawText(ln, { x: c.tipo === 'num' ? x + anchos[i] - INT - w : x + INT, y: y - 9 - k * (TAM + 2), size: TAM, font: forzarTotal || z ? negrita : normal, color: z === 'sube' ? rgb(0.12, 0.31, 0.61) : z === 'baja' ? rgb(0.75, 0, 0) : rgb(0.1, 0.1, 0.1) })
      })
      x += anchos[i]
    })
    pag.drawLine({ start: { x: MARGEN, y: y - alto }, end: { x: MARGEN + util, y: y - alto }, thickness: 0.3, color: rgb(0.8, 0.88, 0.8) })
    y -= alto
  }

  const marcas = new Map<Record<string, unknown>, Map<string, string>>()
  const tabla = (filas: Record<string, unknown>[]) => {
    filaCabecera()
    const r = resaltes(columnas, filas)
    filas.forEach((f, i) => {
      const m = new Map<string, string>()
      for (const c of columnas) { const z = r.get(`${i}:${c.clave}`); if (z) m.set(c.clave, z) }
      marcas.set(f, m)
    })
    filas.forEach((f, i) => dibujarFila(f, i % 2 === 1))
    const sumas = columnas.filter((c) => c.suma && c.tipo === 'num')
    if (sumas.length && filas.length) {
      const tot: Record<string, unknown> = {}
      columnas.forEach((c, i) => {
        tot[c.clave] = c.suma && c.tipo === 'num' ? numero(filas.reduce((s, f) => s + (Number(f[c.clave]) || 0), 0), c.dec ?? 2) : i === 0 ? 'TOTAL' : ''
      })
      dibujarFila(tot, false, true)
    }
  }

  nuevaPagina()
  cabecera()

  if (columnas.length && e.filas) {
    if (e.separar && columnas.length) {
      const grupos: { valor: string; filas: Record<string, unknown>[] }[] = []
      for (const f of e.filas) {
        const v = f[e.separar] == null ? '' : String(f[e.separar])
        const ult = grupos[grupos.length - 1]
        if (ult && ult.valor === v) ult.filas.push(f)
        else grupos.push({ valor: v, filas: [f] })
      }
      grupos.forEach((g, i) => {
        if (i > 0) {
          nuevaPagina()
          cabecera()
        }
        const titulo = `${e.etiquetaSeparar ?? e.separar}: ${g.valor || '(sin dato)'}  ·  ${g.filas.length} líneas`
        pag.drawRectangle({ x: MARGEN, y: y - 17, width: util, height: 17, color: VERDE_CLARO })
        pag.drawText(limpio(titulo), { x: MARGEN + 4, y: y - 12, size: 10.5, font: negrita, color: VERDE })
        y -= 21
        tabla(g.filas)
      })
    } else {
      tabla(e.filas)
    }
    if (!e.filas.length) pag.drawText('Sin resultados.', { x: MARGEN, y: y - 12, size: 10, font: normal, color: GRIS })
  } else if (e.texto) {
    for (const raw of e.texto.split('\n')) {
      const t = raw.trimEnd()
      if (!t.trim()) {
        y -= 6
        continue
      }
      const titulo = t.startsWith('# ')
      const vineta = t.startsWith('- ')
      const cuerpo = titulo ? t.slice(2) : vineta ? t.slice(2) : t
      const fuente = titulo ? negrita : normal
      const tam = titulo ? 12 : 10
      const sangria = vineta ? 12 : 0
      for (const [k, ln] of lineas(cuerpo, fuente, tam, util - sangria).entries()) {
        if (y - tam - 4 < MARGEN + 14) {
          nuevaPagina()
          cabecera()
        }
        if (vineta && k === 0) pag.drawText('•', { x: MARGEN + 2, y: y - tam, size: tam, font: normal, color: VERDE })
        pag.drawText(ln, { x: MARGEN + sangria, y: y - tam, size: tam, font: fuente, color: titulo ? VERDE : rgb(0.1, 0.1, 0.1) })
        y -= tam + 4
      }
      if (titulo) y -= 3
    }
  }

  // Pie de todas las páginas: «Página X de Y».
  paginas.forEach((p, i) => {
    const t = `${limpio(e.titulo).slice(0, 70)}  ·  Página ${i + 1} de ${paginas.length}`
    p.drawText(t, { x: MARGEN, y: 20, size: 8, font: normal, color: GRIS })
  })
  doc.setTitle(limpio(e.titulo))
  doc.setCreator('NEXA · Ofipapel ERP')
  return await doc.save()
}

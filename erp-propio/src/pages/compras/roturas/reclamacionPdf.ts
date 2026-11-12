// PDF de la reclamación de abono a un proveedor (Gestor de Roturas, tarea 32). Se hace en el
// navegador con jsPDF: lista de artículos (expediente, código, referencia, cantidad, motivo) y un
// anexo con las fotos de cada uno. Va adjunto al correo, así que tiene que pesar poco: las fotos se
// vuelven a reducir aquí y hay un tope, porque Microsoft no deja mandar más de 3 MB de una vez.

import { jsPDF } from 'jspdf'

export interface ItemReclamacion {
  numero: string
  codigo: string
  referencia: string | null
  descripcion: string
  cantidad: number
  motivo: string
  detalle: string | null
  /** Enlaces temporales a las fotos del expediente. */
  fotos: string[]
}

export const asuntoReclamacion = (fecha: string) => `Reclamación de abono - Ofipapel - ${fecha}`

export function cuerpoReclamacion(proveedor: string, n: number) {
  return [
    `Estimados señores/as de ${proveedor},`,
    '',
    `Les remitimos la reclamación de abono de ${n} ${n === 1 ? 'artículo' : 'artículos'}. En el PDF adjunto encontrarán el detalle completo: ` +
      'referencia, código interno, cantidad y motivo de cada uno, además de fotos de la mercancía dañada cuando las hay.',
    '',
    'Quedamos a la espera de su decisión y abono antes de proceder con la destrucción de la mercancía.',
    '',
    'En caso de necesitar más fotos o detalles de alguno de los artículos, háganoslo saber.',
    '',
    'Un saludo,',
    'Ofipapel · Compras',
  ].join('\n')
}

const MAX_FOTOS = 12
const LADO_FOTO = 900 // px
const MAX_PDF = 2_700_000 // bytes: margen sobre los 3 MB del correo

interface Foto {
  datos: string
  ancho: number
  alto: number
}

async function cargarFoto(url: string, calidad: number): Promise<Foto | null> {
  try {
    const blob = await (await fetch(url)).blob()
    const img = await createImageBitmap(blob)
    const escala = Math.min(1, LADO_FOTO / Math.max(img.width, img.height))
    const lienzo = document.createElement('canvas')
    lienzo.width = Math.round(img.width * escala)
    lienzo.height = Math.round(img.height * escala)
    const ctx = lienzo.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, lienzo.width, lienzo.height)
    ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height)
    return { datos: lienzo.toDataURL('image/jpeg', calidad), ancho: lienzo.width, alto: lienzo.height }
  } catch {
    return null // una foto que no se puede leer no bloquea la reclamación
  }
}

function componer(proveedor: string, fecha: string, items: ItemReclamacion[], fotos: Map<string, Foto[]>): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const M = 14
  const ANCHO = 210 - M * 2
  let y = 18
  const salto = (alto: number) => {
    if (y + alto > 283) {
      doc.addPage()
      y = 18
    }
  }

  doc.setFont('helvetica', 'bold').setFontSize(16).text('Reclamación de abono', M, y)
  doc.setFont('helvetica', 'normal').setFontSize(10).text('Suministros de Oficina Ofipapel, S.L.', 210 - M, y, { align: 'right' })
  y += 7
  doc.setFontSize(11).text(`Proveedor: ${proveedor}`, M, y)
  doc.text(`Fecha: ${fecha}`, 210 - M, y, { align: 'right' })
  y += 4
  doc.setDrawColor(0).line(M, y, 210 - M, y)
  y += 6

  // Tabla de artículos
  const cols = [
    { t: 'Expediente', x: M, w: 30 },
    { t: 'Cód.', x: M + 30, w: 17 },
    { t: 'Ref. proveedor', x: M + 47, w: 27 },
    { t: 'Artículo', x: M + 74, w: 58 },
    { t: 'Cant.', x: M + 132, w: 12 },
    { t: 'Motivo', x: M + 144, w: ANCHO - 144 },
  ]
  doc.setFillColor(230, 230, 230).rect(M, y - 4, ANCHO, 6, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(9)
  cols.forEach((c) => doc.text(c.t, c.x + 1, y))
  y += 5
  doc.setFont('helvetica', 'normal').setFontSize(9)
  for (const it of items) {
    const celdas = [
      [it.numero],
      doc.splitTextToSize(it.codigo, cols[1].w - 2) as string[],
      doc.splitTextToSize(it.referencia ?? '', cols[2].w - 2) as string[],
      doc.splitTextToSize(it.descripcion, cols[3].w - 2) as string[],
      [new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 }).format(it.cantidad)],
      doc.splitTextToSize(it.detalle ? `${it.motivo}. ${it.detalle}` : it.motivo, cols[5].w - 2) as string[],
    ]
    const alto = Math.max(...celdas.map((c) => c.length)) * 4 + 2
    salto(alto)
    celdas.forEach((c, i) => doc.text(c, cols[i].x + 1, y))
    doc.setDrawColor(190).line(M, y + alto - 4, 210 - M, y + alto - 4)
    y += alto
  }

  // Anexo de fotos
  const conFotos = items.filter((it) => fotos.get(it.numero)?.length)
  if (conFotos.length) {
    doc.addPage()
    y = 18
    doc.setFont('helvetica', 'bold').setFontSize(13).text('Anexo: fotos de la mercancía', M, y)
    y += 8
    const ANCHO_FOTO = (ANCHO - 6) / 2
    for (const it of conFotos) {
      salto(12)
      doc.setFont('helvetica', 'bold').setFontSize(10).text(`${it.numero} · ${it.codigo} · ${it.descripcion}`.slice(0, 110), M, y)
      y += 4
      const lista = fotos.get(it.numero) ?? []
      for (let i = 0; i < lista.length; i += 2) {
        const par = lista.slice(i, i + 2)
        const altos = par.map((f) => Math.min(90, (ANCHO_FOTO * f.alto) / f.ancho))
        const alto = Math.max(...altos)
        salto(alto + 4)
        par.forEach((f, k) => {
          const h = altos[k]
          const w = (h * f.ancho) / f.alto
          doc.addImage(f.datos, 'JPEG', M + k * (ANCHO_FOTO + 6), y, w, h)
        })
        y += alto + 4
      }
      y += 2
    }
  }
  return doc
}

/**
 * Genera el PDF. Si con las fotos pasa del tamaño que admite el correo, lo vuelve a hacer con las
 * fotos más comprimidas y, si aun así no cabe, sin fotos (y avisa).
 */
export async function generarPdfReclamacion(proveedor: string, fecha: string, items: ItemReclamacion[]): Promise<{ pdf: Blob; fotosIncluidas: number; aviso: string | null }> {
  const total = items.reduce((n, it) => n + it.fotos.length, 0)
  for (const calidad of [0.72, 0.5]) {
    const fotos = new Map<string, Foto[]>()
    let quedan = MAX_FOTOS
    for (const it of items) {
      const lista: Foto[] = []
      for (const url of it.fotos) {
        if (quedan <= 0) break
        const f = await cargarFoto(url, calidad)
        if (f) {
          lista.push(f)
          quedan--
        }
      }
      fotos.set(it.numero, lista)
    }
    const incluidas = MAX_FOTOS - quedan
    const pdf = componer(proveedor, fecha, items, fotos).output('blob')
    if (pdf.size <= MAX_PDF)
      return { pdf, fotosIncluidas: incluidas, aviso: incluidas < total ? `Van ${incluidas} de ${total} fotos (el correo no admite más).` : null }
  }
  const pdf = componer(proveedor, fecha, items, new Map()).output('blob')
  return { pdf, fotosIncluidas: 0, aviso: 'Las fotos pesan demasiado para el correo: el PDF va sin fotos. Envíalas aparte si el proveedor las pide.' }
}

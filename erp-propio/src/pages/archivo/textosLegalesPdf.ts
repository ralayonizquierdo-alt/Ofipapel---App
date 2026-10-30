// PDF de los textos legales (Luis, 30/10/2026): el texto tal cual se enseñó a un empleado y el
// justificante de su aceptación o denegación (quién, cuándo, desde qué conexión y equipo, y la
// versión exacta del texto). Se hacen en el navegador con jsPDF.

import { jsPDF } from 'jspdf'

export interface DatosJustificante {
  titulo: string
  contenido: string | null
  version: string
  resultado: 'aceptado' | 'denegado'
  fecha: string
  empleado: string
  empleadoNombre: string | null
  empleadoNumero: string | null
  grupo: string | null
  ip: string | null
  dispositivo: string | null
}

const AZUL: [number, number, number] = [29, 58, 138]
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** Escribe un texto largo con saltos de página. Devuelve la altura final. */
function escribir(doc: jsPDF, texto: string, y: number, tam = 10): number {
  doc.setFont('helvetica', 'normal').setFontSize(tam).setTextColor(30)
  const lineas = doc.splitTextToSize(texto, 182) as string[]
  for (const l of lineas) {
    if (y > 282) {
      doc.addPage()
      y = 16
    }
    doc.text(l, 14, y)
    y += tam * 0.45
  }
  return y
}

function cabecera(doc: jsPDF, titulo: string) {
  doc.setFillColor(...AZUL).rect(0, 0, 210, 16, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(255).text(titulo, 14, 10.5)
}

function descargar(doc: jsPDF, nombre: string) {
  const url = URL.createObjectURL(doc.output('blob'))
  if (!window.open(url, '_blank')) {
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = nombre
    enlace.click()
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

/** El texto legal, tal cual (esa versión). */
export function pdfTextoLegal(d: Pick<DatosJustificante, 'titulo' | 'contenido' | 'version'>) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  cabecera(doc, 'TEXTO LEGAL')
  doc
    .setFont('helvetica', 'bold')
    .setFontSize(11)
    .setTextColor(...AZUL)
  let y = escribir(doc, d.titulo, 26, 11)
  doc
    .setFontSize(8)
    .setTextColor(110)
    .text(`Versión ${d.version}`, 14, y + 2)
  escribir(doc, d.contenido ?? '', y + 9)
  descargar(doc, `Texto legal ${d.version.slice(0, 8)}.pdf`)
}

/** Justificante de la aceptación (o denegación) de un empleado, con el texto completo debajo. */
export function pdfJustificante(d: DatosJustificante) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const acepta = d.resultado === 'aceptado'
  cabecera(doc, acepta ? 'JUSTIFICANTE DE ACEPTACIÓN DE TEXTO LEGAL' : 'JUSTIFICANTE DE DENEGACIÓN DE TEXTO LEGAL')
  const filas: [string, string][] = [
    ['Empleado', `${d.empleadoNumero ?? d.empleado} · ${d.empleadoNombre ?? ''}`],
    ['Tipo clave acceso', d.grupo ?? '—'],
    ['Resultado', acepta ? 'ACEPTADO («Doy mi conformidad»)' : 'NO ACEPTADO («Ahora no»)'],
    ['Fecha y hora', fechaHora(d.fecha)],
    ['Conexión (IP)', d.ip ?? '—'],
    ['Equipo', d.dispositivo ?? '—'],
    ['Texto', d.titulo],
    ['Versión del texto', d.version],
  ]
  let y = 26
  doc.setDrawColor(190).setLineWidth(0.3)
  for (const [k, v] of filas) {
    const val = doc.splitTextToSize(v, 130) as string[]
    const alto = Math.max(7, val.length * 4.6 + 2.4)
    doc.setFillColor(238, 243, 251).rect(14, y, 48, alto, 'FD')
    doc.rect(62, y, 134, alto)
    doc
      .setFont('helvetica', 'bold')
      .setFontSize(9.5)
      .setTextColor(...AZUL)
      .text(k, 16, y + 4.8)
    doc
      .setFont('helvetica', 'normal')
      .setTextColor(acepta || k !== 'Resultado' ? 20 : 180)
      .text(val, 64, y + 4.8)
    y += alto
  }
  doc.setFont('helvetica', 'italic').setFontSize(8.5).setTextColor(90)
  y = escribir(doc, 'Registro generado por el ERP de la empresa. El registro original no se puede modificar ni borrar.', y + 6, 8.5)
  doc
    .setFont('helvetica', 'bold')
    .setFontSize(10.5)
    .setTextColor(...AZUL)
    .text('Texto que se le mostró:', 14, y + 6)
  escribir(doc, d.contenido ?? '', y + 12)
  descargar(doc, `Justificante ${d.empleadoNumero ?? d.empleado} ${d.fecha.slice(0, 10)}.pdf`)
}

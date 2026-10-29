// PDF del presupuesto (Luis, 29/10/2026): A4 con el logo de Ofipapel, datos de la empresa y del
// cliente, líneas (código, descripción, cantidad, precio, dto. e importe), totales, validez y
// vendedor. Se hace en el navegador con jsPDF (sin servidor).

import { jsPDF } from 'jspdf'
import { supabase } from '../../../lib/supabase'

export interface LineaPdf {
  codigo: string | null
  descripcion: string | null
  cantidad: number
  precio: number
  descuento_pct: number
  importe: number
}

export interface DatosPdf {
  tienda: string
  numero: number
  fecha: string | null
  validoHasta: string | null
  clienteCodigo: string | null
  clienteNombre: string | null
  nif: string | null
  vendedor: string | null
  observaciones: string | null
  lineas: LineaPdf[]
  base: number
  igic: number
  total: number
}

const eur = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fecha = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '')

async function imagen(url: string): Promise<string | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const b = await r.blob()
    return await new Promise((ok) => {
      const fr = new FileReader()
      fr.onload = () => ok(String(fr.result))
      fr.onerror = () => ok(null)
      fr.readAsDataURL(b)
    })
  } catch {
    return null
  }
}

/** Nombre del fichero: «Presupuesto 01-30 CLIENTE.pdf». */
export const nombrePdf = (d: DatosPdf) => `Presupuesto ${d.tienda}-${d.numero}${d.clienteNombre ? ` ${d.clienteNombre.replace(/[^\w áéíóúñÁÉÍÓÚÑ.-]/g, '').slice(0, 40)}` : ''}.pdf`

export async function presupuestoPdf(d: DatosPdf): Promise<Blob> {
  const [emp, cli, logo] = await Promise.all([
    supabase.from('empresa').select('nombre, nombre_comercial, cif, direccion, codigo_postal, poblacion, telefono_fijo, email, web').order('codigo').limit(1).maybeSingle(),
    d.clienteCodigo
      ? supabase.from('cliente').select('direccion, codigo_postal, poblacion, telefono_fijo, telefono_movil, email, nif').eq('codigo', d.clienteCodigo).maybeSingle()
      : Promise.resolve({ data: null }),
    imagen(`${import.meta.env.BASE_URL}marca/logo-ofipapel.png`),
  ])
  const e = (emp.data ?? {}) as Record<string, string | null>
  const c = (cli.data ?? {}) as Record<string, string | null>
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const AZUL: [number, number, number] = [29, 58, 138]
  const W = 210
  let y = 14

  // Cabecera: logo y empresa
  if (logo) doc.addImage(logo, 'PNG', 14, y - 4, 46, 24)
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(0)
  doc.text(e.nombre ?? 'SUMINISTROS DE OFICINA OFIPAPEL, S.L.', W - 14, y, { align: 'right' })
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(60)
  const empLineas = [
    e.cif ? `CIF ${e.cif}` : '',
    [e.direccion, [e.codigo_postal, e.poblacion].filter(Boolean).join(' ')].filter(Boolean).join(' · '),
    [e.telefono_fijo ? `Tel. ${e.telefono_fijo}` : '', e.email ?? ''].filter(Boolean).join(' · '),
    e.web ?? '',
  ].filter(Boolean)
  empLineas.forEach((t, i) => doc.text(t, W - 14, y + 5 + i * 4.5, { align: 'right' }))
  y = 42

  // Título
  doc.setFillColor(...AZUL).rect(14, y, W - 28, 11, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(255)
  doc.text(`PRESUPUESTO Nº ${d.tienda}-${d.numero}`, 18, y + 7.6)
  doc.setFontSize(10).text(`Fecha: ${fecha(d.fecha)}${d.validoHasta ? `   ·   Válido hasta: ${fecha(d.validoHasta)}` : ''}`, W - 18, y + 7.3, { align: 'right' })
  y += 17

  // Cliente
  doc.setDrawColor(190).setLineWidth(0.3).rect(14, y, W - 28, 24)
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...AZUL).text('CLIENTE', 17, y + 5)
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(0).text(`${d.clienteNombre ?? ''}`, 17, y + 11)
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(60)
  const nif = d.nif || c.nif
  doc.text([nif ? `NIF ${nif}` : '', d.clienteCodigo ? `Cliente nº ${d.clienteCodigo}` : ''].filter(Boolean).join(' · '), 17, y + 16)
  doc.text([c.direccion, [c.codigo_postal, c.poblacion].filter(Boolean).join(' ')].filter(Boolean).join(' · '), 17, y + 20.5)
  doc.text([c.telefono_movil || c.telefono_fijo, c.email].filter(Boolean).join(' · '), W - 17, y + 20.5, { align: 'right' })
  y += 30

  // Líneas
  const cols = [
    { t: 'Código', x: 16, w: 28, a: 'left' as const },
    { t: 'Descripción', x: 45, w: 80, a: 'left' as const },
    { t: 'Cant.', x: 140, w: 15, a: 'right' as const },
    { t: 'Precio', x: 160, w: 18, a: 'right' as const },
    { t: 'Dto.%', x: 174, w: 12, a: 'right' as const },
    { t: 'Importe', x: W - 16, w: 20, a: 'right' as const },
  ]
  const cabecera = () => {
    doc.setFillColor(232, 236, 244).rect(14, y, W - 28, 7, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...AZUL)
    cols.forEach((col) => doc.text(col.t, col.x, y + 4.8, { align: col.a }))
    y += 9
  }
  cabecera()
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(0)
  d.lineas.forEach((l, i) => {
    const desc = doc.splitTextToSize(l.descripcion ?? '', 92) as string[]
    const alto = Math.max(5.5, desc.length * 4.2 + 1.3)
    if (y + alto > 255) {
      doc.addPage()
      y = 16
      cabecera()
      doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(0)
    }
    if (i % 2 === 1) doc.setFillColor(248, 248, 248).rect(14, y - 3.8, W - 28, alto, 'F')
    doc.text(l.codigo ?? '', 16, y)
    doc.text(desc, 45, y)
    doc.text(eur(l.cantidad).replace(/,00$/, ''), 140, y, { align: 'right' })
    doc.text(eur(l.precio), 160, y, { align: 'right' })
    doc.text(l.descuento_pct ? eur(l.descuento_pct) : '', 174, y, { align: 'right' })
    doc.text(eur(l.importe), W - 16, y, { align: 'right' })
    y += alto
  })
  doc.setDrawColor(...AZUL).setLineWidth(0.5).line(14, y - 2, W - 14, y - 2)
  y += 4

  // Totales
  if (y > 250) {
    doc.addPage()
    y = 20
  }
  const tot = (t: string, v: number, negrita = false) => {
    doc.setFont('helvetica', negrita ? 'bold' : 'normal').setFontSize(negrita ? 12 : 10).setTextColor(negrita ? 0 : 60)
    doc.text(t, 150, y, { align: 'right' })
    doc.text(`${eur(v)} €`, W - 16, y, { align: 'right' })
    y += negrita ? 7 : 5.5
  }
  tot('Base imponible', d.base)
  tot('IGIC', d.igic)
  doc.setFillColor(232, 236, 244).rect(110, y - 5, W - 124, 8, 'F')
  tot('TOTAL', d.total, true)

  // Observaciones y pie
  y += 4
  if (d.observaciones) {
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...AZUL).text('Observaciones', 14, y)
    doc.setFont('helvetica', 'normal').setTextColor(60)
    const obs = doc.splitTextToSize(d.observaciones, W - 28) as string[]
    doc.text(obs, 14, y + 5)
  }
  const pie = [
    d.validoHasta ? `Presupuesto válido hasta el ${fecha(d.validoHasta)}.` : 'Presupuesto válido durante 30 días.',
    'Precios con IGIC detallado. Para aceptarlo, responda a este correo o llámenos.',
    d.vendedor ? `Le atiende: vendedor nº ${d.vendedor}.` : '',
  ].filter(Boolean)
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(90)
  pie.forEach((t, i) => doc.text(t, W / 2, 280 + i * 4.2, { align: 'center' }))
  return doc.output('blob')
}

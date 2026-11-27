// Presupuesto / pedido / proforma en A4 (papel, PDF, correo y compartir salen de aquí).
//
// Rober, 27/11/2026: el formato por defecto es el de GeminisWin PEDIDOSDAV3.FRX (el que usa David), en todos los
// terminales y tablets. Las posiciones se han sacado del propio .FRX (unidades de 1/10000 de pulgada → mm) y se
// respetan sus cinco bandas:
//   · Cabecera de página (todas las páginas): logo, CIF y dirección de Ofipapel.
//   · Cabecera del documento (todas las páginas): Nº documento, fecha, vendedor, cliente, empleado; recuadro del
//     cliente; título PRESUPUESTO/PEDIDO; forma de pago; página; cabecera de columnas.
//   · Líneas: Código · Descripción · Uds. · IGIC · Dto. · Precio · Importe, con las líneas verticales de la rejilla.
//   · Pie del documento (solo al final): observaciones, desglose de IGIC por tipos, dto. de pie, Subtotal / Total
//     IGIC / Total (€), IBAN, sucursal y ruta.
//   · Pie de página (todas las páginas): validez del presupuesto, entrega a cuenta, código de barras del número,
//     texto LOPD y registro mercantil.
// Se hace en el navegador con jsPDF (sin servidor).

import { jsPDF } from 'jspdf'
import JsBarcode from 'jsbarcode'
import { supabase } from '../../../lib/supabase'

export interface LineaPdf {
  codigo: string | null
  descripcion: string | null
  cantidad: number
  precio: number
  descuento_pct: number
  /** Importe de la línea (cantidad × precio − dto. de línea). */
  importe: number
  /** % de IGIC de la línea (columna IGIC y desglose por tipos). */
  igic_pct?: number
  /** Base de la línea con el dto. de pie y el canon ya aplicados, y su cuota de IGIC (desglose por tipos). */
  base?: number
  cuota_igic?: number
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
  /** Título del documento (menú de la impresora del pedido): por defecto «PRESUPUESTO». */
  tituloDoc?: string
  empleado?: string | null
  formaPagoCodigo?: string | null
  ruta?: string | null
  sucursalCodigo?: string | null
  /** Suma de importes de línea antes del dto. de pie, el dto. de pie (%) y su importe. */
  subtotal?: number
  dtoPiePct?: number
  totalDtoPie?: number
  /** IGIC único de pie (si > 0 manda sobre el de cada línea). */
  igicPiePct?: number
  /** Entregado a cuenta (si se conoce). */
  entregaCuenta?: number | null
}

const eur = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fecha = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '')
const miles = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 0 })

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

/** Código de barras (CODE128) del número del documento, como el BarcodeToImg del formato de GeminisWin. */
function codigoBarras(texto: string): string | null {
  try {
    const c = document.createElement('canvas')
    JsBarcode(c, texto, { format: 'CODE128', displayValue: true, fontSize: 18, margin: 0, height: 60, width: 2 })
    return c.toDataURL('image/png')
  } catch {
    return null
  }
}

/** Nombre del fichero: «Presupuesto 01-30 CLIENTE.pdf». */
export const nombrePdf = (d: DatosPdf) => `Presupuesto ${d.tienda}-${d.numero}${d.clienteNombre ? ` ${d.clienteNombre.replace(/[^\w áéíóúñÁÉÍÓÚÑ.-]/g, '').slice(0, 40)}` : ''}.pdf`

// Unidades del .FRX (1/10000 de pulgada) → mm.
const u = (v: number) => v * 0.00254
// Márgenes del papel (lo que la impresora no imprime) y bandas del formato.
const OX = 6.5
const OY = 6
const H_CAB_PAG = u(12605) // 32,0 mm
const H_CAB_DOC = u(23959) // 60,9 mm
const H_LINEA = u(2188) // 5,6 mm
const H_PIE_DOC = u(28750) // 73,0 mm
const H_PIE_PAG = u(14896) // 37,8 mm
const ANCHO = u(77604) // 197 mm
const PIE_PAG_Y = 297 - 5 - H_PIE_PAG
// Columnas (líneas verticales de la rejilla, en mm desde el margen).
const COL = [0, u(8854), u(52396), u(56250), u(59687), u(63125), u(70104), u(77396)]

export async function presupuestoPdf(d: DatosPdf): Promise<Blob> {
  const [emp, cli, suc, fp, lopd, logo] = await Promise.all([
    supabase.from('empresa').select('nombre, cif, direccion, codigo_postal, poblacion, telefono_fijo, fax, email, web').order('codigo').limit(1).maybeSingle(),
    d.clienteCodigo
      ? supabase.from('cliente').select('nombre, razon_social, direccion, codigo_postal, poblacion, telefono_fijo, telefono_movil, nif, ruta_codigo').eq('codigo', d.clienteCodigo).maybeSingle()
      : Promise.resolve({ data: null }),
    d.clienteCodigo && d.sucursalCodigo
      ? supabase.from('cliente_sucursal').select('nombre, direccion, poblacion, telefono_fijo, telefono_movil, contacto, ruta_codigo').eq('cliente_codigo', d.clienteCodigo).eq('codigo', d.sucursalCodigo).maybeSingle()
      : Promise.resolve({ data: null }),
    d.formaPagoCodigo ? supabase.from('forma_pago').select('descripcion').eq('codigo', d.formaPagoCodigo).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('parametro').select('valor').eq('clave', 'tpv.texto_lopd').maybeSingle(),
    imagen(`${import.meta.env.BASE_URL}marca/logo-ofipapel.png`),
  ])
  const e = (emp.data ?? {}) as Record<string, string | null>
  const c = (cli.data ?? {}) as Record<string, string | null>
  const s = (suc.data ?? null) as Record<string, string | null> | null
  const formaPago = ((fp.data ?? {}) as { descripcion?: string | null }).descripcion ?? d.formaPagoCodigo ?? ''
  const textoLopd = ((lopd.data ?? {}) as { valor?: unknown }).valor
  const titulo = d.tituloDoc ?? 'PRESUPUESTO'
  const esPresupuesto = titulo === 'PRESUPUESTO'
  const barras = codigoBarras(String(d.numero))

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const X = (mm: number) => OX + mm
  const txt = (t: string | string[], x: number, y: number, o?: { align?: 'left' | 'right' | 'center'; maxWidth?: number }) =>
    doc.text(t, X(x), y, o)
  const fuente = (estilo: 'normal' | 'bold', tam: number, familia = 'helvetica') => doc.setFont(familia, estilo).setFontSize(tam).setTextColor(0)
  // Altura de la línea base de un texto dentro de una caja del .FRX que empieza en «top».
  const base = (top: number, tam = 10) => top + tam * 0.3

  // Páginas: se pintan cabeceras y pie de página al abrir cada una; el total de páginas no hace falta (GW tampoco).
  let pagina = 0
  let y = 0
  const nuevaPagina = () => {
    if (pagina > 0) doc.addPage()
    pagina += 1
    cabeceraPagina()
    cabeceraDocumento()
    piePagina()
    y = OY + H_CAB_PAG + H_CAB_DOC
  }

  function cabeceraPagina() {
    if (logo) {
      const p = doc.getImageProperties(logo)
      const h = u(8542)
      const w = Math.min(u(20104), (h * p.width) / p.height)
      doc.addImage(logo, 'PNG', X(u(1250)), OY + u(1250), w, h)
    }
    fuente('normal', 10)
    txt(`CIF: ${e.cif ?? 'B-38381653'}`, u(45937), base(OY + u(1771)))
    fuente('normal', 9)
    const dir = [
      e.direccion ?? 'Bulevar Chajofe, 4',
      `${e.codigo_postal ?? '38650'} - ${e.poblacion ?? 'Los Cristianos'} - Tenerife`,
      `Tel.${e.telefono_fijo ?? '922.75.35.20'}${e.fax ? ` - Fax.${e.fax}` : ' - Fax.922.75.28.89'}`,
      e.web ?? 'www.ofipapel.org',
      e.email ?? 'comercial@ofipapelsl.com',
    ]
    dir.forEach((t, i) => txt(t, u(46042), base(OY + u(3333), 9) + i * 3.9))
  }

  function cabeceraDocumento() {
    const g = OY + H_CAB_PAG
    const r = (v: number) => g + u(v - 14688)
    // Etiquetas y valores de la izquierda.
    const fila = (etq: string, xEtq: number, vEtq: number, valor: string, vVal: number, negrita = false) => {
      fuente('normal', 10)
      txt(etq, u(xEtq), base(r(vEtq)))
      fuente(negrita ? 'bold' : 'normal', 10)
      txt(valor, u(12500), base(r(vVal)))
    }
    fila('Nº Documento:', 1667, 16875, `${miles(d.numero)}-${d.tienda}`, 16875, true)
    fila('Fecha:', 6771, 19479, fecha(d.fecha), 19271)
    fila('Vendedor:', 4792, 21875, d.vendedor ?? '', 21771)
    fila('Cod. Cliente:', 3229, 24375, d.clienteCodigo ?? '', 24271)
    fila('Empleado:', 4583, 26875, d.empleado ?? '', 26979)
    doc.setDrawColor(0).setLineWidth(0.25).line(X(u(11667)), r(15937), X(u(11667)), r(15937) + u(14062))
    // Recuadro del cliente.
    doc.rect(X(u(38750)), r(16354), u(36354), u(11354))
    fuente('normal', 10)
    const xc = u(39583)
    txt(d.clienteNombre ?? c.nombre ?? '', xc, base(r(16979)), { maxWidth: u(34792) })
    if (d.clienteCodigo) txt(c.razon_social ?? '', xc, base(r(18750)), { maxWidth: u(38021) })
    txt(d.nif || c.nif || '', xc, base(r(20521)))
    txt(c.direccion ?? '', xc, base(r(22292)), { maxWidth: u(35104) })
    fuente('normal', 9)
    txt(c.codigo_postal ?? '', xc, base(r(24062), 9))
    txt(c.poblacion ?? '', u(52708), base(r(24167), 9), { maxWidth: u(21458) })
    if (c.telefono_fijo) {
      txt('Tel.', u(39687), base(r(25729), 9))
      txt(c.telefono_fijo, u(42187), base(r(25625), 9))
    }
    if (c.telefono_movil) {
      txt('Mov.', u(55729), base(r(25937), 9))
      txt(c.telefono_movil, u(59271), base(r(25833), 9))
    }
    // Título.
    fuente('bold', 26)
    if (titulo === 'PEDIDO') txt('PEDIDO', u(32812), base(r(28750), 26) + 1)
    else txt(titulo, u(27917) + u(27083), base(r(28646), 26) + 1, { align: 'right' })
    // Forma de pago y página.
    fuente('normal', 10)
    if (formaPago) txt(`Forma Pago: ${formaPago}`, u(20000), base(r(33229)), { maxWidth: u(47187) })
    txt(`Página: ${pagina}`, u(63437), base(r(33125)))
    // Cabecera de columnas.
    const yc = r(36667)
    doc.rect(X(0), yc, u(77500), u(1979))
    COL.slice(1, 7).forEach((x) => doc.line(X(x), yc, X(x), yc + u(1979)))
    fuente('normal', 9.5)
    const yt = base(r(36771), 9.5)
    txt('Código', u(208), yt)
    txt('Descripción', u(18021), yt)
    txt('Uds.', u(53021), yt)
    txt('IGIC', u(56667), yt)
    txt('Dto.', u(60312), yt)
    txt('Precio', u(64583), yt)
    txt('Importe', u(71667), yt)
  }

  function piePagina() {
    const p = PIE_PAG_Y
    const r = (v: number) => p + u(v - 75834)
    doc.setDrawColor(0).setLineWidth(0.25).line(X(u(312)), r(76250), X(u(312) + u(78021)), r(76250))
    fuente('normal', 10)
    if (esPresupuesto) txt('VALIDEZ DEL PRESUPUESTO: 15 días', u(521), base(r(76875)))
    if (d.entregaCuenta != null) txt(`Entrega a cuenta: ${eur(d.entregaCuenta)} €`, ANCHO - 2, base(r(76875)), { align: 'right' })
    if (barras) doc.addImage(barras, 'PNG', X(u(31354)), r(76771), u(14792), u(6979) * 0.8)
    if (typeof textoLopd === 'string' && textoLopd.trim()) {
      doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(0)
      txt(doc.splitTextToSize(textoLopd.trim(), u(78229)) as string[], u(625), base(r(81979), 7))
    }
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(0)
    txt(
      'R.M. de S/C de Tenerife Hoja TF-10655 - Tomo 1705, Folio142 Secc. Gral. - SUMINISTRO DE OFICINA OFIPAPEL S.L. CIF:B-38381653',
      u(5000),
      base(r(86562), 7.5),
    )
  }

  // Líneas.
  const limiteLineas = () => PIE_PAG_Y - 1
  nuevaPagina()
  for (const l of d.lineas) {
    fuente('normal', 10)
    const desc = doc.splitTextToSize(l.descripcion ?? '', COL[2] - COL[1] - 1.5) as string[]
    const alto = Math.max(H_LINEA, desc.length * 4.2 + 1.4)
    if (y + alto > limiteLineas()) {
      doc.setDrawColor(0).setLineWidth(0.25).line(X(0), y, X(COL[7]), y)
      nuevaPagina()
    }
    COL.forEach((x) => doc.setDrawColor(0).setLineWidth(0.25).line(X(x), y, X(x), y + alto))
    const yb = y + 3.9
    fuente('normal', 10)
    txt(l.codigo ?? '', COL[0] + 0.6, yb, { maxWidth: COL[1] - COL[0] - 1 })
    txt(desc, COL[1] + 0.8, yb)
    txt(eur(l.cantidad).replace(/,00$/, ''), COL[3] - 0.8, yb, { align: 'right' })
    const pct = d.igicPiePct && d.igicPiePct > 0 ? d.igicPiePct : l.igic_pct
    if (pct != null) txt(eur(pct).replace(/,00$/, ''), COL[4] - 0.8, yb, { align: 'right' })
    if (l.descuento_pct) txt(eur(l.descuento_pct).replace(/,00$/, ''), COL[5] - 0.8, yb, { align: 'right' })
    txt(eur(l.precio), COL[6] - 0.8, yb, { align: 'right' })
    txt(eur(l.importe), COL[7] - 0.8, yb, { align: 'right' })
    y += alto
  }

  // Pie del documento: solo al final, en la misma página si cabe.
  if (y + H_PIE_DOC > PIE_PAG_Y) {
    doc.setDrawColor(0).setLineWidth(0.25).line(X(0), y, X(COL[7]), y)
    nuevaPagina()
  }
  const g = y
  const r = (v: number) => g + u(v - 45001)
  doc.setDrawColor(0).setLineWidth(0.25).line(X(0), g, X(u(77604)), g)
  fuente('normal', 10)
  if (d.observaciones) {
    const obs = doc.splitTextToSize(`OBSERVACIONES:  ${d.observaciones}`, u(77604)) as string[]
    txt(obs.slice(0, 3), 0, base(r(45000)))
  }
  // Desglose de IGIC por tipos.
  const tipos = new Map<number, { base: number; cuota: number }>()
  for (const l of d.lineas) {
    const pct = d.igicPiePct && d.igicPiePct > 0 ? d.igicPiePct : (l.igic_pct ?? 0)
    const t = tipos.get(pct) ?? { base: 0, cuota: 0 }
    t.base += l.base ?? l.importe
    t.cuota += l.cuota_igic ?? 0
    tipos.set(pct, t)
  }
  const filasIgic = [...tipos.entries()].filter(([, t]) => Math.abs(t.base) > 0.004).sort((a, b) => a[0] - b[0]).slice(0, 3)
  doc.rect(X(u(1875)), r(51250), u(25833), u(9271))
  doc.line(X(u(1875)), r(53229), X(u(1875) + u(25833)), r(53229))
  doc.line(X(u(18750)), r(51250), X(u(18750)), r(51250) + u(7604))
  doc.line(X(u(6354)), r(51354), X(u(6354)), r(51354) + u(7396))
  doc.line(X(u(1875)), r(58750), X(u(1875) + u(25833)), r(58750))
  fuente('normal', 9.5)
  txt('% Igic', u(2292), base(r(51354), 9.5))
  txt('Base Imponible', u(7292), base(r(51354), 9.5))
  txt('Importe', u(20729), base(r(51354), 9.5))
  fuente('normal', 10)
  filasIgic.forEach(([pct, t], i) => {
    const yy = base(r([53646, 55417, 57188][i]))
    txt(eur(pct).replace(/,00$/, ''), u(2396) + u(3437) - 0.5, yy, { align: 'right' })
    txt(eur(t.base), u(8229) + u(8125) + 1.5, yy, { align: 'right' })
    txt(eur(t.cuota), u(18646) + u(8333) - 0.5, yy, { align: 'right' })
  })
  txt('Total IGIC:', u(6875), base(r(58854)))
  txt(eur(d.igic), u(13750) + u(6250) + 3, base(r(58750)), { align: 'right' })
  // Dto. de pie.
  if (d.dtoPiePct && d.totalDtoPie) {
    txt('Dto.:', u(1771), base(r(61354)))
    txt(eur(d.dtoPiePct), u(4896) + u(4271), base(r(61250)), { align: 'right' })
    txt('%', u(8125), base(r(61458)))
    txt(eur(d.totalDtoPie), u(10521) + u(9479), base(r(61250)), { align: 'right' })
    txt('Subtotal:', u(20729), base(r(61354)))
    txt(eur((d.subtotal ?? 0) - d.totalDtoPie), u(26042) + u(11562), base(r(61146)), { align: 'right' })
  }
  // Totales.
  doc.rect(X(u(55417)), r(52917), u(77292) - u(55417), r(57292) + u(2292) - r(52917))
  doc.setFont('helvetica', 'normal').setFontSize(10)
  txt('Subtotal....', u(55729), base(r(53229)))
  doc.setFont('courier', 'normal').setFontSize(10)
  txt(eur(d.base), u(64687) + u(12292) - 0.5, base(r(53021)), { align: 'right' })
  doc.setFont('helvetica', 'normal').setFontSize(10)
  txt(d.igicPiePct && d.igicPiePct > 0 ? `Igic ${eur(d.igicPiePct)} %:` : 'Total Igic', u(55625), base(r(55417)))
  doc.setFont('courier', 'normal').setFontSize(10)
  txt(eur(d.igic), u(57604) + u(19271) - 0.5, base(r(55208)), { align: 'right' })
  doc.setFont('helvetica', 'bold').setFontSize(12)
  txt('Total (€)...........', u(55729), base(r(57500), 12))
  doc.setFont('courier', 'bold').setFontSize(12)
  txt(eur(d.total), u(56354) + u(20833) - 0.5, base(r(57500), 12), { align: 'right' })
  // IBAN, sucursal y ruta.
  fuente('bold', 10)
  txt('Cuenta Bancaria Suministros de Oficina Ofipapel SL: IBAN ES04 0049 5740 4522 1661 5740', u(729), base(r(65000)))
  fuente('normal', 10)
  if (s) {
    txt(`Sucursal:${s.nombre ?? ''}`, u(729), base(r(68021)), { maxWidth: u(59375) })
    const dirSuc = [s.direccion, s.poblacion, s.telefono_fijo, s.telefono_movil, s.contacto].filter(Boolean).join(' ')
    if (s.direccion) txt(doc.splitTextToSize(`Direccion:${dirSuc}`, u(59375)) as string[], u(729), base(r(69792)))
  }
  const ruta = d.ruta || s?.ruta_codigo || c.ruta_codigo
  if (ruta) {
    doc.setFont('courier', 'bold').setFontSize(14)
    txt(`Ruta: ${ruta}`, u(61354), base(r(70625), 14))
  }

  return doc.output('blob')
}

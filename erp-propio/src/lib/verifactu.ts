// Algoritmo oficial de la huella (hash) de Veri*Factu — Artículo 137 de la
// Orden HAC/1177/2024 de 17 de octubre. Campos y orden EXACTOS, verificados
// contra el ejemplo oficial publicado por la AEAT (NIF 89890001K, serie
// 12345678/G33, TipoFactura F1, CuotaTotal 12.35, ImporteTotal 123.45,
// FechaHoraHusoGenRegistro 2024-01-01T19:20:30+01:00, sin registro anterior)
// cuya huella SHA-256 resultante es 3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60.
// No modificar el orden de los campos ni el formato de fecha/importe sin
// volver a comprobar contra ese ejemplo oficial.

export interface HuellaVerifactuInput {
  nifEmisor: string
  numSerieFactura: string
  fechaExpedicion: Date
  tipoFactura: string
  cuotaTotal: number
  importeTotal: number
  huellaAnterior: string | null
  fechaHoraHusoGenRegistro: Date
}

function formatearFechaExpedicion(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

function formatearImporte(n: number): string {
  return n.toFixed(2)
}

function formatearFechaHoraHuso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const yyyy = d.getFullYear()
  const mm = pad(d.getMonth() + 1)
  const dd = pad(d.getDate())
  const hh = pad(d.getHours())
  const mi = pad(d.getMinutes())
  const ss = pad(d.getSeconds())
  const offsetMin = -d.getTimezoneOffset()
  const signo = offsetMin >= 0 ? '+' : '-'
  const offH = pad(Math.floor(Math.abs(offsetMin) / 60))
  const offM = pad(Math.abs(offsetMin) % 60)
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${signo}${offH}:${offM}`
}

export function textoEntradaHuella(input: HuellaVerifactuInput): string {
  return (
    `IDEmisorFactura=${input.nifEmisor}` +
    `&NumSerieFactura=${input.numSerieFactura}` +
    `&FechaExpedicionFactura=${formatearFechaExpedicion(input.fechaExpedicion)}` +
    `&TipoFactura=${input.tipoFactura}` +
    `&CuotaTotal=${formatearImporte(input.cuotaTotal)}` +
    `&ImporteTotal=${formatearImporte(input.importeTotal)}` +
    `&Huella=${input.huellaAnterior ?? ''}` +
    `&FechaHoraHusoGenRegistro=${formatearFechaHoraHuso(input.fechaHoraHusoGenRegistro)}`
  )
}

export async function calcularHuellaVerifactu(input: HuellaVerifactuInput): Promise<string> {
  const texto = textoEntradaHuella(input)
  const bytes = new TextEncoder().encode(texto)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

// URLs del servicio de cotejo del QR de la AEAT. Cuál se usa lo decide la BASE DE DATOS
// (tabla verifactu_configuracion.entorno, 'pruebas' por defecto mientras no haya envío
// real); estas constantes solo documentan los valores y sirven a la pantalla antigua.
export const URL_QR_AEAT_PRODUCCION = 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR'
export const URL_QR_AEAT_PRUEBAS = 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR'

// URL de verificación que codifica el QR Veri*Factu (nif/numserie/fecha/importe),
// igual que la que genera el servicio de validación de la AEAT.
export function contenidoQrVerifactu(input: {
  nifEmisor: string
  numSerieFactura: string
  fechaExpedicion: Date
  importeTotal: number
}): string {
  const params = new URLSearchParams({
    nif: input.nifEmisor,
    numserie: input.numSerieFactura,
    fecha: formatearFechaExpedicion(input.fechaExpedicion),
    importe: formatearImporte(input.importeTotal),
  })
  return `${URL_QR_AEAT_PRUEBAS}?${params.toString()}`
}

export const LEYENDA_VERIFACTU = 'Factura verificable en la sede electrónica de la AEAT'

// ---------------------------------------------------------------------------
// Registros generados por la base de datos (tabla registro_facturacion).
// La huella y el encadenado los calcula la BD (fn_verifactu_registrar); aquí se
// recalculan de forma independiente para «Verificar cadena».
// ---------------------------------------------------------------------------

export interface RegistroFacturacion {
  id: number
  id_emisor: string
  tipo_registro: 'alta' | 'anulacion'
  origen_tipo: 'venta' | 'factura'
  origen_tienda_codigo: string
  origen_numero: number
  num_serie_factura: string
  fecha_expedicion: string // AAAA-MM-DD
  tipo_factura: string | null
  rectificada_num_serie: string | null
  cuota_total: number | string | null
  importe_total: number | string | null
  registro_anterior_id: number | null
  huella_anterior: string | null
  huella: string
  fecha_hora_huso: string
  fecha_hora_huso_texto: string
  codigo_qr_contenido: string | null
  motivo: string | null
  estado_envio_aeat: string
  creado_en: string
}

const fechaIsoADdMmAaaa = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}-${m}-${a}`
}

/** Texto de entrada de la huella de un registro guardado (alta o anulación, art. 137). */
export function textoHuellaRegistro(r: RegistroFacturacion): string {
  const fecha = fechaIsoADdMmAaaa(r.fecha_expedicion)
  if (r.tipo_registro === 'anulacion') {
    return (
      `IDEmisorFacturaAnulada=${r.id_emisor}` +
      `&NumSerieFacturaAnulada=${r.num_serie_factura}` +
      `&FechaExpedicionFacturaAnulada=${fecha}` +
      `&Huella=${r.huella_anterior ?? ''}` +
      `&FechaHoraHusoGenRegistro=${r.fecha_hora_huso_texto}`
    )
  }
  return (
    `IDEmisorFactura=${r.id_emisor}` +
    `&NumSerieFactura=${r.num_serie_factura}` +
    `&FechaExpedicionFactura=${fecha}` +
    `&TipoFactura=${r.tipo_factura}` +
    `&CuotaTotal=${formatearImporte(Number(r.cuota_total ?? 0))}` +
    `&ImporteTotal=${formatearImporte(Number(r.importe_total ?? 0))}` +
    `&Huella=${r.huella_anterior ?? ''}` +
    `&FechaHoraHusoGenRegistro=${r.fecha_hora_huso_texto}`
  )
}

export async function sha256Hex(texto: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

export interface ResultadoVerificacion {
  id: number
  huellaOk: boolean
  encadenadoOk: boolean
}

/**
 * Recalcula cada huella y comprueba que huella_anterior coincide con la huella del registro
 * previo del mismo emisor (los registros deben venir ordenados por id ascendente).
 */
export async function verificarCadena(registros: RegistroFacturacion[]): Promise<ResultadoVerificacion[]> {
  const ultimaPorEmisor = new Map<string, RegistroFacturacion>()
  const res: ResultadoVerificacion[] = []
  for (const r of registros) {
    const previo = ultimaPorEmisor.get(r.id_emisor) ?? null
    const huellaOk = (await sha256Hex(textoHuellaRegistro(r))) === r.huella
    const encadenadoOk = previo
      ? r.huella_anterior === previo.huella && r.registro_anterior_id === previo.id
      : r.huella_anterior == null && r.registro_anterior_id == null
    res.push({ id: r.id, huellaOk, encadenadoOk })
    ultimaPorEmisor.set(r.id_emisor, r)
  }
  return res
}

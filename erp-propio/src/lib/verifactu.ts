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
  return `https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?${params.toString()}`
}

export const LEYENDA_VERIFACTU = 'Factura verificable en la sede electrónica de la AEAT'

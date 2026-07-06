/**
 * Simulación fiel del mecanismo Veri*Factu: cada factura genera una huella SHA-256
 * real (Web Crypto, no un hash de juguete) encadenada con la huella de la factura
 * anterior, de forma que alterar o borrar un registro rompe la cadena — que es
 * exactamente la garantía que exige el Reglamento de sistemas de facturación.
 * El envío a la AEAT en sí (el paso que sí requiere certificado digital y el
 * endpoint real de la Agencia Tributaria) se simula, no se hace de verdad.
 */

export const VERIFACTU_EMISOR_NIF = 'B76543210'
export const VERIFACTU_EMISOR_NOMBRE = 'Ofipapel Distribución S.L.'

export interface VerifactuChainEntry {
  invoiceId: string
  hash: string
  hashAnterior: string | null
  timestamp: string
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function buildVerifactuChain(
  invoices: { id: string; fecha: string; total: number }[],
): Promise<Map<string, VerifactuChainEntry>> {
  const sorted = [...invoices].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id.localeCompare(b.id)))
  const map = new Map<string, VerifactuChainEntry>()
  let previous: string | null = null
  for (const inv of sorted) {
    const timestamp = `${inv.fecha}T00:00:00`
    const payload = `NIF=${VERIFACTU_EMISOR_NIF}|NUM=${inv.id}|FECHA=${inv.fecha}|IMPORTE=${inv.total.toFixed(2)}|ANT=${previous ?? ''}`
    const hash = await sha256Hex(payload)
    map.set(inv.id, { invoiceId: inv.id, hash, hashAnterior: previous, timestamp })
    previous = hash
  }
  return map
}

/** Reproduce el patrón real de la URL de cotejo de la AEAT para el QR de Veri*Factu. */
export function verifactuQrUrl(numFactura: string, fecha: string, importe: number): string {
  const [y, m, d] = fecha.split('-')
  const fechaAeat = `${d}-${m}-${y}`
  const params = new URLSearchParams({
    nif: VERIFACTU_EMISOR_NIF,
    numserie: numFactura,
    fecha: fechaAeat,
    importe: importe.toFixed(2),
  })
  return `https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?${params.toString()}`
}

// Cuadro «Por cobrar» (app de oficina y Control de Repartos del ERP): qué sale y en qué apartado. Compartido para que
// las dos pantallas enseñen exactamente lo mismo.
import type { PorCobrar } from './api'

/**
 * Cómo se paga, por el texto de la forma de pago de GeminisWin: remesa y transferencia (y confirming,
 * pagaré o crédito) las paga el cliente por el banco y no se cobran en la entrega; Bizum es que ya está
 * pagada; lo demás (contado, contra reembolso…) se cobra en mano si queda algo pendiente.
 */
export function tipoPago(forma?: string | null): 'banco' | 'pagada' | 'mano' {
  const f = (forma ?? '').toLowerCase()
  if (f.includes('bizum')) return 'pagada'
  if (/remesa|transfer|confirming|pagar[eé]|cr[eé]dito|efecto/.test(f)) return 'banco'
  return 'mano'
}

export const GRUPO_ABONOS = 'Abonos · pendientes de validar en almacén'
export const GRUPO_NULOS = 'Nulos · pendientes de validar en almacén'
export const ORDEN_POR_COBRAR = [
  'Contado · el repartidor no cobró',
  'Contado · entregada, sin liquidar todavía',
  'Transferencia',
  'Remesa',
  'Otras formas por banco',
  GRUPO_ABONOS,
  GRUPO_NULOS,
]

/**
 * Solo FACTURAS (Rober, 17/11/2026): los albaranes a crédito (transferencia o remesa a 30, 60 días…) todavía no se han
 * facturado y se cobran a su vencimiento; con ellos la lista sería interminable. Lo de contado que había que cobrar en
 * mano sí sale siempre, tenga o no número de factura. Bizum es que ya está pagada. Los abonos recogidos sin validar en
 * almacén (19/11/2026) salen siempre, en su apartado.
 */
export function listaPorCobrar(cobros: PorCobrar[]): PorCobrar[] {
  const conFactura = (c: PorCobrar) => c.factura != null && String(c.factura).trim() !== ''
  const enMano = (c: PorCobrar) => c.contado !== false && tipoPago(c.forma_pago) === 'mano'
  return cobros.filter((c) => c.abono || c.nulo || (tipoPago(c.forma_pago) !== 'pagada' && (conFactura(c) || enMano(c))))
}

export function grupoPorCobrar(c: PorCobrar): string {
  if (c.nulo) return GRUPO_NULOS
  if (c.abono) return GRUPO_ABONOS
  const f = (c.forma_pago ?? '').toLowerCase()
  if (f.includes('remesa')) return 'Remesa'
  if (f.includes('transfer')) return 'Transferencia'
  if (c.contado === false || tipoPago(c.forma_pago) === 'banco') return 'Otras formas por banco'
  return c.no_cobro ? 'Contado · el repartidor no cobró' : 'Contado · entregada, sin liquidar todavía'
}

export function gruposPorCobrar(cobros: PorCobrar[]) {
  const lista = listaPorCobrar(cobros)
  return ORDEN_POR_COBRAR.map((g) => ({ g, filas: lista.filter((c) => grupoPorCobrar(c) === g) })).filter((x) => x.filas.length)
}

/** Lo pendiente de cobrar (sin los abonos ni los nulos, que no se cobran). */
export const sumaPorCobrar = (fs: PorCobrar[]) => fs.filter((c) => !c.abono && !c.nulo).reduce((t, c) => t + (c.pendiente ?? 0), 0)

import type { SaleOrder, Invoice, OrderLine } from '../types'

/** Misma regla usada en la semilla: la base imponible es la suma de líneas sin IGIC. */
export function baseAndIva(lineas: OrderLine[], total: number): { base: number; igic: number } {
  const base = Number(lineas.reduce((sum, l) => sum + l.cantidad * l.precioUnit, 0).toFixed(2))
  const igic = Number((total - base).toFixed(2))
  return { base, igic }
}

export function createInvoiceFromSale(sale: SaleOrder): Invoice {
  const { base, igic } = baseAndIva(sale.lineas, sale.total)
  return {
    id: `F-2026-${Date.now().toString().slice(-6)}`,
    ventaId: sale.id,
    clienteId: sale.clienteId,
    fecha: sale.fecha,
    base,
    igic,
    total: sale.total,
  }
}

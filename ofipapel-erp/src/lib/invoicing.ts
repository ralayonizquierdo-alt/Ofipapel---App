import type { SaleOrder, Invoice, OrderLine } from '../types'

/** Misma regla usada en la semilla: la base imponible es la suma de líneas sin IVA. */
export function baseAndIva(lineas: OrderLine[], total: number): { base: number; iva: number } {
  const base = Number(lineas.reduce((sum, l) => sum + l.cantidad * l.precioUnit, 0).toFixed(2))
  const iva = Number((total - base).toFixed(2))
  return { base, iva }
}

export function createInvoiceFromSale(sale: SaleOrder): Invoice {
  const { base, iva } = baseAndIva(sale.lineas, sale.total)
  return {
    id: `F-2026-${Date.now().toString().slice(-6)}`,
    ventaId: sale.id,
    clienteId: sale.clienteId,
    fecha: sale.fecha,
    base,
    iva,
    total: sale.total,
  }
}

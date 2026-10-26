import { PedidoFichaPage } from './PedidoFichaPage'

/** Ventas → Presupuestos: la misma ficha de pedidos, recorriendo solo los presupuestos y sin bloque de factura. */
export function PresupuestosPage() {
  return <PedidoFichaPage presupuestos />
}

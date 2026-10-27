import { wc, wcDesde, wcHasta, type WcPedido } from '../../lib/woocommerce'
import { cargarPedidosErpWeb, type FiltroWeb, type PedidoErpWeb } from './comun'

/** Pedidos de la web en el periodo/estado del filtro, con su pedido del ERP si ya se importó. */
export async function cargarPedidosWeb(f: FiltroWeb, estado?: string): Promise<{ pedidos: WcPedido[]; erp: Map<number, PedidoErpWeb>; truncado: boolean }> {
  const r = await wc.todos<WcPedido>('orders', { after: wcDesde(f.desde), before: wcHasta(f.hasta), status: estado ?? (f.estado || 'any'), orderby: 'date', order: 'desc' }, 20)
  const pedidos = r.data ?? []
  const erp = await cargarPedidosErpWeb(pedidos.map((p) => p.id))
  return { pedidos, erp, truncado: !!r.truncado }
}

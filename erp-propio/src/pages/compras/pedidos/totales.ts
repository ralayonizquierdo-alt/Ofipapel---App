import { supabase } from '../../../lib/supabase'
import { calcularCompra, r3, type LineaCompra } from './compras'

// Totales del pedido a proveedor, reutilizables fuera de la ficha (p. ej. el Gestor de pedidos a
// proveedores, que crea pedidos y luego los recalcula con recalcularTotalesPedido).

export { calcularCompra }

type CabeceraTotales = Parameters<typeof calcularCompra>[1]

/** Columnas de totales de pedido_proveedor a partir de las líneas y la cabecera. */
export function camposTotales(lineas: LineaCompra[], cab: CabeceraTotales) {
  const t = calcularCompra(lineas, cab)
  return {
    subtotal: t.subtotal,
    total_descuento: t.totalDto,
    base_imponible: t.baseConGastos,
    total_igic: t.totalIgic,
    total_gastos: r3(t.gastos + t.otros),
    total_canon: t.canon,
    total: t.total,
    total_a_pagar_proveedor: t.aPagarProveedor,
  }
}

/** Lee el pedido y sus líneas, recalcula los totales y los guarda. Devuelve los totales escritos. */
export async function recalcularTotalesPedido(tienda: string, numero: number) {
  const [{ data: cab, error: e1 }, { data: ls, error: e2 }] = await Promise.all([
    supabase
      .from('pedido_proveedor')
      .select('descuento_pie_pct, igic_pie_pct, gastos_proveedor, gastos_proveedor_igic_pct, transporte_coste, transporte_igic_pct, otros_gastos')
      .eq('tienda_terminal_codigo', tienda)
      .eq('numero', numero)
      .single(),
    supabase
      .from('pedido_proveedor_linea')
      .select('cantidad, precio_compra, descuento_pct, igic_pct, canon')
      .eq('tienda_terminal_codigo', tienda)
      .eq('numero', numero),
  ])
  if (e1 || !cab) throw new Error(e1?.message ?? 'No existe el pedido.')
  if (e2) throw new Error(e2.message)
  const lineas = (ls ?? []).map((l) => ({
    cantidad: Number(l.cantidad ?? 0),
    precio_compra: Number(l.precio_compra ?? 0),
    descuento_pct: Number(l.descuento_pct ?? 0),
    igic_pct: Number(l.igic_pct ?? 0),
    canon: Number(l.canon ?? 0),
  })) as LineaCompra[]
  const n = (v: unknown) => Number(v ?? 0)
  const campos = camposTotales(lineas, {
    descuento_pie_pct: n(cab.descuento_pie_pct),
    igic_pie_pct: n(cab.igic_pie_pct),
    gastos_proveedor: n(cab.gastos_proveedor),
    gastos_proveedor_igic_pct: n(cab.gastos_proveedor_igic_pct),
    transporte_coste: n(cab.transporte_coste),
    transporte_igic_pct: n(cab.transporte_igic_pct),
    otros_gastos: n(cab.otros_gastos),
  })
  const { error } = await supabase.from('pedido_proveedor').update(campos).eq('tienda_terminal_codigo', tienda).eq('numero', numero)
  if (error) throw new Error(error.message)
  return campos
}

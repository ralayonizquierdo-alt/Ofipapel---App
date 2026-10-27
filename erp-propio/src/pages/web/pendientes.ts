import { supabase } from '../../lib/supabase'

export interface LineaPendiente {
  tienda: string
  numero: number
  linea: number
  articulo: string
  descripcion: string
  cantidad: number
  servida: number
  pendiente: number
  almacen: string | null
}

export interface PedidoPendiente {
  tienda: string
  numero: number
  webId: number
  fecha: string | null
  cliente: string | null
  nombre: string | null
  total: number
  preparado: boolean
  almacen: string | null
  lineas: LineaPendiente[]
}

/** Pedidos del ERP que vienen de la web y aún no se han entregado (ni anulado), con sus líneas pendientes. */
export async function cargarPendientesWeb(): Promise<{ pedidos: PedidoPendiente[]; stock: Map<string, number> }> {
  const { data: cabs, error } = await supabase
    .from('pedido_cliente')
    .select('tienda_terminal_codigo, numero, web_pedido_id, fecha, cliente_codigo, nombre_cliente, total, preparado, almacen_codigo, liquidado')
    .not('web_pedido_id', 'is', null)
    .eq('anulado', false)
    .eq('entregado', false)
    .is('venta_numero', null)
    .order('fecha')
    .limit(2000)
  if (error) throw new Error(error.message)
  const pedidos: PedidoPendiente[] = (cabs ?? [])
    .filter((c) => Number(c.liquidado ?? 0) !== 5)
    .map((c) => ({
      tienda: c.tienda_terminal_codigo,
      numero: c.numero,
      webId: Number(c.web_pedido_id),
      fecha: c.fecha,
      cliente: c.cliente_codigo,
      nombre: c.nombre_cliente,
      total: Number(c.total ?? 0),
      preparado: !!c.preparado,
      almacen: c.almacen_codigo,
      lineas: [],
    }))
  const porClave = new Map(pedidos.map((p) => [`${p.tienda}/${p.numero}`, p]))
  const numeros = [...new Set(pedidos.map((p) => p.numero))]
  for (let i = 0; i < numeros.length; i += 200) {
    const { data, error: e } = await supabase
      .from('pedido_cliente_linea')
      .select('tienda_terminal_codigo, numero, numero_linea, articulo_codigo, descripcion, cantidad, unidades_liquidadas, almacen_codigo')
      .in('numero', numeros.slice(i, i + 200))
    if (e) throw new Error(e.message)
    for (const l of data ?? []) {
      const p = porClave.get(`${l.tienda_terminal_codigo}/${l.numero}`)
      if (!p) continue
      const cantidad = Number(l.cantidad ?? 0)
      const servida = Number(l.unidades_liquidadas ?? 0)
      p.lineas.push({
        tienda: p.tienda,
        numero: p.numero,
        linea: l.numero_linea,
        articulo: l.articulo_codigo,
        descripcion: l.descripcion ?? '',
        cantidad,
        servida,
        pendiente: Math.max(0, cantidad - servida),
        almacen: l.almacen_codigo ?? p.almacen,
      })
    }
  }
  const arts = [...new Set(pedidos.flatMap((p) => p.lineas.map((l) => l.articulo)))]
  const stock = new Map<string, number>()
  for (let i = 0; i < arts.length; i += 200) {
    const { data } = await supabase
      .from('articulo_almacen_stock')
      .select('articulo_codigo, almacen_codigo, cantidad_actual, cantidad_reservada, cantidad_disponible')
      .in('articulo_codigo', arts.slice(i, i + 200))
    for (const s of data ?? []) {
      const d = s.cantidad_disponible ?? Number(s.cantidad_actual ?? 0) - Number(s.cantidad_reservada ?? 0)
      stock.set(`${s.articulo_codigo}|${s.almacen_codigo}`, Number(d ?? 0))
    }
  }
  return { pedidos, stock }
}

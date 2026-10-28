import { supabase } from '../../lib/supabase'
import { filasPorTrozos, todasLasFilas } from '../../lib/todasLasFilas'

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
  // Supabase corta cada respuesta en 1000 filas: por bloques.
  const { data: cabs, error } = await todasLasFilas(() =>
    supabase
      .from('pedido_cliente')
      .select('tienda_terminal_codigo, numero, web_pedido_id, fecha, cliente_codigo, nombre_cliente, total, preparado, almacen_codigo, liquidado')
      .not('web_pedido_id', 'is', null)
      .eq('anulado', false)
      .eq('entregado', false)
      .is('venta_numero', null)
      .order('fecha')
      .order('tienda_terminal_codigo')
      .order('numero'),
  )
  if (error) throw new Error(error)
  const pedidos: PedidoPendiente[] = cabs
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
  {
    const { data, error: e } = await filasPorTrozos(numeros, (t) =>
      supabase
        .from('pedido_cliente_linea')
        .select('tienda_terminal_codigo, numero, numero_linea, articulo_codigo, descripcion, cantidad, unidades_liquidadas, almacen_codigo')
        .in('numero', t)
        .order('tienda_terminal_codigo')
        .order('numero')
        .order('numero_linea'),
    )
    if (e) throw new Error(e)
    for (const l of data) {
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
  {
    const { data } = await filasPorTrozos(arts, (t) =>
      supabase
        .from('articulo_almacen_stock')
        .select('articulo_codigo, almacen_codigo, cantidad_actual, cantidad_reservada, cantidad_disponible')
        .in('articulo_codigo', t)
        .order('articulo_codigo')
        .order('almacen_codigo'),
    )
    for (const s of data) {
      const d = s.cantidad_disponible ?? Number(s.cantidad_actual ?? 0) - Number(s.cantidad_reservada ?? 0)
      stock.set(`${s.articulo_codigo}|${s.almacen_codigo}`, Number(d ?? 0))
    }
  }
  return { pedidos, stock }
}

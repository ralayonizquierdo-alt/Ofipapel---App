import { supabase } from '../../../lib/supabase'

export interface ArticuloVenta {
  codigo_interno: string
  codigo_venta: string | null
  codigo_compra_habitual: string | null
  codigo_barras_principal: string | null
  descripcion: string
  pvp: number | null
  igic_pct: number | null
  impuesto2_pct: number | null
  garantia_meses: number | null
  unidades_pedidas: number | null
}

export interface ClienteVenta {
  codigo: string
  nombre: string
  nif: string | null
  tarifa_nivel_defecto: number | null
  descuento_pct: number | null
  descuento_en_pie: boolean
  no_aplica_impuesto2: boolean
  pvp_fijos: boolean
  vendedor_codigo: string | null
  forma_pago_codigo: string | null
  tipo_credito: string | null
  ruta_codigo: string | null
}

export const ARTICULO_VENTA_COLS =
  'codigo_interno, codigo_venta, codigo_compra_habitual, codigo_barras_principal, descripcion, pvp, igic_pct, impuesto2_pct, garantia_meses, unidades_pedidas'

export const CLIENTE_VENTA_COLS =
  'codigo, nombre, nif, tarifa_nivel_defecto, descuento_pct, descuento_en_pie, no_aplica_impuesto2, pvp_fijos, vendedor_codigo, forma_pago_codigo, tipo_credito, ruta_codigo'

/** Busca el artículo por código de venta, código interno o código de barras (como el campo «Cod. Venta» de GeminisWin). */
export async function buscarArticulo(codigo: string): Promise<ArticuloVenta | null> {
  const c = codigo.trim()
  if (!c) return null
  for (const col of ['codigo_venta', 'codigo_interno', 'codigo_barras_principal']) {
    const { data } = await supabase.from('articulo').select(ARTICULO_VENTA_COLS).eq(col, c).limit(1)
    if (data && data.length) return data[0] as ArticuloVenta
  }
  const { data: barras } = await supabase.from('articulo_codigo_barras').select('articulo_codigo').eq('codigo_barras', c).limit(1)
  if (barras && barras.length) {
    const { data } = await supabase.from('articulo').select(ARTICULO_VENTA_COLS).eq('codigo_interno', barras[0].articulo_codigo).limit(1)
    if (data && data.length) return data[0] as ArticuloVenta
  }
  return null
}

/**
 * Precio de línea con el orden de prioridad del mapa funcional: precio fijo del cliente para
 * el artículo (vigente y desde su cantidad mínima) → PVP del nivel de tarifa del cliente →
 * PVP General del artículo.
 */
export async function precioParaCliente(
  articulo: ArticuloVenta,
  cliente: ClienteVenta | null,
  cantidad: number,
  nivelTarifa: number | null,
): Promise<{ pvp: number; origen: 'fijo' | 'tarifa' | 'general' }> {
  const hoy = new Date().toISOString().slice(0, 10)
  if (cliente) {
    const { data: fijos } = await supabase
      .from('cliente_articulo_precio')
      .select('pvp, cantidad_minima, fecha_inicio, fecha_fin')
      .eq('cliente_codigo', cliente.codigo)
      .eq('articulo_codigo', articulo.codigo_interno)
    const vigente = (fijos ?? [])
      .filter((f) => (!f.fecha_inicio || f.fecha_inicio <= hoy) && (!f.fecha_fin || f.fecha_fin >= hoy))
      .filter((f) => f.cantidad_minima == null || Number(f.cantidad_minima) <= cantidad)
      .sort((a, b) => Number(b.cantidad_minima ?? 0) - Number(a.cantidad_minima ?? 0))[0]
    if (vigente) return { pvp: Number(vigente.pvp), origen: 'fijo' }
  }
  const nivel = nivelTarifa ?? cliente?.tarifa_nivel_defecto ?? 0
  if (nivel != null) {
    const { data: niveles } = await supabase
      .from('articulo_precio_nivel')
      .select('pvp')
      .eq('articulo_codigo', articulo.codigo_interno)
      .eq('nivel_tarifa', nivel)
      .limit(1)
    if (niveles && niveles.length && Number(niveles[0].pvp) > 0) return { pvp: Number(niveles[0].pvp), origen: 'tarifa' }
  }
  return { pvp: Number(articulo.pvp ?? 0), origen: 'general' }
}

export function round3(n: number) {
  return Math.round(n * 1000) / 1000
}

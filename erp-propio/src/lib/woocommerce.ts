import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Cliente del menú «Web» en el navegador. NUNCA habla con ofipapel.net directamente:
// llama a la Edge Function «woocommerce-erp» con la sesión del ERP, y es la función la
// que tiene las claves (secretos de Supabase). La función solo hace GET: la web la
// gestiona una empresa externa y Rober no ha autorizado escribir nada en ella.

export const PENDIENTE_AUTORIZACION = 'Pendiente de autorización de Rober'

export const SECRETOS_WOOCOMMERCE = [
  { nombre: 'WOOCOMMERCE_CONSUMER_KEY', obligatorio: true, nota: 'Clave de cliente de la API REST (permiso «Lectura»)' },
  { nombre: 'WOOCOMMERCE_CONSUMER_SECRET', obligatorio: true, nota: 'Clave secreta de cliente de la misma clave' },
  { nombre: 'WOOCOMMERCE_BYPASS_TOKEN', obligatorio: false, nota: 'Cabecera X-Ofipapel-Bot para pasar el anti-bots del hosting (la misma que el bot de WhatsApp)' },
  { nombre: 'WOOCOMMERCE_URL', obligatorio: false, nota: 'Por defecto https://ofipapel.net' },
]

export class WcError extends Error {
  codigo: string
  constructor(codigo: string, mensaje: string) {
    super(mensaje)
    this.codigo = codigo
  }
}

export interface WcRespuesta<T> {
  data: T
  total?: number
  totalPaginas?: number
  truncado?: boolean
}

export interface WcEstado {
  url: string
  hayClaves: boolean
  hayBypass: boolean
  soloLectura: boolean
}

type Params = Record<string, string | number | boolean | undefined | null>

async function llamar<T>(body: { op: string; recurso?: string; params?: Params; maxPaginas?: number }): Promise<WcRespuesta<T>> {
  const { data, error } = await supabase.functions.invoke('woocommerce-erp', { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const st = error.context?.status
      if (st === 401) throw new WcError('sesion', 'La sesión del ERP ha caducado: vuelve a entrar.')
      if (st === 404) throw new WcError('sin_funcion', 'La función «woocommerce-erp» no está desplegada en Supabase.')
      throw new WcError('funcion', `La función «woocommerce-erp» ha fallado (HTTP ${st ?? '?'}).`)
    }
    throw new WcError('red', `No se pudo llamar a la función «woocommerce-erp»: ${error.message}`)
  }
  const r = data as { ok: boolean; codigo?: string; error?: string } & WcRespuesta<T>
  if (!r || !r.ok) throw new WcError(r?.codigo ?? 'desconocido', r?.error ?? 'Respuesta vacía de la función')
  return r
}

export const wc = {
  estado: () => llamar<WcEstado>({ op: 'estado' }).then((r) => r.data),
  probar: () => llamar<WcProducto[]>({ op: 'probar' }),
  get: <T>(recurso: string, params?: Params) => llamar<T>({ op: 'get', recurso, params }),
  todos: <T>(recurso: string, params?: Params, maxPaginas = 10) => llamar<T[]>({ op: 'todos', recurso, params, maxPaginas }),
}

/** Inicio/fin de día en el formato que espera WooCommerce en after/before (hora local de la tienda). */
export function wcDesde(fecha: string) {
  return `${fecha}T00:00:00`
}
export function wcHasta(fecha: string) {
  return `${fecha}T23:59:59`
}

/* ---------- Tipos (subconjunto de la API REST v3 de WooCommerce) ---------- */

export interface WcMeta {
  key: string
  value: unknown
}

export interface WcDireccion {
  first_name?: string
  last_name?: string
  company?: string
  address_1?: string
  address_2?: string
  city?: string
  state?: string
  postcode?: string
  country?: string
  email?: string
  phone?: string
}

export interface WcLinea {
  id: number
  name: string
  product_id: number
  variation_id?: number
  quantity: number
  subtotal: string
  subtotal_tax?: string
  total: string
  total_tax?: string
  sku?: string | null
  price?: number
}

export interface WcPedido {
  id: number
  number?: string
  status: string
  date_created: string
  date_modified?: string
  currency?: string
  total: string
  total_tax?: string
  shipping_total?: string
  shipping_tax?: string
  discount_total?: string
  customer_id?: number
  customer_note?: string
  payment_method_title?: string
  billing: WcDireccion
  shipping?: WcDireccion
  line_items: WcLinea[]
  shipping_lines?: { id?: number; method_title: string; method_id?: string; total: string; total_tax?: string }[]
  coupon_lines?: { id?: number; code: string; discount: string; discount_tax?: string }[]
  fee_lines?: { id?: number; name: string; total: string; total_tax?: string }[]
  refunds?: { id: number; reason?: string; total: string }[]
  meta_data?: WcMeta[]
}

export interface WcProducto {
  id: number
  name: string
  slug?: string
  permalink?: string
  type?: string
  status?: string
  sku?: string
  price?: string
  regular_price?: string
  sale_price?: string
  date_on_sale_from?: string | null
  date_on_sale_to?: string | null
  upsell_ids?: number[]
  cross_sell_ids?: number[]
  related_ids?: number[]
  variations?: number[]
  attributes?: { id?: number; name: string; options?: string[]; option?: string }[]
  average_rating?: string
  rating_count?: number
  manage_stock?: boolean
  stock_quantity?: number | null
  stock_status?: string
  description?: string
  short_description?: string
  images?: { id?: number; src: string }[]
  categories?: { id: number; name: string; slug?: string }[]
  date_modified?: string
  meta_data?: WcMeta[]
}

export interface WcVariacion {
  id: number
  sku?: string
  status?: string
  price?: string
  regular_price?: string
  sale_price?: string
  manage_stock?: boolean | 'parent'
  stock_quantity?: number | null
  stock_status?: string
  attributes?: { id?: number; name: string; option: string }[]
  image?: { src: string } | null
}

export interface WcNotaPedido {
  id: number
  author?: string
  date_created: string
  note: string
  customer_note?: boolean
}

export interface WcEstadoTotal {
  slug: string
  name: string
  total: number
}

export interface WcCliente {
  id: number
  email: string
  first_name?: string
  last_name?: string
  username?: string
  role?: string
  date_created?: string
  is_paying_customer?: boolean
  billing?: WcDireccion
  shipping?: WcDireccion
  orders_count?: number
  total_spent?: string
}

export interface WcCupon {
  id: number
  code: string
  amount: string
  discount_type: string
  description?: string
  date_expires?: string | null
  usage_count?: number
  usage_limit?: number | null
  usage_limit_per_user?: number | null
  individual_use?: boolean
  free_shipping?: boolean
  minimum_amount?: string
  maximum_amount?: string
  date_created?: string
}

export interface WcCategoria {
  id: number
  name: string
  slug: string
  parent: number
  count?: number
  description?: string
  image?: { src: string } | null
}

export interface WcResena {
  id: number
  date_created: string
  product_id: number
  product_name?: string
  status: string
  reviewer: string
  reviewer_email?: string
  review: string
  rating: number
  verified?: boolean
}

export interface WcReembolso {
  id: number
  date_created: string
  amount: string
  reason?: string
  refunded_by?: number
  line_items?: WcLinea[]
}

export const ESTADOS_PEDIDO_WEB: { value: string; label: string }[] = [
  { value: 'pending', label: 'Pendiente de pago' },
  { value: 'processing', label: 'Procesando' },
  { value: 'on-hold', label: 'En espera' },
  { value: 'completed', label: 'Completado' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'refunded', label: 'Reembolsado' },
  { value: 'failed', label: 'Fallido' },
  { value: 'checkout-draft', label: 'Borrador' },
]

export function nombreEstadoWeb(s: string) {
  return ESTADOS_PEDIDO_WEB.find((e) => e.value === s)?.label ?? s
}

/** Registro de una operación hecha en el ERP (p. ej. una importación) en web_sincronizacion_log. */
export async function registrarSincronizacion(fila: {
  operacion: string
  recurso?: string
  resultado: 'ok' | 'error' | 'aviso'
  mensaje?: string
  registros?: number
  web_pedido_id?: number
  pedido_tienda_codigo?: string
  pedido_numero?: number
  parametros?: Record<string, unknown>
}) {
  await supabase.from('web_sincronizacion_log').insert({ origen: 'erp', ...fila })
}

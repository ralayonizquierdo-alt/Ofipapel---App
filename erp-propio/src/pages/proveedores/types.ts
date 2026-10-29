// Tipos de la ficha de Proveedores (Compras → Proveedores en GeminisWin).
// Nombres de columna = nombres reales en Postgres (tabla proveedor, migrada de PROVEEDO).

export interface Proveedor {
  codigo: string
  nombre: string
  razon_social: string | null
  nif: string | null
  fecha_alta: string | null
  fecha_baja: string | null

  // Datos generales
  contacto: string | null
  direccion: string | null
  codigo_postal: string | null
  poblacion: string | null
  provincia_codigo: string | null
  pais_codigo: string | null
  telefono_fijo: string | null
  telefono_movil: string | null
  fax: string | null
  email: string | null
  web: string | null

  // Datos comerciales
  tipo_documento_defecto: number | null
  tipo_factura: number | null
  forma_pago_codigo: string | null
  dias_pago_1_tipo: number | null
  dias_pago_1: number | null
  dias_pago_2_tipo: number | null
  dias_pago_2: number | null
  dias_demora_pago: number | null
  num_pagos_demora: number | null
  dias_entrega: number | null
  compra_minima: number | null
  limite_deuda: number | null
  deuda_actual: number | null
  saldo_anterior: number | null
  total_comprado: number | null
  pendiente_pago: number | null
  es_precio_local: boolean // proveedor local (true) o de importación (false)
  descuento_pie_pct: number | null
  no_aplica_impuesto2: boolean // «no aplicar canon»
  no_aplica_impuesto3: boolean
  es_proveedor_dependiente: boolean
  fecha_ultima_compra: string | null
  fecha_ultimo_pedido: string | null

  // Plantilla de tarifas
  plantilla_tarifa_codigo: string | null

  // Enlaces
  almacen_defecto_codigo: string | null // proveedor exclusivo por almacén
  id_sinli: string | null
  id_fande: string | null
  cuenta_contable_400: string | null
  /** proveedor = mercancía · acreedor = servicios y gastos (Compras → Acreedores). */
  tipo: 'proveedor' | 'acreedor'
  cuenta_contable_600: string | null
  cuenta_contable_401: string | null
  cuenta_contable_41150: string | null
  cuenta_contable_572: string | null

  // Observaciones e imagen
  observaciones: string | null
  imagen_url: string | null
  imagen_modo: number // 0 tamaño real · 1 tamaño ajustado · 2 rellenar marco

  activo: boolean
  actualizado_en: string
}

export const emptyProveedor: Omit<Proveedor, 'actualizado_en'> = {
  codigo: '',
  nombre: '',
  razon_social: null,
  nif: null,
  fecha_alta: null,
  fecha_baja: null,
  contacto: null,
  direccion: null,
  codigo_postal: null,
  poblacion: null,
  provincia_codigo: null,
  pais_codigo: null,
  telefono_fijo: null,
  telefono_movil: null,
  fax: null,
  email: null,
  web: null,
  tipo_documento_defecto: null,
  tipo_factura: null,
  forma_pago_codigo: null,
  dias_pago_1_tipo: null,
  dias_pago_1: null,
  dias_pago_2_tipo: null,
  dias_pago_2: null,
  dias_demora_pago: null,
  num_pagos_demora: null,
  dias_entrega: null,
  compra_minima: null,
  limite_deuda: null,
  deuda_actual: null,
  saldo_anterior: null,
  total_comprado: null,
  pendiente_pago: null,
  es_precio_local: true,
  descuento_pie_pct: null,
  no_aplica_impuesto2: false,
  no_aplica_impuesto3: false,
  es_proveedor_dependiente: false,
  fecha_ultima_compra: null,
  fecha_ultimo_pedido: null,
  plantilla_tarifa_codigo: null,
  almacen_defecto_codigo: null,
  id_sinli: null,
  id_fande: null,
  cuenta_contable_400: null,
  tipo: 'proveedor',
  cuenta_contable_600: null,
  cuenta_contable_401: null,
  cuenta_contable_41150: null,
  cuenta_contable_572: null,
  observaciones: null,
  imagen_url: null,
  imagen_modo: 1,
  activo: true,
}

/** Todas las pestañas de la ficha reciben lo mismo; las de rejilla usan proveedor.codigo. */
export interface ProveedorTabProps {
  proveedor: Proveedor
  editing: boolean
  onChange: (patch: Partial<Proveedor>) => void
}

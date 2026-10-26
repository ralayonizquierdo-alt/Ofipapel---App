// Tipos de la ficha de Clientes (Clientes → Clientes en GeminisWin).
// Nombres de columna = nombres reales en Postgres (tabla cliente, migrada de CLIENTES).

export interface Cliente {
  codigo: string
  nombre: string
  razon_social: string | null
  nif: string | null
  fecha_nacimiento: string | null
  fecha_alta: string | null
  fecha_baja: string | null

  // General
  gerente: string | null
  contacto: string | null
  comentario: string | null
  fecha_ultima_venta: string | null
  es_generico: boolean
  bloqueado: boolean
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

  // Comercial
  tipo_cliente_codigo: string | null
  actividad: string | null
  productos: string | null
  previsto_ventas: number | null
  pedido_minimo: number | null
  tipo_credito: string | null // CLIENTES.TIPOCREDIT (texto 25): tipo de venta, «Contado» / «Crédito»
  forma_pago_codigo: string | null
  tipo_factura_global: number | null
  digito_control: number | null // D.C. = serie de facturación
  tipo_documento_contado: number | null
  tipo_documento_credito: number | null
  'nº_copias_factura': number | null
  limite_deuda: number | null
  saldo_anterior: number | null
  fecha_saldo_inicial: string | null
  deuda_actual: number | null
  dias_pago_1_tipo: number | null
  dias_pago_1: number | null
  dias_pago_2_tipo: number | null
  dias_pago_2: number | null
  dias_demora_pago: number | null
  num_pagos_demora: number | null
  observ_jefe_compras: string | null // autorizados para hacer compras
  avisar_jefe_compras: boolean
  mensaje_aviso_venta: string | null
  es_peligroso: boolean

  // Tarifas → Tarifas y descuentos
  incremento_sobre_coste_pct: number | null
  descuento_pct: number | null
  descuento_en_pie: boolean
  descuento_ficticio_pct: number | null
  tarifa_nivel_defecto: number | null
  no_permite_modificar_tarifa: boolean
  no_aplica_impuesto2: boolean // «no aplicar el canon»
  no_aplica_impuesto3: boolean
  pvp_fijos: boolean // «PVPs fijos, sin ofertas y dtos»

  // Enlaces
  vendedor_codigo: string | null
  tienda_defecto_codigo: string | null
  zona_territorial_codigo: string | null
  ruta_codigo: string | null
  orden_en_ruta: number | null
  codigo_barras: string | null
  cuenta_contable_430: string | null
  cuenta_contable_700: string | null
  cuenta_contable_431: string | null
  cuenta_contable_43150: string | null
  cuenta_contable_572: string | null
  face_organo_gestor: string | null
  face_organo_gestor_nombre: string | null
  face_unidad_tramitadora: string | null
  face_unidad_tramitadora_nombre: string | null
  face_oficina_contable: string | null
  face_oficina_contable_nombre: string | null

  // Sucursales
  genera_sucursales_auto: boolean

  // Obs. e Img.
  imagen_url: string | null

  // Web (la contraseña solo existe como hash y nunca se muestra)
  web_publicado: boolean
  web_fecha_baja: string | null
  web_id_cliente: number | null
  web_id_sucursal: string | null
  web_usuario: string | null
  web_contrasena_hash: string | null
  web_nombre_pila: string | null
  web_apellidos: string | null
  web_fact_nombre_pila: string | null
  web_fact_apellidos: string | null
  web_factura_datos_distintos: boolean

  activo: boolean
  actualizado_en: string
}

export const emptyCliente: Omit<Cliente, 'actualizado_en'> = {
  codigo: '',
  nombre: '',
  razon_social: null,
  nif: null,
  fecha_nacimiento: null,
  fecha_alta: null,
  fecha_baja: null,
  gerente: null,
  contacto: null,
  comentario: null,
  fecha_ultima_venta: null,
  es_generico: false,
  bloqueado: false,
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
  tipo_cliente_codigo: null,
  actividad: null,
  productos: null,
  previsto_ventas: null,
  pedido_minimo: null,
  tipo_credito: 'Contado',
  forma_pago_codigo: null,
  tipo_factura_global: null,
  digito_control: null,
  tipo_documento_contado: null,
  tipo_documento_credito: null,
  'nº_copias_factura': 1,
  limite_deuda: null,
  saldo_anterior: null,
  fecha_saldo_inicial: null,
  deuda_actual: null,
  dias_pago_1_tipo: null,
  dias_pago_1: null,
  dias_pago_2_tipo: null,
  dias_pago_2: null,
  dias_demora_pago: null,
  num_pagos_demora: null,
  observ_jefe_compras: null,
  avisar_jefe_compras: false,
  mensaje_aviso_venta: null,
  es_peligroso: false,
  incremento_sobre_coste_pct: null,
  descuento_pct: null,
  descuento_en_pie: false,
  descuento_ficticio_pct: null,
  tarifa_nivel_defecto: 0,
  no_permite_modificar_tarifa: false,
  no_aplica_impuesto2: false,
  no_aplica_impuesto3: false,
  pvp_fijos: false,
  vendedor_codigo: null,
  tienda_defecto_codigo: null,
  zona_territorial_codigo: null,
  ruta_codigo: null,
  orden_en_ruta: null,
  codigo_barras: null,
  cuenta_contable_430: null,
  cuenta_contable_700: null,
  cuenta_contable_431: null,
  cuenta_contable_43150: null,
  cuenta_contable_572: null,
  face_organo_gestor: null,
  face_organo_gestor_nombre: null,
  face_unidad_tramitadora: null,
  face_unidad_tramitadora_nombre: null,
  face_oficina_contable: null,
  face_oficina_contable_nombre: null,
  genera_sucursales_auto: false,
  imagen_url: null,
  web_publicado: false,
  web_fecha_baja: null,
  web_id_cliente: null,
  web_id_sucursal: null,
  web_usuario: null,
  web_contrasena_hash: null,
  web_nombre_pila: null,
  web_apellidos: null,
  web_fact_nombre_pila: null,
  web_fact_apellidos: null,
  web_factura_datos_distintos: false,
  activo: true,
}

/** Todas las pestañas de la ficha reciben lo mismo; las de rejilla usan cliente.codigo. */
export interface ClienteTabProps {
  cliente: Cliente
  editing: boolean
  onChange: (patch: Partial<Cliente>) => void
}

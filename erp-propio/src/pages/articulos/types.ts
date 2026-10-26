// Tipos de la ficha de Artículos (Almacén → Artículos en GeminisWin).
// Nombres de columna = nombres reales en Postgres; cada tabla cita en su
// comentario la tabla DBF original (ver MAPA_DATOS_GEMINISWIN.xlsx).

export interface Articulo {
  codigo_interno: string
  descripcion: string
  descripcion_corta: string | null
  marca_codigo: string | null
  familia_codigo: string | null
  proveedor_habitual_codigo: string | null
  codigo_compra_habitual: string | null
  codigo_venta: string | null
  codigo_barras_principal: string | null
  campo_libre: string | null

  // Características — embalaje y unidad de medida
  unidades_por_caja: number | null
  cajas_por_bulto: number | null
  unidad_medida: string | null
  unidad_medida_base: string | null
  unidad_medida_valor: number | null
  vende_por_caja: boolean
  vende_por_horario: boolean
  pesar_en_tpv: boolean
  control_lotes: number | null
  garantia_meses: number | null

  // Características — costes
  coste_puro: number | null
  coste_bruto: number | null
  coste_neto: number | null
  precio_medio_compra: number | null
  precio_liquidado: number | null
  coste_local: number | null
  calcular_coste_automatico: boolean

  // Características — plantilla de tarifa y descuento máximo
  plantilla_tarifa_codigo: string | null
  descuento_maximo_cliente_pct: number | null

  // Características — impuestos
  tipo_igic_codigo: number | null
  igic_pct: number | null
  impuesto2_pct: number | null
  impuesto3_pct: number | null

  // Características — PVP general (tabla articulo_precio_nivel lleva los 7 niveles)
  pvp: number | null

  // Características — opciones
  no_calcular_pvp_auto: boolean
  permite_modificar_pvp_al_vender: boolean
  permite_modificar_pvp_solo_si_es_cero: boolean
  modificar_pvp_actualiza_articulo: boolean
  modificar_pvp_pide_precio_coste: boolean
  pvp_es_padre_de_variantes: boolean
  no_ver_en_venta: boolean
  no_ver_en_compra: boolean
  sin_control_stock: boolean
  compuesto: boolean
  es_kit_de_componentes: boolean
  talla: string | null
  color: string | null
  tipo_articulo: number | null

  // Características — fechas
  ultima_compra_fecha: string | null
  ultima_venta_fecha: string | null
  fecha_ultima_modificacion_pvp: string | null
  fecha_alta: string | null
  fecha_baja: string | null
  fecha_prevista_venta: string | null
  ultima_compra_tienda: string | null
  ultima_compra_numero: number | null
  ultimo_descuento_compra_pct: number | null
  ultima_bonificacion_compra: number | null
  ultimas_unidades_compradas: number | null

  // Almacén (cabecera, no por almacén concreto)
  stock_minimo: number | null
  stock_maximo: number | null
  pedido_recomendado: number | null
  ubicacion_1: string | null
  ubicacion_2: string | null

  // Precios de oferta (nivel artículo)
  precio_oferta: number | null
  oferta_fecha_desde: string | null
  oferta_hora_desde: string | null
  oferta_fecha_hasta: string | null
  oferta_hora_hasta: string | null

  // Parámetros para el cálculo del PVP
  tipo_redondeo: number | null

  // Observaciones
  observaciones: string | null
  observaciones_info: string | null
  observaciones_venta: boolean
  mensaje_ventas: string | null

  // Imagen y Web
  imagen_url: string | null
  web_publicado: boolean
  web_fecha_baja: string | null
  web_id_link: number | null
  web_destacado: boolean
  etiqueta_energetica: string | null
  web_descripcion: string | null
  web_fabricante: string | null
  web_categoria: string | null
  web_url: string | null
  web_observaciones: string | null
  web_sin_imagen: boolean
  web_sin_observaciones: boolean
  web_sin_oferta: boolean
  web_descripcion_corta_envio: boolean

  activo: boolean
  actualizado_en: string
}

export const emptyArticulo: Omit<Articulo, 'actualizado_en'> = {
  codigo_interno: '',
  descripcion: '',
  descripcion_corta: null,
  marca_codigo: null,
  familia_codigo: null,
  proveedor_habitual_codigo: null,
  codigo_compra_habitual: null,
  codigo_venta: null,
  codigo_barras_principal: null,
  campo_libre: null,
  unidades_por_caja: null,
  cajas_por_bulto: null,
  unidad_medida: null,
  unidad_medida_base: null,
  unidad_medida_valor: null,
  vende_por_caja: false,
  vende_por_horario: false,
  pesar_en_tpv: false,
  control_lotes: 0,
  garantia_meses: null,
  coste_puro: null,
  coste_bruto: null,
  coste_neto: null,
  precio_medio_compra: null,
  precio_liquidado: null,
  coste_local: null,
  calcular_coste_automatico: true,
  plantilla_tarifa_codigo: null,
  descuento_maximo_cliente_pct: null,
  tipo_igic_codigo: 0,
  igic_pct: null,
  impuesto2_pct: null,
  impuesto3_pct: null,
  pvp: null,
  no_calcular_pvp_auto: false,
  permite_modificar_pvp_al_vender: false,
  permite_modificar_pvp_solo_si_es_cero: true,
  modificar_pvp_actualiza_articulo: false,
  modificar_pvp_pide_precio_coste: false,
  pvp_es_padre_de_variantes: false,
  no_ver_en_venta: false,
  no_ver_en_compra: false,
  sin_control_stock: false,
  compuesto: false,
  es_kit_de_componentes: false,
  talla: null,
  color: null,
  tipo_articulo: null,
  ultima_compra_fecha: null,
  ultima_venta_fecha: null,
  fecha_ultima_modificacion_pvp: null,
  fecha_alta: null,
  fecha_baja: null,
  fecha_prevista_venta: null,
  ultima_compra_tienda: null,
  ultima_compra_numero: null,
  ultimo_descuento_compra_pct: null,
  ultima_bonificacion_compra: null,
  ultimas_unidades_compradas: null,
  stock_minimo: null,
  stock_maximo: null,
  pedido_recomendado: null,
  ubicacion_1: null,
  ubicacion_2: null,
  precio_oferta: null,
  oferta_fecha_desde: null,
  oferta_hora_desde: null,
  oferta_fecha_hasta: null,
  oferta_hora_hasta: null,
  tipo_redondeo: 2,
  observaciones: null,
  observaciones_info: null,
  observaciones_venta: false,
  mensaje_ventas: null,
  imagen_url: null,
  web_publicado: false,
  web_fecha_baja: null,
  web_id_link: null,
  web_destacado: false,
  etiqueta_energetica: null,
  web_descripcion: null,
  web_fabricante: null,
  web_categoria: null,
  web_url: null,
  web_observaciones: null,
  web_sin_imagen: false,
  web_sin_observaciones: false,
  web_sin_oferta: false,
  web_descripcion_corta_envio: false,
  activo: true,
}

export interface ArticuloPrecioNivel {
  articulo_codigo: string
  nivel_tarifa: number
  pvp: number
  incremento_pct: number | null
  modo_calculo: string | null // 'P' % sobre coste · 'D' % descuento sobre General
  permite_descuento_linea: boolean
}

export interface ArticuloCodigoBarras {
  id?: number
  articulo_codigo: string
  proveedor_codigo: string | null
  codigo_barras: string
  digitos_barras: number | null
  unidades_por_codigo: number | null
  unidad_descripcion: string | null
}

export interface ArticuloProveedor {
  articulo_codigo: string
  proveedor_codigo: string
  codigo_compra: string | null
  coste_puro: number | null
  coste_neto: number | null
  coste_bruto: number | null
  precio_medio_compra: number | null
  ultimo_descuento_pct: number | null
  impuesto1_pct: number | null
  impuesto2_pct: number | null
  impuesto3_pct: number | null
  ultima_bonificacion: number | null
  ultima_compra_tienda: string | null
  ultima_compra_numero: number | null
  ultima_compra_fecha: string | null
  fecha_prevista_entrega: string | null
  ultimas_unidades_compradas: number | null
  unidades_pedidas: number | null
  unidades_compra: number | null
}

export interface ArticuloUnidadVenta {
  id?: number
  articulo_codigo: string
  descripcion: string
  factor_conversion: number
  tipo_calculo_precio: number | null // 0 proporcional · 1 % sobre el anterior · 2 PVP fijo · 3 tarifas de la ficha
  incremento_pct: number | null
  no_vender: boolean
  precios?: ArticuloUnidadVentaPrecioNivel[]
}

export interface ArticuloUnidadVentaPrecioNivel {
  articulo_unidad_venta_id: number
  nivel_tarifa: number
  pvp: number
}

export interface ArticuloOferta {
  id?: number
  articulo_codigo: string
  tipo_oferta: number // 0 cantidad mínima · 1 regalo
  descripcion: string | null
  fecha_desde: string | null
  hora_desde: string | null
  fecha_hasta: string | null
  hora_hasta: string | null
  cada_x_cantidad: number | null
  articulo_regalo_codigo: string | null
  cantidad_oferta: number | null
  descuento_pct: number | null
  pvp_fijo: number | null
}

export interface ArticuloTarifaCantidad {
  id?: number
  articulo_codigo: string
  cantidad_desde: number
  descripcion_oferta: string | null
  fecha_desde: string | null
  hora_desde: string | null
  fecha_hasta: string | null
  hora_hasta: string | null
  stock_minimo_oferta: number | null
  almacen_oferta_codigo: string | null
  es_un_pvp_para_toda_la_oferta: boolean
}

export interface ArticuloAlmacenStock {
  articulo_codigo: string
  almacen_codigo: string
  cantidad_actual: number
  cantidad_reservada: number
  cantidad_disponible: number | null
  ubicacion_1: string | null
  ubicacion_2: string | null
}

export interface ArticuloTallaColorConfig {
  articulo_codigo: string
  tope_maximo: number | null
  tope_minimo: number | null
  salto: number | null
  num_colores: number | null
  num_tallas: number | null
  rango_alfabetico: boolean
  no_incluir_color: boolean
  no_incluir_talla: boolean
  pvp_es_padre: boolean
  codigo_compra_es_padre: boolean
}

export interface ArticuloVariante {
  id?: number
  articulo_codigo: string
  talla_id: number | null
  talla_descripcion: string | null
  color_id: number | null
  color_descripcion: string | null
  codigo_variante: string | null
}

export interface ArticuloEquivalencia {
  id?: number
  articulo_codigo: string
  codigo_equivalente: string
  descripcion_1: string | null
  descripcion_2: string | null
}

export interface ArticuloComponente {
  id?: number
  articulo_kit_codigo: string
  articulo_componente_codigo: string
  unidades: number
  tipo_movimiento: number | null
}

export const NIVELES_TARIFA = [
  { nivel: 0, nombre: 'General' },
  { nivel: 1, nombre: 'MAYOR M-1' },
  { nivel: 2, nombre: 'MAYOR M-2' },
  { nivel: 3, nombre: 'MAYOR M-3' },
  { nivel: 4, nombre: 'Tarifa Dto-4' },
  { nivel: 5, nombre: 'Tarifa Dto-5' },
  { nivel: 6, nombre: 'Tarifa Dto-6' },
]

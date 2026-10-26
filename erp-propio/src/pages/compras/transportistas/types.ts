// Ficha de Transportistas (Compras → Transportistas en GeminisWin, tabla TRANSPOR).
// Nombres de columna = nombres reales en Postgres (tabla transportista).

export interface Transportista {
  codigo: string
  nombre: string
  razon_social: string | null
  nif: string | null
  contacto: string | null
  fecha_alta: string | null
  fecha_baja: string | null

  // Datos generales
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
  forma_pago_codigo: string | null
  dias_pago_1_tipo: number | null
  dias_pago_1: number | null
  dias_pago_2_tipo: number | null
  dias_pago_2: number | null
  dias_demora_pago: number | null
  num_pagos_demora: number | null
  no_contabiliza_gasto: boolean // NOCONTGAST

  // Enlaces
  cuenta_contable_400: string | null
  cuenta_contable_624: string | null
  cuenta_contable_411: string | null
  cuenta_contable_41150: string | null
  cuenta_contable_572: string | null

  // Observaciones e imagen
  observaciones: string | null
  imagen_url: string | null
  imagen_modo: number

  activo: boolean
  actualizado_en: string
}

export const emptyTransportista: Omit<Transportista, 'actualizado_en'> = {
  codigo: '',
  nombre: '',
  razon_social: null,
  nif: null,
  contacto: null,
  fecha_alta: null,
  fecha_baja: null,
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
  forma_pago_codigo: null,
  dias_pago_1_tipo: null,
  dias_pago_1: null,
  dias_pago_2_tipo: null,
  dias_pago_2: null,
  dias_demora_pago: null,
  num_pagos_demora: null,
  no_contabiliza_gasto: false,
  cuenta_contable_400: null,
  cuenta_contable_624: null,
  cuenta_contable_411: null,
  cuenta_contable_41150: null,
  cuenta_contable_572: null,
  observaciones: null,
  imagen_url: null,
  imagen_modo: 1,
  activo: true,
}

export interface TransportistaTabProps {
  transportista: Transportista
  editing: boolean
  onChange: (patch: Partial<Transportista>) => void
}

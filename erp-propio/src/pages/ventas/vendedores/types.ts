// Ficha de Vendedores y de Técnicos (Ventas → Vendedores / Técnicos en GeminisWin): la misma
// ficha sobre dos tablas con las mismas columnas (VENDEDOR y TECNICOS en GeminisWin).

export type TipoFicha = 'vendedor' | 'tecnico'

export interface Vendedor {
  codigo: string
  nombre: string
  nombre_corto: string | null
  dni: string | null
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
  fecha_alta: string | null
  fecha_baja: string | null
  fecha_nacimiento: string | null
  comision_oferta_pct: number | null // COMISOFERT: «Precio de Oferta»
  computa_beneficio: boolean // COMPORBEN: comisiones sobre el beneficio
  observaciones: string | null
  imagen_url: string | null
  imagen_modo: number
  activo: boolean
  actualizado_en: string
}

export const emptyVendedor: Omit<Vendedor, 'actualizado_en'> = {
  codigo: '',
  nombre: '',
  nombre_corto: null,
  dni: null,
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
  fecha_alta: null,
  fecha_baja: null,
  fecha_nacimiento: null,
  comision_oferta_pct: null,
  computa_beneficio: false,
  observaciones: null,
  imagen_url: null,
  imagen_modo: 1,
  activo: true,
}

/** Comisión por nivel de tarifa (COMISION0..6): 0 General, 1-3 MAYOR M-1..M-3, 4-6 Tarifa Dcto -4..-6. */
export type Comisiones = Record<number, number | null>

export interface VendedorTabProps {
  tipo: TipoFicha
  vendedor: Vendedor
  editing: boolean
  onChange: (patch: Partial<Vendedor>) => void
}

export const CONFIG: Record<TipoFicha, { tabla: string; tablaComision: string; fk: string; ruta: string; titulo: string; singular: string }> = {
  vendedor: { tabla: 'vendedor', tablaComision: 'vendedor_comision_nivel', fk: 'vendedor_codigo', ruta: '/vendedores', titulo: 'Vendedores', singular: 'vendedor' },
  tecnico: { tabla: 'tecnico', tablaComision: 'tecnico_comision_nivel', fk: 'tecnico_codigo', ruta: '/tecnicos', titulo: 'Técnicos', singular: 'técnico' },
}

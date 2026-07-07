export type LocationType = 'Almacén' | 'Tienda'

export interface Location {
  id: string
  nombre: string
  tipo: LocationType
  direccion: string
  zona: string
}

export interface SalesRep {
  id: string
  nombre: string
  zona: string
  telefono: string
  furgonId: string
  cocheId: string
}

export type VehicleType = 'Furgón de reparto' | 'Coche comercial'
export type VehicleEstado = 'En ruta' | 'En base' | 'Taller'

export interface VehicleFinanciacion {
  activa: boolean
  cuotaMensual: number
  cuotasPagadas: number
  cuotasTotales: number
}

export interface VehicleUbicacion {
  lat: number
  lon: number
  zona: string
  actualizado: string
}

export interface Vehicle {
  id: string
  tipo: VehicleType
  marca: string
  modelo: string
  anio: number
  matricula: string
  fotoUrl?: string
  comercialId: string
  kilometraje: number
  estado: VehicleEstado
  fechaAlta: string
  itvUltima: string
  itvProxima: string
  seguroCompania: string
  seguroPoliza: string
  seguroVencimiento: string
  financiacion: VehicleFinanciacion
  ubicacion: VehicleUbicacion
}

export type TipoGastoVehiculo =
  | 'Revisión periódica'
  | 'ITV'
  | 'Reparación'
  | 'Neumáticos'
  | 'Combustible'
  | 'Seguro'
  | 'Multa'
  | 'Otros'

export interface GastoVehiculo {
  id: string
  vehiculoId: string
  fecha: string
  tipo: TipoGastoVehiculo
  descripcion: string
  km?: number
  taller?: string
  importe: number
}

export type EstadoCitaVehiculo = 'Pendiente' | 'Completada'

export interface CitaVehiculo {
  id: string
  vehiculoId: string
  fecha: string
  tipo: TipoGastoVehiculo
  descripcion: string
  estado: EstadoCitaVehiculo
}

export interface Category {
  id: string
  nombre: string
  margenMinorista: number
  margenMayorista: number
}

export interface Supplier {
  id: string
  nombre: string
  contacto: string
  telefono: string
  email: string
  plazoEntregaDias: number
  ultimaCompra: string
}

export type IgicRate = 7 | 3 | 0

export type FormatoVenta = 'Unidad' | 'Paquete'

export type TarifaId = 'Tarifa 1' | 'Tarifa 2' | 'Tarifa 3' | 'Tarifa 6 (Mayor)'

export const TARIFA_IDS: TarifaId[] = ['Tarifa 1', 'Tarifa 2', 'Tarifa 3', 'Tarifa 6 (Mayor)']

export interface Product {
  id: string
  sku: string
  codigoBarras: string
  nombre: string
  categoriaId: string
  proveedorId: string
  coste: number
  pvp: number
  tarifas: Record<TarifaId, number>
  igic: IgicRate
  unidadVenta: string
  formatoVenta: FormatoVenta
  unidadesPorPaquete: number
  ubicacion: string
  activo: boolean
  publicadoWeb: boolean
  imagenUrl?: string
}

export interface StockEntry {
  id: string
  productoId: string
  locationId: string
  unidades: number
  minimo: number
}

export type ClienteTipo = 'Mayorista' | 'Minorista'

export interface Client {
  id: string
  nombre: string
  tipo: ClienteTipo
  tarifa: string
  comercialId: string
  zona: string
  cif: string
  telefono: string
  email: string
  direccion: string
  saldoPendiente: number
  ultimoPedido: string
}

export type EstadoVenta = 'Presupuesto' | 'Pedido' | 'Albarán' | 'Facturado'

export interface OrderLine {
  productoId: string
  cantidad: number
  precioUnit: number
  igic: IgicRate
}

export type CanalVenta = 'Comercial' | 'Tienda' | 'Web'

export interface SaleOrder {
  id: string
  clienteId: string
  comercialId: string
  estado: EstadoVenta
  canal: CanalVenta
  locationId?: string
  formaPago?: 'Efectivo' | 'Tarjeta'
  fecha: string
  lineas: OrderLine[]
  total: number
}

export type EstadoCompra = 'Pendiente' | 'Recibido'

export interface PurchaseOrder {
  id: string
  proveedorId: string
  locationId: string
  estado: EstadoCompra
  fecha: string
  fechaPrevista: string
  lineas: OrderLine[]
  total: number
}

export type EstadoEnvioAeat = 'Pendiente' | 'Enviado'

export interface VerifactuEnvio {
  id: string
  invoiceId: string
  estado: EstadoEnvioAeat
  fechaEnvio: string | null
}

export interface Invoice {
  id: string
  ventaId: string
  clienteId: string
  fecha: string
  base: number
  igic: number
  total: number
}

export type UserRole = 'Administración' | 'Comercial' | 'Almacén' | 'Contabilidad'

export interface AppUser {
  id: string
  nombre: string
  usuario: string
  rol: UserRole
  ubicacionId?: string
  ultimoAcceso: string
  activo: boolean
}

export type EstadoCaja = 'Abierta' | 'Cerrada'

export interface CashSession {
  id: string
  locationId: string
  fechaApertura: string
  fechaCierre: string | null
  saldoInicial: number
  ventasEfectivo: number
  ventasTarjeta: number
  saldoContado: number | null
  estado: EstadoCaja
}

export type EstadoTransferencia = 'Pendiente' | 'En tránsito' | 'Completada'

export interface TransferLine {
  productoId: string
  cantidad: number
}

export interface StockTransfer {
  id: string
  origenId: string
  destinoId: string
  fecha: string
  estado: EstadoTransferencia
  lineas: TransferLine[]
}

export interface Database {
  locations: Location[]
  salesReps: SalesRep[]
  vehicles: Vehicle[]
  categories: Category[]
  suppliers: Supplier[]
  products: Product[]
  stock: StockEntry[]
  clients: Client[]
  sales: SaleOrder[]
  purchases: PurchaseOrder[]
  invoices: Invoice[]
  users: AppUser[]
  cashSessions: CashSession[]
  transfers: StockTransfer[]
  verifactuEnvios: VerifactuEnvio[]
  gastosVehiculos: GastoVehiculo[]
  citasVehiculos: CitaVehiculo[]
}

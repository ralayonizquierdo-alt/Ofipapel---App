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
}

export type VanEstado = 'En ruta' | 'En base' | 'Mantenimiento'

export interface Van {
  id: string
  matricula: string
  comercialId: string
  estado: VanEstado
}

export interface Category {
  id: string
  nombre: string
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

export type IvaRate = 21 | 10 | 4

export type FormatoVenta = 'Unidad' | 'Paquete'

export interface Product {
  id: string
  sku: string
  nombre: string
  categoriaId: string
  proveedorId: string
  coste: number
  pvp: number
  tarifaMayorista: number
  iva: IvaRate
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
  iva: IvaRate
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

export interface Invoice {
  id: string
  ventaId: string
  clienteId: string
  fecha: string
  base: number
  iva: number
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

export interface Lote {
  id: string
  productoId: string
  locationId: string
  lote: string
  fechaCaducidad: string
  unidades: number
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
  vans: Van[]
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
  lotes: Lote[]
  transfers: StockTransfer[]
}

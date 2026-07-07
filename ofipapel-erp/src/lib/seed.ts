import { createRng, pick, intBetween, daysAgo, daysAhead } from './rng'
import { placeholderImageFor } from './placeholderImage'
import type {
  Location,
  SalesRep,
  Van,
  Category,
  Supplier,
  Product,
  StockEntry,
  Client,
  SaleOrder,
  PurchaseOrder,
  Invoice,
  AppUser,
  Database,
  OrderLine,
  EstadoVenta,
  CanalVenta,
  CashSession,
  StockTransfer,
  FormatoVenta,
  VerifactuEnvio,
  TarifaId,
} from '../types'

const ZONES = [
  'Santa Cruz de Tenerife',
  'La Laguna',
  'Sur de Tenerife',
  'Las Palmas de Gran Canaria',
  'Telde',
  'Lanzarote',
  'Fuerteventura',
] as const

const REP_NAMES = [
  'Carlos Medina',
  'Beatriz Hernández',
  'Óscar Delgado',
  'Nayra Santana',
  'Iván Cabrera',
  'Sara Rodríguez',
  'Airam Pérez',
] as const

function buildLocations(): Location[] {
  return [
    { id: 'alm-1', nombre: 'Ofipapel', tipo: 'Almacén', direccion: 'Polígono Costa Sur, Santa Cruz de Tenerife', zona: 'Santa Cruz de Tenerife' },
    { id: 'alm-2', nombre: 'Aliz 1', tipo: 'Almacén', direccion: 'Polígono El Sebadal, Las Palmas de Gran Canaria', zona: 'Las Palmas de Gran Canaria' },
    { id: 'alm-3', nombre: 'Aliz 2', tipo: 'Almacén', direccion: 'Polígono Los Majuelos, Arona', zona: 'Sur de Tenerife' },
    { id: 'alm-4', nombre: 'Nave 6', tipo: 'Almacén', direccion: 'Polígono Argana, Arrecife', zona: 'Lanzarote' },
    { id: 'tie-1', nombre: 'Tienda Santa Cruz', tipo: 'Tienda', direccion: 'Calle Villalba Hervás, Santa Cruz de Tenerife', zona: 'Santa Cruz de Tenerife' },
    { id: 'tie-2', nombre: 'Tienda La Laguna', tipo: 'Tienda', direccion: 'Avenida Trinidad, La Laguna', zona: 'La Laguna' },
    { id: 'tie-3', nombre: 'Tienda Las Palmas', tipo: 'Tienda', direccion: 'Calle Triana, Las Palmas de Gran Canaria', zona: 'Las Palmas de Gran Canaria' },
  ]
}

function buildRepsAndVans(): { reps: SalesRep[]; vans: Van[] } {
  const reps: SalesRep[] = []
  const vans: Van[] = []
  REP_NAMES.forEach((nombre, i) => {
    const repId = `com-${i + 1}`
    const vanId = `fur-${i + 1}`
    reps.push({
      id: repId,
      nombre,
      zona: ZONES[i],
      telefono: `6${intBetweenFixed(i, 10000000, 99999999)}`,
      furgonId: vanId,
    })
    vans.push({
      id: vanId,
      matricula: `${intBetweenFixed(i, 1000, 9999)} ${['BCD', 'FGH', 'JKL', 'MNP'][i % 4]}`,
      comercialId: repId,
      estado: (['En ruta', 'En ruta', 'En base', 'En ruta', 'En ruta', 'Mantenimiento', 'En ruta'] as const)[i],
    })
  })
  return { reps, vans }
}

// Deterministic filler so phone/plate numbers don't require passing rng around at module scope
function intBetweenFixed(seedOffset: number, min: number, max: number): number {
  const rng = createRng(1000 + seedOffset)
  return Math.floor(rng() * (max - min + 1)) + min
}

const CATEGORY_DEFS: { nombre: string; templates: string[]; sizes?: string[]; margenMinorista: number; margenMayorista: number }[] = [
  {
    nombre: 'Papelería',
    templates: ['Folio A4 80g', 'Folio A4 90g', 'Folio A3 80g', 'Bloc de notas', 'Bloc cuadriculado', 'Papel continuo', 'Cartulina', 'Papel kraft', 'Sobre americano', 'Sobre bolsa A4'],
    sizes: ['paquete 500', 'paquete 250', 'caja 5 paquetes', 'unidad'],
    margenMinorista: 85,
    margenMayorista: 35,
  },
  {
    nombre: 'Escritura',
    templates: ['Bolígrafo azul', 'Bolígrafo negro', 'Bolígrafo rojo', 'Rotulador permanente', 'Rotulador fluorescente', 'Lápiz HB', 'Portaminas', 'Corrector líquido', 'Corrector cinta', 'Marcador pizarra blanca'],
    sizes: ['unidad', 'caja 12 uds', 'caja 50 uds', 'blister 3 uds'],
    margenMinorista: 100,
    margenMayorista: 40,
  },
  {
    nombre: 'Archivo y Clasificación',
    templates: ['Archivador de palanca A4', 'Carpeta con gomas', 'Carpeta colgante', 'Subcarpeta color', 'Separador de plástico', 'Caja archivo definitivo', 'Fundas multitaladro', 'Clasificador de fuelle'],
    sizes: ['unidad', 'paquete 10 uds', 'paquete 25 uds', 'paquete 100 uds'],
    margenMinorista: 80,
    margenMayorista: 30,
  },
  {
    nombre: 'Informática y Consumibles',
    templates: ['Tóner compatible HP', 'Tóner compatible Brother', 'Cartucho tinta compatible', 'Cable USB-C', 'Ratón inalámbrico', 'Teclado USB', 'Disco USB 32GB', 'Regleta 6 tomas'],
    margenMinorista: 60,
    margenMayorista: 25,
  },
  {
    nombre: 'Mobiliario de oficina',
    templates: ['Silla de oficina', 'Mesa de escritorio', 'Cajonera con ruedas', 'Bandeja portadocumentos', 'Papelera metálica', 'Perchero de pie'],
    margenMinorista: 50,
    margenMayorista: 20,
  },
  {
    nombre: 'Embalaje y Manipulado',
    templates: ['Caja cartón canal simple', 'Caja cartón canal doble', 'Rollo film estirable', 'Precinto adhesivo', 'Burbuja de embalaje', 'Etiqueta envío adhesiva'],
    sizes: ['unidad', 'paquete 10 uds', 'rollo', 'caja 36 uds'],
    margenMinorista: 70,
    margenMayorista: 30,
  },
  {
    nombre: 'Impresión y Tóner',
    templates: ['Papel fotográfico', 'Papel para plotter', 'Cinta impresora matricial', 'Tóner original', 'Tambor compatible'],
    margenMinorista: 65,
    margenMayorista: 25,
  },
  {
    nombre: 'Material Escolar',
    templates: ['Cuaderno cuadriculado', 'Cuaderno rayado', 'Estuche escolar', 'Mochila escolar', 'Goma de borrar', 'Sacapuntas', 'Pegamento de barra', 'Tijera escolar'],
    sizes: ['unidad', 'pack 5 uds'],
    margenMinorista: 90,
    margenMayorista: 35,
  },
  {
    nombre: 'Limpieza e Higiene',
    templates: ['Gel hidroalcohólico', 'Papel higiénico industrial', 'Bobina secamanos', 'Bayeta multiusos', 'Bolsa de basura', 'Guantes desechables'],
    sizes: ['unidad', 'paquete 6 uds', 'caja 12 uds'],
    margenMinorista: 60,
    margenMayorista: 20,
  },
  {
    nombre: 'Regalo y Detalle',
    templates: ['Agenda anual', 'Set de escritorio', 'Libreta tapa dura', 'Taza personalizable', 'Powerbank promocional'],
    margenMinorista: 110,
    margenMayorista: 45,
  },
]

const SUPPLIER_NAMES = [
  'Distribuciones Papel Sur S.L.',
  'Global Office Supplies',
  'Canarias Ofimática S.A.',
  'Suministros Atlántico',
  'Papelera del Teide S.L.',
  'Mayorista Insular de Oficina',
  'Ibérica de Consumibles',
  'Distribuciones Guanche',
  'Ofertas Escolares Canarias',
  'Embalajes del Atlántico',
  'Tóner Express Canarias',
  'Mobiliario Insular S.L.',
]

const CLIENT_COMPANY_NAMES = [
  'Librería Montaña S.L.', 'Copistería Rápida', 'Gestoría Benítez y Asociados', 'Colegio San Fernando',
  'Ayuntamiento de Candelaria', 'Ferretería Hermanos López', 'Clínica Dental Sonrisa', 'Asesoría Fiscal Canarias',
  'Hotel Playa Dorada', 'Restaurante El Mirador', 'Autoescuela Vía Rápida', 'Notaría Pérez-Suárez',
  'Instituto Tecnológico Insular', 'Farmacia Ldo. Ramírez', 'Óptica Visión Clara', 'Supermercados Isleños S.L.',
  'Constructora Atlántida', 'Peluquería Estilo Canario', 'Academia de Idiomas Britain', 'Talleres Mecánicos Suárez',
  'Papelería El Estudiante', 'Centro Médico Vitalia', 'Inmobiliaria Costa Norte', 'Bufete Jurídico Domínguez',
  'Panadería La Espiga', 'Distribuciones Náuticas', 'Editorial Insular', 'Agencia de Viajes Volcán',
  'Consultora Empresarial Teide', 'Residencia Los Almendros', 'Gimnasio PowerFit', 'Estudio de Arquitectura Bello',
  'Frutería El Guanche', 'Taller de Serigrafía Color', 'Colegio Concertado Santa Ana', 'Veterinaria San Roque',
  'Imprenta Rápida Digital', 'Cafetería Central', 'Aseguradora Insular', 'Transportes Rodríguez e Hijos',
  'Librería-Papelería Arco Iris',
]

const PARTICULAR_NAMES = [
  'Ana Pérez', 'Juan Delgado', 'María Cabrera', 'Pedro Hernández', 'Lucía Santana',
  'Miguel Rodríguez', 'Carmen Díaz', 'Antonio Ramos', 'Isabel Torres', 'Francisco Gil',
]

function buildCategories(): Category[] {
  return CATEGORY_DEFS.map((c, i) => ({
    id: `cat-${i + 1}`,
    nombre: c.nombre,
    margenMinorista: c.margenMinorista,
    margenMayorista: c.margenMayorista,
  }))
}

function buildSuppliers(rng: () => number): Supplier[] {
  return SUPPLIER_NAMES.map((nombre, i) => ({
    id: `prov-${i + 1}`,
    nombre,
    contacto: pick(rng, ['Marta Ruiz', 'Javier Soto', 'Elena Castro', 'David Morales', 'Cristina Alonso']),
    telefono: `9${intBetween(rng, 10000000, 99999999)}`,
    email: `pedidos@${nombre.toLowerCase().replace(/[^a-z]+/g, '').slice(0, 12)}.es`,
    plazoEntregaDias: intBetween(rng, 1, 10),
    ultimaCompra: daysAgo(rng, 45),
  }))
}

function parseFormato(size: string): { formatoVenta: FormatoVenta; unidadesPorPaquete: number } {
  if (size === 'unidad' || size === 'rollo') return { formatoVenta: 'Unidad', unidadesPorPaquete: 1 }
  const match = size.match(/\d+/)
  return { formatoVenta: 'Paquete', unidadesPorPaquete: match ? Number(match[0]) : 1 }
}

/** EAN-13 con dígito de control real, para que el lector de código de barras del TPV tenga algo válido que leer. */
function buildEan13(rng: () => number): string {
  let digits = '84' // prefijo arbitrario, no es un GS1 real
  for (let i = 0; i < 10; i++) digits += intBetween(rng, 0, 9)
  let sum = 0
  for (let i = 0; i < 12; i++) sum += (i % 2 === 0 ? 1 : 3) * Number(digits[i])
  const checkDigit = (10 - (sum % 10)) % 10
  return digits + checkDigit
}

export function tarifasFor(tarifaBase: number): Record<TarifaId, number> {
  return {
    'Tarifa 1': Number((tarifaBase * 1.06).toFixed(2)),
    'Tarifa 2': tarifaBase,
    'Tarifa 3': Number((tarifaBase * 0.95).toFixed(2)),
    'Tarifa 6 (Mayor)': Number((tarifaBase * 0.9).toFixed(2)),
  }
}

function buildProducts(rng: () => number, categories: Category[], suppliers: Supplier[]): Product[] {
  const products: Product[] = []
  let counter = 10000
  CATEGORY_DEFS.forEach((catDef, catIdx) => {
    const categoriaId = categories[catIdx].id
    const sizes = catDef.sizes ?? ['unidad']
    catDef.templates.forEach((template) => {
      sizes.forEach((size) => {
        counter += intBetween(rng, 3, 9)
        const coste = Number((intBetween(rng, 40, 4000) / 100).toFixed(2))
        // Margen de la familia con un pequeño desajuste por producto para que no todos salgan al céntimo iguales.
        const jitter = 0.95 + rng() * 0.1
        const pvp = Number((coste * (1 + catDef.margenMinorista / 100) * jitter).toFixed(2))
        const tarifaMayorista = Number((coste * (1 + catDef.margenMayorista / 100) * jitter).toFixed(2))
        const { formatoVenta, unidadesPorPaquete } = parseFormato(size)
        products.push({
          id: `prod-${counter}`,
          sku: `OF-${counter}`,
          codigoBarras: buildEan13(rng),
          nombre: size === 'unidad' ? template : `${template} (${size})`,
          categoriaId,
          proveedorId: pick(rng, suppliers).id,
          coste,
          pvp,
          tarifas: tarifasFor(tarifaMayorista),
          igic: pick(rng, [7, 7, 7, 3, 0] as const),
          unidadVenta: size,
          formatoVenta,
          unidadesPorPaquete,
          ubicacion: `P${intBetween(rng, 1, 8)}-E${intBetween(rng, 1, 6)}`,
          activo: rng() > 0.03,
          publicadoWeb: rng() > 0.05,
          imagenUrl: rng() > 0.1 ? placeholderImageFor(catDef.nombre) : undefined,
        })
      })
    })
  })
  return products
}

function buildStock(rng: () => number, products: Product[], locations: Location[]): StockEntry[] {
  const entries: StockEntry[] = []
  const almacenes = locations.filter((l) => l.tipo === 'Almacén')
  const tiendas = locations.filter((l) => l.tipo === 'Tienda')
  let id = 1
  products.forEach((p) => {
    // Every product lives in the central warehouse.
    const central = almacenes[0]
    entries.push(makeStockEntry(rng, id++, p.id, central.id))
    // Distributed across the other warehouses with decreasing likelihood.
    almacenes.slice(1).forEach((loc) => {
      if (rng() < 0.55) entries.push(makeStockEntry(rng, id++, p.id, loc.id))
    })
    // Only a curated subset reaches the retail stores.
    tiendas.forEach((loc) => {
      if (rng() < 0.35) entries.push(makeStockEntry(rng, id++, p.id, loc.id))
    })
  })
  return entries
}

function makeStockEntry(rng: () => number, id: number, productoId: string, locationId: string): StockEntry {
  const minimo = intBetween(rng, 10, 120)
  const bajoMinimoChance = rng() < 0.12
  const unidades = bajoMinimoChance ? intBetween(rng, 0, minimo - 1) : intBetween(rng, minimo, minimo * 8)
  return { id: `stk-${id}`, productoId, locationId, unidades, minimo }
}

function buildClients(rng: () => number, reps: SalesRep[]): Client[] {
  const clients: Client[] = []
  let id = 1
  CLIENT_COMPANY_NAMES.forEach((nombre) => {
    const rep = pick(rng, reps)
    clients.push({
      id: `cli-${id++}`,
      nombre,
      tipo: 'Mayorista',
      // Tarifa 6 (Mayor) es la reservada para las cuentas más grandes, así que sale con menos frecuencia.
      tarifa: pick(rng, ['Tarifa 1', 'Tarifa 1', 'Tarifa 2', 'Tarifa 2', 'Tarifa 3', 'Tarifa 6 (Mayor)'] as const),
      comercialId: rep.id,
      zona: rep.zona,
      cif: `B${intBetween(rng, 10000000, 99999999)}`,
      telefono: `9${intBetween(rng, 10000000, 99999999)}`,
      email: `compras@${nombre.toLowerCase().replace(/[^a-z]+/g, '').slice(0, 14)}.es`,
      direccion: `Zona ${rep.zona}`,
      saldoPendiente: Number((rng() < 0.55 ? intBetween(rng, 0, 350000) / 100 : 0).toFixed(2)),
      ultimoPedido: daysAgo(rng, 60),
    })
  })
  PARTICULAR_NAMES.forEach((nombre) => {
    const rep = pick(rng, reps)
    clients.push({
      id: `cli-${id++}`,
      nombre,
      tipo: 'Minorista',
      tarifa: 'PVP',
      comercialId: rep.id,
      zona: rep.zona,
      cif: `${intBetween(rng, 10000000, 99999999)}${pick(rng, ['A', 'B', 'C', 'D'])}`,
      telefono: `6${intBetween(rng, 10000000, 99999999)}`,
      email: `${nombre.toLowerCase().replace(/[^a-z]+/g, '.')}@correo.es`,
      direccion: `Zona ${rep.zona}`,
      saldoPendiente: 0,
      ultimoPedido: daysAgo(rng, 90),
    })
  })
  return clients
}

function priceFor(client: Client, product: Product): number {
  if (client.tipo === 'Minorista') return product.pvp
  return product.tarifas[client.tarifa as TarifaId] ?? product.tarifas['Tarifa 2']
}

function makeLineas(rng: () => number, client: Client, products: Product[]): OrderLine[] {
  const count = intBetween(rng, 1, 6)
  const lineas: OrderLine[] = []
  for (let i = 0; i < count; i++) {
    const producto = pick(rng, products)
    lineas.push({
      productoId: producto.id,
      cantidad: intBetween(rng, 1, client.tipo === 'Mayorista' ? 40 : 5),
      precioUnit: priceFor(client, producto),
      igic: producto.igic,
    })
  }
  return lineas
}

function totalFor(lineas: OrderLine[]): number {
  return Number(lineas.reduce((sum, l) => sum + l.cantidad * l.precioUnit * (1 + l.igic / 100), 0).toFixed(2))
}

const ESTADOS_VENTA: EstadoVenta[] = ['Presupuesto', 'Pedido', 'Albarán', 'Facturado', 'Facturado', 'Facturado', 'Facturado']

function buildSales(rng: () => number, clients: Client[], products: Product[], locations: Location[]): SaleOrder[] {
  const sales: SaleOrder[] = []
  const tiendas = locations.filter((l) => l.tipo === 'Tienda')
  const total = 260
  for (let i = 1; i <= total; i++) {
    const client = pick(rng, clients)
    const lineas = makeLineas(rng, client, products)
    const canal: CanalVenta = client.tipo === 'Minorista' ? pick(rng, ['Tienda', 'Web', 'Comercial']) : pick(rng, ['Comercial', 'Comercial', 'Web'])
    sales.push({
      id: `V-2026-${String(1000 + i)}`,
      clienteId: client.id,
      comercialId: client.comercialId,
      estado: pick(rng, ESTADOS_VENTA),
      canal,
      locationId: canal === 'Tienda' ? pick(rng, tiendas).id : undefined,
      formaPago: canal === 'Tienda' ? pick(rng, ['Efectivo', 'Tarjeta']) : undefined,
      fecha: daysAgo(rng, 75),
      lineas,
      total: totalFor(lineas),
    })
  }
  return sales.sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
}

function buildInvoices(sales: SaleOrder[]): Invoice[] {
  return sales
    .filter((s) => s.estado === 'Facturado')
    .map((s, i) => {
      const base = Number(s.lineas.reduce((sum, l) => sum + l.cantidad * l.precioUnit, 0).toFixed(2))
      const igic = Number((s.total - base).toFixed(2))
      return {
        id: `F-2026-${String(500 + i)}`,
        ventaId: s.id,
        clienteId: s.clienteId,
        fecha: s.fecha,
        base,
        igic,
        total: s.total,
      }
    })
}

function buildPurchases(rng: () => number, suppliers: Supplier[], products: Product[], locations: Location[]): PurchaseOrder[] {
  const almacenes = locations.filter((l) => l.tipo === 'Almacén')
  const purchases: PurchaseOrder[] = []
  for (let i = 1; i <= 70; i++) {
    const proveedor = pick(rng, suppliers)
    const lineas: OrderLine[] = Array.from({ length: intBetween(rng, 1, 5) }, () => {
      const producto = pick(rng, products.filter((p) => p.proveedorId === proveedor.id) || products)
      return { productoId: producto?.id ?? pick(rng, products).id, cantidad: intBetween(rng, 20, 400), precioUnit: producto?.coste ?? 1, igic: producto?.igic ?? 7 }
    })
    const estado = rng() < 0.4 ? 'Pendiente' : 'Recibido'
    purchases.push({
      id: `C-2026-${String(200 + i)}`,
      proveedorId: proveedor.id,
      locationId: pick(rng, almacenes).id,
      estado,
      fecha: daysAgo(rng, 60),
      fechaPrevista: estado === 'Pendiente' ? daysAhead(rng, 15) : daysAgo(rng, 60),
      lineas,
      total: totalFor(lineas),
    })
  }
  return purchases.sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
}

function buildUsers(reps: SalesRep[], locations: Location[]): AppUser[] {
  const users: AppUser[] = []
  users.push({ id: 'usr-1', nombre: 'Rubén Alayón Izquierdo', usuario: 'r.alayonizquierdo', rol: 'Administración', ultimoAcceso: 'hoy 09:12', activo: true })
  reps.forEach((rep, i) => {
    users.push({
      id: `usr-com-${i + 1}`,
      nombre: rep.nombre,
      usuario: rep.nombre.toLowerCase().split(' ').join('.'),
      rol: 'Comercial',
      ultimoAcceso: `hoy ${8 + (i % 3)}:${(10 * i) % 60 || '05'}`,
      activo: true,
    })
  })
  locations.filter((l) => l.tipo === 'Almacén').forEach((loc, i) => {
    users.push({
      id: `usr-alm-${i + 1}`,
      nombre: `Encargado ${loc.nombre}`,
      usuario: `almacen${i + 1}`,
      rol: 'Almacén',
      ubicacionId: loc.id,
      ultimoAcceso: `hoy 08:${20 + i * 5}`,
      activo: true,
    })
  })
  users.push({ id: 'usr-cont-1', nombre: 'Cristina Bello', usuario: 'c.bello', rol: 'Contabilidad', ultimoAcceso: 'ayer 18:40', activo: true })
  return users
}

function buildVerifactuEnvios(invoices: Invoice[]): VerifactuEnvio[] {
  const sorted = [...invoices].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
  return sorted.map((inv, i) => ({
    id: inv.id,
    invoiceId: inv.id,
    // Las facturas más recientes quedan como "Pendiente" de envío, para poder probar la acción.
    estado: i < 5 ? 'Pendiente' : 'Enviado',
    fechaEnvio: i < 5 ? null : inv.fecha,
  }))
}

function buildCashSessions(rng: () => number, locations: Location[]): CashSession[] {
  const tiendas = locations.filter((l) => l.tipo === 'Tienda')
  const sessions: CashSession[] = []
  let id = 1
  tiendas.forEach((tienda) => {
    for (let dayOffset = 14; dayOffset >= 0; dayOffset--) {
      const d = new Date()
      d.setDate(d.getDate() - dayOffset)
      const fechaApertura = d.toISOString().slice(0, 10)
      const saldoInicial = 100
      const ventasEfectivo = Number((intBetween(rng, 8000, 45000) / 100).toFixed(2))
      const ventasTarjeta = Number((intBetween(rng, 15000, 60000) / 100).toFixed(2))
      const esHoy = dayOffset === 0
      const esperado = saldoInicial + ventasEfectivo
      const diferencia = esHoy ? 0 : Number(((rng() - 0.5) * 6).toFixed(2))
      sessions.push({
        id: `caja-${id++}`,
        locationId: tienda.id,
        fechaApertura,
        fechaCierre: esHoy ? null : fechaApertura,
        saldoInicial,
        ventasEfectivo,
        ventasTarjeta,
        saldoContado: esHoy ? null : Number((esperado + diferencia).toFixed(2)),
        estado: esHoy ? 'Abierta' : 'Cerrada',
      })
    }
  })
  return sessions
}

function buildTransfers(rng: () => number, products: Product[], locations: Location[]): StockTransfer[] {
  const almacenes = locations.filter((l) => l.tipo === 'Almacén')
  const transfers: StockTransfer[] = []
  const estados = ['Pendiente', 'En tránsito', 'Completada', 'Completada', 'Completada'] as const
  for (let i = 1; i <= 22; i++) {
    const origen = pick(rng, almacenes)
    let destino = pick(rng, almacenes)
    while (destino.id === origen.id) destino = pick(rng, almacenes)
    const lineas = Array.from({ length: intBetween(rng, 1, 4) }, () => ({
      productoId: pick(rng, products).id,
      cantidad: intBetween(rng, 10, 150),
    }))
    transfers.push({
      id: `TR-2026-${String(100 + i)}`,
      origenId: origen.id,
      destinoId: destino.id,
      fecha: daysAgo(rng, 30),
      estado: pick(rng, estados),
      lineas,
    })
  }
  return transfers.sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
}

export function generateDatabase(): Database {
  const rng = createRng(20260702)
  const locations = buildLocations()
  const { reps, vans } = buildRepsAndVans()
  const categories = buildCategories()
  const suppliers = buildSuppliers(rng)
  const products = buildProducts(rng, categories, suppliers)
  const stock = buildStock(rng, products, locations)
  const clients = buildClients(rng, reps)
  const sales = buildSales(rng, clients, products, locations)
  const invoices = buildInvoices(sales)
  const purchases = buildPurchases(rng, suppliers, products, locations)
  const users = buildUsers(reps, locations)
  const cashSessions = buildCashSessions(rng, locations)
  const transfers = buildTransfers(rng, products, locations)
  const verifactuEnvios = buildVerifactuEnvios(invoices)

  return {
    locations,
    salesReps: reps,
    vans,
    categories,
    suppliers,
    products,
    stock,
    clients,
    cashSessions,
    transfers,
    sales,
    purchases,
    invoices,
    users,
    verifactuEnvios,
  }
}

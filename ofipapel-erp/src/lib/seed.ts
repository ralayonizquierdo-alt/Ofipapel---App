import { createRng, pick, intBetween, daysAgo, daysAhead } from './rng'
import { placeholderImageFor, vehiclePlaceholderImageFor } from './placeholderImage'
import { TENERIFE_ZONE_COORDS, TENERIFE_ZONES } from './geo'
import { priceForMargin } from './pricing'
import { TARIFA_IDS } from '../types'
import type {
  Location,
  SalesRep,
  Vehicle,
  VehicleType,
  Category,
  Subfamilia,
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
  GastoVehiculo,
  TipoGastoVehiculo,
  CitaVehiculo,
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

// Deterministic filler so phone/plate numbers don't require passing rng around at module scope
function intBetweenFixed(seedOffset: number, min: number, max: number): number {
  const rng = createRng(1000 + seedOffset)
  return Math.floor(rng() * (max - min + 1)) + min
}

const FURGON_MODELS = [
  { marca: 'Peugeot', modelo: 'Partner' },
  { marca: 'Citroën', modelo: 'Berlingo' },
  { marca: 'Renault', modelo: 'Kangoo' },
  { marca: 'Fiat', modelo: 'Doblo Cargo' },
  { marca: 'Volkswagen', modelo: 'Caddy' },
  { marca: 'Ford', modelo: 'Transit Connect' },
  { marca: 'Opel', modelo: 'Combo Cargo' },
] as const

const COCHE_MODELS = [
  { marca: 'Seat', modelo: 'León' },
  { marca: 'Volkswagen', modelo: 'Golf' },
  { marca: 'Dacia', modelo: 'Sandero' },
  { marca: 'Peugeot', modelo: '308' },
  { marca: 'Renault', modelo: 'Clio' },
  { marca: 'Opel', modelo: 'Corsa' },
  { marca: 'Toyota', modelo: 'Corolla' },
] as const

const ASEGURADORAS = ['Mapfre', 'Allianz', 'Mutua Madrileña', 'AXA', 'Generali', 'Reale Seguros'] as const

const PLATE_LETTERS = 'BCDFGHJKLMNPRSTVWXYZ'

function buildPlateLetters(rng: () => number): string {
  let letters = ''
  for (let i = 0; i < 3; i++) letters += PLATE_LETTERS[Math.floor(rng() * PLATE_LETTERS.length)]
  return letters
}

function buildVehicleFor(rng: () => number, tipo: VehicleType, idx: number, comercialId: string): Vehicle {
  const modelo = tipo === 'Furgón de reparto' ? FURGON_MODELS[idx % FURGON_MODELS.length] : COCHE_MODELS[idx % COCHE_MODELS.length]
  const anio = intBetween(rng, 2018, 2025)
  const antiguedadAnios = 2026 - anio
  const kilometraje = tipo === 'Furgón de reparto' ? intBetween(rng, 20000, 40000) * Math.max(1, antiguedadAnios) : intBetween(rng, 8000, 22000) * Math.max(1, antiguedadAnios)
  const matricula = `${intBetween(rng, 1000, 9999)} ${buildPlateLetters(rng)}`
  // La flota reparte solo en Tenerife, así que la ubicación siempre cae dentro de la isla.
  const zona = pick(rng, TENERIFE_ZONES)
  const coords = TENERIFE_ZONE_COORDS[zona]
  const itvVencida = rng() < 0.12
  const itvUltima = daysAgo(rng, antiguedadAnios > 4 ? 300 : 500)
  const itvProxima = itvVencida ? daysAgo(rng, 20) : daysAhead(rng, intBetween(rng, 15, 340))
  const financiacionActiva = rng() < 0.55
  const cuotasTotales = pick(rng, [36, 48, 60])
  const financiacion = financiacionActiva
    ? {
        activa: true,
        cuotaMensual: Number((intBetween(rng, 15000, 35000) / 100).toFixed(2)),
        cuotasPagadas: intBetween(rng, 1, cuotasTotales - 1),
        cuotasTotales,
      }
    : { activa: false, cuotaMensual: 0, cuotasPagadas: 0, cuotasTotales: 0 }
  const id = tipo === 'Furgón de reparto' ? `fur-${idx + 1}` : `coc-${idx + 1}`
  return {
    id,
    tipo,
    marca: modelo.marca,
    modelo: modelo.modelo,
    anio,
    matricula,
    fotoUrl: vehiclePlaceholderImageFor(tipo, id),
    comercialId,
    kilometraje,
    estado: tipo === 'Furgón de reparto' ? pick(rng, ['En ruta', 'En ruta', 'En ruta', 'En base', 'Taller'] as const) : pick(rng, ['En ruta', 'En ruta', 'En base'] as const),
    fechaAlta: daysAgo(rng, antiguedadAnios * 365 + intBetween(rng, 0, 200)),
    itvUltima,
    itvProxima,
    seguroCompania: pick(rng, ASEGURADORAS),
    seguroPoliza: `POL-${intBetween(rng, 100000, 999999)}`,
    seguroVencimiento: daysAhead(rng, intBetween(rng, 5, 360)),
    financiacion,
    ubicacion: {
      lat: Number((coords.lat + (rng() - 0.5) * 0.06).toFixed(5)),
      lon: Number((coords.lon + (rng() - 0.5) * 0.06).toFixed(5)),
      zona,
      actualizado: new Date(Date.now() - intBetween(rng, 0, 40) * 60000).toISOString(),
    },
  }
}

function buildRepsAndVehicles(rng: () => number): { reps: SalesRep[]; vehicles: Vehicle[] } {
  const reps: SalesRep[] = []
  const vehicles: Vehicle[] = []
  REP_NAMES.forEach((nombre, i) => {
    const repId = `com-${i + 1}`
    const furgonId = `fur-${i + 1}`
    const cocheId = `coc-${i + 1}`
    reps.push({
      id: repId,
      nombre,
      zona: ZONES[i],
      telefono: `6${intBetweenFixed(i, 10000000, 99999999)}`,
      furgonId,
      cocheId,
    })
    vehicles.push(buildVehicleFor(rng, 'Furgón de reparto', i, repId))
    vehicles.push(buildVehicleFor(rng, 'Coche comercial', i, repId))
  })
  return { reps, vehicles }
}

const GASTO_TEMPLATES: { tipo: TipoGastoVehiculo; descripciones: string[]; importe: [number, number] }[] = [
  { tipo: 'Combustible', descripciones: ['Repostaje diésel', 'Repostaje gasolina'], importe: [3000, 8000] },
  { tipo: 'Revisión periódica', descripciones: ['Revisión de mantenimiento programada', 'Cambio de aceite y filtros'], importe: [8000, 22000] },
  { tipo: 'Reparación', descripciones: ['Sustitución de pastillas de freno', 'Reparación de avería eléctrica', 'Cambio de batería'], importe: [6000, 45000] },
  { tipo: 'Neumáticos', descripciones: ['Cambio de neumáticos (juego de 4)', 'Cambio de neumáticos (juego de 2)'], importe: [15000, 42000] },
  { tipo: 'Multa', descripciones: ['Multa por estacionamiento', 'Multa por exceso de velocidad'], importe: [3000, 20000] },
  { tipo: 'Otros', descripciones: ['Lavado y limpieza integral', 'Peaje / aparcamiento'], importe: [500, 4000] },
]

function buildGastosVehiculos(rng: () => number, vehicles: Vehicle[]): GastoVehiculo[] {
  const gastos: GastoVehiculo[] = []
  let id = 1
  vehicles.forEach((v) => {
    const numGastos = intBetween(rng, 5, 12)
    for (let i = 0; i < numGastos; i++) {
      const tpl = pick(rng, GASTO_TEMPLATES)
      gastos.push({
        id: `gv-${id++}`,
        vehiculoId: v.id,
        fecha: daysAgo(rng, 380),
        tipo: tpl.tipo,
        descripcion: pick(rng, tpl.descripciones),
        km: tpl.tipo !== 'Multa' && tpl.tipo !== 'Otros' ? intBetween(rng, Math.max(0, v.kilometraje - 40000), v.kilometraje) : undefined,
        taller: tpl.tipo === 'Revisión periódica' || tpl.tipo === 'Reparación' || tpl.tipo === 'Neumáticos' ? pick(rng, ['Taller Insular', 'Talleres Guanche', 'Servicio Oficial', 'Neumáticos Atlántico']) : undefined,
        importe: Number((intBetween(rng, tpl.importe[0], tpl.importe[1]) / 100).toFixed(2)),
      })
    }
    // Gasto del seguro anual, siempre presente
    gastos.push({
      id: `gv-${id++}`,
      vehiculoId: v.id,
      fecha: daysAgo(rng, 200),
      tipo: 'Seguro',
      descripcion: `Prima anual · ${v.seguroCompania}`,
      importe: Number((intBetween(rng, 35000, 75000) / 100).toFixed(2)),
    })
  })
  return gastos.sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
}

const CITA_TEMPLATES: { tipo: TipoGastoVehiculo; descripciones: string[] }[] = [
  { tipo: 'ITV', descripciones: ['Cita de inspección técnica (ITV)'] },
  { tipo: 'Revisión periódica', descripciones: ['Revisión de mantenimiento programada', 'Cambio de aceite y filtros'] },
  { tipo: 'Neumáticos', descripciones: ['Cambio de neumáticos programado'] },
  { tipo: 'Seguro', descripciones: ['Renovación de póliza de seguro'] },
  { tipo: 'Otros', descripciones: ['Lavado y limpieza integral', 'Revisión de aire acondicionado'] },
]

function buildCitasVehiculos(rng: () => number, vehicles: Vehicle[]): CitaVehiculo[] {
  const citas: CitaVehiculo[] = []
  let id = 1
  vehicles.forEach((v) => {
    const numCitas = intBetween(rng, 1, 3)
    for (let i = 0; i < numCitas; i++) {
      const tpl = pick(rng, CITA_TEMPLATES)
      const completada = rng() < 0.25
      citas.push({
        id: `cv-${id++}`,
        vehiculoId: v.id,
        fecha: completada ? daysAgo(rng, 30) : daysAhead(rng, intBetween(rng, 2, 90)),
        tipo: tpl.tipo,
        descripcion: pick(rng, tpl.descripciones),
        estado: completada ? 'Completada' : 'Pendiente',
      })
    }
  })
  return citas.sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
}

interface CategoryDef {
  nombre: string
  templates: string[]
  sizes?: string[]
  margenMinorista: number
  /** Margen de beneficio (%) sobre coste, ya definido de forma independiente para cada tarifa mayorista. */
  margenes: Record<TarifaId, number>
  subfamilias: string[]
}

const CATEGORY_DEFS: CategoryDef[] = [
  {
    nombre: 'Papelería',
    templates: ['Folio A4 80g', 'Folio A4 90g', 'Folio A3 80g', 'Bloc de notas', 'Bloc cuadriculado', 'Papel continuo', 'Cartulina', 'Papel kraft', 'Sobre americano', 'Sobre bolsa A4'],
    sizes: ['paquete 500', 'paquete 250', 'caja 5 paquetes', 'unidad'],
    margenMinorista: 85,
    margenes: { 'Tarifa 1': 45, 'Tarifa 2': 35, 'Tarifa 3': 28, 'Tarifa 6 (Mayor)': 20 },
    subfamilias: ['Papel y folios', 'Blocs y libretas', 'Cartulina y papel kraft', 'Sobres'],
  },
  {
    nombre: 'Escritura',
    templates: ['Bolígrafo azul', 'Bolígrafo negro', 'Bolígrafo rojo', 'Rotulador permanente', 'Rotulador fluorescente', 'Lápiz HB', 'Portaminas', 'Corrector líquido', 'Corrector cinta', 'Marcador pizarra blanca'],
    sizes: ['unidad', 'caja 12 uds', 'caja 50 uds', 'blister 3 uds'],
    margenMinorista: 100,
    margenes: { 'Tarifa 1': 50, 'Tarifa 2': 40, 'Tarifa 3': 32, 'Tarifa 6 (Mayor)': 24 },
    subfamilias: ['Bolígrafos', 'Rotuladores y marcadores', 'Lápices y portaminas', 'Correctores'],
  },
  {
    nombre: 'Archivo y Clasificación',
    templates: ['Archivador de palanca A4', 'Carpeta con gomas', 'Carpeta colgante', 'Subcarpeta color', 'Separador de plástico', 'Caja archivo definitivo', 'Fundas multitaladro', 'Clasificador de fuelle'],
    sizes: ['unidad', 'paquete 10 uds', 'paquete 25 uds', 'paquete 100 uds'],
    margenMinorista: 80,
    margenes: { 'Tarifa 1': 40, 'Tarifa 2': 30, 'Tarifa 3': 24, 'Tarifa 6 (Mayor)': 18 },
    subfamilias: ['Archivadores', 'Carpetas', 'Cajas y clasificadores', 'Accesorios de archivo'],
  },
  {
    nombre: 'Informática y Consumibles',
    templates: ['Tóner compatible HP', 'Tóner compatible Brother', 'Cartucho tinta compatible', 'Cable USB-C', 'Ratón inalámbrico', 'Teclado USB', 'Disco USB 32GB', 'Regleta 6 tomas'],
    margenMinorista: 60,
    margenes: { 'Tarifa 1': 32, 'Tarifa 2': 25, 'Tarifa 3': 20, 'Tarifa 6 (Mayor)': 15 },
    subfamilias: ['Tóner y tinta', 'Periféricos', 'Almacenamiento y accesorios'],
  },
  {
    nombre: 'Mobiliario de oficina',
    templates: ['Silla de oficina', 'Mesa de escritorio', 'Cajonera con ruedas', 'Bandeja portadocumentos', 'Papelera metálica', 'Perchero de pie'],
    margenMinorista: 50,
    margenes: { 'Tarifa 1': 26, 'Tarifa 2': 20, 'Tarifa 3': 16, 'Tarifa 6 (Mayor)': 12 },
    subfamilias: ['Sillas y mesas', 'Almacenaje', 'Complementos de oficina'],
  },
  {
    nombre: 'Embalaje y Manipulado',
    templates: ['Caja cartón canal simple', 'Caja cartón canal doble', 'Rollo film estirable', 'Precinto adhesivo', 'Burbuja de embalaje', 'Etiqueta envío adhesiva'],
    sizes: ['unidad', 'paquete 10 uds', 'rollo', 'caja 36 uds'],
    margenMinorista: 70,
    margenes: { 'Tarifa 1': 38, 'Tarifa 2': 30, 'Tarifa 3': 24, 'Tarifa 6 (Mayor)': 18 },
    subfamilias: ['Cajas de cartón', 'Film y precintos', 'Protección y etiquetado'],
  },
  {
    nombre: 'Impresión y Tóner',
    templates: ['Papel fotográfico', 'Papel para plotter', 'Cinta impresora matricial', 'Tóner original', 'Tambor compatible'],
    margenMinorista: 65,
    margenes: { 'Tarifa 1': 34, 'Tarifa 2': 25, 'Tarifa 3': 20, 'Tarifa 6 (Mayor)': 15 },
    subfamilias: ['Papel especial', 'Consumibles de impresión'],
  },
  {
    nombre: 'Material Escolar',
    templates: ['Cuaderno cuadriculado', 'Cuaderno rayado', 'Estuche escolar', 'Mochila escolar', 'Goma de borrar', 'Sacapuntas', 'Pegamento de barra', 'Tijera escolar'],
    sizes: ['unidad', 'pack 5 uds'],
    margenMinorista: 90,
    margenes: { 'Tarifa 1': 46, 'Tarifa 2': 35, 'Tarifa 3': 28, 'Tarifa 6 (Mayor)': 20 },
    subfamilias: ['Cuadernos', 'Estuches y mochilas', 'Material de dibujo'],
  },
  {
    nombre: 'Limpieza e Higiene',
    templates: ['Gel hidroalcohólico', 'Papel higiénico industrial', 'Bobina secamanos', 'Bayeta multiusos', 'Bolsa de basura', 'Guantes desechables'],
    sizes: ['unidad', 'paquete 6 uds', 'caja 12 uds'],
    margenMinorista: 60,
    margenes: { 'Tarifa 1': 30, 'Tarifa 2': 20, 'Tarifa 3': 16, 'Tarifa 6 (Mayor)': 12 },
    subfamilias: ['Higiene', 'Limpieza general', 'Desechables'],
  },
  {
    nombre: 'Regalo y Detalle',
    templates: ['Agenda anual', 'Set de escritorio', 'Libreta tapa dura', 'Taza personalizable', 'Powerbank promocional'],
    margenMinorista: 110,
    margenes: { 'Tarifa 1': 55, 'Tarifa 2': 45, 'Tarifa 3': 36, 'Tarifa 6 (Mayor)': 27 },
    subfamilias: ['Papelería de regalo', 'Artículos promocionales'],
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
    numero: i + 1,
    nombre: c.nombre,
    margenMinorista: c.margenMinorista,
    margenes: c.margenes,
  }))
}

function buildSubfamilias(categories: Category[]): Subfamilia[] {
  const subfamilias: Subfamilia[] = []
  let id = 1
  CATEGORY_DEFS.forEach((catDef, catIdx) => {
    const familiaId = categories[catIdx].id
    catDef.subfamilias.forEach((nombre, subIdx) => {
      subfamilias.push({ id: `sub-${id++}`, familiaId, numero: subIdx + 1, nombre })
    })
  })
  return subfamilias
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

function buildProducts(rng: () => number, categories: Category[], subfamilias: Subfamilia[], suppliers: Supplier[]): Product[] {
  const products: Product[] = []
  let counter = 10000
  CATEGORY_DEFS.forEach((catDef, catIdx) => {
    const familia = categories[catIdx]
    const subfamiliasDeLaFamilia = subfamilias.filter((s) => s.familiaId === familia.id)
    const sizes = catDef.sizes ?? ['unidad']
    catDef.templates.forEach((template, templateIdx) => {
      const subfamiliaId = subfamiliasDeLaFamilia[templateIdx % subfamiliasDeLaFamilia.length].id
      sizes.forEach((size) => {
        counter += intBetween(rng, 3, 9)
        const coste = Number((intBetween(rng, 40, 4000) / 100).toFixed(2))
        // Margen de la familia con un pequeño desajuste por producto para que no todos salgan al céntimo iguales.
        const jitter = 0.95 + rng() * 0.1
        const pvp = priceForMargin(coste * jitter, familia.margenMinorista)
        const tarifas = {} as Record<TarifaId, number>
        TARIFA_IDS.forEach((t) => {
          tarifas[t] = priceForMargin(coste * jitter, familia.margenes[t])
        })
        const { formatoVenta, unidadesPorPaquete } = parseFormato(size)
        products.push({
          id: `prod-${counter}`,
          sku: `OF-${counter}`,
          codigoBarras: buildEan13(rng),
          nombre: size === 'unidad' ? template : `${template} (${size})`,
          subfamiliaId,
          proveedorId: pick(rng, suppliers).id,
          coste,
          pvp,
          tarifas,
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
  const { reps, vehicles } = buildRepsAndVehicles(rng)
  const categories = buildCategories()
  const subfamilias = buildSubfamilias(categories)
  const suppliers = buildSuppliers(rng)
  const products = buildProducts(rng, categories, subfamilias, suppliers)
  const stock = buildStock(rng, products, locations)
  const clients = buildClients(rng, reps)
  const sales = buildSales(rng, clients, products, locations)
  const invoices = buildInvoices(sales)
  const purchases = buildPurchases(rng, suppliers, products, locations)
  const users = buildUsers(reps, locations)
  const cashSessions = buildCashSessions(rng, locations)
  const transfers = buildTransfers(rng, products, locations)
  const verifactuEnvios = buildVerifactuEnvios(invoices)
  const gastosVehiculos = buildGastosVehiculos(rng, vehicles)
  const citasVehiculos = buildCitasVehiculos(rng, vehicles)

  return {
    locations,
    salesReps: reps,
    vehicles,
    categories,
    subfamilias,
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
    gastosVehiculos,
    citasVehiculos,
  }
}

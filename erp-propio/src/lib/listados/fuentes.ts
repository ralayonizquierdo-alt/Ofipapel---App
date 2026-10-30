// Fuentes del Generador de listados: qué se puede listar y con qué columnas. Cada fuente es una
// vista v_lst_<clave> de la base de datos (migración 20261029_generador_listados.sql); aquí van
// los nombres que ve el usuario y el tipo de cada columna (para los filtros y las sumas).
// Para añadir una columna: añadirla a la vista y aquí.

export type TipoColumna = 'texto' | 'num' | 'fecha' | 'bool'

export interface ColumnaFuente {
  clave: string
  etiqueta: string
  tipo: TipoColumna
  /** Decimales al mostrar (numéricas). */
  dec?: number
}

export interface Fuente {
  clave: string
  titulo: string
  columnas: ColumnaFuente[]
  /** Columnas que salen marcadas al empezar un listado nuevo. */
  porDefecto: string[]
}

const t = (clave: string, etiqueta: string): ColumnaFuente => ({ clave, etiqueta, tipo: 'texto' })
const n = (clave: string, etiqueta: string, dec = 2): ColumnaFuente => ({ clave, etiqueta, tipo: 'num', dec })
const f = (clave: string, etiqueta: string): ColumnaFuente => ({ clave, etiqueta, tipo: 'fecha' })
const b = (clave: string, etiqueta: string): ColumnaFuente => ({ clave, etiqueta, tipo: 'bool' })

export const FUENTES: Fuente[] = [
  {
    clave: 'clientes',
    titulo: 'Clientes',
    porDefecto: ['codigo', 'nombre', 'poblacion', 'telefono', 'deuda_actual'],
    columnas: [
      t('codigo', 'Código'), t('nombre', 'Nombre'), t('razon_social', 'Razón social'), t('nif', 'NIF'), t('poblacion', 'Población'),
      t('codigo_postal', 'C. postal'), t('provincia', 'Provincia'), t('telefono', 'Teléfono'), t('movil', 'Móvil'), t('email', 'E-mail'),
      t('tipo_cliente', 'Tipo cliente'), t('tipo_cliente_desc', 'Tipo cliente (desc.)'), t('zona', 'Zona'), t('zona_desc', 'Zona (desc.)'),
      t('vendedor', 'Vendedor'), t('vendedor_nombre', 'Vendedor (nombre)'), t('ruta', 'Ruta'), t('forma_pago', 'Forma de pago'),
      t('tipo_credito', 'Tipo crédito'), n('tarifa', 'Tarifa', 0), n('descuento_pct', 'Dto. %'), n('limite_deuda', 'Límite deuda'),
      n('deuda_actual', 'Deuda actual'), f('fecha_alta', 'Fecha alta'), f('fecha_baja', 'Fecha baja'), f('fecha_ultima_venta', 'Última venta'),
      b('activo', 'Activo'), b('bloqueado', 'Bloqueado'),
    ],
  },
  {
    clave: 'articulos',
    titulo: 'Artículos',
    porDefecto: ['codigo', 'descripcion', 'familia', 'pvp', 'coste', 'stock'],
    columnas: [
      t('codigo', 'Código'), t('descripcion', 'Descripción'), t('referencia', 'Referencia'), t('codigo_barras', 'Cód. barras'),
      t('familia', 'Familia'), t('familia_desc', 'Familia (desc.)'), t('marca', 'Marca'), t('proveedor', 'Proveedor'),
      t('proveedor_nombre', 'Proveedor (nombre)'), t('codigo_compra', 'Cód. compra'), n('pvp', 'PVP', 3), n('coste', 'Coste', 3),
      n('precio_medio_compra', 'Precio medio compra', 3), n('margen_pct', 'Margen %'), n('igic_pct', 'IGIC %'), n('stock', 'Stock'),
      n('stock_minimo', 'Stock mínimo'), n('stock_maximo', 'Stock máximo'), f('ultima_compra_fecha', 'Última compra'),
      f('ultima_venta_fecha', 'Última venta'), f('fecha_alta', 'Fecha alta'), f('fecha_baja', 'Fecha baja'), b('activo', 'Activo'),
      b('web_publicado', 'En la web'), b('bajo_minimo', 'Bajo stock mínimo'),
    ],
  },
  {
    clave: 'stock',
    titulo: 'Stock por almacén',
    porDefecto: ['articulo', 'descripcion', 'almacen', 'stock', 'valor_coste'],
    columnas: [
      t('articulo', 'Artículo'), t('descripcion', 'Descripción'), t('familia', 'Familia'), t('familia_desc', 'Familia (desc.)'), t('marca', 'Marca'),
      t('almacen', 'Almacén'), n('stock', 'Stock'), n('reservado', 'Reservado'), n('disponible', 'Disponible'), n('stock_minimo', 'Stock mínimo'),
      n('coste', 'Coste', 3), n('valor_coste', 'Valor a coste'), n('pvp', 'PVP', 3), n('valor_pvp', 'Valor a PVP'), b('activo', 'Activo'),
    ],
  },
  {
    clave: 'ventas',
    titulo: 'Ventas / albaranes',
    porDefecto: ['tienda', 'numero', 'fecha', 'cliente', 'cliente_nombre', 'total'],
    columnas: [
      t('tienda', 'Tienda'), n('numero', 'Número', 0), f('fecha', 'Fecha'), n('anio', 'Año', 0), t('mes', 'Mes'), t('cliente', 'Cliente'),
      t('cliente_nombre', 'Cliente (nombre)'), t('vendedor', 'Vendedor'), t('empleado', 'Empleado'), t('forma_pago', 'Forma de pago'),
      t('tipo_credito', 'Tipo crédito'), n('subtotal', 'Subtotal'), n('total', 'Total'), n('total_pagado', 'Pagado'), n('total_pendiente', 'Pendiente'),
      b('facturada', 'Facturada'), b('anulada', 'Anulada'),
    ],
  },
  {
    clave: 'ventas_lineas',
    titulo: 'Ventas por artículo (líneas)',
    porDefecto: ['fecha', 'cliente_nombre', 'articulo', 'descripcion', 'cantidad', 'base'],
    columnas: [
      t('tienda', 'Tienda'), n('numero', 'Número', 0), f('fecha', 'Fecha'), n('anio', 'Año', 0), t('mes', 'Mes'), t('cliente', 'Cliente'),
      t('cliente_nombre', 'Cliente (nombre)'), t('vendedor', 'Vendedor'), t('articulo', 'Artículo'), t('referencia', 'Referencia'),
      t('descripcion', 'Descripción'), t('familia', 'Familia'), t('familia_desc', 'Familia (desc.)'), t('marca', 'Marca'), n('cantidad', 'Unidades'),
      n('precio', 'Precio', 3), n('descuento_pct', 'Dto. %'), n('base', 'Base'), n('igic', 'IGIC'), n('total', 'Total'), n('coste', 'Coste'),
      n('margen', 'Margen'),
    ],
  },
  {
    clave: 'facturas',
    titulo: 'Facturas de clientes',
    porDefecto: ['serie', 'n_factura', 'fecha', 'cliente_nombre', 'base', 'igic', 'total'],
    columnas: [
      t('tienda', 'Tienda'), n('numero', 'Número', 0), t('serie', 'Serie'), n('n_factura', 'Nº factura', 0), f('fecha', 'Fecha'), n('anio', 'Año', 0),
      t('mes', 'Mes'), t('cliente', 'Cliente'), t('cliente_nombre', 'Cliente (nombre)'), t('vendedor', 'Vendedor'), t('forma_pago', 'Forma de pago'),
      t('estado', 'Estado'), n('base', 'Base'), n('igic', 'IGIC'), n('total', 'Total'), n('pagado', 'Pagado'), n('pendiente', 'Pendiente'),
    ],
  },
  {
    clave: 'compras',
    titulo: 'Pedidos a proveedor',
    porDefecto: ['numero', 'fecha', 'proveedor_nombre', 'estado', 'total'],
    columnas: [
      t('tienda', 'Tienda'), n('numero', 'Número', 0), f('fecha', 'Fecha'), n('anio', 'Año', 0), t('mes', 'Mes'), t('proveedor', 'Proveedor'),
      t('proveedor_nombre', 'Proveedor (nombre)'), t('tipo_proveedor', 'Proveedor / acreedor'), t('estado', 'Estado'), t('albaran', 'Albarán'),
      t('almacen', 'Almacén'), n('base', 'Base'), n('igic', 'IGIC'), n('total', 'Total'), b('recibido', 'Recibido'), b('pagado', 'Pagado'),
      b('abono', 'Abono'),
    ],
  },
  {
    clave: 'compras_lineas',
    titulo: 'Compras por artículo (líneas)',
    porDefecto: ['fecha', 'proveedor_nombre', 'articulo', 'descripcion', 'cantidad', 'importe'],
    columnas: [
      t('tienda', 'Tienda'), n('numero', 'Número', 0), f('fecha', 'Fecha'), n('anio', 'Año', 0), t('mes', 'Mes'), t('proveedor', 'Proveedor'),
      t('proveedor_nombre', 'Proveedor (nombre)'), t('estado', 'Estado'), t('articulo', 'Artículo'), t('codigo_compra', 'Cód. compra'),
      t('descripcion', 'Descripción'), t('familia', 'Familia'), t('familia_desc', 'Familia (desc.)'), n('cantidad', 'Unidades'),
      n('precio_compra', 'Precio compra', 3), n('descuento_pct', 'Dto. %'), n('coste_neto', 'Coste neto', 3), n('importe', 'Importe'),
      b('recibido', 'Recibido'),
    ],
  },
  {
    clave: 'proveedores',
    titulo: 'Proveedores y acreedores',
    porDefecto: ['codigo', 'nombre', 'tipo', 'telefono', 'pendiente_pago'],
    columnas: [
      t('codigo', 'Código'), t('nombre', 'Nombre'), t('tipo', 'Proveedor / acreedor'), t('razon_social', 'Razón social'), t('nif', 'NIF'),
      t('poblacion', 'Población'), t('telefono', 'Teléfono'), t('email', 'E-mail'), t('contacto', 'Contacto'), t('forma_pago', 'Forma de pago'),
      n('deuda_actual', 'Deuda actual'), n('total_comprado', 'Total comprado'), n('pendiente_pago', 'Pendiente de pago'), f('fecha_alta', 'Fecha alta'),
      f('fecha_baja', 'Fecha baja'), f('fecha_ultima_compra', 'Última compra'), b('activo', 'Activo'),
    ],
  },
  {
    clave: 'caja',
    titulo: 'Movimientos de caja',
    porDefecto: ['tienda', 'fecha', 'tipo_movimiento', 'concepto', 'ingreso', 'gasto'],
    columnas: [
      t('tienda', 'Tienda'), n('numero', 'Número', 0), f('fecha', 'Fecha'), n('anio', 'Año', 0), t('mes', 'Mes'), t('tipo_movimiento', 'Tipo'),
      t('descripcion_tipo', 'Tipo (desc.)'), t('concepto', 'Concepto'), t('documento', 'Documento'), n('ingreso', 'Ingreso'), n('gasto', 'Gasto'),
      n('neto', 'Neto'), t('forma_pago', 'Forma de pago'), t('cliente', 'Cliente'), t('empleado', 'Empleado'), b('activo', 'Activo'),
    ],
  },
  // Añadidas por Luis (30/10/2026): migración 20261030_generador_mas_fuentes.
  {
    clave: 'presupuestos',
    titulo: 'Presupuestos',
    porDefecto: ['tienda', 'numero', 'fecha', 'cliente_nombre', 'estado', 'responsable_numero', 'proximo_contacto', 'total'],
    columnas: [
      t('tienda', 'Tienda'), n('numero', 'Número', 0), f('fecha', 'Fecha'), n('anio', 'Año', 0), t('mes', 'Mes'), t('cliente', 'Cliente'),
      t('cliente_nombre', 'Cliente (nombre)'), t('estado', 'Estado'), t('responsable_numero', 'Vend. Nº'), t('responsable_nombre', 'Vendedor (nombre)'),
      f('proximo_contacto', 'Próximo contacto'), f('valido_hasta', 'Válido hasta'), b('caducado', 'Caducado'), n('contactos', 'Contactos', 0),
      t('motivo_perdida', 'Motivo de pérdida'), n('total', 'Total'),
    ],
  },
  {
    clave: 'pedidos',
    titulo: 'Pedidos de clientes',
    porDefecto: ['tienda', 'numero', 'fecha', 'cliente_nombre', 'origen', 'vendedor_nombre', 'estado', 'total'],
    columnas: [
      t('tienda', 'Tienda'), n('numero', 'Número', 0), f('fecha', 'Fecha'), n('anio', 'Año', 0), t('mes', 'Mes'), t('cliente', 'Cliente'),
      t('cliente_nombre', 'Cliente (nombre)'), t('origen', 'Origen (web / comercial / tienda)'), t('vendedor', 'Comercial'),
      t('vendedor_nombre', 'Comercial (nombre)'), t('empleado', 'Empleado'), t('estado', 'Estado'), n('total', 'Total'),
      n('total_pendiente', 'Pendiente'), b('va_a_reparto', 'Va a reparto'),
    ],
  },
  {
    clave: 'repartos',
    titulo: 'Repartos (entregas)',
    porDefecto: ['numero', 'fecha', 'repartidor_nombre', 'ruta_desc', 'cliente_nombre', 'estado_entrega', 'importe'],
    columnas: [
      n('numero', 'Reparto', 0), f('fecha', 'Fecha'), n('anio', 'Año', 0), t('mes', 'Mes'), t('ruta', 'Ruta'), t('ruta_desc', 'Ruta (desc.)'),
      t('repartidor', 'Repartidor'), t('repartidor_nombre', 'Repartidor (nombre)'), t('estado_reparto', 'Estado del reparto'),
      n('venta_numero', 'Albarán', 0), t('cliente', 'Cliente'), t('cliente_nombre', 'Cliente (nombre)'), t('poblacion', 'Población'),
      t('estado_entrega', 'Estado de la entrega'), t('estado_observaciones', 'Motivo'), n('importe', 'Importe'),
    ],
  },
  {
    clave: 'cobros',
    titulo: 'Cobros de clientes',
    porDefecto: ['tienda', 'fecha_pago', 'cliente_nombre', 'concepto', 'forma', 'importe'],
    columnas: [
      t('tienda', 'Tienda'), f('fecha_pago', 'Fecha de cobro'), n('anio', 'Año', 0), t('mes', 'Mes'), t('cliente', 'Cliente'),
      t('cliente_nombre', 'Cliente (nombre)'), t('concepto', 'Concepto'), t('forma', 'Forma (efectivo / tarjeta…)'), t('estado_cobro', 'Estado'),
      n('importe', 'Importe'),
    ],
  },
  {
    clave: 'peticiones',
    titulo: 'Peticiones',
    porDefecto: ['tienda', 'numero', 'fecha', 'empleado_numero', 'referencia', 'articulo_desc', 'cantidad', 'estado'],
    columnas: [
      t('tienda', 'Tienda'), n('numero', 'Número', 0), f('fecha', 'Fecha'), t('empleado_numero', 'Empl. Nº'), t('referencia', 'Código de venta'),
      t('articulo_desc', 'Artículo'), t('familia', 'Familia'), t('proveedor', 'Proveedor'), n('cantidad', 'Cantidad'), t('estado', 'Estado'),
    ],
  },
  {
    clave: 'familias',
    titulo: 'Familias',
    porDefecto: ['codigo', 'descripcion', 'nivel1', 'articulos'],
    columnas: [
      t('codigo', 'Código'), t('descripcion', 'Descripción'), t('nivel1', 'Nivel 1'), t('nivel2', 'Nivel 2'), n('descuento_pct', 'Dto. %'),
      n('articulos', 'Nº artículos', 0), b('web_publicada', 'En la web'),
    ],
  },
]

export const FUENTE_POR_CLAVE: Record<string, Fuente> = Object.fromEntries(FUENTES.map((x) => [x.clave, x]))

export interface FiltroListado {
  col: string
  op: string
  valor?: string
  valor2?: string
}

export interface DefinicionListado {
  columnas: string[]
  filtros: FiltroListado[]
  agrupar: string[]
  sumar: string[]
  orden: { col: string; desc: boolean }[]
}

export const OPERADORES: { op: string; texto: string; tipos: TipoColumna[]; valores: 0 | 1 | 2 }[] = [
  { op: '=', texto: 'igual a', tipos: ['texto', 'num', 'fecha'], valores: 1 },
  { op: '<>', texto: 'distinto de', tipos: ['texto', 'num', 'fecha'], valores: 1 },
  { op: 'contiene', texto: 'contiene', tipos: ['texto'], valores: 1 },
  { op: 'empieza', texto: 'empieza por', tipos: ['texto'], valores: 1 },
  { op: 'en', texto: 'es uno de (separados por comas)', tipos: ['texto', 'num'], valores: 1 },
  { op: '>', texto: 'mayor que', tipos: ['num', 'fecha'], valores: 1 },
  { op: '>=', texto: 'mayor o igual que', tipos: ['num', 'fecha'], valores: 1 },
  { op: '<', texto: 'menor que', tipos: ['num', 'fecha'], valores: 1 },
  { op: '<=', texto: 'menor o igual que', tipos: ['num', 'fecha'], valores: 1 },
  { op: 'entre', texto: 'entre', tipos: ['num', 'fecha'], valores: 2 },
  { op: 'vacio', texto: 'está vacío', tipos: ['texto', 'num', 'fecha'], valores: 0 },
  { op: 'no_vacio', texto: 'no está vacío', tipos: ['texto', 'num', 'fecha'], valores: 0 },
  { op: 'si', texto: 'es Sí', tipos: ['bool'], valores: 0 },
  { op: 'no', texto: 'es No', tipos: ['bool'], valores: 0 },
]

export const definicionNueva = (fuente: Fuente): DefinicionListado => ({ columnas: [...fuente.porDefecto], filtros: [], agrupar: [], sumar: [], orden: [] })

// Qué fuente propone el botón «Listados» de la barra de título según la pantalla abierta (la
// ruta más larga que encaje manda). Sin coincidencia, el generador se abre con la primera fuente.
const FUENTE_POR_RUTA: [string, string][] = [
  ['/clientes', 'clientes'],
  ['/tipos-cliente', 'clientes'],
  ['/listados-clientes', 'clientes'],
  ['/recalcular-deuda', 'clientes'],
  ['/vendedores', 'clientes'],
  ['/zonas-territoriales', 'clientes'],
  ['/pedidos', 'ventas'],
  ['/presupuestos', 'ventas'],
  ['/gestor-pedidos', 'ventas'],
  ['/gestor-presupuestos', 'ventas'],
  ['/tpv', 'ventas_lineas'],
  ['/ventas', 'ventas_lineas'],
  ['/listados-ventas', 'ventas_lineas'],
  ['/repartos', 'ventas'],
  ['/reparaciones', 'ventas'],
  ['/facturacion', 'facturas'],
  ['/generar-facturas', 'facturas'],
  ['/listado-facturas', 'facturas'],
  ['/listados-facturacion', 'facturas'],
  ['/gestor-cobros-clientes', 'facturas'],
  ['/cobros-clientes', 'facturas'],
  ['/caja', 'caja'],
  ['/compras', 'compras'],
  ['/pedidos-proveedor', 'compras'],
  ['/creacion-rapida-pedidos', 'compras_lineas'],
  ['/facturas-proveedor', 'compras'],
  ['/pagos-proveedor', 'compras'],
  ['/gestor-pagos-proveedor', 'compras'],
  ['/gestor-pedidos-proveedor', 'compras'],
  ['/listados-compras', 'compras'],
  ['/peticiones', 'compras_lineas'],
  ['/proveedores', 'proveedores'],
  ['/transportistas', 'proveedores'],
  ['/articulos', 'articulos'],
  ['/familias', 'articulos'],
  ['/marcas', 'articulos'],
  ['/plantillas-tarifas', 'articulos'],
  ['/tarifas-oferta', 'articulos'],
  ['/modificacion-precios', 'articulos'],
  ['/almacen', 'articulos'],
  ['/stock', 'stock'],
  ['/inventario', 'stock'],
  ['/regularizacion-stock', 'stock'],
  ['/traspasos', 'stock'],
  ['/almacenes', 'stock'],
]

export function fuenteDeRuta(pathname: string): string | null {
  let mejor: [string, string] | null = null
  for (const r of FUENTE_POR_RUTA) if ((pathname === r[0] || pathname.startsWith(r[0] + '/')) && (!mejor || r[0].length > mejor[0].length)) mejor = r
  return mejor?.[1] ?? null
}

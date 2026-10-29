// Color de cada sección: la ventana de las pantallas de Clientes, Pedidos, Pagos, Caja, Ventas,
// Facturación, Compras, Artículos y Traspasos toma un tono suave a juego con su icono de la barra
// de accesos (QuickBar), para saber de un vistazo dónde se está. Los tonos van en index.css
// (.gw-ventana[data-seccion=…]); el resto de pantallas se queda en el gris de siempre.

export type Seccion = 'clientes' | 'pedidos' | 'pagos' | 'caja' | 'ventas' | 'facturacion' | 'compras' | 'articulos' | 'traspasos'

/** Color del icono de cada sección en la barra de accesos (el tono de la ventana va a juego). */
export const COLOR_SECCION: Record<Seccion, string> = {
  clientes: '#c49a0a',
  pedidos: '#2e8b4f',
  pagos: '#7e57c2',
  caja: '#2f7fc1',
  ventas: '#1a8a88',
  facturacion: '#d0503a',
  compras: '#9a6235',
  articulos: '#e07b1a',
  traspasos: '#4656b8',
}

const RUTAS: [Seccion, string[]][] = [
  ['clientes', ['/clientes', '/tipos-cliente', '/listados-clientes', '/recalcular-deuda']],
  ['pedidos', ['/pedidos', '/presupuestos', '/gestor-pedidos', '/gestor-presupuestos', '/listados-ventas/pedidos', '/listados-ventas/presupuestos']],
  ['pagos', ['/gestor-cobros-clientes', '/cobros-clientes']],
  ['caja', ['/caja']],
  ['ventas', ['/tpv', '/ventas', '/listados-ventas']],
  ['facturacion', ['/facturacion', '/generar-facturas', '/listado-facturas', '/listados-facturacion', '/registros-verifactu']],
  [
    'compras',
    [
      '/compras',
      '/pedidos-proveedor',
      '/creacion-rapida-pedidos',
      '/facturas-proveedor',
      '/pagos-proveedor',
      '/gestor-pagos-proveedor',
      '/gestor-pedidos-proveedor',
      '/listados-compras',
      '/proveedores',
      '/transportistas',
      '/peticiones',
      '/pagos',
    ],
  ],
  [
    'articulos',
    ['/articulos', '/familias', '/marcas', '/plantillas-tarifas', '/tarifas-oferta', '/modificacion-precios', '/stock', '/almacen', '/inventario', '/regularizacion-stock'],
  ],
  ['traspasos', ['/traspasos']],
]

/** Sección de una ruta (por prefijo completo: «/pedidos» no casa con «/pedidos-proveedor»), o null. */
export function seccionDe(pathname: string): Seccion | null {
  for (const [s, prefijos] of RUTAS) if (prefijos.some((p) => pathname === p || pathname.startsWith(p + '/'))) return s
  return null
}

// Árbol de menús de la ventana principal, copiado del mapa funcional de GeminisWin
// (págs. 1-3). Las opciones con `to` o `action` funcionan; el resto sale en gris.

export type MenuAction = 'signout' | 'close-window' | 'undo' | 'redo' | 'cut' | 'copy' | 'delete' | 'selectAll'

export interface MenuItem {
  label: string
  to?: string
  action?: MenuAction
  shortcut?: string
  children?: MenuEntry[]
  checked?: boolean
}

export type MenuEntry = MenuItem | 'sep'

export interface TopMenu {
  label: string
  items: MenuEntry[]
}

const item = (label: string, extra: Omit<MenuItem, 'label'> = {}): MenuItem => ({ label, ...extra })
const off = (labels: string[]): MenuItem[] => labels.map((l) => item(l))

export const MENUS: TopMenu[] = [
  {
    label: 'Archivo',
    items: [
      item('Periodos o Ejercicios'),
      item('Datos de Empresa'),
      item('Tiendas', { to: '/tiendas' }),
      item('Parámetros'),
      'sep',
      item('Cambiar Empleado', { action: 'signout', shortcut: 'Ctrl+E' }),
      item('Cambiar Grupo de Acceso', { shortcut: 'Ctrl+O' }),
      'sep',
      ...off(['Códigos Postales', 'Cód. Bancarios', 'Formas de Pago', 'Monedas', 'Carga Cotización', 'Zonas de servicio']),
      item('Empleados', { to: '/empleados' }),
      'sep',
      item('Traspaso Información', { children: [] }),
      item('Traspaso a Contabilidad'),
      'sep',
      ...off(['Preparar página', 'Presentación preliminar', 'Elegir impresora', 'Importar']),
      item('Salir', { action: 'signout' }),
    ],
  },
  {
    label: 'Edición',
    items: [
      item('Deshacer', { action: 'undo', shortcut: 'Ctrl+Z' }),
      item('Rehacer', { action: 'redo', shortcut: 'Ctrl+Y' }),
      'sep',
      item('Cortar', { action: 'cut', shortcut: 'Ctrl+X' }),
      item('Copiar', { action: 'copy', shortcut: 'Ctrl+C' }),
      item('Pegar', { shortcut: 'Ctrl+V' }),
      item('Borrar', { action: 'delete', shortcut: 'Supr' }),
      item('Seleccionar todo', { action: 'selectAll', shortcut: 'Ctrl+A' }),
      'sep',
      item('Encontrar', { shortcut: 'Ctrl+F' }),
      item('Reemplazar', { shortcut: 'Ctrl+H' }),
    ],
  },
  {
    label: 'Clientes',
    items: [
      item('Clientes', { to: '/clientes' }),
      item('Tipo Cliente'),
      item('Recalcular deuda'),
      item('Pagos de Clientes, Cobros', { shortcut: 'Alt+F7' }),
      'sep',
      item('Listados', {
        children: off([
          'List. de Clientes',
          'List. de Ventas y Facturas por Cliente',
          'Por Zonas Terr., Vendedores, Facturas y Artículos Pend.',
          'Cli. que no han pagado',
        ]),
      }),
    ],
  },
  {
    label: 'Ventas',
    items: [
      ...off(['Vendedores', 'Repartidores', 'Zonas Territoriales', 'Rutas de Reparto']),
      item('Repartos', { to: '/repartos' }),
      ...off(['Técnicos', 'Nº Serie']),
      'sep',
      item('Pedidos', { to: '/pedidos' }),
      item('TPV / Ventas', { to: '/ventas', shortcut: 'Ctrl+F12' }),
      item('Ventas / Facturas'),
      item('Reparaciones', { shortcut: 'Ctrl+F11' }),
      item('Presupuestos'),
      item('Gestor de Pedidos', { shortcut: 'Alt+F6' }),
      item('Gestor de Presupuestos'),
      'sep',
      item('Listados', {
        children: [
          item('List. Ventas', {
            children: [item('List. de Ventas'), item('Ventas por Artículo', { shortcut: 'Alt+F9' })],
          }),
          ...off(['List. Pedidos', 'L. Reparaciones', 'List. Presupuestos', 'List. Tarjetas', 'List. Divisas', 'List. Apert. Cajón']),
        ],
      }),
    ],
  },
  {
    label: 'Caja',
    items: [
      item('Mov. de Caja', { shortcut: 'Alt+F5' }),
      item('Listado de Caja', { shortcut: 'Ctrl+F5' }),
      item('Entrada en caja'),
      item('Salida de caja'),
      item('Apertura de Caja', { to: '/ventas', shortcut: 'Alt+F6' }),
      item('Cierre de Caja', { to: '/ventas', shortcut: 'Ctrl+F6' }),
      item('Aperturas y Cierres'),
    ],
  },
  {
    label: 'Facturación',
    items: [
      item('Generar Facturas'),
      item('Facturas', { to: '/facturacion' }),
      item('Gestor de Pagos de Clientes'),
      item('Liquidación'),
      'sep',
      item('Listados', { children: off(['List. Facturas', 'L. Pend. de Cobro', 'List. Remesas', 'Extracto clientes']) }),
    ],
  },
  {
    label: 'Compras',
    items: [
      item('Pedidos a Proveedores', { to: '/compras' }),
      ...off(['Creación Ráp. de Pedidos', 'Listados de Pedidos', 'Facturas Proveedor', 'Listados de Facturas']),
      item('Pagos', { to: '/pagos' }),
      item('Gestor de Pagos'),
      'sep',
      item('Proveedores', { to: '/proveedores' }),
      item('Transportistas'),
      'sep',
      item('Gestor Pedidos a Proveedores'),
      item('Peticiones de Artículos'),
      item('Generar Petición', { shortcut: 'Ctrl+P' }),
    ],
  },
  {
    label: 'Almacén',
    items: [
      item('Artículos', { to: '/articulos' }),
      item('Creación Ráp. de Artíc.'),
      item('Listados Artículos', { to: '/stock' }),
      item('List. de Movimientos de Artículos'),
      item('Etiquetas de Cód. de Barras'),
      'sep',
      item('Traspasos', { to: '/traspasos' }),
      item('Control de Lotes'),
      item('Almacenes', { to: '/almacenes' }),
      item('Regularización de Stock'),
      item('Inventarios', { to: '/inventario' }),
      item('Inventariar Almacén'),
      'sep',
      ...off(['Familias', 'Marcas', 'Plantillas Tarifas', 'Tarifas de Oferta', 'Modificación de Precios', 'Modif. de Artículos en bloque']),
      'sep',
      item('Puntos de Restauración Stock'),
      item('Recalcular Stock', { children: [] }),
      item('Eliminación de Artículos'),
      item("Plu's"),
    ],
  },
  {
    label: 'Utilidades',
    items: [
      item('Examinar', { shortcut: 'F11' }),
      item('Copia de Seguridad', {
        children: [item('Hacer Copia', { shortcut: 'Alt+F8' }), item('Testear Copia'), item('Restaurar Copia')],
      }),
      'sep',
      ...off(['Cambio de Fecha', 'Cambio de Fecha y Hora', 'Cambio de Tienda']),
      'sep',
      item('Reparar Base de Datos', { shortcut: 'Alt+F12' }),
      item('Reconstruir Ficheros', { shortcut: 'Alt+F11' }),
      ...off(['Act. Tablas del Terminal', 'Act. Tablas y Ejecutable del Terminal', 'Actualizar Tabla', 'Ejecutar Programa']),
      'sep',
      item('Informes', { children: off(['Crear', 'Modificar', 'Crear Etiqueta', 'Mod. Etiqueta', 'Ejecutar']) }),
      'sep',
      item('Control de Módulos'),
      item('Opciones de tablas', { children: [] }),
      'sep',
      item('Eliminar Ficheros Temporales'),
      item('Configurar Utilidades'),
      'sep',
      item('Utilidades a medida', {
        children: off(['Etiquetas', 'Listado de Ventas', 'Stock a 0 de Familia', 'Elimina ArtiEnBlanco', 'Conectar David']),
      }),
    ],
  },
  {
    label: 'Ventana',
    items: [
      item('Ocultar', { action: 'close-window' }),
      item('Ocultar todo', { action: 'close-window' }),
      item('Mostrar todo'),
      item('Borrar', { action: 'close-window' }),
      item('Recorrer', { shortcut: 'Ctrl+F1' }),
    ],
  },
  {
    label: '?',
    items: [item('Resumen del ERP', { to: '/resumen' }), 'sep', item('Acerca de Ofipapel ERP')],
  },
]

/** Descripción de cada ventana para la barra de título de la ventana hija y la barra de estado. */
export const WINDOW_TITLES: { prefix: string; title: string }[] = [
  { prefix: '/articulos', title: 'Artículos' },
  { prefix: '/clientes', title: 'Clientes' },
  { prefix: '/proveedores', title: 'Proveedores' },
  { prefix: '/almacenes', title: 'Almacenes' },
  { prefix: '/tiendas', title: 'Tiendas' },
  { prefix: '/empleados', title: 'Empleados' },
  { prefix: '/stock', title: 'Listados Artículos (stock por almacén)' },
  { prefix: '/traspasos', title: 'Traspasos entre Almacenes' },
  { prefix: '/inventario', title: 'Inventarios' },
  { prefix: '/compras', title: 'Pedidos a Proveedores' },
  { prefix: '/pedidos', title: 'Pedidos de Clientes' },
  { prefix: '/repartos', title: 'Repartos' },
  { prefix: '/ventas', title: 'TPV / Ventas' },
  { prefix: '/pagos', title: 'Pagos' },
  { prefix: '/facturacion', title: 'Facturas' },
  { prefix: '/resumen', title: 'Resumen del ERP' },
]

export function windowTitle(pathname: string) {
  return WINDOW_TITLES.find((w) => pathname === w.prefix || pathname.startsWith(w.prefix + '/'))?.title ?? ''
}

export function isEnabled(i: MenuItem) {
  return Boolean(i.to || i.action || (i.children && i.children.length > 0))
}

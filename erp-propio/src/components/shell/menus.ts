// Árbol de menús de la ventana principal, copiado del mapa funcional de GeminisWin
// (págs. 1-3). Las opciones con `to` o `action` funcionan; el resto sale en gris.

export type MenuAction = 'signout' | 'close-window' | 'undo' | 'redo' | 'cut' | 'copy' | 'delete' | 'selectAll'

export interface MenuItem {
  label: string
  to?: string
  action?: MenuAction
  shortcut?: string
  /** Texto de la barra de estado al pasar el ratón (p. ej. «Ficha de Vendedores»). */
  description?: string
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
      item('Panel de Control', { to: '/resumen', description: 'Panel de Control: actividad del día, pedidos, repartos y avisos' }),
      'sep',
      item('Periodos o Ejercicios'),
      item('Datos de Empresa'),
      item('Tiendas', { to: '/tiendas' }),
      item('Parámetros'),
      'sep',
      item('Cambiar Empleado', { action: 'signout', shortcut: 'Ctrl+E' }),
      item('Cambiar Contraseña', { to: '/cambiar-clave', description: 'Cambiar la contraseña del empleado conectado' }),
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
      item('Vendedores', { to: '/vendedores', description: 'Ficha de Vendedores' }),
      item('Repartidores', { to: '/repartidores', description: 'Ficha de Repartidores' }),
      item('Zonas Territoriales', { to: '/zonas-territoriales', description: 'Zonas Territoriales' }),
      item('Rutas de Reparto', { to: '/rutas-reparto', description: 'Rutas de Reparto' }),
      item('Repartos', { to: '/repartos', description: 'Repartos' }),
      item('Técnicos', { to: '/tecnicos', description: 'Ficha de Técnicos' }),
      item('Nº Serie', { to: '/numeros-serie', description: 'Números de Serie' }),
      'sep',
      item('Pedidos', { to: '/pedidos', description: 'Pedidos de Clientes' }),
      item('TPV / Ventas', { to: '/tpv', shortcut: 'CTRL+F12', description: 'TPV / Ventas' }),
      item('Ventas / Facturas', { to: '/ventas', description: 'Ventas / Facturas' }),
      item('Reparaciones', { to: '/reparaciones', shortcut: 'CTRL+F11', description: 'Reparaciones' }),
      item('Presupuestos', { to: '/presupuestos', description: 'Presupuestos' }),
      item('Gestor de Pedidos', { to: '/gestor-pedidos', shortcut: 'ALT+F6', description: 'Gestor de Pedidos' }),
      item('Gestor de Presupuestos', { to: '/gestor-presupuestos', description: 'Gestor de Presupuestos' }),
      'sep',
      item('Listados', {
        children: [
          item('List. Ventas', {
            children: [item('List. de Ventas'), item('Ventas por Artículo', { shortcut: 'ALT+F9' })],
          }),
          ...off(['List Pedidos', 'L. Reparaciones', 'List. Presupuestos', 'List. Tarjetas', 'List. Divisas', 'List. Apert. Cajón']),
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
      // En GeminisWin Apertura de Caja y Gestor de Pedidos muestran los dos Alt+F6; el atajo real va al Gestor.
      item('Apertura de Caja', { to: '/caja', shortcut: 'Alt+F6 ' }),
      item('Cierre de Caja', { to: '/caja', shortcut: 'Ctrl+F6' }),
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
      item('Registros VeriFactu', { to: '/registros-verifactu', description: 'Registros de facturación VeriFactu encadenados' }),
      'sep',
      item('Listados', { children: off(['List. Facturas', 'L. Pend. de Cobro', 'List. Remesas', 'Extracto clientes']) }),
    ],
  },
  {
    label: 'Contabilidad',
    // Menú nuevo, no existe en GeminisWin (petición de Rober, 27/10/2026). En gris: Retenciones,
    // Remesas SEPA y Cierre de ejercicio (pendientes).
    items: [
      item('Generar Asientos Automáticos', { to: '/contabilidad/generar', description: 'Genera los asientos de ventas, facturas, cobros, pagos y caja' }),
      item('Asientos Pendientes / con Errores', { to: '/contabilidad/pendientes', description: 'Asientos que no cuadran o sin cuenta contable' }),
      item('Diario de Asientos', { to: '/contabilidad/diario', description: 'Diario de asientos: consulta y edición manual' }),
      'sep',
      item('Plan de Cuentas', { to: '/contabilidad/plan-cuentas', description: 'Plan de cuentas (PGC PYMES) y subcuentas' }),
      item('Mayor / Extracto de Cuenta', { to: '/contabilidad/mayor', description: 'Mayor de una cuenta con saldo acumulado' }),
      item('Sumas y Saldos', { to: '/contabilidad/sumas-saldos', description: 'Balance de sumas y saldos' }),
      item('Pérdidas y Ganancias', { to: '/contabilidad/perdidas-ganancias', description: 'Cuenta de pérdidas y ganancias (grupos 6 y 7)' }),
      item('Libros Registro de IGIC', { to: '/contabilidad/libros-igic', description: 'Libros registro de facturas emitidas y recibidas' }),
      'sep',
      item('Modelo 420 (IGIC Trimestral)', { to: '/contabilidad/modelo-420', description: 'Autoliquidación trimestral de IGIC' }),
      item('Modelo 425 (IGIC Anual)', { to: '/contabilidad/modelo-425', description: 'Resumen anual de IGIC' }),
      item('Modelo 347', { to: '/contabilidad/modelo-347', description: 'Operaciones con terceros de más de 3.005,06 €' }),
      ...off(['Retenciones 111 / 115']),
      item('Verifactu (Registro y Envío)', { to: '/registros-verifactu', description: 'Registros de facturación VeriFactu encadenados' }),
      'sep',
      item('Conciliación Bancaria', { to: '/contabilidad/conciliacion', description: 'Importar extractos Norma 43 y casarlos con la contabilidad' }),
      ...off(['Remesas SEPA']),
      item('Previsión de Tesorería', { to: '/contabilidad/tesoreria', description: 'Cobros y pagos pendientes por vencimiento' }),
      'sep',
      ...off(['Cierre y Apertura de Ejercicio']),
      item('Exportar a Gestoría', { to: '/contabilidad/exportar', description: 'Diario y libros de IGIC en CSV para la gestoría' }),
      item('Configuración Contable', { to: '/contabilidad/configuracion', description: 'Cuentas por defecto de los asientos automáticos' }),
    ],
  },
  {
    label: 'Compras',
    items: [
      item('Pedidos a Proveedores', {
        to: '/pedidos-proveedor',
        description: 'Realiza pedidos a los proveedores, actualiza stock, precios y crea nuevos artículos',
      }),
      item('Creación Ráp. de Pedidos', { to: '/creacion-rapida-pedidos', description: 'Creación Rápida de Pedidos a Proveedores' }),
      item('Listados de Pedidos'),
      item('Facturas Proveedor', { to: '/facturas-proveedor', description: 'Facturas de Proveedores' }),
      item('Listados de Facturas'),
      item('Pagos', { to: '/pagos-proveedor', description: 'Pagos a Proveedores' }),
      item('Gestor de Pagos', { to: '/gestor-pagos-proveedor', description: 'Gestor de Pagos a Proveedores' }),
      'sep',
      item('Proveedores', { to: '/proveedores', description: 'Ficha de Proveedores' }),
      item('Transportistas', { to: '/transportistas', description: 'Ficha de Transportistas' }),
      'sep',
      item('Gestor Pedidos a Proveedores', { to: '/gestor-pedidos-proveedor', description: 'Gestor de Pedidos a Proveedores' }),
      item('Peticiones de Artículos'),
      item('Generar Petición', { shortcut: 'CTRL+P' }),
    ],
  },
  {
    label: 'Almacén',
    items: [
      item('Artículos', { to: '/articulos', description: 'Crea, modifica, anula, artículos en los diversos almacenes' }),
      item('Creación Ráp. de Artic.'),
      item('Listados Artículos', { to: '/stock' }),
      item('List. de Movimientos de Artículos'),
      item('Etiquetas de Cód. de Barras'),
      'sep',
      item('Traspasos', { to: '/traspasos', description: 'Traspasos entre Almacenes' }),
      item('Control de Lotes'),
      item('Almacenes', { to: '/almacenes', description: 'Ficha de Almacenes' }),
      item('Regularización de Stock', { to: '/regularizacion-stock', description: 'Regularización de Stock' }),
      item('Inventarios', { to: '/inventario', description: 'Inventarios' }),
      item('Inventariar Almacén'),
      item('Familias', { to: '/familias', description: 'Ficha de Familias' }),
      item('Marcas', { to: '/marcas', description: 'Ficha de Marcas' }),
      item('Plantillas Tarifas', { to: '/plantillas-tarifas', description: 'Plantillas de Tarifas' }),
      'sep',
      item('Tarifas de Oferta', { to: '/tarifas-oferta', description: 'Tarifas de Oferta' }),
      item('Modificación de Precios', { to: '/modificacion-precios', description: 'Modificación de Precios' }),
      item('Modif. de Artículos en bloque'),
      item('Puntos de Restauración Stock'),
      item('Recalcular Stock', { children: [] }),
      item('Eliminación de Artículos'),
      'sep',
      item("Plu's"),
    ],
  },
  {
    label: 'Web',
    // Menú nuevo, no existe en GeminisWin (petición de Rober, 27/10/2026): conexión con WooCommerce.
    // SOLO LECTURA de la web (la gestiona una empresa externa): lo que escribiría en ella es vista
    // previa con el botón desactivado, «Pendiente de autorización de Rober». En gris lo aún no hecho.
    items: [
      item('Publicar Artículos en la Web', { to: '/web/publicar', description: 'Vista previa de los artículos a publicar en la web (pendiente de autorización)' }),
      item('Sincronizar Catálogo', { to: '/web/catalogo', description: 'Comparación del catálogo de la web con los artículos del ERP' }),
      item('Artículos con Errores Web', { to: '/web/errores', description: 'Artículos sin imagen, descripción, stock o precio, o con SKU duplicado' }),
      item('Precios Web', { to: '/web/precios', description: 'Comparación de precios y ofertas con fecha de la web y del ERP' }),
      item('Categorías Web', { to: '/web/categorias', description: 'Familias del ERP frente a las categorías de la web' }),
      ...off(['Imágenes y Textos Web', 'Variaciones', 'Productos Relacionados']),
      'sep',
      item('Importar Pedidos Web', { to: '/web/importar-pedidos', description: 'Importa los pedidos de la tienda online como pedidos de cliente' }),
      item('Pedidos Web Pendientes de Servir', { to: '/web/pendientes', description: 'Pedidos web importados aún sin entregar' }),
      item('Estado de Pedidos Web', { to: '/web/estado-pedidos', description: 'Estado de los pedidos en la web y en el ERP' }),
      ...off(['Facturas de Pedidos Web', 'Envíos y Seguimiento']),
      item('Devoluciones y Reembolsos Web', { to: '/web/devoluciones', description: 'Reembolsos de la tienda online (consulta)' }),
      'sep',
      item('Clientes Web', { to: '/web/clientes', description: 'Clientes de la tienda online y su cliente del ERP' }),
      item('Clientes de Empresa', { to: '/web/clientes-empresa', description: 'Clientes web enlazados y su tarifa según la ficha del cliente' }),
      ...off(['Solicitudes de Presupuesto Web']),
      item('Ofertas y Cupones Web', { to: '/web/cupones', description: 'Cupones de la tienda online (consulta)' }),
      ...off(['Reseñas de Productos', 'Carritos Abandonados']),
      'sep',
      item('Pedidos y Consultas por WhatsApp', { to: '/web/whatsapp', description: 'Enlace de consulta con el bot de WhatsApp' }),
      'sep',
      item('Stock Reservado por Pedidos Web', { to: '/web/stock-reservado', description: 'Unidades comprometidas por pedidos web sin servir' }),
      item('Registro de Sincronización', { to: '/web/registro', description: 'Lecturas de la web e importaciones en el ERP' }),
      item('Estadísticas Web', { to: '/web/estadisticas', description: 'Ventas web por día o mes y productos más vendidos' }),
      item('Configuración de la Conexión', { to: '/web/configuracion', description: 'Conexión con WooCommerce (solo lectura) y ajustes de importación' }),
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
    items: [item('Panel de Control', { to: '/resumen' }), 'sep', item('Acerca de Ofipapel ERP')],
  },
]

/** Descripción de cada ventana para la barra de título de la ventana hija y la barra de estado. */
export const WINDOW_TITLES: { prefix: string; title: string }[] = [
  { prefix: '/articulos', title: 'Artículos' },
  { prefix: '/familias', title: 'Familias' },
  { prefix: '/marcas', title: 'Marcas' },
  { prefix: '/plantillas-tarifas', title: 'Plantillas de Tarifas' },
  { prefix: '/clientes', title: 'Clientes' },
  { prefix: '/proveedores', title: 'Proveedores' },
  { prefix: '/almacenes', title: 'Almacenes' },
  { prefix: '/tiendas', title: 'Tiendas' },
  { prefix: '/empleados', title: 'Empleados' },
  { prefix: '/stock', title: 'Listados Artículos (stock por almacén)' },
  { prefix: '/traspasos', title: 'Traspasos de artículos entre almacenes' },
  { prefix: '/inventario', title: 'Inventarios' },
  { prefix: '/compras', title: 'Pedidos a Proveedores' },
  { prefix: '/pedidos-proveedor', title: 'Pedidos a Proveedores' },
  { prefix: '/creacion-rapida-pedidos', title: 'Creación Rápida de Pedidos' },
  { prefix: '/pagos-proveedor', title: 'Pagos de Gastos, pagos a proveedores, pagos a transportistas, etc' },
  { prefix: '/gestor-pagos-proveedor', title: 'Gestor de Pagos' },
  { prefix: '/facturas-proveedor', title: 'Facturas de Proveedores' },
  { prefix: '/gestor-pedidos-proveedor', title: 'Gestor de Pedidos a Proveedores' },
  { prefix: '/transportistas', title: 'Transportistas' },
  { prefix: '/regularizacion-stock', title: 'Regularización de Stock' },
  { prefix: '/tarifas-oferta', title: 'Tarifas de Oferta' },
  { prefix: '/modificacion-precios', title: 'Modificación de Precios' },
  { prefix: '/pedidos', title: 'Pedidos de Clientes' },
  { prefix: '/repartos', title: 'Repartos' },
  { prefix: '/tpv', title: 'Ventas' },
  { prefix: '/ventas', title: 'Ventas' },
  { prefix: '/caja', title: 'Apertura y Cierre de Caja' },
  { prefix: '/presupuestos', title: 'Presupuestos' },
  { prefix: '/gestor-pedidos', title: 'Control y Gestion de Pedidos de Clientes' },
  { prefix: '/gestor-presupuestos', title: 'Control y Gestion de Presupuestos de Clientes y/o Pactos de Tarifas' },
  { prefix: '/numeros-serie', title: 'Números de Serie' },
  { prefix: '/reparaciones', title: 'Reparaciones' },
  { prefix: '/vendedores', title: 'Vendedores' },
  { prefix: '/tecnicos', title: 'Técnicos' },
  { prefix: '/repartidores', title: 'Repartidores' },
  { prefix: '/zonas-territoriales', title: 'Zonas Territoriales' },
  { prefix: '/rutas-reparto', title: 'Rutas de Reparto' },
  { prefix: '/pagos', title: 'Pagos' },
  { prefix: '/facturacion', title: 'Facturas' },
  { prefix: '/registros-verifactu', title: 'Registros de Facturación VeriFactu' },
  { prefix: '/contabilidad/generar', title: 'Generar Asientos Automáticos' },
  { prefix: '/contabilidad/pendientes', title: 'Asientos Pendientes / con Errores' },
  { prefix: '/contabilidad/diario', title: 'Diario de Asientos' },
  { prefix: '/contabilidad/plan-cuentas', title: 'Plan de Cuentas' },
  { prefix: '/contabilidad/mayor', title: 'Mayor / Extracto de Cuenta' },
  { prefix: '/contabilidad/sumas-saldos', title: 'Sumas y Saldos' },
  { prefix: '/contabilidad/perdidas-ganancias', title: 'Pérdidas y Ganancias' },
  { prefix: '/contabilidad/libros-igic', title: 'Libros Registro de IGIC' },
  { prefix: '/contabilidad/modelo-420', title: 'Modelo 420 - IGIC Trimestral' },
  { prefix: '/contabilidad/modelo-425', title: 'Modelo 425 - IGIC Resumen Anual' },
  { prefix: '/contabilidad/modelo-347', title: 'Modelo 347 - Operaciones con Terceros' },
  { prefix: '/contabilidad/conciliacion', title: 'Conciliación Bancaria' },
  { prefix: '/contabilidad/tesoreria', title: 'Previsión de Tesorería' },
  { prefix: '/contabilidad/exportar', title: 'Exportar a Gestoría' },
  { prefix: '/contabilidad/configuracion', title: 'Configuración Contable' },
  { prefix: '/contabilidad', title: 'Contabilidad' },
  { prefix: '/cambiar-clave', title: 'Cambiar Contraseña' },
  { prefix: '/resumen', title: 'Panel de Control' },
  { prefix: '/web/publicar', title: 'Publicar Artículos en la Web (vista previa)' },
  { prefix: '/web/catalogo', title: 'Sincronizar Catálogo (comparación web ↔ ERP)' },
  { prefix: '/web/errores', title: 'Artículos con Errores Web' },
  { prefix: '/web/precios', title: 'Precios Web (comparación)' },
  { prefix: '/web/categorias', title: 'Categorías Web (familias ↔ categorías)' },
  { prefix: '/web/importar-pedidos', title: 'Importar Pedidos Web' },
  { prefix: '/web/pendientes', title: 'Pedidos Web Pendientes de Servir' },
  { prefix: '/web/estado-pedidos', title: 'Estado de Pedidos Web' },
  { prefix: '/web/devoluciones', title: 'Devoluciones y Reembolsos Web' },
  { prefix: '/web/clientes', title: 'Clientes Web' },
  { prefix: '/web/clientes-empresa', title: 'Clientes de Empresa (web)' },
  { prefix: '/web/cupones', title: 'Ofertas y Cupones Web' },
  { prefix: '/web/whatsapp', title: 'Pedidos y Consultas por WhatsApp' },
  { prefix: '/web/stock-reservado', title: 'Stock Reservado por Pedidos Web' },
  { prefix: '/web/registro', title: 'Registro de Sincronización Web' },
  { prefix: '/web/estadisticas', title: 'Estadísticas Web' },
  { prefix: '/web/configuracion', title: 'Configuración de la Conexión con la Web' },
]

export function windowTitle(pathname: string) {
  return WINDOW_TITLES.find((w) => pathname === w.prefix || pathname.startsWith(w.prefix + '/'))?.title ?? ''
}

export function isEnabled(i: MenuItem) {
  return Boolean(i.to || i.action || (i.children && i.children.length > 0))
}

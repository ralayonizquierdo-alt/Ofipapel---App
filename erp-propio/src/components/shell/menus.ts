// Árbol de menús de la ventana principal, copiado del mapa funcional de GeminisWin
// (págs. 1-3). Las opciones con `to` o `action` funcionan; el resto sale en gris.

export type MenuAction = 'signout' | 'close-window' | 'hide-window' | 'show-all' | 'cycle-window' | 'about' | 'undo' | 'redo' | 'cut' | 'copy' | 'delete' | 'selectAll' | 'generar-peticion' | 'paste' | 'find' | 'replace' | 'cambiar-grupo'

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
    // Calcado de GeminisWin (captura 05-00). Además, «Cambiar Contraseña» (propio del ERP).
    items: [
      item('Seleccionar Periodo', { description: 'Crea, modifica, elimina, establece el período de trabajo actual' }),
      item('Periodos o Ejercicios'),
      item('Datos de Empresa', { to: '/empresa', description: 'Datos de la empresa' }),
      item('Tiendas', { to: '/tiendas', description: 'Ficha de Tiendas' }),
      item('Parámetros'),
      'sep',
      item('Cambiar Empleado', { action: 'signout', shortcut: 'CTRL+E' }),
      item('Cambiar Grupo de Acceso', { action: 'cambiar-grupo', shortcut: 'CTRL+O', description: 'Ver el programa como otro grupo de acceso (solo administradores)' }),
      item('Cambiar Contraseña', { to: '/cambiar-clave', description: 'Cambiar la contraseña del empleado conectado' }),
      'sep',
      // SIN CAPTURA (Códigos Postales, Cód. Bancarios y Monedas): hechas con el esquema y el estilo de Formas de Pago.
      item('Códigos Postales', { to: '/codigos-postales', description: 'Ficha de Códigos Postales (sin captura)' }),
      item('Cód. Bancarios', { to: '/bancos', description: 'Bancos y sus sucursales (sin captura)' }),
      item('Formas de Pago', { to: '/formas-pago', description: 'Ficha de Formas de Pago' }),
      item('Monedas', { to: '/monedas', description: 'Ficha de Monedas (sin captura)' }),
      ...off(['Carga Cotización', 'Zonas de servicio']),
      item('Empleados', { to: '/empleados', description: 'Ficha de Empleados' }),
      // Propio del ERP (en GeminisWin los grupos se eligen en Empleados → Seguridad): qué opciones puede usar cada grupo.
      item('Grupos de Acceso', { to: '/grupos-acceso', description: 'Grupos de acceso: opciones de menú permitidas a cada grupo' }),
      'sep',
      item('Traspaso Información', { children: [] }),
      item('Traspaso a Contabilidad'),
      'sep',
      ...off(['Preparar página...', 'Presentación preliminar', 'Elegir Impresora...', 'Importar']),
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
      item('Pegar', { action: 'paste', shortcut: 'Ctrl+V' }),
      item('Borrar', { action: 'delete', shortcut: 'Supr' }),
      item('Seleccionar todo', { action: 'selectAll', shortcut: 'Ctrl+A' }),
      'sep',
      item('Encontrar', { action: 'find', shortcut: 'Ctrl+F', description: 'Busca un texto en la rejilla de la ventana activa' }),
      item('Reemplazar', { action: 'replace', shortcut: 'Ctrl+H', description: 'Reemplaza un texto en los campos de la ficha en modificación' }),
    ],
  },
  {
    label: 'Clientes',
    items: [
      item('Clientes', { to: '/clientes' }),
      item('Tipo Cliente', { to: '/tipos-cliente', description: 'Tipos de Cliente: condiciones por defecto (sin captura)' }),
      item('Recalcular deuda'),
      item('Pagos de Clientes, Cobros', { to: '/cobros-clientes/ficha', shortcut: 'Alt+F7', description: 'Pagos de Clientes, Cobros' }),
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
            children: [
              item('List. de Ventas', { to: '/listados-ventas/ventas', description: 'Listados de Ventas' }),
              item('Ventas por Artículo', { to: '/listados-ventas/articulos', shortcut: 'ALT+F9', description: 'Listado de Ventas por Artículo' }),
            ],
          }),
          // «List Pedidos» (de clientes) sin captura: en gris.
          ...off(['List Pedidos']),
          item('L. Reparaciones', { to: '/listados-ventas/reparaciones', description: 'Listado de Reparaciones' }),
          item('List. Presupuestos', { to: '/listados-ventas/presupuestos', description: 'Listado de presupuestos' }),
          item('List. Tarjetas', { to: '/listados-ventas/tarjetas', description: 'Listado de Cobros en Tarjetas' }),
          item('List. Divisas', { to: '/listados-ventas/divisas', description: 'Listado de Cobros en Divisas' }),
          item('List. Apert. Cajón', { to: '/listados-ventas/cajon', description: 'Listado de Aperturas de Cajón' }),
        ],
      }),
    ],
  },
  {
    label: 'Caja',
    items: [
      // Como en GeminisWin, Mov. de Caja abre la ventana en alta.
      item('Mov. de Caja', { to: '/caja/movimientos/nuevo', shortcut: 'Alt+F5', description: 'Movimientos de caja: entradas, salidas, ventas, cobros y pagos' }),
      item('Listado de Caja', { to: '/caja/listado', shortcut: 'Ctrl+F5', description: 'Informes de Caja' }),
      'sep',
      item('Entrada en caja', { to: '/caja/entrada', description: 'Entrada de dinero en la caja abierta' }),
      item('Salida de caja', { to: '/caja/salida', description: 'Salida de dinero de la caja abierta' }),
      'sep',
      // En GeminisWin Apertura de Caja y Gestor de Pedidos muestran los dos Alt+F6; el atajo real va al Gestor.
      item('Apertura de Caja', { to: '/caja/apertura', shortcut: 'Alt+F6 ', description: 'Abrir la caja de la tienda/terminal con el fondo inicial' }),
      item('Cierre de Caja', { to: '/caja/cierre', shortcut: 'Ctrl+F6', description: 'Cerrar la caja abierta con el arqueo' }),
      item('Aperturas y Cierres', { to: '/caja/aperturas', description: 'Aperturas y Cierres de Caja' }),
    ],
  },
  {
    label: 'Facturación',
    items: [
      // Calcado de GeminisWin (capturas 04-10 y 04-11). Registros VeriFactu está en Contabilidad.
      item('Generar Facturas', { to: '/generar-facturas', description: 'Generar facturación mensual, etc' }),
      item('Facturas', { to: '/facturacion', description: 'Facturas Clientes' }),
      item('Gestor de Pagos de Clientes', { to: '/gestor-cobros-clientes', description: 'Gestor de Pagos de Clientes (cobros)' }),
      item('Listados', {
        children: [
          item('List. Facturas', { to: '/listado-facturas', description: 'Listado de facturas de clientes con desglose de IGIC' }),
          ...off(['L. Pend. de Cobro', 'List. Remesas', 'Extracto clientes']),
        ],
      }),
      item('Liquidación'),
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
      item('Listados de Pedidos', { to: '/listados-compras/pedidos', description: 'Informes de Pedidos a Proveedores' }),
      item('Facturas Proveedor', { to: '/facturas-proveedor', description: 'Facturas de Proveedores' }),
      item('Listados de Facturas', { to: '/listados-compras/facturas', description: 'Informes de Facturas de Proveedores' }),
      item('Pagos', { to: '/pagos-proveedor', description: 'Pagos a Proveedores' }),
      item('Gestor de Pagos', { to: '/gestor-pagos-proveedor', description: 'Gestor de Pagos a Proveedores' }),
      'sep',
      item('Proveedores', { to: '/proveedores', description: 'Ficha de Proveedores' }),
      item('Transportistas', { to: '/transportistas', description: 'Ficha de Transportistas' }),
      'sep',
      item('Gestor Pedidos a Proveedores', { to: '/gestor-pedidos-proveedor', description: 'Gestor de Pedidos a Proveedores' }),
      // SIN CAPTURA de GeminisWin: ficha y alta rápida hechas sobre PETICION/PETIDETA.
      item('Peticiones de Artículos', { to: '/peticiones', description: 'Peticiones de Artículos: encargos internos que se tramitan como pedido a proveedor' }),
      // El atajo CTRL+P lo recoge GenerarPeticionHost (abre el alta rápida encima de la ventana actual).
      item('Generar Petición', { action: 'generar-peticion', shortcut: 'CTRL+P', description: 'Generar una Petición de Artículo' }),
    ],
  },
  {
    label: 'Almacén',
    items: [
      item('Artículos', { to: '/articulos', description: 'Crea, modifica, anula, artículos en los diversos almacenes' }),
      item('Creación Ráp. de Artic.', { to: '/almacen/creacion-rapida', description: 'Creación rápida de artículos' }),
      item('Listados Artículos', { to: '/almacen/listados-articulos', description: 'Listados de Artículos' }),
      item('List. de Movimientos de Artículos', { to: '/almacen/movimientos', description: 'Listados de Movimientos de los Artículos' }),
      item('Etiquetas de Cód. de Barras', { to: '/almacen/etiquetas', description: 'Listados de Etiquetas de Artículos' }),
      'sep',
      item('Traspasos', { to: '/traspasos', description: 'Traspasos entre Almacenes' }),
      item('Control de Lotes', { to: '/almacen/lotes', description: 'Control de Lotes' }),
      item('Almacenes', { to: '/almacenes', description: 'Ficha de Almacenes' }),
      item('Regularización de Stock', { to: '/regularizacion-stock', description: 'Regularización de Stock' }),
      item('Inventarios', { to: '/inventario', description: 'Inventarios' }),
      item('Inventariar Almacén', { to: '/almacen/inventariar', description: 'Inventariar Almacén' }),
      item('Familias', { to: '/familias', description: 'Ficha de Familias' }),
      item('Marcas', { to: '/marcas', description: 'Ficha de Marcas' }),
      item('Plantillas Tarifas', { to: '/plantillas-tarifas', description: 'Plantillas de Tarifas' }),
      'sep',
      item('Tarifas de Oferta', { to: '/tarifas-oferta', description: 'Tarifas de Oferta' }),
      item('Modificación de Precios', { to: '/modificacion-precios', description: 'Modificación de Precios' }),
      item('Modif. de Artículos en bloque', { to: '/almacen/modificacion-bloque', description: 'Modificación datos de Artículos' }),
      // SIN CAPTURA de GeminisWin (Puntos de Restauración, Recalcular Stock y Eliminación de
      // Artículos): hechas con el esquema y el estilo de sus gemelas; ajustar cuando llegue la captura.
      item('Puntos de Restauración Stock', { to: '/almacen/puntos-restauracion', description: 'Puntos de Restauración de Stock (sin captura)' }),
      item('Recalcular Stock', {
        children: [item('Recalcular Stock desde Movimientos', { to: '/almacen/recalcular-stock', description: 'Recalcular el stock desde los movimientos (sin captura)' })],
      }),
      item('Eliminación de Artículos', { to: '/almacen/eliminacion-articulos', description: 'Eliminación (baja) de Artículos sin movimientos (sin captura)' }),
      'sep',
      item("Plu's", { to: '/almacen/plus', description: "Asignación de Plu's" }),
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
    // Calcado de GeminisWin (capturas 05-20 y 05-21). Todo en gris: nada de esto existe aún en el ERP.
    items: [
      item('Examinar', { shortcut: 'F11', description: 'Examina y/o edita la tabla activa' }),
      item('Copia de Seguridad', {
        children: [item('Hacer Copia', { shortcut: 'Alt+F8' }), item('Testear Copia'), item('Restaurar Copia')],
      }),
      ...off(['Cambio de Fecha', 'Cambio de Fecha y Hora', 'Cambio de Tienda']),
      'sep',
      item('Reparar Base de Datos', { shortcut: 'ALT+F12' }),
      item('Reconstruir Ficheros', { shortcut: 'ALT+F11' }),
      'sep',
      ...off(['Act. Tablas del Terminal', 'Act.Tablas y Ejecutable del Terminal', 'Actualizar Tabla...', 'Ejecutar Programa']),
      item('Informes', { children: off(['Crear', 'Modificar', 'Crear Etiqueta', 'Mod. Etiqueta', 'Ejecutar']) }),
      item('Control de Módulos'),
      item('Opciones de tablas', { children: [] }),
      'sep',
      item('Enviar Información a IdsSoft, S.L.', { children: [] }),
      item('Eliminar Ficheros Temporales'),
      'sep',
      item('Configurar Utilidades'),
      'sep',
      // Etiquetas y Listado De Ventas abren las pantallas que ya existen (Almacén y Ventas).
      item('Etiquetas', { to: '/almacen/etiquetas', description: 'Listados de Etiquetas de Artículos' }),
      item('Listado De Ventas', { to: '/listados-ventas/ventas', description: 'Listados de Ventas' }),
      item('Stock A 0 de Familia', { to: '/almacen/stock-cero-familia', description: 'Pone a 0 el stock de una familia en un almacén' }),
      item('Elimina ArtiEnBlanco', { to: '/almacen/articulos-en-blanco', description: 'Da de baja los artículos en blanco' }),
      ...off(['Conectar David']),
      'sep',
      item('Conectar con IdsSoft'),
    ],
  },
  {
    label: 'Ventana',
    items: [
      // Una sola ventana a la vez (ver Layout): Ocultar la deja en la lista, Borrar la cierra,
      // Mostrar todo vuelve a enseñar la ocultada y Recorrer pasa a la siguiente de la lista.
      item('Ocultar', { action: 'hide-window', description: 'Oculta la ventana activa' }),
      item('Ocultar todo', { action: 'hide-window', description: 'Oculta la ventana activa' }),
      item('Mostrar todo', { action: 'show-all', description: 'Vuelve a mostrar la ventana ocultada' }),
      item('Borrar', { action: 'close-window', description: 'Cierra la ventana activa' }),
      item('Recorrer', { action: 'cycle-window', shortcut: 'Ctrl+F1', description: 'Pasa a la siguiente ventana abierta' }),
    ],
  },
  {
    label: '?',
    items: [item('Panel de Control', { to: '/resumen' }), 'sep', item('Acerca de Ofipapel ERP', { action: 'about', description: 'Versión del programa' })],
  },
]

/** Descripción de cada ventana para la barra de título de la ventana hija y la barra de estado. */
export const WINDOW_TITLES: { prefix: string; title: string }[] = [
  { prefix: '/listados-ventas/ventas', title: 'Listados de Ventas' },
  { prefix: '/listados-ventas/articulos', title: 'Listado de Ventas por Artículo' },
  { prefix: '/listados-ventas/reparaciones', title: 'Informes' },
  { prefix: '/listados-ventas/presupuestos', title: 'Listado de presupuestos' },
  { prefix: '/listados-ventas/tarjetas', title: 'Listado de Cobros en Tarjetas' },
  { prefix: '/listados-ventas/divisas', title: 'Listado de Cobros en Divisas' },
  { prefix: '/listados-ventas/cajon', title: 'Listado de Aperturas de Cajón' },
  { prefix: '/listados-compras/pedidos', title: 'Informes de Pedidos' },
  { prefix: '/listados-compras/facturas', title: 'Informes de Facturas de Proveedores' },
  { prefix: '/articulos', title: 'Artículos' },
  { prefix: '/familias', title: 'Familias' },
  { prefix: '/marcas', title: 'Marcas' },
  { prefix: '/plantillas-tarifas', title: 'Plantillas de Tarifas' },
  { prefix: '/clientes', title: 'Clientes' },
  { prefix: '/proveedores', title: 'Proveedores' },
  { prefix: '/almacenes', title: 'Almacenes' },
  { prefix: '/tiendas', title: 'Tiendas' },
  { prefix: '/empleados', title: 'Empleados' },
  { prefix: '/grupos-acceso', title: 'Grupos de Acceso' },
  { prefix: '/empresa', title: 'Empresa' },
  { prefix: '/formas-pago', title: 'Formas de pago' },
  { prefix: '/codigos-postales', title: 'Códigos Postales' },
  { prefix: '/bancos', title: 'Códigos Bancarios' },
  { prefix: '/monedas', title: 'Monedas' },
  { prefix: '/tipos-cliente', title: 'Tipos de Cliente' },
  { prefix: '/stock', title: 'Listados de Artículos' },
  { prefix: '/almacen/listados-articulos', title: 'Listados de Artículos' },
  { prefix: '/almacen/movimientos', title: 'Listados de Movimientos de los Artículos' },
  { prefix: '/almacen/etiquetas', title: 'Listados de Etiquetas de Artículos' },
  { prefix: '/almacen/creacion-rapida', title: 'Artículos' },
  { prefix: '/almacen/modificacion-bloque', title: 'Modificación datos de Artículos' },
  { prefix: '/almacen/plus', title: "Asignación de Plu's" },
  { prefix: '/almacen/inventariar', title: 'Inventariar Almacén' },
  { prefix: '/almacen/puntos-restauracion', title: 'Puntos de Restauración de Stock' },
  { prefix: '/almacen/recalcular-stock', title: 'Recalcular Stock' },
  { prefix: '/almacen/eliminacion-articulos', title: 'Eliminación de Artículos' },
  { prefix: '/almacen/lotes', title: 'Control de Lotes' },
  { prefix: '/almacen/stock-cero-familia', title: 'Stock A 0 de Familia' },
  { prefix: '/almacen/articulos-en-blanco', title: 'Elimina Artículos en Blanco' },
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
  { prefix: '/peticiones', title: 'Peticiones de Artículos' },
  { prefix: '/regularizacion-stock', title: 'Regularización de Stock' },
  { prefix: '/tarifas-oferta', title: 'Tarifas de Oferta' },
  { prefix: '/modificacion-precios', title: 'Modificación de Precios' },
  { prefix: '/pedidos', title: 'Pedidos de Clientes' },
  { prefix: '/repartos', title: 'Repartos' },
  { prefix: '/tpv', title: 'Ventas' },
  { prefix: '/ventas', title: 'Ventas' },
  { prefix: '/caja/movimientos', title: 'Caja' },
  { prefix: '/caja/listado', title: 'Informes de Caja' },
  { prefix: '/caja/entrada', title: 'Entrada en caja' },
  { prefix: '/caja/salida', title: 'Salida de caja' },
  { prefix: '/caja/aperturas', title: 'Aperturas y Cierres de Caja' },
  { prefix: '/caja', title: 'Aperturas y Cierres de Caja' },
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
  { prefix: '/cobros-clientes', title: 'Pagos de Clientes, Cobros' },
  { prefix: '/gestor-cobros-clientes', title: 'Gestor de Pagos de Clientes' },
  { prefix: '/pagos', title: 'Pagos' },
  { prefix: '/facturacion', title: 'Facturas Clientes' },
  { prefix: '/generar-facturas', title: 'Generar Facturas' },
  { prefix: '/listado-facturas', title: 'Listado de Facturas' },
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

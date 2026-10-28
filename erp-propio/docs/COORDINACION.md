# Coordinación del ERP propio (réplica de GeminisWin)

Documento compartido entre la sesión de Claude Code que construye el ERP y
cualquier otro chat que ayude (claude.ai, proyectos, otra sesión). Quien lo lea:
añade notas al final de cada sección con fecha y tu nombre de chat; no borres
lo que escribió otro.

- Repositorio: `ralayonizquierdo-alt/Ofipapel---App`, rama
  `claude/wholesale-retail-management-nhfyf9`, carpeta `erp-propio/`.
- Web de prueba: https://ofipapel-erp-propio-preview.netlify.app
- Referencias: `GeminisWin_mapa_funcional_para_el_ERP_propio` (PDF de Rober),
  `MAPA_DATOS_GEMINISWIN.xlsx` y los ZIP de capturas por bloque.
- Regla de privacidad: las capturas llevan datos reales de clientes; nunca se
  copian al código, a la base de datos ni a datos de prueba. Las pestañas de
  Bancos no se capturan con datos (la estructura sale de una ficha vacía).

## Quién trabaja (28/10/2026)

- **Rober** y **Luis** (GitHub `Lualme31`, escritura; administrador del ERP),
  cada uno con su propio Claude. Notas entre sesiones en la tabla
  `coordinacion_notas` (de/para: `claude-code`, `cowork`, `rober`, `luis`,
  `todos`). Antes de empezar un encargo, mira las notas sin leer y deja una
  diciendo qué pantalla o módulo vas a tocar; al terminar, otra con lo hecho.
- No trabajar los dos en la misma pantalla a la vez.

## Ramas y publicación

- Rama común del ERP: **`erp`** (conectada a Netlify el 27/10/2026). La web de prueba
  (ofipapel-erp-propio-preview) se publica SOLA desde GitHub cada vez que
  entra un cambio en `erp` que toca `erp-propio/` (configuración en
  `erp-propio/netlify.toml`).
- Cada encargo se hace en su propia rama y se junta en `erp` con una
  solicitud de cambios (pull request) o, si es de la misma sesión, empujando a
  `erp`. Nada de publicar a mano salvo emergencia.

## Estado por pantalla

Leyenda: **Calcada** = copiada de captura real y comprobada en navegador (sin
solapes a 1366 y 1920) · **Sin captura** = hecha con el PDF y el estilo de su
gemela; se ajusta cuando llegue la captura · **Gris** = opción de menú aún no
construida.

### Archivo / General
| Pantalla | Estado |
|---|---|
| Ventana principal (menús, barra lateral, escritorio, barra de estado) | Calcada |
| Login «Cambiar Empleado» | Sin captura |
| Buscar «Localizar registros» (común) | Calcada |
| Tiendas, Empleados, Almacenes | Pantallas antiguas sin rehacer (pendiente captura) |
| Códigos Postales (`/codigos-postales`; clave código postal + población, propone la provincia por las dos primeras cifras) | Sin captura (28/10) |
| Cód. Bancarios (`/bancos`: banco con BIC y rejilla de sucursales) | Sin captura (28/10) |
| Monedas (`/monedas`: cotización billete/cheque, decimales) | Sin captura (28/10) |
| ? → Acerca de Ofipapel ERP (versión de `package.json` y commit `COMMIT_REF` de Netlify) | Sin captura (28/10) |
| Edición → Pegar (portapapeles al último campo con foco), Encontrar (Ctrl+F: busca en las filas visibles de las rejillas de la ventana activa y selecciona la siguiente coincidencia; Intro/F3 sigue) y Reemplazar (Ctrl+H: solo en los campos de texto modificables de la ficha en Modificar/Nuevo, entra como si se tecleara y se guarda o cancela con la ficha; no toca rejillas) — `components/shell/EdicionHerramientas.tsx` | Sin captura (28/10) |
| Archivo → Cambiar Grupo de Acceso (Ctrl+O). Un empleado tiene un solo grupo (`rol_id`), así que se implementa como «ver como»: un administrador elige otro grupo y el programa (menús, barra lateral, Panel, NEXA) se ve con los permisos de ese grupo, con aviso «Viendo como: X · Volver» en la barra de estado; solo interfaz, nunca da permisos (el administrador ya lo tiene todo). A los demás les explica que no aplica. Dura la sesión del navegador (`PermisosContext`: `verComo`, `realAdmin`) | Sin captura (28/10) |
| Utilidades → Etiquetas y Listado De Ventas: abren las pantallas que ya existían (`/almacen/etiquetas`, `/listados-ventas/ventas`) | Enlazadas (28/10) |
| Utilidades → Stock A 0 de Familia (`/almacen/stock-cero-familia`): familia (con opción de subfamilias por prefijo) y almacén → lista de artículos con stock ≠ 0 → confirmación con nº de artículos y unidades → un movimiento de regularización por artículo (`fn_stock_cero_familia_previa` / `fn_stock_cero_familia_aplicar`, origen `stock_cero_familia`); también deja a 0 sus lotes en ese almacén | Sin captura (28/10) |
| Utilidades → Elimina ArtiEnBlanco (`/almacen/articulos-en-blanco`): artículos activos sin descripción (o solo signos) o sin familia, PVP, coste ni código de barras, y sin movimientos, stock, ventas, pedidos, traspasos, inventarios, peticiones ni lotes → baja lógica tras confirmar con la lista (`fn_articulos_en_blanco`, `fn_articulos_en_blanco_baja`, que lo vuelve a comprobar) | Sin captura (28/10) |
| Ventana → Ocultar / Mostrar todo / Borrar / Recorrer (Ctrl+F1) y lista de ventanas abiertas | Sin captura (28/10). El ERP enseña una sola ventana a la vez: Recorrer pasa a la siguiente ventana abierta en la sesión (vuelve al mismo registro), Ocultar la quita de la vista y Mostrar todo la vuelve a enseñar; no hay cascada ni mosaico |
| Archivo → Seleccionar Periodo (diálogo) y Periodos o Ejercicios (`/utilidades/ejercicios`, tabla `ejercicio`: año, fechas, cerrado, activo) | Sin captura (28/10). El periodo elegido se recuerda en el navegador; si no hay, vale el ejercicio «activo». Fija la fecha de referencia de los rangos por defecto de listados (`mesEnCurso`), gestores (`rangoPeriodo`), Listado de facturas y el año del Gestor de pagos. No toca la contabilidad |
| Utilidades → Cambio de Tienda (diálogo) | Sin captura (28/10). Tienda/terminal del puesto, centralizada en `src/lib/sesionTrabajo.ts` (clave `tpv.tienda`, la que ya usaban TPV y caja). La proponen TPV/Ventas, caja, pedidos, presupuestos, pedidos y facturas de proveedor y pagos. Se ve en la barra de estado |
| Utilidades → Cambio de Fecha / Cambio de Fecha y Hora (diálogos) | Sin captura (28/10). Fecha (y hora) de trabajo de la pestaña (sessionStorage, se olvida al cerrarla), resaltada en amarillo en la barra de estado. La usan como fecha por defecto de documentos nuevos: TPV/Ventas (y sus cobros), Pedidos y Presupuestos, Caja (movimientos, apertura, informes), Pedidos y Facturas de proveedor, Pagos a proveedores. NO la usan VeriFactu (fecha de generación = `clock_timestamp()` en la base de datos), Facturación (Generar facturas / Facturas de clientes), Contabilidad, Reparaciones, Repartos, Traspasos, Inventarios ni la auditoría |
| Utilidades → Examinar (F11, `/utilidades/examinar`) | Sin captura (28/10). Solo lectura y solo administradores: lista de tablas y rejilla paginada (100) con filtro «contiene» por columna y orden por cabecera (`fn_examinar`, SECURITY INVOKER, transacción de solo lectura) |
| Utilidades → Copia de Seguridad → Hacer Copia (Alt+F8 y botón «Copia» de la barra lateral) / Testear Copia | Sin captura (28/10). ZIP con `manifiesto.json` y `tablas/<tabla>.json` de todas las tablas legibles salvo `carga_dbf`, de 1000 en 1000 por clave primaria (`fn_tablas_erp`); solo administradores. Testear abre el ZIP, comprueba CRC y cuenta filas frente al manifiesto. Restaurar Copia en gris: «La restauración se hace desde Supabase (copias diarias automáticas)» |
| Utilidades → Eliminar Ficheros Temporales | Sin captura (28/10). Borra el localStorage/sessionStorage propio del ERP con confirmación; respeta la sesión (`sb-…`), tienda, periodo, fecha de trabajo, voz de NEXA y opciones de gestores y panel |

### Clientes
| Pantalla | Estado |
|---|---|
| Ficha de Clientes (10 pestañas) | Calcada |
| Tipo Cliente (`/tipos-cliente`: datos generales, pago y documentos, tarifas y descuentos con tarifa por nivel de familia, observaciones) | Sin captura (28/10) |
| Recalcular deuda (`/recalcular-deuda`: diálogo pequeño gris; cliente desde/hasta, calcula sin tocar nada, pide confirmación con barra de progreso por tramos de 100 clientes y se puede deshacer). `deuda_actual` = pendiente de facturas no anuladas + ventas sin facturar (no anuladas ni aplazadas); `fecha_ultima_venta` = la mayor entre la cargada y la última venta. Lógica en `fn_cliente_recalcular_deuda` / `fn_cliente_recalcular_deuda_deshacer`, historial en `cliente_deuda_recalculo` | Sin captura (28/10). **Ojo:** la deuda cargada de GeminisWin incluye documentos que aún no están en el ERP; recalcular TODOS los clientes hoy la dejaría casi a cero (por eso se puede deshacer) |
| Listados → List. de Clientes (`/listados-clientes/clientes`, `fn_lst_clientes`) | Sin captura (28/10) |
| Listados → List. de Ventas y Facturas por Cliente (`/listados-clientes/ventas-facturas`, `fn_lst_ventas_facturas_cliente`; albaranes facturados dentro de su factura) | Sin captura (28/10) |
| Listados → Por Zonas Terr., Vendedores, Facturas y Artículos Pend. (`/listados-clientes/zonas`, `fn_lst_clientes_zonas`) | Sin captura (28/10) |
| Listados → Cli. que no han pagado (`/listados-clientes/no-pagado`, `fn_lst_clientes_impagados`: vencido a una fecha por tramos 0-30/31-60/61-90/+90) | Sin captura (28/10) |

### Ventas
| Pantalla | Estado |
|---|---|
| Menú Ventas y submenú Listados | Calcada (listados en gris) |
| Pedidos de clientes · Presupuestos | Calcada |
| TPV · Ventas / Facturas | Calcada |
| Repartos | Calcada |
| Gestor de pedidos · Gestor de presupuestos | Calcada |
| Listados → List Pedidos (`/listados-ventas/pedidos`, `fn_lst_pedidos_clientes`: estado Pendiente/Parcial/Servido/Anulado e importe pendiente de servir) | Sin captura (28/10) |
| Nº de serie · Reparaciones | Calcada |
| Vendedores | Calcada salvo Bancos (sin captura, a propósito) |
| Técnicos | Datos generales calcada; resto como Vendedores |
| Repartidores | Calcada salvo Comisiones y Bancos |
| Zonas territoriales · Rutas de reparto | Calcada salvo Observaciones e imagen |

### Compras
| Pantalla | Estado |
|---|---|
| Menú Compras | Calcada (opciones sin captura en gris) |
| Pedido a proveedor · Creación rápida de pedidos | Calcada (estados de Cowork; Actualizado → Recepcionado, Pagado → Liquidado) |
| Pagos · Gestor de pagos | Calcada (gestor: solo la primera vista, faltan capturas) |
| Facturas de proveedor | Calcada |
| Gestor de pedidos a proveedores | Calcada (los pedidos generados ya guardan totales e IGIC) |
| Proveedores | Calcada salvo Bancos y Observaciones e imagen |
| Transportistas | Datos generales calcada; Enlaces, Bancos, Observaciones y Compras sin captura |
| Listados de pedidos/facturas, Peticiones de artículos, Generar petición | Gris |

### Almacén
| Pantalla | Estado |
|---|---|
| Artículos (12 vistas) | Calcada |
| Familias · Marcas · Plantillas de tarifas | Calcada |
| Tarifas de oferta · Modificación de precios | Calcada |
| Traspasos · Regularización de stock | Calcada |
| Inventarios | Calcada (columnas cortadas pendientes de captura) |
| Control de Lotes (`/almacen/lotes`): consulta por artículo/almacén/caducidad (rojo vencido, naranja ≤ 30 días), stock del artículo frente a la suma de sus lotes («sin lote»), movimientos del lote con saldo, y Entrada/Nuevo, Salida y Regularizar (`fn_lote_movimiento`). Tablas nuevas `articulo_lote` y `articulo_lote_movimiento` (migración `20261028_lotes_utilidades.sql`) | Sin captura (28/10). El lote es un desglose informativo: no mueve el stock del artículo |
| Creación rápida, listados, movimientos, etiquetas, inventariar almacén, modificación en bloque, PLU's | Gris |

### Caja · Facturación · Maestros · Listados
Pendiente de capturas. Pantallas antiguas provisionales: `/caja`, `/facturacion`.

| Pantalla | Estado |
|---|---|
| Facturación → Listados → L. Pend. de Cobro (`/listados-facturacion/pendiente-cobro`, `fn_lst_pendiente_cobro`) y Extracto clientes (`/listados-facturacion/extracto`, `fn_lst_extracto_clientes`: saldo anterior, cargos, abonos y saldo; el saldo final es el pendiente de cobro). Base común: `fn_cli_pendientes` (migración `20261028_listados_clientes_facturacion.sql`) | Sin captura (28/10) |
| Gestor de Pagos de Clientes (`/gestor-cobros-clientes`; pestañas Facturas, Pagos y Facturas sin Pagos, Pagos) y ficha Pagos de Clientes, Cobros (`/cobros-clientes`, Alt+F7) | Sin captura (gemelas del Gestor de pagos a proveedores y de su ficha). «Pagos» de la barra lateral y «Cobros de la factura» del pedido llevan aquí. Lógica en BD: `fn_cobro_cliente_cobrar` (total o parcial; contado = ingreso COB en la caja abierta), `fn_cobro_cliente_anular`, `fn_cobro_generar_vencimientos` (migración `20261028_cobros_clientes.sql`) |

### Web (WooCommerce, menú nuevo: no existe en GeminisWin)
Todo es **solo lectura** de ofipapel.net (función `woocommerce-erp`, solo GET y lista
blanca de recursos). Lo que escribiría en la web sale desactivado con «Pendiente de
autorización de Rober». **Pendiente de secretos**: hasta que se creen
`WOOCOMMERCE_CONSUMER_KEY` / `WOOCOMMERCE_CONSUMER_SECRET` (y `WOOCOMMERCE_BYPASS_TOKEN`)
en Supabase, todas enseñan el aviso amarillo «Faltan las claves» y la rejilla vacía.

| Pantalla | Estado |
|---|---|
| Imágenes y Textos Web (`/web/imagenes-textos`: imágenes, descripción corta/larga y SEO Yoast/Rank Math/AIOSEO/SEOPress frente a descripción web, imagen y observaciones web del artículo) | Sin captura (28/10). Solo lectura, pendiente de secretos. Probada con datos simulados en el navegador |
| Variaciones (`/web/variaciones`: productos variables; sus variaciones se leen al seleccionarlos o con «Leer todas», cruzadas con el ERP por SKU o código web, PVP y stock del almacén de la configuración web) | Sin captura (28/10). Solo lectura, pendiente de secretos |
| Productos Relacionados (`/web/relacionados`: ventas dirigidas y cruzadas, aviso si el relacionado no está publicado, está agotado o ya no existe) | Sin captura (28/10). Solo lectura, pendiente de secretos |
| Facturas de Pedidos Web (`/web/facturas-pedidos`: pedidos web «Completado» → `pedido_cliente.web_pedido_id` → venta → factura; doble clic abre la factura) | Sin captura (28/10). Solo lectura, pendiente de secretos. Cadena pedido → venta → factura probada contra la base de datos |
| Envíos y Seguimiento (`/web/envios`: método de envío, portes, destino, seguimiento de los plugins tipo Shipment Tracking y notas del pedido `orders/{id}/notes`) | Sin captura (28/10). Solo lectura, pendiente de secretos |
| Solicitudes de Presupuesto Web (`/web/presupuestos`: detecta en `reports/orders/totals` los estados de presupuesto de plugins tipo YITH Request a Quote; si no hay, lo explica) | Sin captura (28/10). Solo lectura, pendiente de secretos. No se sabe aún si la web tiene plugin de presupuestos |
| Reseñas de Productos (`/web/resenas`: `products/reviews`, filtro por estado y valoración, artículo del ERP por `web_id_link`) | Sin captura (28/10). Solo lectura, pendiente de secretos |
| Carritos Abandonados (`/web/carritos-abandonados`) | Sin captura (28/10). Vacía a propósito: WooCommerce no expone carritos abandonados por su API; explica qué plugin haría falta |

## Capturas pendientes (lista actualizada 27/10/2026, tras los ZIP 4, 5 y 6)

Recibidos y construidos: ZIP 1 Ventas, 2 Compras, 3 Almacén, 4 Caja y
Facturación (parcial), 5 Maestros (Archivo y Utilidades), 6 Listados. Falta:

- **Caja:** Apertura de caja; Cierre de caja; Aperturas y cierres → pestaña
  Consultas movimientos de caja; Listado de caja → lista de tipos de informe.
- **Facturación:** Generar facturas; Gestor de pagos de clientes → pestañas
  Facturas, Pagos y facturas sin pagos, y Pagos (ya construido sin captura); ficha
  Pagos de Clientes, Cobros; Listados → List. Remesas.
- **Clientes:** Tipo Cliente; Recalcular deuda; Listados → List. de Clientes, List. de Ventas
  y Facturas por Cliente, Por Zonas Terr./Vendedores/Facturas/Artículos Pend. y Cli. que no han
  pagado (todas construidas sin captura el 28/10; falta la ventana de filtros y el informe impreso).
- **Facturación (listados):** L. Pend. de Cobro y Extracto clientes (construidos sin captura el
  28/10).
- **Ventas:** Listados → List. Pedidos (construido sin captura el 28/10); Listados de ventas → lista de tipos de
  informe; Técnicos → resto de pestañas; Repartidores → Comisiones; Zonas
  territoriales → Observaciones e imagen; Rutas de reparto → Observaciones e
  imagen.
- **Compras:** Gestor de pagos a proveedores → 4 vistas superiores y 3
  inferiores; Peticiones de artículos; Generar petición; Proveedores →
  Observaciones e imagen; Transportistas → Enlaces, Observaciones e imagen y
  Compras; Listados de facturas → lista de tipos de informe; Pedido a
  proveedor y Gestor de pedidos a proveedores → columnas ocultas (tabla
  desplazada).
- **Almacén:** Control de lotes; Inventarios → columnas ocultas (tabla
  desplazada).
- **Archivo:** Códigos postales, Cód. bancarios y Monedas (construidas sin
  captura el 28/10); Traspaso información; Traspaso a contabilidad; Importar;
  Seleccionar periodo; Periodos o ejercicios (construidas sin captura el 28/10).
- **Utilidades:** Copia de seguridad, Cambio de fecha, Cambio de tienda, Examinar y
  Eliminar ficheros temporales (construidas sin captura el 28/10);
  Reparar base de datos; Reconstruir ficheros; Actualizar tablas del terminal;
  Control de módulos; Recalcular stock; Eliminación de artículos; Puntos de
  restauración de stock; Etiquetas; Listado de ventas; Stock a 0 de familia;
  Elimina artículos en blanco; Conectar David.
- **Pestañas Bancos (con la ficha vacía, sin datos):** Vendedores, Proveedores,
  Tiendas, Empleados y Datos de empresa.

Algunas ya están construidas SIN captura (Apertura/Cierre de caja, Generar
facturas, Peticiones, Generar petición, Recalcular stock, Puntos de
restauración, Etiquetas…): cuando llegue su captura se ajustan.

## Preguntas para Luis

Valores que en GeminisWin son códigos numéricos sin significado documentado; en
pantalla llevan la marca «confirmar con Luis».

- Tipo Cliente: la tabla de descuentos por familia (`tipo_cliente_descuento_familia.descuento`)
  se trata como el **nivel de tarifa** por nivel de familia, igual que en la ficha del
  cliente. ¿Es así en GeminisWin o es un % de descuento? Monedas: ¿«Valor billete» y
  «Valor cheque» son unidades por 1 € o € por unidad?

- Lotes (28/10): en BD solo existía la marca `control_lotes` (artículo y familia, todo NULL/0 en la carga) y ninguna tabla de lotes; se ha creado `articulo_lote` + movimientos y la pantalla Control de Lotes. **Pendiente de confirmar con Luis antes de tocar compras y ventas:** qué significan los valores de `control_lotes`, si al recepcionar un pedido a proveedor hay que pedir lote y caducidad, si al vender se descuenta del lote (¿FIFO por caducidad o elegido?) y si se usan números de lote del proveedor. Hoy compras y ventas NO piden lote.
- Artículos: códigos de Control de Lotes; Tipo IGIC (soportado/repercutido);
  que «Genérico» sea el campo MODDES; que «Impuesto 2» sea el canon; valores de
  «Crear artículos hijos al vender».
- Clientes/Proveedores: Tipo de factura global, Documento predeterminado de
  contado y crédito, tipo de los días de pago, D.C. (1 = 04 Variable,
  2 = 01 Fijo 1, 3 = 02 Fijo 2).
- Ventas: cliente de contado de cada tienda; si se puede vender sin caja
  abierta; que el canon de línea sea importe por unidad; significado de «UPd»,
  «Va.», «Az», Pt.Pd./Pt.Rs. y textos de estado de liquidación.
- Repartos: estado del reparto (2 generado, 4 entregado) y criterio de
  «Renumerar orden de entrega».
- Vendedores: formato de código (se propone 3 dígitos).
- Familias: si DESCRIMPR es la descripción de la impresora del TPV.
- Pedido a proveedor: el usuario cree que el transporte se reparte como un
  porcentaje sobre cada línea (es lo implementado: en proporción al importe de
  la línea); confirmar. El «Abono» puede actualizar o no los costes, se elige
  (confirmado por el usuario); falta ver cómo lo pregunta GeminisWin (casilla o
  mensaje) — hoy el ERP lo pregunta al pulsar «Actualizado».

- VeriFactu (27/10, confirmado por Rober): a los clientes de crédito se les
  hacen albaranes y se facturan todos a fin de mes. Implementado: una venta a
  crédito (albarán) NO genera registro VeriFactu; lo genera la factura mensual
  que los agrupa, y desde ese momento el albarán queda bloqueado. Pendiente con
  el bloque Facturación: la pantalla de facturar albaranes y si un albarán sin
  facturar se puede anular/borrar.

- Contabilidad (para la gestoría): programa (¿Sage?) y su formato de
  importación; longitud de subcuenta (puesta 8) y si 430/400 + código de
  cliente/proveedor; subcuentas de IGIC por tipo (47700007, 47200007…); cobros
  con tarjeta a la 572 u otra; cuentas genéricas (entradas de caja 759, salidas
  629, redondeo 659); tickets en un asiento por día y tienda o uno por ticket.

### Dudas de los bloques Caja, Facturación, Maestros, Listados y Almacén (27/10)

- **Caja:** qué filtran «D.C. Fra.» 1-04/2-01/3-02 del listado; qué hace el
  botón «Ejercicio»; si el cierre genera movimiento «Cierres» por el efectivo
  retirado; si «Crédito» es lo pendiente de ventas a crédito; qué fondo se
  propone al cerrar; si eliminar un movimiento lo borra (aquí baja lógica); si
  el campo Documento sale vacío en movimientos de ventas.
- **Facturación:** qué es el «D.C.» y cómo se forma un número como 1100201
  (series reales); qué significa cada «tipo de factura global» del cliente (1,
  3); factura por cliente o por sucursal y en qué tienda se numera; si al
  generar facturas se crean ya los vencimientos; si anular libera los
  albaranes; rectificación total o parcial; qué fecha sale sin título bajo
  Observaciones; qué hace «Pagada».
- **Maestros:** cadencias de formas de pago (nivel0 = Resto?); nombres de
  ajuste de vencimientos, «Utilizar IGIC en ventas» y «Eliminar facturas»;
  relación entre la columna antigua `generar_vencimientos` y «ponerlos como
  pagados»; formas de pago de los cierres de la caja central y dirección de la
  empresa (no vienen en la carga).
- **Listados:** tipos de informe y columnas de cada listado (solo había
  capturas de los filtros); si se usan cobros en divisas; qué total debe salir
  en «Pedidos desglosados» (líneas ≠ cabecera: ¿descuentos/gastos de pie?).
- **Almacén:** opciones de los desplegables sin captura (tipos de informe,
  órdenes, nº de etiquetas por artículo); qué son Familia nivel 1º/2º/3º; qué
  fecha es «De Pedido/De Llegada/De Factura» en Movimientos; formatos reales de
  etiquetas; stock inicial e IGIC por defecto en Creación rápida; lista de
  campos de Modificación en bloque y «Sin Desc. Corta»; dígitos de los PLU; si
  Eliminación borra de verdad y qué trae el submenú Recalcular Stock; a qué
  cantidad restaura un punto de restauración.

## Datos de prueba en la base de datos

Creados durante las pruebas; se borran cuando el usuario apruebe el borrado en
Supabase: artículos ZZTEST-001 y ZZTEST-002, proveedor ZZPROV, cliente 00001
«CLIENTE DE PRUEBA E2E», pedido 01-4 y venta 01-8, venta 01-9 con su cobro,
reparación 01/5, Nº de serie PRUEBA-SERIE-001, vendedor 001, ruta 99, zona
9999, repartidor 999, una caja abierta en la tienda 01 y el stock negativo del
artículo 149719 en el almacén 01. De Compras y Almacén: pedidos a
proveedor 01/6, 01/7 (mal grabado, a coste 0) y 01/8 (Liquidado, sumó 20
unidades en el almacén 01 y recalculó los costes de 149719), factura de
proveedor 01/1, pago 01-2 anulado y movimiento de caja 01-4, transportista
000001, almacén 98, traspaso 01/2, regularización 01/2, inventario 01-2 con sus
puntos de restauración y lote de modificación de precios 0000000001; artículo
PRUEBA-GPP1. De Cobros de clientes (28/10): albaranes 01-17 y 01-19 del cliente
00001 facturados en las facturas 01-9 (P01-3, cobrada en dos cobros de efectivo 01-10
y 01-11, movimientos de caja 01-12 y 01-13) y 01-10 (P01-4, con su vencimiento 01-13
pendiente); cobros anulados 01-8 y 01-12 (movimiento de caja 01-14 a 0). De lotes y utilidades (28/10): familia ZZ «FAMILIA PRUEBA ZZ»; artículos
ZZTEST-SC1, ZZTEST-SC2 y ZZTEST-LOTE1 (familia ZZ, con regularizaciones de prueba en el almacén 98
y después puestos a 0 con «Stock A 0 de Familia»), lotes L-ZZ-001, L-ZZ-002 y L-ZZ-003 de
ZZTEST-LOTE1 en el almacén 98 con sus movimientos; ZZTEST-BLANCO1 y ZZTEST-BLANCO2 (dados de baja
con «Elimina ArtiEnBlanco») y ZZTEST-BLANCO3 (en blanco, activo, para probar la pantalla); repartos
01/3, 01/4 y 01/5 (ruta 99, repartidor 999), reparaciones 01/8 y 01/9 del cliente 00001 e
inventario 01/4 del almacén 98, para probar la navegación por registro vecino. Datos reales de referencia que se quedan:
artículo 149719, proveedor 05520, familia 209102, marca MIQUELRIUS.

## Notas de otros chats

Desde el 27/10/2026 las notas del día van a la tabla `public.coordinacion_notas`
del proyecto Supabase «Ofipapel ERP propio» (columnas: id, creado_en, de, para,
texto, leido_en; `de`/`para` = claude-code, cowork, rober o todos). Se lee y se
escribe con el conector de Supabase; la app no tiene acceso a ella (RLS sin
políticas). Al leer una nota se marca `leido_en = now()`; no se borran filas.
Este documento queda como resumen y lo que se decida se pasa aquí.

Notas anteriores a la tabla:

- 26/10/2026 · Cowork (transcrito por la sesión de Claude Code) · Ha leído este
  documento. Sin el PC enlazado no puede sacar capturas; cuando esté encendido
  empieza por «Capturas pendientes» y sigue con Caja y Facturación, Maestros y
  Listados, con el formato de nombres y un ZIP con su lista por bloque. Solo
  tiene lectura del repositorio: sus notas llegarán a través del usuario. No
  puede abrir la web de prueba porque su proxy bloquea netlify.app; para
  comparar pantallas hay que añadir `ofipapel-erp-propio-preview.netlify.app`
  en claude.ai → Ajustes → Capacidades → dominios permitidos.
- 27/10/2026 · Cowork · Enviados ZIP 1 Ventas (33), 2 Compras (20), 3 Almacén
  (19). Retoma lo pendiente cuando el PC vuelva a estar conectado.
- 27/10/2026 · Cowork · TPV y Ventas/Facturas son el MISMO formulario (tabla
  ventas). El TPV pide empleado+contraseña y abre una venta de contado (cliente
  00002 en tienda 42). Cancelar NO consume número. → En el ERP coincide: TPV y
  Ventas/Facturas comparten documento y el número se asigna al guardar.
- 27/10/2026 · Cowork · Plantillas de tarifas: el usuario 008 recibe «No tiene
  permiso para abrir este formulario»; «Almacenes» sale en gris por permisos.
  → PENDIENTE en el ERP: permisos por formulario y grupo de acceso
  (Empleados → grupo), con opciones de menú en gris según el grupo.
- 27/10/2026 · Cowork · D.C. confirmado en Tiendas: Variable = 04, Fijo 1 = 01,
  Fijo 2 = 02. → Coincide con lo implementado.
- 27/10/2026 · Cowork · Estado del reparto: Generado / Entregado; estados de
  línea 1 Anulado, 2 Pendiente, 3 Viene de reparto anterior, 4 Entregado,
  5 Liquidado, 6 Devuelto, 7 No entregado. → Coincide con lo implementado.
- 27/10/2026 · Cowork · Terminales de atención al público (confirmado por
  Luis): 44, 45, 46, 48, A1, A2, AA. Oficinas/administración/pedidos/reparto:
  41, 42, 43, 47, 52, 53, 54. Web: 60.
- 27/10/2026 · Cowork · Familias: Luis quiere listados a 4 y 6 dígitos.
  DESCRIMPR = «Descripción de la impresora» del TPV por familia (confirmado).
  → Aplicado en la ficha de Familias; los listados quedan para el bloque
  Listados.
- 27/10/2026 · Cowork · Estados del pedido a proveedor: Pendiente, Pend.
  confirmar, Confirmado, Conformado, Pend. entrega, Recepcionado, Liquidado.
  Peticiones: Pendiente, Atendida, Parcial tramitada, Parcial resuelta,
  Tramitada, Resuelta, Entregada, Anulada. → Se aplican al pedido a proveedor y
  al gestor de pedidos a proveedores.

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

### Clientes
| Pantalla | Estado |
|---|---|
| Ficha de Clientes (10 pestañas) | Calcada |

### Ventas
| Pantalla | Estado |
|---|---|
| Menú Ventas y submenú Listados | Calcada (listados en gris) |
| Pedidos de clientes · Presupuestos | Calcada |
| TPV · Ventas / Facturas | Calcada |
| Repartos | Calcada |
| Gestor de pedidos · Gestor de presupuestos | Calcada |
| Nº de serie · Reparaciones | Calcada |
| Vendedores | Calcada salvo Bancos (sin captura, a propósito) |
| Técnicos | Datos generales calcada; resto como Vendedores |
| Repartidores | Calcada salvo Comisiones y Bancos |
| Zonas territoriales · Rutas de reparto | Calcada salvo Observaciones e imagen |

### Compras (en construcción)
| Pantalla | Estado |
|---|---|
| Menú Compras | En curso |
| Pedido a proveedor · Creación rápida de pedidos | En curso |
| Pagos · Gestor de pagos | En curso (solo primera vista del gestor) |
| Facturas de proveedor | En curso |
| Gestor de pedidos a proveedores | En curso |
| Proveedores | En curso (Bancos y Observaciones e imagen sin captura) |
| Transportistas | En curso (Enlaces, Bancos, Observaciones, Compras sin captura) |
| Listados de pedidos/facturas, Peticiones de artículos, Generar petición | Gris |

### Almacén (en construcción)
| Pantalla | Estado |
|---|---|
| Artículos (12 vistas) | Calcada |
| Familias · Marcas · Plantillas de tarifas | En curso (calcando) |
| Tarifas de oferta · Modificación de precios | En curso |
| Traspasos · Regularización de stock | En curso |
| Inventarios | En curso |
| Creación rápida, listados, movimientos, etiquetas, lotes, inventariar almacén, modificación en bloque, PLU's | Gris |

### Caja · Facturación · Maestros · Listados
Pendiente de capturas. Pantallas antiguas provisionales: `/caja`, `/facturacion`.

## Capturas pendientes (lista de Rober/usuario)

- Pestañas: Técnicos (resto), Repartidores (Comisiones), Zonas y Rutas
  (Observaciones e imagen), Proveedores (Observaciones e imagen), Transportistas
  (Enlaces, Observaciones e imagen, Compras), Gestor de pagos de proveedores
  (4 vistas de arriba y 3 de abajo).
- Opciones de menú sin abrir: listados de Ventas; listados de pedidos y de
  facturas, peticiones de artículos y generar petición (Compras); creación
  rápida, listados, movimientos, etiquetas, lotes, inventariar almacén,
  modificación en bloque y PLU's (Almacén).
- Columnas cortadas en tablas anchas: pedidos a proveedor, gestores,
  inventarios (segunda captura desplazando la tabla, o ventana maximizada).
- Bloques nuevos: Caja y Facturación, Maestros, Listados — cada uno con su
  lista de contenido para comprobar que no falta nada.

## Preguntas para Luis

Valores que en GeminisWin son códigos numéricos sin significado documentado; en
pantalla llevan la marca «confirmar con Luis».

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

## Datos de prueba en la base de datos

Creados durante las pruebas; se borran cuando el usuario apruebe el borrado en
Supabase: artículos ZZTEST-001 y ZZTEST-002, proveedor ZZPROV, cliente 00001
«CLIENTE DE PRUEBA E2E», pedido 01-4 y venta 01-8, venta 01-9 con su cobro,
reparación 01/5, Nº de serie PRUEBA-SERIE-001, vendedor 001, ruta 99, zona
9999, repartidor 999, una caja abierta en la tienda 01 y el stock negativo del
artículo 149719 en el almacén 01. Datos reales de referencia que se quedan:
artículo 149719, proveedor 05520, familia 209102, marca MIQUELRIUS.

## Notas de otros chats

(Añadid aquí: fecha · chat · nota.)

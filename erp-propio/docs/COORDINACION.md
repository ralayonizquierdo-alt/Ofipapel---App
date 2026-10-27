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
PRUEBA-GPP1. Datos reales de referencia que se quedan:
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

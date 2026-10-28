# El ERP propio y la app de Finanzas: qué va a cambiar y cómo llegarán los datos

Documento para la app de **Finanzas** (`Index.html`, «Control financiero de
Ofipapel») y para el Claude que la mantiene. Explica el ERP nuevo, cómo
recibe hoy Finanzas los listados de GeminisWin y cómo los va a recibir cuando
el ERP sustituya a GeminisWin. Situación a **28/10/2026**.

> **Resumen en tres frases.** El ERP propio va a sustituir a GeminisWin. Los
> listados que hoy llegan a Finanzas saldrán del ERP **con el mismo formato
> que ahora**, en la misma carpeta, así que Finanzas no tiene que cambiar nada
> el día del cambio. Más adelante, si se decide, Finanzas podrá leer los datos
> directamente del ERP en vez de importar ficheros.

---

## 1. Qué es el ERP propio

- Es un programa de gestión hecho a medida que **replica GeminisWin** (el
  programa en Visual FoxPro de IdsSoft que usa hoy Ofipapel): artículos,
  clientes, proveedores, ventas y TPV, compras, almacén, caja, facturación
  con VeriFactu, listados, contabilidad y conexión con la web (WooCommerce).
- Funciona en el navegador. Web de prueba:
  https://ofipapel-erp-propio-preview.netlify.app
- Código: carpeta `erp-propio/` de este mismo repositorio. La explicación
  completa está en `erp-propio/docs/PROYECTO_ERP.md`.
- Base de datos: **Supabase, proyecto «Ofipapel ERP propio»**
  (`sufxvpiwcncnyltrvoun`). Es **otro proyecto distinto** del de Finanzas
  (`agjmciudnnginqybnogh`): no comparten tablas y el ERP no escribe nada en
  Finanzas.
- Estado: casi todas las pantallas están construidas y hay una carga real de
  datos de GeminisWin para pruebas. **Todavía no se usa en la tienda.**
  GeminisWin sigue siendo el programa real hasta el día del arranque.

## 2. Cómo llegan hoy los datos a Finanzas

Hoy Finanzas **no lee de ninguna base de datos de gestión**: importa ficheros.
Cowork (un Claude que trabaja en el PC de la oficina) saca los listados de
GeminisWin de forma automática y los deja en la carpeta **LISTADOS
AUTOMATIZADOS**. Desde ahí se arrastran a la pantalla correspondiente de
Finanzas, que los lee con `XLSX` (Excel) o `pdf.js` (PDF) y guarda el
resultado en su Supabase (`registros`, `app_sync`).

Estas son las importaciones de Finanzas y lo que espera cada una. **Es el
contrato que el ERP tiene que respetar.**

| Importación (clave en Finanzas) | Función | Qué espera el fichero (primera hoja) |
|---|---|---|
| Ventas Caja (`ventasCaja`) | `importVentasCajaExcel` | Movimientos de caja, una fila por movimiento: col. 0 tienda · 1 fecha · 2 hora · 3 empleado · 4 ingreso · 6 tipo de movimiento · 7 descripción del tipo · 12 tipo de contado |
| Ventas Web (`ventasWeb`) | `importVentasWebExcel` | Una fila por pedido web: col. 2 fecha (número de serie de Excel) · 4 nombre del cliente · 6 total. Opcional: filas «TOTAL MM/AAAA» con el total en la col. 6 |
| Ventas Anuales con / sin IGIC (`ventasAnual`) | `importVentasAnualExcel` | Cabecera «Año» en la col. 0; debajo, una fila por año: col. 0 año · 1-12 meses · 13 total |
| Ventas por Vendedor (`ventasVendedores`) | `importVentasVendedoresExcel` | Cabecera «Vendedor»; filas: col. 0 vendedor · 1 año · 2-13 meses · 14 total. Las filas «Total…» se saltan |
| Ventas por Tienda (`ventasTiendas`) | `importVentasTiendasExcel` | Cabecera «Tda»; filas: col. 0 tienda · 1 año · 2-13 meses · 14 total. Excluye las tiendas 41, 43, 60 y 68; agrupa AA → ALIZ-2 y A1-A3 → ALIZ-1 |
| Ventas por Cliente (`ventasClientes`) | `importVentasClientesExcel` | Cabecera «Cliente»; filas: col. 0 código · 1 vendedor · 2 año · 3-14 meses. **El nombre del cliente va en la fila siguiente**, col. 0 |
| Ventas por Familias (`familias`) | `importFamiliasExcelPfx` | Filas de texto «código nombre» (2 dígitos = categoría, 3-4 = familia) y filas de datos: col. 0 código (número) · 1 año · 14 total |
| Compras / pedidos a proveedor (`compras`) | `importComprasExcel` | Una fila por pedido: col. 0 nº de pedido (número) · 1 fecha · 2 almacén · 3 «código - nombre» del proveedor · 4 total · 5 observaciones. Solo añade pedidos que no tenga |
| Compras Anuales (`comprasAnual`) | `importComprasSmartExcel` | Cabecera «Año» (el listado «arch. 19»): como Ventas Anuales |
| Compras por Proveedor (`comprasProveedores`) | `importComprasSmartExcel` | Cabecera «Prov.» (el listado «arch. 17»): col. 0 código · 1 año · 2-13 meses · 14 total; el nombre en la fila siguiente |
| Pagos a Proveedores (`proveedores`) | `importProveedoresExcel` / `importProveedoresPDF` | Col. 0 receptor · 1 nombre · 2 nº de factura · 3 nº de documento de pago · 4 importe · 6 fecha del documento · 7 fecha · 8 vencimiento · 10 tipo de movimiento |
| Cierre de Cajas (`cajaCierres`) | `importCierrePDF` | PDF del cierre de caja de GeminisWin (cierre de terminal, totales y cierre de caja central) |
| Volcado Diario (`volcado`) y Banco / Recibos (`cajaBancoRecibos`) | `importarExcel` / `importBancoPDF` | **No salen de GeminisWin** (son la hoja `SALDOS_BANCOS.xlsx` y los PDF del banco). El ERP no los toca |

Las fechas que llegan en Excel pueden venir como fecha de Excel, como número
de serie o como texto; Finanzas las pasa a `AAAA-MM-DD` con la hora local.
Los años de dos cifras se convierten sumando 2000.

## 3. Qué vamos a hacer: tres fases

### Fase A · Ahora (sin cambios)
GeminisWin sigue siendo el programa real. Cowork sigue dejando los listados
en LISTADOS AUTOMATIZADOS y Finanzas los importa igual que siempre. **No hay
que tocar nada en Finanzas.**

### Fase B · Arranque del ERP (Finanzas sigue sin cambiar)
Cuando el ERP sustituya a GeminisWin, **el ERP generará los mismos
listados**:
- **mismos nombres de cabecera** («Año», «Vendedor», «Tda», «Cliente»,
  «Prov.»…);
- **mismas columnas en el mismo orden**, con las filas de totales y los
  nombres en la fila siguiente donde hoy los hay;
- **mismos tipos de dato** (lo que hoy es número sigue siendo número; ver el
  apartado 5);
- **en la misma carpeta**, LISTADOS AUTOMATIZADOS, con la misma frecuencia.

Para eso, antes del arranque se hará una **prueba en paralelo**: el mismo
periodo sacado de GeminisWin y del ERP, importado en Finanzas, y comparando
que los totales coinciden al céntimo. Hasta que cuadre, no se cambia.

El PDF del **cierre de caja** se sacará con el mismo esquema que el de
GeminisWin para que `importCierrePDF` lo siga leyendo; si no fuera posible,
el ERP dará además ese cierre en Excel y se adapta la importación (se avisaría
antes).

### Fase C · Más adelante (opcional, a decidir por Rober)
En lugar de importar ficheros, Finanzas podría **leer directamente del ERP**
a través de unas **vistas de solo lectura** pensadas para ella (por ejemplo
`finanzas_ventas_mensuales`, `finanzas_caja_diaria`, `finanzas_compras`,
`finanzas_pagos_proveedor`), con un usuario propio que solo pueda leer esas
vistas. Ventajas: datos al día sin pasos manuales. Esta fase **no está
decidida**; si se hace, se escribirá aquí la lista exacta de vistas y
columnas, y los ficheros de la fase B seguirán funcionando mientras tanto.

## 4. Cómo están guardados los datos en el ERP

Lo necesario para entender de dónde saldrán los números.

### Convenciones generales
- **Fechas:** tipo fecha, formato `AAAA-MM-DD`, en hora de **Canarias**
  (`Atlantic/Canary`). La hora de los documentos va aparte, como texto
  `HH:MM`. Las marcas de «actualizado» van con zona horaria.
- **Importes:** número decimal (`numeric`) en euros, redondeados a 2
  decimales. Nada de texto con «€», puntos de miles ni comas.
- **IGIC** (Canarias), siempre desglosado: **base**, **cuota de IGIC** y
  **total**. Así se puede dar cualquier listado «con IGIC» o «sin IGIC».
- **Códigos:** son texto y conservan los ceros a la izquierda, igual que en
  GeminisWin (tienda `01`, vendedor `001`…). Los documentos se identifican por
  **tienda + número**.
- **Nada se borra:** las bajas son lógicas (`activo = false`) y las ventas
  anuladas llevan fecha de anulación (`anulada_en`). Los listados excluyen
  siempre lo dado de baja y lo anulado.

### Dónde está cada dato

| Dato | Tabla(s) del ERP | Columnas clave |
|---|---|---|
| Ventas (tickets, albaranes y facturas de venta) | `venta` + `venta_linea` | `tienda_terminal_codigo`, `numero`, `fecha`, `hora`, `cliente_codigo`, `vendedor_codigo`, `empleado_codigo`, `subtotal`, `total_igic_pie`, `total`, formas de cobro (`total_efectivo`, `total_tarjeta`…), `anulada_en`; en las líneas `articulo_codigo`, `cantidad`, `total_base`, `total_igic` |
| Facturas a clientes (incluida la factura mensual de albaranes) | `factura` | `fecha_factura`, `cliente_codigo`, `total_base`, `total_igic`, `total`, `estado`, `tipo_factura` (rectificativas) |
| Movimientos de caja | `movimiento_caja` | `tienda_terminal_codigo`, `fecha`, `hora`, `empleado_codigo`, `ingreso`, `gasto`, `tipo_movimiento`, `descripcion_tipo`, `tipo_contado`, `forma_pago_codigo` |
| Aperturas y cierres de caja | `caja_apertura_cierre` (+ `caja_apertura_cierre_categoria`) y funciones `fn_caja_*` | efectivo inicial, totales por forma de pago, descuadre |
| Pedidos web | `pedido_cliente` con `web_pedido_id` | fecha, cliente, total |
| Pedidos a proveedor | `pedido_proveedor` | `numero`, `fecha_hora`, `almacen_codigo`, `proveedor_codigo`, `estado`, `base_imponible`, `total_igic`, `total`, `observaciones` |
| Facturas de proveedor | `factura_proveedor` | `fecha_factura`, `proveedor_codigo`, `numero_factura_externo`, `base_imponible`, `total_igic`, `total`, `fecha_vencimiento`, `total_pendiente` |
| Pagos a proveedor | `pago_proveedor` | `receptor_codigo`, `receptor_nombre`, `numero_factura_externa`, `numero_documento_pago`, `importe_pagado`, `fecha_factura`, `fecha_pago`, `fecha_vencimiento`, `tipo_pago` |
| Familias | `familia` | `codigo`, `descripcion`, niveles |
| Maestros | `cliente`, `vendedor`, `tienda`, `proveedor` | código y nombre |

### De qué tabla saldrá cada importación de Finanzas

| Importación | Se calculará con |
|---|---|
| Ventas Caja | `movimiento_caja` fila a fila (es el mismo dato que hoy da GeminisWin) |
| Ventas Web | `pedido_cliente` con `web_pedido_id` |
| Ventas Anuales con / sin IGIC | `venta` (no anuladas), sumada por año y mes; con IGIC = `total`, sin IGIC = base |
| Ventas por Vendedor / Tienda / Cliente | `venta`, sumada por `vendedor_codigo` / `tienda_terminal_codigo` / `cliente_codigo`, año y mes |
| Ventas por Familias | `venta_linea` unida a `articulo` y `familia`, por año |
| Compras | `pedido_proveedor` |
| Compras Anuales / por Proveedor | `pedido_proveedor` y `factura_proveedor` por año y mes, con el mismo criterio que use hoy GeminisWin (se comprobará en la prueba en paralelo) |
| Pagos a Proveedores | `pago_proveedor` |
| Cierre de Cajas | cierre de caja del ERP |

## 5. Detalles que no se pueden romper (lista para la prueba en paralelo)

- **Tipos de dato:** Finanzas comprueba `typeof === 'number'` en varios sitios
  (nº de pedido en Compras, código de familia, año y total en Familias, tienda
  en Ventas por Tienda). En el Excel del ERP esas columnas tienen que ser
  **números**, no texto.
- **Tiendas:** se mantienen los códigos de GeminisWin. Siguen fuera de los
  totales 41, 43, 60 y 68, y siguen los grupos AA → ALIZ-2 y A1-A3 → ALIZ-1.
- **Fechas en Excel:** como fecha real de Excel (o número de serie), nunca
  como texto `dd/mm/aaaa`.
- **Filas de totales y nombres:** donde hoy hay una fila «Total…» o el nombre
  va en la fila siguiente (Clientes, Proveedores), se mantiene igual.
- **Ventas anuladas y rectificativas:** las anuladas no suman; las facturas
  rectificativas restan, como en GeminisWin.
- **Albaranes de crédito:** la venta cuenta el día del albarán (como hoy). La
  factura mensual que los agrupa **no se suma otra vez**.
- **Ventas Caja:** las columnas 0-12 siguen en las mismas posiciones, aunque
  algunas intermedias (5, 8-11) vayan vacías.

## 6. Lo que no cambia

- Finanzas sigue siendo **donde se ven los datos económicos**. El panel de
  inicio del ERP no enseña importes porque lo ven todos los empleados.
- El Volcado Diario, los saldos de bancos y los PDF del banco siguen igual.
- El ERP **no escribe nunca** en la base de datos de Finanzas.

## 7. Dudas abiertas

- Lista exacta y frecuencia de los listados que hoy genera Cowork en LISTADOS
  AUTOMATIZADOS (nombre de fichero, cada cuánto, qué opciones de GeminisWin se
  usan). Hace falta para replicarlos uno a uno.
- Si las compras anuales y por proveedor se basan en pedidos o en facturas de
  proveedor.
- Si en el futuro se quiere la fase C (lectura directa) y qué pantallas de
  Finanzas la usarían primero.

Para cualquier cambio en estos formatos: **se avisa antes en este documento**
y se prueba con un fichero real antes de tocar nada.

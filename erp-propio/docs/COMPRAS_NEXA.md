# Compras con NEXA (01/11/2026)

## Fase 3: borrador de pedido (01/11/2026)

Migración `20261101_compras_crear_pedido.sql`. **`fn_compras_crear_pedido(proveedor, lineas, almacen, observaciones, tienda)`**
(nivel 3 en NEXA): crea el pedido a proveedor en estado «pendiente» (sin confirmar ni mover stock), con el número de
`fn_siguiente_numero`, los precios/descuentos del proveedor (o del artículo), IGIC y totales calculados igual que
`calcularCompra` (sin descuento de pie ni gastos). Hace lo mismo que «Generar pedidos» del Gestor; Rober lo revisa y lo
confirma él en Compras → Gestor de Pedidos a Proveedores. **Peticiones:** el borrador NO las toca (solo informa de cuántas abiertas incluye, `peticiones_abiertas_incluidas`). Ver «Estados» más abajo. Probado con 2 artículos de Esselte (transacción deshecha):
totales cuadrados y auditoría de cabecera y líneas.

## Estados: del borrador a la petición resuelta (flujo de Rober, automático desde 01/11/2026)

Migración `20261101_peticiones_flujo_estados.sql` (triggers en `pedido_proveedor` y `pedido_proveedor_linea`):

| Paso | Pedido a proveedor | Peticiones de clientes |
|---|---|---|
| NEXA (o el Gestor) genera el pedido | `pendiente`: se edita y se manda al proveedor como **propuesta** | siguen `pendiente` (su cantidad ya cuenta como «pendiente de recibir», así que no se vuelven a pedir) |
| Se compara con la propuesta valorada del proveedor, se edita y se graba como pedido **aceptado** | `confirmado` (o conformado / pend. entrega) | **`tramitada`**, sola, al cambiar el estado o al guardar las líneas de un pedido ya aceptado (la ficha guarda primero la cabecera y luego las líneas) |
| Se recibe y se **liquida** el albarán (chequeo de almacén, venta y contabilidad; entra el stock) | `liquidado` | **`resuelta`**, sola, lista para la facturación |

Antes el ERP daba las peticiones por tramitadas al **generar** el pedido (Gestor → Propuestas y Peticiones → Tramitar): si luego
no había stock, quedaban tramitadas para siempre. Ya no: esas dos pantallas dejan las peticiones `pendiente`
(`TabPropuestas.tsx`, `peticiones.ts`). `fn_compras_tramitar_peticiones` queda como llamada manual (la usa NEXA solo si se lo
piden). Si el trigger falla (p. ej. petición de un periodo cerrado) avisa pero no impide guardar el pedido. Los abonos no
tramitan peticiones.

**Qué peticiones entran en un pedido:** solo las del proveedor de ese pedido, o sin proveedor si el proveedor está entre
los de la ficha del artículo (habitual o en `articulo_proveedor`: un artículo puede tener varios proveedores y aparecerá en
la propuesta de cada uno). Esto vale para sumarlas a la necesidad (`fn_compras_gestor_proveedor`) y para tramitarlas.

## Listado «Peticiones resueltas por proveedor» (PET-0001)

Fuente `peticiones` del Generador, con las columnas de proveedor del pedido, cliente, nº de pedido y recepción. El Generador tiene
ahora la opción **«Separar con un título y una hoja por cada…»** (pestaña *Agrupar*, campo `separar` de la definición): el listado sale en
bloques, cada uno con su título, y **al imprimir o sacar el PDF cada bloque empieza en una hoja nueva**. PET-0001 la lleva activada
por proveedor. Funciona con cualquier columna de texto y con cualquier fuente.

## Fase 2: el Gestor de Pedidos a Proveedores de Rober hecho función

Migración `20261101_compras_gestor.sql`. **`fn_compras_gestor_proveedor(proveedor, desde)`** (nivel 1, solo lee) copia su método:
lo vendido desde la **última compra al proveedor** (`pedido_proveedor`, o `desde` si se pasa), el stock actual, lo **pendiente de
recibir** (pedidos a proveedor sin recibir) y lo **comprometido a clientes** (`pedido_cliente` sin anular, entregar ni cerrar, más las **peticiones abiertas**, que se suman a lo que hay que pedir).
Regla: `disponible = stock + pendiente − comprometido`; `necesidad = venta diaria × (días desde la última compra, máx. 90 + plazo de entrega)`; si `disponible ≥ necesidad` no se pide, si no se pide la diferencia. **Plazo de entrega**: el de la ficha del proveedor (`dias_entrega`) o 20 días si no lo tiene (casi todos tardan 15-20 días hasta Canarias; los 3 de informática, una semana).
Decisión por línea: `pedir`, `no_pedir` o `dudosa` (llega justo con menos de un 25 % de margen, venta aislada de 1 unidad,
periodo de menos de 7 días, stock negativo) con el **motivo**. Excluye los artículos `00003…` (pedidos expresos de cliente).
Usa el proveedor habitual del artículo. Aún no crea el pedido ni concilia con la propuesta valorada del proveedor.

## Fase 1: mínimos y máximos desde el histórico

Migración `supabase/migrations/20261101_compras_nexa.sql` (aplicada en la base). Todo es SECURITY INVOKER:
actúa con los permisos de quien lo llama. Dadas de alta en `nexa_operacion` con su receta.

| Función | Qué hace | Nivel NEXA |
|---|---|---|
| `fn_compras_calcular_minimos(meses, cobertura_dias, z, plazo_defecto)` | Por artículo: demanda semanal media y desviación sobre el histórico de ventas (`movimiento_stock`, tipo `venta`, devoluciones restan). Mínimo = demanda diaria × plazo del proveedor + z × desviación semanal × √(plazo/7). Máximo = mínimo + demanda diaria × cobertura. Devuelve también la **confianza** | 1 (solo lee) |
| `fn_compras_propuesta_pedidos(proveedor)` | Artículos con stock + pendiente de recibir ≤ mínimo aprobado, agrupados por proveedor habitual, con la cantidad que lleva al máximo | 1 (solo lee) |
| `fn_compras_aplicar_minimos(confianza_minima, proveedor, meses, cobertura)` | Escribe mínimo/máximo en `articulo` (solo los que cambian y de la confianza pedida o mejor; por defecto solo «alta») | 4 (con motivo) |

**Confianza:** «insuficiente» (menos de 90 días de histórico o sin ventas: no propone), «baja», «media»
(≥180 días y ≥6 semanas con ventas), «alta» (≥365 días y ≥12 semanas con ventas).

**Plazo del proveedor:** `proveedor.dias_entrega`; si no lo tiene, 7 días y la fila sale con `plazo_supuesto`.

**Limitaciones conocidas**
- **13/11/2026: ya calcula con el histórico de GeminisWin.** El resumen HIST_VENTAS (ventas por artículo, almacén y
  mes, 2023-11 a 2026-10) está en `venta_historico_mensual` (256.270 filas; `fn_carga_gw_hist_ventas()` la rellena
  desde `carga_dbf`, repetible). `fn_compras_calcular_minimos` trabaja ahora por MESES: histórico + ventas del ERP
  de los meses posteriores al último del histórico. Con los 2.000 artículos cargados: 1.414 con confianza alta,
  281 media y 262 baja. El histórico trae 36.874 artículos: el resto entrará al completar el catálogo.
  (Nota anterior, ya superada:) Hoy el ERP solo tiene las ventas de prueba desde el 23/10: todo sale «insuficiente». Falta cargar el histórico
  de ventas de GeminisWin (encargo a Cowork, nota 96 de `coordinacion_notas`).
- No corrige la estacionalidad (vuelta al cole): para eso hace falta ≥ 1 año completo.
- Aún no crea los pedidos: la fase 2 convertirá `fn_compras_propuesta_pedidos` en borradores de `pedido_proveedor`
  (nivel 2-3, con `fn_siguiente_numero`), respetando `compra_minima`.

## Plazos de entrega de los proveedores (01/11/2026)

Los `dias_entrega` que venían de GeminisWin no eran reales (había -1, 1, 2, 8, 10…). Por indicación de Rober se
cambiaron en bloque, por tipo de proveedor (340 fichas, auditadas con su valor anterior): **informática y consumibles**
(EXADI 04062, INFORPOR 04030, UFP 04075, MUCHO CARTUCHO 04090) → **7 días**; **locales** (código `50…`) → **3 días**;
**resto** → **20 días** (el punto medio de 15-20). Se dejaron como estaban los acreedores contables (`60…`/`61…`) y los
proveedores de baja. Cada proveedor puede afinarse luego en su ficha.

> Nota de limpieza: al aplicar la fase 2 en la base, Supabase pedía confirmación para el `DROP FUNCTION`, así que la
> versión antigua se renombró a `fn_compras_gestor_proveedor_antigua(text, date)` (sin permisos para nadie) en lugar
> de borrarla. Se puede eliminar con `drop function` cuando haya alguien delante para confirmar.

## Pedidos de informática (pendiente, no se toca por ahora)

Se hacen **una vez a la semana y se subastan entre tres proveedores** (EXADI, INFORPOR, UFP): el pedido se pasa a los
tres, devuelven sus precios, se cruzan y se adjudica cada línea al mejor postor **con algunas reglas** (por definir con
Rober); se prepara un pedido por proveedor y se envía por correo. Hoy ya está automatizado en el GeminisWin actual (Skills
`generar-pedido-informatica-geminiswin` e `importar-pedidos-informatica-geminiswin`), así que de momento NEXA no lo
sustituye. MUCHO CARTUCHO (consumibles) no entra en esa subasta. El Gestor de compras (`fn_compras_gestor_proveedor`)
vale para el resto de proveedores no locales.

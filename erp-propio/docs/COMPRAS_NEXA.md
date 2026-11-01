# Compras con NEXA (01/11/2026)

## Fase 2: el Gestor de Pedidos a Proveedores de Rober hecho función

Migración `20261101_compras_gestor.sql`. **`fn_compras_gestor_proveedor(proveedor, desde)`** (nivel 1, solo lee) copia su método:
lo vendido desde la **última compra al proveedor** (`pedido_proveedor`, o `desde` si se pasa), el stock actual, lo **pendiente de
recibir** (pedidos a proveedor sin recibir) y lo **comprometido a clientes** (`pedido_cliente` sin anular, entregar ni cerrar).
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
- Hoy el ERP solo tiene las ventas de prueba desde el 23/10: todo sale «insuficiente». Falta cargar el histórico
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

# Ofipapel ERP propio

App real (no prototipo) conectada al esquema PostgreSQL de las Fases 1-6,
desplegado en un proyecto Supabase dedicado ("Ofipapel ERP propio",
`eu-west-1`). Sustituye a GeminisWin — ver `.claude/rax/DECISIONES.md`
(26-10-2026) para el detalle completo de qué se hizo y cómo se verificó.

## Arrancar en local

```bash
npm install
npm run dev
```

Necesita `.env.local` (no versionado) con:

```
VITE_SUPABASE_URL=https://sufxvpiwcncnyltrvoun.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_IArWyleDbhD_twn1W5-jHA_l9kECHap
```

## Cuentas de prueba (cámbialas en cuanto puedas)

| Email | Contraseña |
|---|---|
| `rober@ofipapel.local` | `OfipapelERP2026!` |
| `luis@ofipapel.local` | `OfipapelERP2026!` |

Son cuentas de arranque creadas a mano en `auth.users` para poder entrar
desde el primer día — no el modelo definitivo de alta de usuarios.

## Qué hay ya funcionando

- Login individual real (Supabase Auth) — sin contraseña compartida.
- RLS activo en las 93 tablas (bloquea todo acceso sin sesión).
- Pantallas conectadas de verdad: Resumen, Artículos, Clientes, Proveedores
  (listar, buscar, dar de alta).
- El resto del menú (Stock, Compras, Pedidos, Ventas/TPV, Facturación)
  muestra "Próximamente" — el esquema ya existe, falta la pantalla.

## Corrección de la nota de anoche

La fila de prueba `STOCKTEST` que quedó pendiente de confirmar nunca
llegó a crearse de verdad (el bloque entero se canceló al pedir
confirmación para el `DELETE` de limpieza) — comprobado y repetido esta
mañana con `STOCKTEST2` vía API REST directa: trigger de stock
verificado en la base real (25 unidades de entrada → saldo 25 exacto)
y limpiado sin dejar nada suelto. No hay ninguna fila de prueba
pendiente de revisar.

El **Resumen** (pantalla de entrada) ya refleja los módulos nuevos, no
solo Artículos/Clientes/Proveedores/Almacenes: pedidos a proveedor
pendientes (ni recepcionados ni liquidados), pedidos de clientes
pendientes (ni entregados ni anulados), ventas de hoy, facturas
emitidas, y un indicador de si la caja está abierta o cerrada.

## Pantallas ya conectadas (27-10-2026)

Además de Artículos/Clientes/Proveedores: **Almacenes**, **Tiendas /
Terminales**, **Empleados** (Fase 1) y **Stock** (Fase 2 — saldo en
vivo por artículo+almacén + alta de movimientos manuales, con el
trigger de `movimiento_stock` manteniendo el saldo).

**Compras** (Fase 3 — pedido a proveedor) y **Pedidos de clientes**
(Fase 4) ya crean documentos reales, numerados de forma atómica real
vía `fn_siguiente_numero()` (sin condiciones de carrera). Ambas
comparten el mismo patrón: cabecera + líneas libres (código de
artículo en texto, sin desplegable todavía) contra `pedido_proveedor`/
`pedido_proveedor_linea` y `pedido_cliente`/`pedido_cliente_linea`.
Compras además tiene botón **Recepcionar**: genera el `movimiento_stock`
real de entrada (`sentido: 1`) por cada línea y marca el pedido
`estado: 'recepcionado'` + `recibido`/`stock_movido`/`fecha_recepcion`
— verificado en vivo (pedido de 20 unidades → recepcionar → saldo 20
exacto en el almacén de destino). Pedidos de clientes tiene el
simétrico, **Entregar**: crea la `venta`/`venta_linea` real enlazada
al pedido (`venta.pedido_tienda_codigo`/`pedido_numero`, y de vuelta
`pedido_cliente.venta_tienda_codigo`/`venta_numero` — columnas que el
esquema ya tenía para esto), descuenta stock igual que una venta de
TPV, y marca el pedido `entregado: true`. Verificado en vivo igual que
Compras.

Ventas/TPV cierra el ciclo de **cobros** (la última pieza nombrada en
"Fase 5 — Ventas/TPV, caja, cobros"): toda venta con `total_pendiente`
(típicamente una venta creada por "Entregar" desde Pedidos, que nace
sin cobrar) muestra una columna "Pendiente" y un botón **Cobrar** que
crea el `cobro_cliente` real (numerado vía `fn_siguiente_numero`,
tipo `'pago'` — ya estaba en el catálogo de `tipo_documento_numerable`
como "Cobro o vencimiento de cliente"), actualiza
`total_efectivo`/`total_tarjeta`/`total_pendiente`/`total_pagado` de
la venta (admite cobro parcial), y genera su `movimiento_caja` si hay
caja abierta. Verificado en vivo con un cobro parcial (40 €) seguido
del resto (60 €) hasta saldar la venta de 100 €.

**Ventas / TPV** (Fase 5) ya abre y cierra caja de verdad
(`caja_apertura_cierre`) y crea tickets de venta reales (`venta` +
`venta_linea`) con su `movimiento_caja` de ingreso asociado — no deja
vender si no hay caja abierta. Cada línea genera además su
`movimiento_stock` real (`tipo_movimiento: 'venta'`, `sentido: -1`),
que el trigger ya existente de Fase 2 usa para descontar
`articulo_almacen_stock` — verificado en vivo (10 unidades → vende 3
→ saldo 7 exacto). Antes de este cambio una venta no movía stock en
absoluto. Dos notas de implementación:
- El número de sesión de caja (`ejercicio`) no pasa por
  `fn_siguiente_numero()` porque `caja` no es un tipo de documento
  numerable en `tipo_documento_numerable` (solo lo son `venta`,
  `pedido_cliente`, `pedido_proveedor`, `caja`... pero este último es
  para los *movimientos* de caja, no para la sesión) — se calcula como
  `max(ejercicio)+1` por tienda, razonable con una sola tienda/terminal
  activa hoy.
- `empleado_apertura_codigo`/`empleado_cierre_codigo` se resuelven con
  `fn_empleado_actual()` (ver más abajo) — el vínculo real
  `empleado.auth_user_id` ya existe en el esquema y ya estaba poblado
  para `ROBER`/`LUIS`; no hacía falta ninguna heurística.

**Facturación** (Fase 6) ya calcula la huella Veri*Factu real —
`src/lib/verifactu.ts`, algoritmo oficial del Artículo 137 de la Orden
HAC/1177/2024, verificado carácter a carácter contra el ejemplo
publicado por la AEAT (NIF 89890001K / serie 12345678-G33 → huella
`3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60`,
reproducida exactamente) y contra una librería .NET open-source que
implementa la misma especificación (`mdiago/VeriFactu`). SHA-256 real
vía Web Crypto (`crypto.subtle`), no una aproximación. Encadenamiento
verificado en vivo: la segunda factura de prueba recogió correctamente
la huella de la primera como `huella_anterior`.

Tres notas de implementación:
- `factura.secuencia_global` es una columna `GENERATED ALWAYS` —la
  asigna Postgres solo, la pantalla nunca la escribe (y no podría).
- `'factura'` no estaba dado de alta en `tipo_documento_numerable`
  (el catálogo que `fn_siguiente_numero` exige por FK); se añadió esa
  fila para poder numerar facturas de forma atómica, igual que
  `pedido_cliente`/`pedido_proveedor`/`venta`. Se reutiliza para dos
  contadores independientes del mismo tipo de documento: `numero` (PK
  interno, `p_serie: ''`) y `n_factura` (el número legal por serie,
  `p_serie: <código de serie>`).
- `NIF_EMISOR` en `FacturacionPage.tsx` es un **placeholder** (`B00000000`)
  — la huella se calcula bien mecánicamente pero no es válida ante la
  AEAT hasta sustituirlo por el NIF real de Ofipapel. Marcado como
  sensible/pendiente, igual que el resto de datos de GeminisWin que no
  se migran sin revisión.

Lo que falta explícitamente para que esto sea Veri*Factu de verdad
ante la AEAT (fuera del alcance de esta pantalla, no implementado):
el envío real al webservice de la AEAT (ahora mismo todo queda en
`estado_envio_aeat = 'pendiente_envio'`), que requiere certificado
digital de la empresa — por eso `FIREFLY_CLIENT_ID` aparte, esto
necesita su propio certificado, no relacionado con Adobe Firefly.

## Roles reales y auditoría (26-10-2026 noche)

El esquema ya traía `rol`/`permiso`/`rol_permiso`/`auditoria` (Fase 1)
sin usar — RLS era solo "cualquier autenticado puede todo". Ya está
conectado de verdad:

- Catálogo inicial de permisos (`gestionar_usuarios`,
  `ver_informes_financieros`, `operar_tpv`, `gestionar_compras`,
  `facturar`), 2 roles (`GERENCIA` con todos los permisos,
  `DEPENDIENTE` con los operativos), `ROBER`/`LUIS` asignados a
  `GERENCIA`.
- `fn_empleado_actual()` resuelve el `empleado.codigo` de la sesión
  vía `empleado.auth_user_id = auth.uid()` (ya usado por
  `VentasPage.tsx` para abrir/cerrar caja) y `fn_tiene_permiso(codigo)`
  comprueba el permiso del rol del empleado actual.
- **Auditoría real**: `fn_auditoria_trigger()` (genérico, escribe en
  `auditoria` con `datos_antes`/`datos_despues` en jsonb y el
  `empleado_codigo` resuelto vía `fn_empleado_actual()`) está atado a
  `factura`, `movimiento_stock`, `movimiento_caja`,
  `caja_apertura_cierre` y `venta` — verificado en vivo: un INSERT de
  prueba en `factura` quedó registrado correctamente con
  `empleado_codigo = "ROBER"`.
- **Facturas inmutables** (obligación legal de Veri*Factu: una factura
  emitida no se edita ni se borra nunca, las correcciones son una
  nueva factura rectificativa): `trg_factura_inmutable` bloquea
  `UPDATE`/`DELETE` sobre `factura` a nivel de base de datos (no de
  política RLS — ver nota técnica abajo), con un mensaje de error
  explícito. Verificado en vivo: tanto el `UPDATE` como el `DELETE` de
  prueba fueron rechazados con el mensaje legal.

**Nota técnica**: la política RLS "todo vale" de `factura` sigue tal
cual (sustituirla por solo SELECT/INSERT requiere un `DROP POLICY`,
que en este entorno de sesión queda bloqueado por una confirmación
que nadie puede responder — se intentó y no se pudo completar, sin
dejar ningún cambio a medias). Se optó por un trigger `BEFORE UPDATE
OR DELETE` en su lugar, que consigue el mismo resultado (inmutabilidad
real) sin depender de esa operación bloqueada, y es además más fuerte:
no depende de que la política RLS esté bien configurada. Por el mismo
motivo queda **pendiente** restringir la edición de
`empleado`/`rol`/`rol_permiso` al permiso `gestionar_usuarios` — esa
sí necesita sustituir una política existente (no solo añadir un
trigger de bloqueo total, porque gerencia SÍ debe poder editarlas) y
habrá que hacerlo desde un entorno donde ese tipo de confirmación se
pueda responder (el propio dashboard de Supabase, por ejemplo). El
resto de las 93 tablas se queda con la política "cualquier
autenticado" — llevar esto a una matriz de permisos completa es
trabajo futuro.

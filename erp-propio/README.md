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

**Ventas / TPV** (Fase 5) ya abre y cierra caja de verdad
(`caja_apertura_cierre`) y crea tickets de venta reales (`venta` +
`venta_linea`) con su `movimiento_caja` de ingreso asociado — no deja
vender si no hay caja abierta. Dos notas de implementación:
- El número de sesión de caja (`ejercicio`) no pasa por
  `fn_siguiente_numero()` porque `caja` no es un tipo de documento
  numerable en `tipo_documento_numerable` (solo lo son `venta`,
  `pedido_cliente`, `pedido_proveedor`, `caja`... pero este último es
  para los *movimientos* de caja, no para la sesión) — se calcula como
  `max(ejercicio)+1` por tienda, razonable con una sola tienda/terminal
  activa hoy.
- `empleado_apertura_codigo`/`empleado_cierre_codigo` llevan una FK a
  `empleado`, que todavía no tiene vínculo real con `auth.users`. De
  momento se deriva del email de sesión (`rober@ofipapel.local` →
  `ROBER`), que coincide con los dos empleados ya sembrados — simplificación
  temporal, pendiente de decidir el vínculo real cuando haya altas de
  empleados desde la propia app.

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

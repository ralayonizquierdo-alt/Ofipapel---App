# Seguridad en la base de datos (RLS) — estado y plan

Proyecto Supabase `sufxvpiwcncnyltrvoun`. Inventario hecho el 28/10/2026 consultando
`pg_policies`, `pg_proc`, `pg_roles` y los permisos de tablas y funciones en la base real.
Migraciones: `supabase/migrations/20261028_seguridad_config.sql` (1.ª tanda, §2–§3) y
`supabase/migrations/20261028_seguridad_funciones.sql` (2.ª tanda, §5–§6).

## 1. Cómo está montado

- **Todas las tablas de `public` tienen RLS activada** (123 tablas, todas de `postgres`). Ninguna
  tiene `FORCE ROW LEVEL SECURITY`.
- **Sin sesión (`anon`) no se lee ni se escribe nada**: todas las políticas son `to authenticated`.
  `carga_dbf` y `coordinacion_notas` no tienen ninguna política (cerradas para la API).
- **El punto débil:** casi todas las tablas tienen una única política PERMISSIVE
  `autenticados_acceso_total_<tabla>` (`for all using (true) with check (true)`). Cualquier
  empleado con sesión puede leer y escribir cualquier tabla por la API REST, aunque la interfaz le
  muestre las opciones en gris. Los permisos por grupo (`rol_permiso`, `fn_mis_permisos`) son,
  hoy, solo de interfaz.
- Excepciones que ya existían antes de esta tanda:
  - `rol`, `rol_permiso`, `permiso`, `empresa`: restrictivas `admin_*` (solo administradores
    escriben).
  - `ejercicio`: alta y modificación solo administradores (permisivas), sin borrado.
  - `apunte`, `asiento`, `asiento_documento`: solo lectura (los escriben las funciones `fn_contab_*`).
  - `registro_facturacion`, `verifactu_configuracion`: solo lectura.
  - `web_configuracion`: lectura y modificación para todos; `web_sincronizacion_log`: lectura y alta.
  - `moneda_cotizacion`: lectura y alta. `parametro`: alta/modificación solo administradores
    (la lleva otra tanda, no se toca aquí).
- Triggers de protección que ya existían:
  - `trg_secuencia_proteger`: `authenticated`/`anon` no pueden tocar `secuencia_numeracion`
    directamente (solo vía `fn_siguiente_numero` y `fn_ajustar_contador`).
  - `trg_empleado_proteger_acceso`: solo un administrador cambia `rol_id`/`auth_user_id` de un
    empleado o borra uno con usuario.
  - `trg_registro_facturacion_inmutable`: un registro VeriFactu no se borra y solo puede cambiar
    su estado de envío.
  - `trg_rol_proteger_admin`: no se puede dejar el ERP sin grupo administrador.

### Quién ejecuta las funciones y si saltan RLS

- `postgres` tiene **BYPASSRLS** y es el dueño de todas las funciones.
- **44 funciones SECURITY DEFINER** → se ejecutan como `postgres` y **saltan RLS**. Las que
  escriben: `fn_siguiente_numero`, `fn_ajustar_contador` (comprueba administrador),
  `fn_auditoria_trigger`, `fn_verifactu_registrar` (no ejecutable por `authenticated`),
  `fn_verifactu_emitir_venta`, `fn_verifactu_anular_venta`, `fn_contab_guardar_asiento`,
  `fn_contab_renumerar`, `fn_contab_conciliar_auto`, `fn_contab_cuenta_cliente/proveedor/transportista`,
  `cargar_dbf_lote`, y los triggers `fn_venta_verifactu_bloqueo`, `fn_venta_linea_verifactu_bloqueo`,
  `fn_sincronizar_ruta_desde_ruta_reparto`. Antes de la 2.ª tanda solo `fn_ajustar_contador` y
  `fn_mis_permisos` comprobaban quién llama; la clasificación actual está en el §5.
- **142 funciones SECURITY INVOKER** → se ejecutan como el usuario (`authenticated`) y **sí
  respetan RLS**. Entre ellas `fn_carga_gw_*` (escriben `forma_pago`, `tienda_terminal`… pero se
  lanzan por SQL como `postgres`, ver `CARGA_GEMINISWIN.md`), `fn_ejercicio_activar` y
  `fn_nexa_consulta` (solo lectura: `transaction_read_only`).
- Edge Functions: `empleados-acceso` usa `service_role` (salta RLS, comprueba administrador);
  `nexa` usa la clave pública con el JWT del usuario (respeta RLS); `woocommerce-erp` no toca
  estas tablas.

## 2. Qué se ha cerrado en esta tanda

Políticas **RESTRICTIVE** nuevas (no se ha borrado ninguna existente). Una escritura tiene que
cumplir la permisiva *y* todas las restrictivas. La lectura no cambia.

| Tabla | Alta | Modificar | Borrar | Notas |
|---|---|---|---|---|
| `empresa` | admin | admin | admin | Ya estaba (20261027_archivo_maestros.sql) |
| `tienda_terminal` | admin | admin | admin | Solo la escribe Archivo → Tiendas |
| `forma_pago` | admin | admin | admin | Solo Archivo → Formas de Pago |
| `serie_facturacion` | admin **o** permiso `/facturacion` o `/generar-facturas` | admin | admin | Esas dos pantallas crean series sobre la marcha |
| `secuencia_numeracion` | admin | admin | admin | Ya lo impedía el trigger; los contadores avanzan por `fn_siguiente_numero` (DEFINER, no le afecta) |
| `verifactu_configuracion` | admin | admin | admin | Ya era solo lectura |
| `web_configuracion` | admin | admin | admin | Antes la modificaba cualquiera |
| `configuracion_contable`, `configuracion_contable_igic` | admin | admin | admin | |
| `empleado` | admin | admin | admin | Todos siguen leyendo (su ficha y el resto) |
| `ejercicio` | admin | admin | admin | Ya era así; se deja también como restrictiva |
| `nivel_tarifa`, `tipo_documento_numerable`, `tipo_documento_contable` | admin | admin | admin | Ninguna pantalla los escribe |
| `registro_facturacion` | nadie | nadie | nadie | Solo `fn_verifactu_registrar` (DEFINER) |
| `auditoria` | nadie | nadie | nadie | Solo `fn_auditoria_trigger` (DEFINER); no se pueden fabricar apuntes |

Además:
- `revoke truncate` a `anon` y `authenticated` en todas las tablas (TRUNCATE salta RLS; ningún
  cliente lo usa).
- `fn_siguiente_numero` y `fn_tiene_permiso` ya no las ejecuta `anon` (sin sesión se podían gastar
  números de documento y dejar huecos en la numeración).

«admin» = `fn_es_administrador()`: empleado activo con `auth_user_id = auth.uid()` y grupo con
`rol.es_administrador`.

**Comprobado antes de aplicar** que ningún flujo de empleado normal escribe en esas tablas: búsqueda
en `src/` (llamadas directas y los genéricos `useFichaMaestro`), en las Edge Functions y en el código
de todas las funciones SQL. Los únicos que escriben son pantallas de administración (Archivo,
Contabilidad → Configuración, Web → Configuración, Utilidades → Ejercicios) y funciones DEFINER.

**No se ha restringido nada más** a propósito: las tablas de negocio siguen abiertas (ver §4).

## 3. Pruebas hechas (28/10/2026)

Por la API REST con el JWT de cada usuario:
- `prueba` (grupo DEPENDIENTE). Antes de la migración, un `PATCH forma_pago` (mismo valor)
  devolvía la fila modificada. Después:
  - `PATCH` a `forma_pago`, `empresa`, `empleado` (su propia ficha), `tienda_terminal`,
    `auditoria`, `registro_facturacion`, `secuencia_numeracion` → 0 filas afectadas.
  - `POST` a `forma_pago`, `serie_facturacion`, `auditoria` → 403 (`violates row-level security
    policy "admin_escribe_…"` / `"inmutable_alta_auditoria"`).
  - Sigue leyendo `empleado`, `tienda_terminal`, `forma_pago`, `empresa`; sigue escribiendo en
    `movimiento_caja`.
- `rober` (administrador): modifica `forma_pago` 07 y la devuelve a su valor, `empresa`,
  `empleado`, `configuracion_contable` → filas devueltas, sin errores.

En navegador (Playwright, servidor local):
- `prueba`: venta de TPV en tienda 01, cliente 00001, artículo ZZTEST-001, cobro en efectivo →
  **venta 01-20 guardada**, con su línea, movimiento de stock, cobro, registro VeriFactu y apuntes
  de auditoría (los escribe el trigger DEFINER). Panel, Caja (aperturas y movimientos), Pedidos
  (lista y nuevo), Ventas, ficha de la venta, artículo, cliente, Reparaciones, Presupuestos: sin
  errores. Empresa y Formas de Pago: «sin permiso» (interfaz), como antes.
- `rober`: Empresa → cambia el comentario, guarda, lo vuelve a dejar vacío y guarda; TPV, Caja
  (aperturas, movimientos, listado), Pedidos (lista y nuevo), Formas de Pago, Tiendas, Empleados,
  Configuración Contable y Web: sin errores. No se abrió ni cerró caja: la de la tienda 01 ya
  estaba abierta (ejercicio 2).

## 4. Plan siguiente (por prioridad)

Hecho en la 2.ª tanda (ver §5): `fn_puede`, comprobación en las funciones peligrosas,
`cargar_dbf_lote`, borrado físico de maestros solo administradores. Queda:

1. **Contabilidad** (plan aparte, no tocado): `fn_contab_guardar_asiento`, `fn_contab_renumerar`,
   `fn_contab_anular_asiento`, `fn_contab_conciliar_auto`, `fn_contab_generar` y
   `fn_contab_cuenta_cliente/proveedor/transportista` (crean subcuentas) son DEFINER y no
   comprueban quién llama → `fn_puede('/contabilidad/diario')`, `/contabilidad/generar`,
   `/contabilidad/conciliacion`…, y escritura de `cuenta_contable`, `extracto_bancario`,
   `extracto_movimiento` por `/contabilidad/...`.
2. **Alta y modificación de maestros por permiso de menú** (riesgo medio). Restrictivas
   `for insert` y `for update` con `fn_puede(...)`, una por tabla, aceptando la unión de las
   pantallas que la escriben:
   - `articulo` y sus hijas (`articulo_codigo_barras`, `articulo_tarifa_cantidad*`,
     `articulo_unidad_venta*`, `articulo_oferta`, `articulo_plu`, `articulo_variante`,
     `articulo_componente`, `articulo_equivalencia`, `articulo_proveedor`) → `/articulos`
     **o** `/almacen/...` (utilidades) **o** las pantallas que tocan campos derivados. Antes hay
     que pasar a triggers DEFINER los campos que actualizan el TPV y las compras
     (últimas ventas/compras, unidades pendientes) y `articulo_almacen_stock`; si no, la
     política tendría que admitir `/tpv`, `/ventas`, `/pedidos`, `/compras`… y no serviría.
   - `cliente`, `cliente_sucursal`, `cliente_contacto`, `cliente_articulo_precio`,
     `cuenta_bancaria` → `/clientes` (el TPV da de alta clientes rápidos: añadir `/tpv`, y
     `deuda_actual` la recalculan las funciones de cobro → mover a trigger).
   - `proveedor`, `articulo_proveedor` → `/proveedores` o `/compras...`.
   - `familia`, `marca`, `tipo_cliente`, `tipo_cliente_descuento_familia`, `plantilla_tarifa*`,
     `vendedor`, `tecnico`, `repartidor`, `transportista`, rutas y zonas, bancos, monedas,
     códigos postales → la ruta de su ficha (Archivo / Almacén / Ventas → maestros).
3. **Documentos de venta y compra** (riesgo alto si se hace mal): un guardado de TPV escribe en
   `venta`, `venta_linea`, `movimiento_stock`, `cobro_cliente`, `movimiento_caja`,
   `apertura_cajon` y actualiza `articulo`/`cliente`. Lo sensato es mover cada guardado a una
   RPC DEFINER que compruebe el permiso (`fn_guardar_venta`, `fn_guardar_pedido`…) y dejar esas
   tablas en solo lectura para `authenticated`. Hasta entonces, una restrictiva por permiso
   tendría que aceptar la unión de todas las pantallas que escriben la tabla (`/tpv` o
   `/ventas` o `/pedidos` o `/web/...`), y la importación web (`src/pages/web/importar.ts`).
   Borrados de líneas (`venta_linea`, `*_linea`, `inventario_linea`…) y de documentos
   (`pedido_cliente`, `factura_proveedor`, `peticion`, `inventario`, `caja_apertura_cierre`) los
   hace la interfaz en el uso normal: restringirlos al permiso de su pantalla, no a admin.
4. **Lectura** (último): limitar la lectura de `auditoria`, `empleado` (datos personales),
   `cuenta_bancaria` y contabilidad a quien tenga el permiso de la pantalla.
5. Funciones INVOKER que escriben y no están en el §5 (p. ej. `fn_ejercicio_activar`,
   importaciones web): respetan RLS, así que quedarán cubiertas por los puntos 2–3; revisar si
   alguna necesita además su `fn_puede`.

Cada paso, como en estas tandas: políticas RESTRICTIVE nuevas, nunca `drop policy`; prueba con
`prueba` (DEPENDIENTE) y `rober` (administrador) por API y en navegador.

## 5. 2.ª tanda: quién puede llamar a cada función (28/10/2026)

### `fn_puede(p_codigo)`

SECURITY DEFINER, STABLE, `search_path = public, pg_temp`; `anon` no la ejecuta. Verdadero si:
- el usuario es **administrador activo** (`fn_es_administrador()`), o
- su **empleado está activo** y su grupo tiene ese código, o una ruta de la que cuelga
  (`/clientes` permite `/clientes/lista`), o una `REDIRECCIONES` cuyo destino lo cubre — igual
  que `rutaPermitida` de `src/lib/permisos.ts` (**si cambias `REDIRECCIONES` allí, cámbialas
  también en `fn_puede`**), o
- es una llamada interna sin usuario de la API (SQL como `postgres`/`supabase_admin`, o
  `service_role` de las Edge Functions): cargas y mantenimiento siguen funcionando.

`fn_tiene_permiso` (código exacto) exige ahora también empleado activo. `fn_es_cowork()`:
el usuario conectado es `cowork@ofipapel.local`, mirado por su id en `auth.users` (no por el
texto del JWT).

### Las 44 funciones SECURITY DEFINER

| Clase | Funciones | Por qué |
|---|---|---|
| **Protegida ahora** | `cargar_dbf_lote` | Solo `fn_es_cowork()` o administrador (antes miraba el email del JWT) |
| | `fn_verifactu_anular_venta` | `/ventas` o `/tpv` (DEPENDIENTE la tiene: anula desde la ficha de la venta) |
| | `fn_verifactu_anular_factura` | `/facturacion` (la llama `fn_anular_factura_cliente`, misma regla) |
| | `fn_empleado_usuarios_acceso` | `/empleados` (devuelve emails y último acceso); sin permiso, lista vacía |
| **Segura** (solo lee o ya comprueba) | `fn_es_administrador`, `fn_tiene_permiso`, `fn_puede`, `fn_es_cowork`, `fn_mis_permisos`, `fn_empleado_actual`, `fn_factura_anulada`, `fn_ultimo_numero_usado`, `fn_verifactu_nif_emisor` | Lectura de lo del propio usuario o de datos ya visibles |
| | `fn_ajustar_contador` | Ya comprueba administrador |
| | `fn_siguiente_numero` | La usan todas las fichas al guardar; `anon` no la ejecuta (1.ª tanda) |
| | `fn_verifactu_emitir_venta` | Idempotente: si la venta ya tiene alta, la devuelve; la emite el trigger al guardar |
| | `fn_verifactu_registrar`, `fn_contab_crear_asiento`, `fn_contab_anular_interno` | `authenticated` no las ejecuta |
| | Triggers: `fn_auditoria_trigger`, `fn_factura_verifactu_alta_trg`, `fn_venta_verifactu_emitir_trg`, `fn_venta_verifactu_bloqueo`, `fn_venta_linea_verifactu_bloqueo`, `fn_sincronizar_ruta_desde_ruta_reparto` | Una función de trigger no se puede llamar por RPC |
| **Pendiente (Contabilidad)** | `fn_contab_guardar_asiento`, `fn_contab_anular_asiento`, `fn_contab_renumerar`, `fn_contab_conciliar_auto`, `fn_contab_generar`, `fn_contab_cuenta_cliente`, `fn_contab_cuenta_proveedor`, `fn_contab_cuenta_transportista` | Escriben asientos/cuentas sin comprobar quién llama. Plan aparte |
| | `fn_contab_347`, `fn_contab_cfg`, `fn_contab_cobro_en_ticket`, `fn_contab_cuenta_cobro`, `fn_contab_cuenta_igic`, `fn_contab_desglose_*`, `fn_contab_libro_igic`, `fn_contab_mayor`, `fn_contab_subcuenta`, `fn_contab_sumas_saldos`, `fn_contab_tipo_igic` | Solo leen, pero dan toda la contabilidad a cualquier empleado: limitar por `/contabilidad/...` en el mismo plan |

### Funciones INVOKER que modifican en bloque, protegidas también

Respetan RLS, pero mientras las tablas de negocio sigan abiertas cualquiera podía lanzarlas
por la API. Comprobación al principio (marca `[seguridad 20261028]` en el cuerpo):

| Función | Permiso (cualquiera vale) |
|---|---|
| `fn_anular_factura_cliente`, `fn_rectificar_factura_cliente` | `/facturacion` |
| `fn_facturar_albaranes` | `/generar-facturas` |
| `fn_cobro_cliente_cobrar`, `fn_cobro_cliente_anular` | `/cobros-clientes/ficha`, `/gestor-cobros-clientes`, `/facturacion` |
| `fn_cliente_recalcular_deuda`, `fn_cliente_recalcular_deuda_deshacer` | `/recalcular-deuda` |
| `fn_stock_cero_familia_aplicar` | `/almacen/stock-cero-familia` |
| `fn_recalcular_stock_aplicar` | `/almacen/recalcular-stock` |
| `fn_punto_restauracion_crear`, `fn_punto_restauracion_restaurar` | `/almacen/puntos-restauracion` |
| `fn_articulos_eliminacion_baja` | `/almacen/eliminacion-articulos` |
| `fn_articulos_en_blanco_baja` | `/almacen/articulos-en-blanco` |
| `fn_articulos_bloque`, `fn_modificacion_articulos_aplicar` | `/almacen/modificacion-bloque` |
| `fn_liquidacion_comisiones_liquidar`, `fn_liquidacion_comisiones_anular` | `/liquidacion` |
| `fn_carga_gw_*` (25) | Sin `execute` para `anon`/`authenticated`: se lanzan por SQL como `postgres` |

Comprobado antes: quién las llama en `src/` (cada una desde su pantalla) y en otras funciones
SQL (solo `fn_anular_factura_cliente` → `fn_verifactu_anular_factura`, mismo permiso). Los
cobros del TPV **no** pasan por `fn_cobro_cliente_cobrar` (los escribe `VentaDocumento`
directamente), así que el TPV de DEPENDIENTE no se ve afectado. El código de «Pagos de
Clientes» es `/cobros-clientes/ficha` (no `/cobros-clientes`).

### Borrado físico de maestros: solo administradores

Restrictivas nuevas `admin_borra_<tabla>` (`for delete to authenticated using
fn_es_administrador()`) en: `articulo`, `cliente`, `proveedor`, `familia`, `marca`, `vendedor`,
`tecnico`, `repartidor`, `transportista`, `almacen`, `zona_territorial`, `ruta_reparto`, `ruta`,
`tipo_cliente`, `codigo_postal`, `banco`, `banco_sucursal`, `moneda`, `zona_servicio`,
`plantilla_tarifa`, `provincia`, `pais`.

**No** se restringen las tablas hijas que la interfaz borra en el uso normal (búsqueda de
`.delete()` en `src/`): `articulo_codigo_barras`, `articulo_tarifa_cantidad*`,
`articulo_unidad_venta*`, `articulo_oferta`, `articulo_plu`, `articulo_variante`,
`articulo_componente`, `articulo_equivalencia`, `cliente_sucursal`, `cliente_contacto`,
`cliente_articulo_precio`, `cuenta_bancaria`, `ruta_reparto_zona`, `ruta_reparto_repartidor`,
`tipo_cliente_descuento_familia`, `plantilla_tarifa_nivel`, líneas de documentos, etc. Ninguna
función SQL borra en las tablas restringidas.

Con RLS un borrado no permitido no da error: borra 0 filas. Por eso `useFichaMaestro.eliminar`,
`ZonaFichaPage` y `RutaFichaPage` piden ahora la fila borrada (`.select('codigo')`) y, si no
vuelve ninguna, dicen «Solo un administrador puede eliminar registros…» en vez de quitarla de
la lista.

## 6. Pruebas de la 2.ª tanda (28/10/2026)

Por la API REST con el JWT de cada usuario:

| Llamada | `prueba` (DEPENDIENTE) | `rober` (administrador) |
|---|---|---|
| `fn_puede('/tpv')`, `/ventas`, `/caja/movimientos`, `/caja/apertura`, `/clientes/lista` | true | true |
| `fn_puede('/facturacion')`, `/recalcular-deuda`, `/almacen/recalcular-stock` | false | true |
| `cargar_dbf_lote([])` | 403 `42501` | 200 → 0 |
| `fn_verifactu_anular_factura` / `fn_anular_factura_cliente` (factura inexistente) | 403 `42501` | 400 «no tiene registro VeriFactu» (pasa la comprobación) |
| `fn_verifactu_anular_venta` (venta inexistente) | 400 «No existe la venta» (tiene `/ventas`) | igual |
| `fn_cliente_recalcular_deuda`, `fn_stock_cero_familia_aplicar`, `fn_articulos_eliminacion_baja`, `fn_liquidacion_comisiones_anular` | 403 `42501` | pasan la comprobación |
| `fn_empleado_usuarios_acceso()` | `[]` | lista de usuarios |
| `DELETE articulo ZZTEST-001`, `DELETE cliente 00001` | 200 `[]` (0 filas: RLS) | — |
| Banco de prueba `ZZ99`: alta (rober) → `DELETE` (prueba) → baja lógica `activo=false` (rober) → `DELETE` (rober) | `[]` | alta, baja y borrado con la fila devuelta |
| `fn_puede` sin sesión (`anon`) | 401 `permission denied` | |

`cowork`, por SQL simulando su JWT (`request.jwt.claims` con su `sub`, rol `authenticated`):
`fn_es_cowork()` = true, `fn_es_administrador()` = false, `fn_puede('/tpv')` = false,
`cargar_dbf_lote('[]')` = 0 (pasa).

En navegador (Playwright, `VITE_BASE_PATH=/ npx vite --port 5185`): `prueba`, venta de TPV en
tienda 01, cliente 00001, ZZTEST-001, cobro → **«Venta Nº 21 guardada.»**, sin errores de la API.

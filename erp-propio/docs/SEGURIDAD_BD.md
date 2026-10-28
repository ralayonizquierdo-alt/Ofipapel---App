# Seguridad en la base de datos (RLS) — estado y plan

Proyecto Supabase `sufxvpiwcncnyltrvoun`. Inventario hecho el 28/10/2026 consultando
`pg_policies`, `pg_proc`, `pg_roles` y los permisos de tablas y funciones en la base real.
Migración de esta tanda: `supabase/migrations/20261028_seguridad_config.sql`.

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
  `fn_sincronizar_ruta_desde_ruta_reparto`. **Solo `fn_ajustar_contador` y `fn_mis_permisos`
  comprueban quién llama**; el resto confía en que solo las llame la interfaz.
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

## 4. Propuesta siguiente (por prioridad)

1. **Funciones DEFINER sin comprobación** (riesgo alto, cambio pequeño). Añadir al principio de
   cada una `if not public.fn_puede('<permiso>') then raise exception … using errcode='42501'`:
   - `cargar_dbf_lote` → solo administrador o el usuario de carga (`cowork`; hoy no tiene empleado:
     darle uno en un grupo «CARGA» o comprobar su `auth.uid()`).
   - `fn_contab_guardar_asiento`, `fn_contab_renumerar`, `fn_contab_anular_asiento`,
     `fn_contab_conciliar_auto`, `fn_contab_generar` → permisos `/contabilidad/...`.
   - `fn_verifactu_anular_venta` / `fn_verifactu_anular_factura` → `/ventas` / `/facturacion`.
2. **Una función única de permiso para las políticas**: `fn_puede(codigo text)` =
   `fn_es_administrador() or exists(... e.activo and rp.permiso_codigo = codigo)`. Ojo:
   `fn_tiene_permiso` hoy no mira `empleado.activo`; corregirlo o sustituirlo.
3. **Borrados** (riesgo medio, muy acotado): restrictiva `for delete` solo administradores en
   maestros (`cliente`, `proveedor`, `articulo`, `familia`, `marca`, tarifas, `banco`,
   `cuenta_bancaria`, `cuenta_contable`, `vendedor`, `repartidor`, `tecnico`, rutas y zonas).
   Antes, buscar en `src/` los `.delete()` de cada una (p. ej. `AperturasCierresPage` borra en
   `caja_apertura_cierre`; las fichas de documentos borran sus líneas al reescribirlas).
4. **Escritura de maestros por permiso de menú** (riesgo medio): restrictivas
   `insert/update` con `fn_puede('/articulos')` en `articulo*`, `/clientes` en `cliente*`,
   `/proveedores` en `proveedor`, `articulo_proveedor`, etc. Cuidado con los efectos laterales:
   el TPV y las compras actualizan campos de `articulo` (últimas ventas/compras, unidades
   pedidas) y `articulo_almacen_stock`; esos campos deberían pasar a triggers DEFINER antes de
   cerrar la tabla, o la política tiene que admitir también los permisos de venta/compra.
5. **Documentos de venta y compra** (riesgo alto si se hace mal): un guardado de TPV escribe en
   `venta`, `venta_linea`, `movimiento_stock`, `cobro_cliente`, `movimiento_caja`,
   `apertura_cajon`. Lo sensato es mover cada guardado a una RPC DEFINER que compruebe el permiso
   (`fn_guardar_venta`, `fn_guardar_pedido`…) y entonces dejar esas tablas en solo lectura para
   `authenticated`. Hasta entonces, una restrictiva por permiso tendría que aceptar la unión de
   todas las pantallas que escriben la tabla (`/tpv` o `/ventas` o `/pedidos` o `/web/...`).
6. **Contabilidad y bancos**: `configuracion_contable*` ya están cerradas; `cuenta_contable`,
   `extracto_bancario`, `extracto_movimiento`, `banco`, `cuenta_bancaria` siguen abiertas →
   escritura por `/contabilidad/...`.
7. **Lectura** (último): limitar la lectura de `auditoria`, `empleado` (datos personales),
   `cuenta_bancaria` y contabilidad a quien tenga el permiso de la pantalla.

Cada paso, como en esta tanda: políticas RESTRICTIVE nuevas, nunca `drop policy`; prueba con
`prueba` (DEPENDIENTE) y `rober` (administrador) por API y en navegador.

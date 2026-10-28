-- Seguridad en la base de datos (2.ª tanda): quién puede llamar a las funciones peligrosas y
-- quién puede BORRAR maestros. Inventario, clasificación de las 44 funciones SECURITY DEFINER,
-- pruebas y pendientes en docs/SEGURIDAD_BD.md.
--
-- 1) fn_puede(codigo): la misma regla que src/lib/permisos.ts → rutaPermitida, en la base.
--    fn_tiene_permiso pasa a exigir también empleado activo.
-- 2) Comprobación de quién llama al principio de las funciones que modifican datos en bloque,
--    anulan/rectifican documentos VeriFactu o cargan datos. Se inyecta un `if not … raise` justo
--    después del primer BEGIN de cada función, sobre su definición actual (pg_get_functiondef),
--    para no copiar aquí cuerpos de cientos de líneas que mantienen otras tandas. Lleva la marca
--    «[seguridad 20261028]» y no se vuelve a inyectar si ya está: la migración es idempotente.
--    NO se tocan las funciones de Contabilidad (fn_contab_*): tienen un plan aparte.
-- 3) DELETE físico en maestros: solo administradores (políticas RESTRICTIVE nuevas). Las tablas
--    hijas que la interfaz borra en el uso normal (códigos de barras, sucursales, contactos,
--    líneas…) NO se restringen.
-- Sin DROP / DELETE / TRUNCATE.

-- ---------------------------------------------------------------------------------------------
-- 1) Helpers de permiso
-- ---------------------------------------------------------------------------------------------

-- Permiso exacto (código de rol_permiso) de un empleado ACTIVO. Lo usa la política de alta de
-- serie_facturacion (20261028_seguridad_config.sql).
create or replace function public.fn_tiene_permiso(p_permiso_codigo text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.empleado e
    join public.rol_permiso rp on rp.rol_id = e.rol_id
    where e.auth_user_id = auth.uid()
      and e.activo
      and rp.permiso_codigo = p_permiso_codigo
  );
$$;

-- ¿El usuario conectado puede usar esta opción? p_codigo = ruta de la pantalla («/facturacion»,
-- «/almacen/recalcular-stock») o «accion:<acción>». Igual que rutaPermitida (src/lib/permisos.ts):
--   - administrador activo → sí;
--   - empleado activo cuyo grupo tiene ese código, o una ruta de la que cuelga
--     («/clientes» permite «/clientes/lista»);
--   - REDIRECCIONES: «/caja/apertura» permite «/caja/aperturas» y al revés se pide el destino.
--     Si cambias REDIRECCIONES en permisos.ts, cámbialas también aquí.
--   - Llamadas internas sin usuario de la API (SQL como postgres: cargas y mantenimiento;
--     Edge Functions con service_role): sí, como hasta ahora.
create or replace function public.fn_puede(p_codigo text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with red(origen, destino) as (
    values ('/caja', '/caja/aperturas'), ('/caja/apertura', '/caja/aperturas'),
           ('/caja/cierre', '/caja/aperturas'), ('/compras', '/pedidos-proveedor'),
           ('/pagos', '/pagos-proveedor'), ('/stock', '/almacen/listados-articulos')
  ),
  objetivo(c) as (
    select nullif(btrim(p_codigo), '')
    union
    select red.destino from red where red.origen = btrim(p_codigo)
  )
  select
    (auth.uid() is null and (coalesce(auth.role(), '') = 'service_role' or session_user in ('postgres', 'supabase_admin')))
    or public.fn_es_administrador()
    or exists (
      select 1
      from public.empleado e
      join public.rol_permiso rp on rp.rol_id = e.rol_id
      left join red on red.origen = rp.permiso_codigo
      join objetivo o on o.c is not null
      where e.auth_user_id = auth.uid()
        and e.activo
        and (
          rp.permiso_codigo = o.c
          or (left(rp.permiso_codigo, 1) = '/' and starts_with(o.c, rp.permiso_codigo || '/'))
          or (red.destino is not null and (o.c = red.destino or starts_with(o.c, red.destino || '/')))
        )
    );
$$;
revoke all on function public.fn_puede(text) from public, anon;
grant execute on function public.fn_puede(text) to authenticated, service_role;
comment on function public.fn_puede(text) is 'Permiso de pantalla (ruta) o acción del usuario conectado, con la misma regla que src/lib/permisos.ts (rutaPermitida). Administradores siempre; SQL interno (postgres/service_role) también.';

-- Usuario técnico de carga de GeminisWin (cowork@ofipapel.local). Se mira por su id en
-- auth.users (no por el texto del JWT).
create or replace function public.fn_es_cowork()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from auth.users u where u.id = auth.uid() and u.email = 'cowork@ofipapel.local');
$$;
revoke all on function public.fn_es_cowork() from public, anon;
grant execute on function public.fn_es_cowork() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 2) Funciones protegidas
-- ---------------------------------------------------------------------------------------------

-- Carga DBF: antes solo comprobaba el email del JWT de cowork; ahora cowork (por id) o un
-- administrador, con el código de error de permisos.
create or replace function public.cargar_dbf_lote(p jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare n integer;
begin
  if not (public.fn_es_cowork() or public.fn_es_administrador()) then
    raise exception 'No tienes permiso para cargar datos de GeminisWin.' using errcode = '42501';
  end if;
  insert into carga_dbf (tabla, clave, datos, cargado_en)
  select distinct on (e->>'t', e->>'k') e->>'t', e->>'k', e->'d', now()
  from jsonb_array_elements(p) e
  on conflict (tabla, clave) do update set datos = excluded.datos, cargado_en = now();
  get diagnostics n = row_count;
  return n;
end $function$;

-- Usuarios de acceso de los empleados (emails y último acceso): solo quien abre Empleados.
create or replace function public.fn_empleado_usuarios_acceso()
returns table(empleado_codigo text, usuario text, ultimo_acceso timestamp with time zone)
language sql
stable
security definer
set search_path = public
as $$
  select e.codigo, split_part(u.email, '@', 1), u.last_sign_in_at
  from public.empleado e join auth.users u on u.id = e.auth_user_id
  where public.fn_puede('/empleados');
$$;

-- Las cargas de GeminisWin (fn_carga_gw_*) se lanzan por SQL como postgres (CARGA_GEMINISWIN.md)
-- y ninguna pantalla las llama: la API ya no puede ejecutarlas (escriben maestros enteros).
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname like 'fn\_carga\_gw\_%'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- Comprobación al principio de cada función: función → pantallas que la usan (cualquiera vale).
do $$
declare
  r record;
  v_def text;
  v_pos int;
  v_cab text;
  v_cuerpo text;
  v_cond text;
  v_guarda text;
begin
  for r in
    select * from (values
      -- VeriFactu: anular una venta (Ventas o TPV, la misma ficha) o una factura.
      ('public.fn_verifactu_anular_venta(text,bigint,text)', array['/ventas', '/tpv'], 'anular ventas'),
      ('public.fn_verifactu_anular_factura(text,bigint,text)', array['/facturacion'], 'anular facturas'),
      ('public.fn_anular_factura_cliente(text,bigint,text,boolean)', array['/facturacion'], 'anular facturas'),
      ('public.fn_rectificar_factura_cliente(text,bigint,text)', array['/facturacion'], 'rectificar facturas'),
      ('public.fn_facturar_albaranes(jsonb,date,text,text,date,date,boolean,text)', array['/generar-facturas'], 'generar facturas'),
      -- Cobros de clientes (Pagos de Clientes, Gestor de cobros y la ficha de factura).
      ('public.fn_cobro_cliente_cobrar(jsonb)', array['/cobros-clientes/ficha', '/gestor-cobros-clientes', '/facturacion'], 'cobrar a clientes'),
      ('public.fn_cobro_cliente_anular(text,bigint,text)', array['/cobros-clientes/ficha', '/gestor-cobros-clientes', '/facturacion'], 'anular cobros'),
      -- Procesos en bloque.
      ('public.fn_cliente_recalcular_deuda(jsonb)', array['/recalcular-deuda'], 'recalcular la deuda de clientes'),
      ('public.fn_cliente_recalcular_deuda_deshacer(uuid)', array['/recalcular-deuda'], 'recalcular la deuda de clientes'),
      ('public.fn_stock_cero_familia_aplicar(text,text,boolean,text)', array['/almacen/stock-cero-familia'], 'poner a 0 el stock de una familia'),
      ('public.fn_recalcular_stock_aplicar(text,text,text)', array['/almacen/recalcular-stock'], 'recalcular el stock'),
      ('public.fn_punto_restauracion_crear(text,text,text,text,text,boolean)', array['/almacen/puntos-restauracion'], 'crear puntos de restauración de stock'),
      ('public.fn_punto_restauracion_restaurar(text,bigint,boolean)', array['/almacen/puntos-restauracion'], 'restaurar el stock'),
      ('public.fn_articulos_eliminacion_baja(text[])', array['/almacen/eliminacion-articulos'], 'dar de baja artículos'),
      ('public.fn_articulos_en_blanco_baja(text[])', array['/almacen/articulos-en-blanco'], 'dar de baja artículos en blanco'),
      ('public.fn_articulos_bloque(jsonb,jsonb,boolean,integer)', array['/almacen/modificacion-bloque'], 'modificar artículos en bloque'),
      ('public.fn_modificacion_articulos_aplicar(text)', array['/almacen/modificacion-bloque'], 'modificar artículos en bloque'),
      ('public.fn_liquidacion_comisiones_liquidar(jsonb,text)', array['/liquidacion'], 'liquidar comisiones'),
      ('public.fn_liquidacion_comisiones_anular(bigint)', array['/liquidacion'], 'anular liquidaciones')
    ) as t(firma, rutas, que)
  loop
    v_def := pg_get_functiondef(r.firma::regprocedure);
    continue when position('[seguridad 20261028]' in v_def) > 0;
    v_pos := position('AS $function$' in v_def);
    if v_pos = 0 then
      raise exception 'Formato inesperado en %', r.firma;
    end if;
    v_cab := left(v_def, v_pos + length('AS $function$') - 1);
    v_cuerpo := substr(v_def, v_pos + length('AS $function$'));
    if v_cuerpo !~* '\mbegin\M' then
      raise exception 'Sin BEGIN en %', r.firma;
    end if;
    select string_agg(format('public.fn_puede(%L)', x), ' or ') into v_cond from unnest(r.rutas) x;
    v_guarda := format(
      E'\n  -- [seguridad 20261028] solo quien tiene la pantalla (o administrador)\n'
      '  if not (%s) then\n'
      '    raise exception %L using errcode = ''42501'';\n'
      '  end if;',
      v_cond, 'No tienes permiso para ' || r.que || '.');
    -- Primer BEGIN del cuerpo (tras DECLARE). regexp_replace sin 'g' cambia solo el primero.
    v_cuerpo := regexp_replace(v_cuerpo, '\m([Bb][Ee][Gg][Ii][Nn])\M', '\1' || replace(v_guarda, '\', '\\'));
    execute v_cab || v_cuerpo;
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 3) Borrado físico de maestros: solo administradores
-- ---------------------------------------------------------------------------------------------
-- La interfaz da de baja (activo = false); el botón «Eliminar» de algunas fichas (familias,
-- marcas, zonas, rutas, bancos, monedas…) es tarea de administración. Las tablas hijas que se
-- borran en el uso normal (articulo_codigo_barras, cliente_sucursal, cliente_contacto,
-- cuenta_bancaria, ruta_reparto_zona, *_linea…) quedan como estaban.
do $$
declare
  t text;
begin
  foreach t in array array[
    'articulo', 'cliente', 'proveedor', 'familia', 'marca', 'vendedor', 'tecnico', 'repartidor',
    'transportista', 'almacen', 'zona_territorial', 'ruta_reparto', 'ruta', 'tipo_cliente',
    'codigo_postal', 'banco', 'banco_sucursal', 'moneda', 'zona_servicio', 'plantilla_tarifa',
    'provincia', 'pais']
  loop
    if to_regclass('public.' || t) is not null and not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'admin_borra_' || t
    ) then
      execute format('create policy %I on public.%I as restrictive for delete to authenticated using ((select public.fn_es_administrador()))', 'admin_borra_' || t, t);
    end if;
  end loop;
end $$;

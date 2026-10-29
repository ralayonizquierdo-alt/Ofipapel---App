-- Seguridad en la base de datos (3.ª tanda): ESCRITURAS en las tablas de negocio solo para quien
-- tiene permiso en alguna pantalla que legítimamente escribe en esa tabla. Mapa tabla → pantallas,
-- método y pruebas en docs/SEGURIDAD_BD.md §7–§8.
--
-- - fn_puede_alguno(text[]): la regla de fn_puede para varios códigos en UNA consulta. Admin y
--   llamadas internas (SQL como postgres, service_role) siempre pasan. El código especial
--   'carga' deja pasar además al usuario técnico cowork (fn_es_cowork) en las tablas que
--   rellenan las cargas de GeminisWin.
-- - Por tabla, tres políticas RESTRICTIVE nuevas (alta, modificación, borrado) con
--   `(select public.fn_puede_alguno(array[...]))`: el `select` hace que Postgres la evalúe una
--   vez por sentencia (InitPlan), no una vez por fila.
-- - Las lecturas NO cambian. No se borra ninguna política (las permisivas siguen; una escritura
--   tiene que cumplir además todas las restrictivas).
-- - Se aplica en tandas (bloques 1–5) para poder parar a medias. Cada bloque es idempotente:
--   si la política ya existe, se ajusta con ALTER POLICY (así se amplía un array sin DROP).
-- - NO se toca Contabilidad (cuenta_contable, extracto_*, asientos…): plan aparte. Tampoco las
--   tablas de configuración ya protegidas en 20261028_seguridad_config.sql, ni `parametro`.
-- Sin DROP / DELETE / TRUNCATE.

-- =============================================================================================
-- Bloque 1: función de permiso, triggers de saldo como DEFINER, maestros y clientes
-- =============================================================================================

create or replace function public.fn_puede_alguno(p_codigos text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- Igual que fn_puede (y que rutaPermitida de src/lib/permisos.ts): si cambias REDIRECCIONES
  -- allí, cámbialas también aquí y en fn_puede.
  with red(origen, destino) as (
    values ('/caja', '/caja/aperturas'), ('/caja/apertura', '/caja/aperturas'),
           ('/caja/cierre', '/caja/aperturas'), ('/compras', '/pedidos-proveedor'),
           ('/pagos', '/pagos-proveedor'), ('/stock', '/almacen/listados-articulos')
  ),
  pedidos(c) as (
    select btrim(x) from unnest(p_codigos) x where nullif(btrim(x), '') is not null
  ),
  objetivo(c) as (
    select c from pedidos
    union
    select red.destino from red join pedidos on red.origen = pedidos.c
  )
  select
    (auth.uid() is null and (coalesce(auth.role(), '') = 'service_role' or session_user in ('postgres', 'supabase_admin')))
    or public.fn_es_administrador()
    or ('carga' = any (p_codigos) and public.fn_es_cowork())
    or exists (
      select 1
      from public.empleado e
      join public.rol_permiso rp on rp.rol_id = e.rol_id
      left join red on red.origen = rp.permiso_codigo
      join objetivo o on true
      where e.auth_user_id = auth.uid()
        and e.activo
        and (
          rp.permiso_codigo = o.c
          or (left(rp.permiso_codigo, 1) = '/' and starts_with(o.c, rp.permiso_codigo || '/'))
          or (red.destino is not null and (o.c = red.destino or starts_with(o.c, red.destino || '/')))
        )
    );
$$;

revoke execute on function public.fn_puede_alguno(text[]) from public, anon;
grant execute on function public.fn_puede_alguno(text[]) to authenticated, service_role;

comment on function public.fn_puede_alguno(text[]) is
  'Verdadero si el usuario puede abrir ALGUNA de esas pantallas (regla de fn_puede), es administrador, es una llamada interna, o el array lleva ''carga'' y es cowork. Lo usan las políticas permiso_* (20261029_seguridad_escrituras.sql).';

-- Los saldos que mantienen estos triggers se derivan de la fila que se acaba de insertar (que ya
-- ha pasado su propia política): se ejecutan como dueño para no tener que dar escritura directa en
-- articulo_almacen_stock / articulo_lote a todas las pantallas que mueven stock o lotes.
-- Una función de trigger no se puede llamar por RPC.
alter function public.fn_actualizar_stock_desde_movimiento() security definer;
alter function public.fn_lote_movimiento_actualiza() security definer;

-- Crea (o ajusta con ALTER POLICY, si ya existe) las tres políticas RESTRICTIVE de escritura de
-- una tabla. Se repite en cada bloque porque cada uno se aplica en su propia sesión.
create or replace function pg_temp.politica_escritura(p_tabla text, p_codigos text[])
returns void language plpgsql as $$
declare
  v_expr text := format('((select public.fn_puede_alguno(%L::text[])))', p_codigos);
  v_existe boolean;
begin
  select exists (select 1 from pg_policies where schemaname = 'public' and tablename = p_tabla and policyname = 'permiso_alta_' || p_tabla) into v_existe;
  execute case when v_existe then format('alter policy %I on public.%I with check %s', 'permiso_alta_' || p_tabla, p_tabla, v_expr)
    else format('create policy %I on public.%I as restrictive for insert to authenticated with check %s', 'permiso_alta_' || p_tabla, p_tabla, v_expr) end;
  select exists (select 1 from pg_policies where schemaname = 'public' and tablename = p_tabla and policyname = 'permiso_modifica_' || p_tabla) into v_existe;
  execute case when v_existe then format('alter policy %I on public.%I using %s with check %s', 'permiso_modifica_' || p_tabla, p_tabla, v_expr, v_expr)
    else format('create policy %I on public.%I as restrictive for update to authenticated using %s with check %s', 'permiso_modifica_' || p_tabla, p_tabla, v_expr, v_expr) end;
  select exists (select 1 from pg_policies where schemaname = 'public' and tablename = p_tabla and policyname = 'permiso_borra_' || p_tabla) into v_existe;
  execute case when v_existe then format('alter policy %I on public.%I using %s', 'permiso_borra_' || p_tabla, p_tabla, v_expr)
    else format('create policy %I on public.%I as restrictive for delete to authenticated using %s', 'permiso_borra_' || p_tabla, p_tabla, v_expr) end;
end;
$$;

-- Maestros (Archivo / Almacén / Ventas / Compras → fichas). 'carga' = cargas de GeminisWin.
select pg_temp.politica_escritura(t, c) from (values
  ('familia',                        array['/familias', 'carga']),
  ('marca',                          array['/marcas', 'carga']),
  ('plantilla_tarifa',               array['/plantillas-tarifas', 'carga']),
  ('plantilla_tarifa_nivel',         array['/plantillas-tarifas', 'carga']),
  ('tipo_cliente',                   array['/tipos-cliente', 'carga']),
  ('tipo_cliente_descuento_familia', array['/tipos-cliente']),
  ('vendedor',                       array['/vendedores', 'carga']),
  ('vendedor_comision_nivel',        array['/vendedores', 'carga']),
  ('tecnico',                        array['/tecnicos']),
  ('tecnico_comision_nivel',         array['/tecnicos']),
  ('repartidor',                     array['/repartidores', 'carga']),
  ('repartidor_comision_nivel',      array['/repartidores']),
  ('zona_territorial',               array['/zonas-territoriales', 'carga']),
  ('ruta_reparto',                   array['/rutas-reparto', 'carga']),
  ('ruta_reparto_zona',              array['/rutas-reparto', '/zonas-territoriales', 'carga']),
  ('ruta_reparto_repartidor',        array['/rutas-reparto', '/repartidores', 'carga']),
  ('ruta',                           array['/rutas-reparto']),
  ('almacen',                        array['/almacenes', 'carga']),
  ('banco',                          array['/bancos']),
  ('banco_sucursal',                 array['/bancos']),
  ('moneda',                         array['/monedas', '/archivo/carga-cotizacion']),
  ('moneda_cotizacion',              array['/archivo/carga-cotizacion']),
  ('codigo_postal',                  array['/codigos-postales']),
  ('zona_servicio',                  array['/archivo/zonas-servicio']),
  ('provincia',                      array['carga']),
  ('pais',                           array['carga']),
  ('transportista',                  array['/transportistas', 'carga']),
  ('proveedor',                      array['/proveedores', '/archivo/importar', 'carga']),
  -- Clientes
  ('cliente',                        array['/clientes', '/web/clientes', '/web/clientes-empresa', '/recalcular-deuda', '/archivo/importar', 'carga']),
  ('cliente_sucursal',               array['/clientes']),
  ('cliente_contacto',               array['/clientes']),
  ('cliente_descuento_familia',      array['/clientes']),
  ('cliente_articulo_precio',        array['/clientes', '/modificacion-precios', 'carga']),
  ('cliente_deuda_recalculo',        array['/recalcular-deuda']),
  ('tipo_contacto',                  array['/clientes']),
  ('cuenta_bancaria',                array['/clientes', '/proveedores', '/transportistas', '/vendedores', '/tecnicos', '/repartidores'])
) v(t, c);

-- =============================================================================================
-- Bloque 1b (ajuste del 1, ya aplicado): Compras → Acreedores (/acreedores, de Luis, commit
-- 819f312) es la misma ficha de proveedor con `tipo = 'acreedor'` y su pestaña Bancos.
-- =============================================================================================

create or replace function pg_temp.politica_escritura(p_tabla text, p_codigos text[])
returns void language plpgsql as $$
declare
  v_expr text := format('((select public.fn_puede_alguno(%L::text[])))', p_codigos);
  v_existe boolean;
begin
  select exists (select 1 from pg_policies where schemaname = 'public' and tablename = p_tabla and policyname = 'permiso_alta_' || p_tabla) into v_existe;
  execute case when v_existe then format('alter policy %I on public.%I with check %s', 'permiso_alta_' || p_tabla, p_tabla, v_expr)
    else format('create policy %I on public.%I as restrictive for insert to authenticated with check %s', 'permiso_alta_' || p_tabla, p_tabla, v_expr) end;
  select exists (select 1 from pg_policies where schemaname = 'public' and tablename = p_tabla and policyname = 'permiso_modifica_' || p_tabla) into v_existe;
  execute case when v_existe then format('alter policy %I on public.%I using %s with check %s', 'permiso_modifica_' || p_tabla, p_tabla, v_expr, v_expr)
    else format('create policy %I on public.%I as restrictive for update to authenticated using %s with check %s', 'permiso_modifica_' || p_tabla, p_tabla, v_expr, v_expr) end;
  select exists (select 1 from pg_policies where schemaname = 'public' and tablename = p_tabla and policyname = 'permiso_borra_' || p_tabla) into v_existe;
  execute case when v_existe then format('alter policy %I on public.%I using %s', 'permiso_borra_' || p_tabla, p_tabla, v_expr)
    else format('create policy %I on public.%I as restrictive for delete to authenticated using %s', 'permiso_borra_' || p_tabla, p_tabla, v_expr) end;
end;
$$;

select pg_temp.politica_escritura(t, c) from (values
  ('proveedor',       array['/proveedores', '/acreedores', '/archivo/importar', 'carga']),
  ('cuenta_bancaria', array['/clientes', '/proveedores', '/acreedores', '/transportistas', '/vendedores', '/tecnicos', '/repartidores'])
) v(t, c);

-- =============================================================================================
-- Bloque 2: artículos y sus tablas hijas
-- =============================================================================================

create or replace function pg_temp.politica_escritura(p_tabla text, p_codigos text[])
returns void language plpgsql as $$
declare
  v_expr text := format('((select public.fn_puede_alguno(%L::text[])))', p_codigos);
  v_existe boolean;
begin
  select exists (select 1 from pg_policies where schemaname = 'public' and tablename = p_tabla and policyname = 'permiso_alta_' || p_tabla) into v_existe;
  execute case when v_existe then format('alter policy %I on public.%I with check %s', 'permiso_alta_' || p_tabla, p_tabla, v_expr)
    else format('create policy %I on public.%I as restrictive for insert to authenticated with check %s', 'permiso_alta_' || p_tabla, p_tabla, v_expr) end;
  select exists (select 1 from pg_policies where schemaname = 'public' and tablename = p_tabla and policyname = 'permiso_modifica_' || p_tabla) into v_existe;
  execute case when v_existe then format('alter policy %I on public.%I using %s with check %s', 'permiso_modifica_' || p_tabla, p_tabla, v_expr, v_expr)
    else format('create policy %I on public.%I as restrictive for update to authenticated using %s with check %s', 'permiso_modifica_' || p_tabla, p_tabla, v_expr, v_expr) end;
  select exists (select 1 from pg_policies where schemaname = 'public' and tablename = p_tabla and policyname = 'permiso_borra_' || p_tabla) into v_existe;
  execute case when v_existe then format('alter policy %I on public.%I using %s', 'permiso_borra_' || p_tabla, p_tabla, v_expr)
    else format('create policy %I on public.%I as restrictive for delete to authenticated using %s', 'permiso_borra_' || p_tabla, p_tabla, v_expr) end;
end;
$$;

select pg_temp.politica_escritura(t, c) from (values
  -- La ficha, la creación rápida, la recepción de compras (últimas compras, coste), modificación de
  -- precios y las utilidades de almacén que dan de baja o modifican en bloque.
  ('articulo',                           array['/articulos', '/almacen/creacion-rapida', '/pedidos-proveedor', '/creacion-rapida-pedidos', '/gestor-pedidos-proveedor', '/modificacion-precios', '/almacen/modificacion-bloque', '/almacen/eliminacion-articulos', '/almacen/articulos-en-blanco', '/archivo/importar', 'carga']),
  ('articulo_codigo_barras',             array['/articulos', '/almacen/creacion-rapida', 'carga']),
  ('articulo_precio_nivel',              array['/articulos', '/almacen/creacion-rapida', '/modificacion-precios', 'carga']),
  ('articulo_proveedor',                 array['/articulos', '/almacen/creacion-rapida', '/pedidos-proveedor', '/creacion-rapida-pedidos', '/gestor-pedidos-proveedor', 'carga']),
  ('articulo_tarifa_cantidad',           array['/articulos', '/modificacion-precios', '/tarifas-oferta']),
  ('articulo_tarifa_cantidad_nivel',     array['/articulos', '/modificacion-precios', '/tarifas-oferta']),
  ('articulo_componente',                array['/articulos']),
  ('articulo_equivalencia',              array['/articulos']),
  ('articulo_oferta',                    array['/articulos']),
  ('articulo_talla_color_config',        array['/articulos']),
  ('articulo_unidad_venta',              array['/articulos']),
  ('articulo_unidad_venta_precio_nivel', array['/articulos']),
  ('articulo_variante',                  array['/articulos']),
  ('articulo_favorito',                  array['/articulos']),
  ('color',                              array['/articulos']),
  ('talla',                              array['/articulos']),
  ('articulo_plu',                       array['/almacen/plus']),
  ('oferta_tarifa',                      array['/tarifas-oferta']),
  ('modificacion_precio',                array['/modificacion-precios']),
  ('modificacion_precio_linea',          array['/modificacion-precios']),
  ('modificacion_precio_linea_nivel',    array['/modificacion-precios']),
  ('modificacion_articulo',              array['/almacen/modificacion-bloque']),
  ('modificacion_articulo_linea',        array['/almacen/modificacion-bloque'])
) v(t, c);

-- =============================================================================================
-- Bloque 3: almacén (stock, traspasos, regularizaciones, inventarios, lotes, series)
-- =============================================================================================

create or replace function pg_temp.politica_escritura(p_tabla text, p_codigos text[])
returns void language plpgsql as $$
declare
  v_expr text := format('((select public.fn_puede_alguno(%L::text[])))', p_codigos);
  v_existe boolean;
begin
  select exists (select 1 from pg_policies where schemaname = 'public' and tablename = p_tabla and policyname = 'permiso_alta_' || p_tabla) into v_existe;
  execute case when v_existe then format('alter policy %I on public.%I with check %s', 'permiso_alta_' || p_tabla, p_tabla, v_expr)
    else format('create policy %I on public.%I as restrictive for insert to authenticated with check %s', 'permiso_alta_' || p_tabla, p_tabla, v_expr) end;
  select exists (select 1 from pg_policies where schemaname = 'public' and tablename = p_tabla and policyname = 'permiso_modifica_' || p_tabla) into v_existe;
  execute case when v_existe then format('alter policy %I on public.%I using %s with check %s', 'permiso_modifica_' || p_tabla, p_tabla, v_expr, v_expr)
    else format('create policy %I on public.%I as restrictive for update to authenticated using %s with check %s', 'permiso_modifica_' || p_tabla, p_tabla, v_expr, v_expr) end;
  select exists (select 1 from pg_policies where schemaname = 'public' and tablename = p_tabla and policyname = 'permiso_borra_' || p_tabla) into v_existe;
  execute case when v_existe then format('alter policy %I on public.%I using %s', 'permiso_borra_' || p_tabla, p_tabla, v_expr)
    else format('create policy %I on public.%I as restrictive for delete to authenticated using %s', 'permiso_borra_' || p_tabla, p_tabla, v_expr) end;
end;
$$;

select pg_temp.politica_escritura(t, c) from (values
  -- Todo lo que mueve stock: venta, entrega de pedido, recepción de compra, creación rápida,
  -- inventario, regularización, traspaso, stock a cero por familia, puntos de restauración.
  ('movimiento_stock',               array['/tpv', '/ventas', '/pedidos', '/presupuestos', '/pedidos-proveedor', '/creacion-rapida-pedidos', '/gestor-pedidos-proveedor', '/almacen/creacion-rapida', '/almacen/inventariar', '/inventario', '/regularizacion-stock', '/traspasos', '/almacen/stock-cero-familia', '/almacen/puntos-restauracion', 'carga']),
  -- El saldo lo mantiene el trigger de movimiento_stock (DEFINER desde el bloque 1); aquí solo
  -- escriben Recalcular Stock y la carga.
  ('articulo_almacen_stock',         array['/almacen/recalcular-stock', 'carga']),
  ('traspaso_almacen',               array['/traspasos', '/regularizacion-stock']),
  ('traspaso_almacen_linea',         array['/traspasos', '/regularizacion-stock']),
  ('regularizacion_stock',           array['/regularizacion-stock']),
  ('inventario',                     array['/inventario', '/almacen/inventariar']),
  ('inventario_linea',               array['/inventario', '/almacen/inventariar']),
  ('punto_restauracion_stock',       array['/inventario', '/almacen/inventariar', '/almacen/puntos-restauracion']),
  ('punto_restauracion_stock_linea', array['/inventario', '/almacen/inventariar', '/almacen/puntos-restauracion']),
  ('articulo_lote',                  array['/almacen/lotes', '/almacen/stock-cero-familia']),
  ('articulo_lote_movimiento',       array['/almacen/lotes', '/almacen/stock-cero-familia']),
  ('articulo_numero_serie',          array['/numeros-serie'])
) v(t, c);

-- =============================================================================================
-- Bloque 4: compras (pedidos y facturas de proveedor, pagos, peticiones)
-- =============================================================================================

create or replace function pg_temp.politica_escritura(p_tabla text, p_codigos text[])
returns void language plpgsql as $$
declare
  v_expr text := format('((select public.fn_puede_alguno(%L::text[])))', p_codigos);
  v_existe boolean;
begin
  select exists (select 1 from pg_policies where schemaname = 'public' and tablename = p_tabla and policyname = 'permiso_alta_' || p_tabla) into v_existe;
  execute case when v_existe then format('alter policy %I on public.%I with check %s', 'permiso_alta_' || p_tabla, p_tabla, v_expr)
    else format('create policy %I on public.%I as restrictive for insert to authenticated with check %s', 'permiso_alta_' || p_tabla, p_tabla, v_expr) end;
  select exists (select 1 from pg_policies where schemaname = 'public' and tablename = p_tabla and policyname = 'permiso_modifica_' || p_tabla) into v_existe;
  execute case when v_existe then format('alter policy %I on public.%I using %s with check %s', 'permiso_modifica_' || p_tabla, p_tabla, v_expr, v_expr)
    else format('create policy %I on public.%I as restrictive for update to authenticated using %s with check %s', 'permiso_modifica_' || p_tabla, p_tabla, v_expr, v_expr) end;
  select exists (select 1 from pg_policies where schemaname = 'public' and tablename = p_tabla and policyname = 'permiso_borra_' || p_tabla) into v_existe;
  execute case when v_existe then format('alter policy %I on public.%I using %s', 'permiso_borra_' || p_tabla, p_tabla, v_expr)
    else format('create policy %I on public.%I as restrictive for delete to authenticated using %s', 'permiso_borra_' || p_tabla, p_tabla, v_expr) end;
end;
$$;

select pg_temp.politica_escritura(t, c) from (values
  ('pedido_proveedor',       array['/pedidos-proveedor', '/creacion-rapida-pedidos', '/gestor-pedidos-proveedor', '/peticiones', '/facturas-proveedor', '/pagos-proveedor', '/gestor-pagos-proveedor']),
  ('pedido_proveedor_linea', array['/pedidos-proveedor', '/creacion-rapida-pedidos', '/gestor-pedidos-proveedor', '/peticiones']),
  ('factura_proveedor',      array['/facturas-proveedor', '/pagos-proveedor', '/gestor-pagos-proveedor']),
  ('pago_proveedor',         array['/pagos-proveedor', '/gestor-pagos-proveedor', '/facturas-proveedor']),
  ('peticion',               array['/peticiones', '/gestor-pedidos-proveedor', 'accion:generar-peticion']),
  ('peticion_tramitacion',   array['/peticiones', '/gestor-pedidos-proveedor', 'accion:generar-peticion'])
) v(t, c);

-- =============================================================================================
-- Bloque 5: ventas, caja, cobros, facturación, repartos, web
-- =============================================================================================

create or replace function pg_temp.politica_escritura(p_tabla text, p_codigos text[])
returns void language plpgsql as $$
declare
  v_expr text := format('((select public.fn_puede_alguno(%L::text[])))', p_codigos);
  v_existe boolean;
begin
  select exists (select 1 from pg_policies where schemaname = 'public' and tablename = p_tabla and policyname = 'permiso_alta_' || p_tabla) into v_existe;
  execute case when v_existe then format('alter policy %I on public.%I with check %s', 'permiso_alta_' || p_tabla, p_tabla, v_expr)
    else format('create policy %I on public.%I as restrictive for insert to authenticated with check %s', 'permiso_alta_' || p_tabla, p_tabla, v_expr) end;
  select exists (select 1 from pg_policies where schemaname = 'public' and tablename = p_tabla and policyname = 'permiso_modifica_' || p_tabla) into v_existe;
  execute case when v_existe then format('alter policy %I on public.%I using %s with check %s', 'permiso_modifica_' || p_tabla, p_tabla, v_expr, v_expr)
    else format('create policy %I on public.%I as restrictive for update to authenticated using %s with check %s', 'permiso_modifica_' || p_tabla, p_tabla, v_expr, v_expr) end;
  select exists (select 1 from pg_policies where schemaname = 'public' and tablename = p_tabla and policyname = 'permiso_borra_' || p_tabla) into v_existe;
  execute case when v_existe then format('alter policy %I on public.%I using %s', 'permiso_borra_' || p_tabla, p_tabla, v_expr)
    else format('create policy %I on public.%I as restrictive for delete to authenticated using %s', 'permiso_borra_' || p_tabla, p_tabla, v_expr) end;
end;
$$;

select pg_temp.politica_escritura(t, c) from (values
  -- Guardado de TPV/venta, entrega de pedido o presupuesto, asignación a reparto, y las funciones
  -- de cobro (fn_cobro_aplicar_*), facturación (fn_facturar_albaranes) y anulación de factura.
  ('venta',                   array['/tpv', '/ventas', '/pedidos', '/presupuestos', '/repartos', '/facturacion', '/generar-facturas', '/cobros-clientes/ficha', '/gestor-cobros-clientes']),
  ('venta_linea',             array['/tpv', '/ventas', '/pedidos', '/presupuestos']),
  ('venta_componente',        array['/tpv', '/ventas', '/pedidos', '/presupuestos']),
  ('apertura_cajon',          array['/tpv', '/ventas']),
  ('cobro_cliente',           array['/tpv', '/ventas', '/facturacion', '/cobros-clientes/ficha', '/gestor-cobros-clientes']),
  ('movimiento_caja',         array['/tpv', '/ventas', '/caja/movimientos', '/caja/entrada', '/caja/salida', '/pagos-proveedor', '/gestor-pagos-proveedor', '/facturas-proveedor', '/facturacion', '/cobros-clientes/ficha', '/gestor-cobros-clientes']),
  ('caja_apertura_cierre',    array['/caja/aperturas']),
  ('caja_apertura_cierre_categoria', array['/caja/aperturas']),
  ('factura',                 array['/facturacion', '/generar-facturas', '/cobros-clientes/ficha', '/gestor-cobros-clientes']),
  ('factura_impuesto_tramo',  array['/facturacion', '/generar-facturas']),
  ('pedido_cliente',          array['/pedidos', '/presupuestos', '/reparaciones', '/web/importar-pedidos']),
  ('pedido_cliente_linea',    array['/pedidos', '/presupuestos', '/reparaciones', '/web/importar-pedidos']),
  ('pedido_cliente_componente', array['/pedidos', '/presupuestos', '/reparaciones', '/web/importar-pedidos']),
  ('reparto',                 array['/repartos']),
  ('reparto_linea',           array['/repartos']),
  ('liquidacion_comision',    array['/liquidacion']),
  ('liquidacion_comision_documento', array['/liquidacion']),
  -- Registro de la sincronización con la web: lo escribe cualquier pantalla del menú Web.
  ('web_sincronizacion_log',  array['/web/configuracion', '/web/importar-pedidos', '/web/catalogo', '/web/errores', '/web/precios', '/web/categorias', '/web/pendientes', '/web/stock-reservado', '/web/estado-pedidos', '/web/devoluciones', '/web/clientes', '/web/clientes-empresa', '/web/cupones', '/web/registro', '/web/estadisticas', '/web/publicar', '/web/whatsapp', '/web/imagenes-textos', '/web/variaciones', '/web/relacionados', '/web/facturas-pedidos', '/web/envios', '/web/presupuestos', '/web/resenas', '/web/carritos-abandonados'])
) v(t, c);

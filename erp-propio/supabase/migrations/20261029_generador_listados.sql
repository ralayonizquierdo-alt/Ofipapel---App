-- Generador de listados de Avatar (Luis, 29/10/2026): una sola pantalla para sacar cualquier
-- listado (columnas, filtros, agrupar y sumar, orden), guardarlo con nombre y compartirlo por
-- grupo de acceso.
--
-- 1) Fuentes: vistas v_lst_<fuente> con las columnas que se pueden listar. security_invoker:
--    cada uno ve solo lo que la RLS de las tablas le deja ver.
-- 2) fn_listado_ejecutar: arma la consulta SOLO con columnas que existen en la vista (las comprueba
--    contra information_schema) y valores siempre entrecomillados (%L): no admite SQL libre.
-- 3) listado_guardado: listados con nombre; los ve su autor, los administradores y los grupos a
--    los que se comparte (vacío = todos).
-- Idempotente.

-- ---------------------------------------------------------------- 1) fuentes
create or replace view public.v_lst_clientes with (security_invoker = true) as
select c.codigo, c.nombre, c.razon_social, c.nif, c.poblacion, c.codigo_postal, c.provincia_codigo as provincia,
       coalesce(nullif(c.telefono_fijo, ''), c.telefono_movil) as telefono, c.telefono_movil as movil, c.email,
       c.tipo_cliente_codigo as tipo_cliente, tc.descripcion as tipo_cliente_desc,
       c.zona_territorial_codigo as zona, z.descripcion as zona_desc,
       c.vendedor_codigo as vendedor, ve.nombre as vendedor_nombre, c.ruta_codigo as ruta,
       c.forma_pago_codigo as forma_pago, c.tipo_credito, c.tarifa_nivel_defecto as tarifa, c.descuento_pct,
       c.limite_deuda, c.deuda_actual, c.fecha_alta, c.fecha_baja, c.fecha_ultima_venta, c.activo, c.bloqueado
  from cliente c
  left join tipo_cliente tc on tc.codigo = c.tipo_cliente_codigo
  left join zona_territorial z on z.codigo = c.zona_territorial_codigo
  left join vendedor ve on ve.codigo = c.vendedor_codigo;

create or replace view public.v_lst_articulos with (security_invoker = true) as
select a.codigo_interno as codigo, a.descripcion, a.codigo_venta as referencia, a.codigo_barras_principal as codigo_barras,
       a.familia_codigo as familia, f.descripcion as familia_desc, a.marca_codigo as marca,
       a.proveedor_habitual_codigo as proveedor, p.nombre as proveedor_nombre, a.codigo_compra_habitual as codigo_compra,
       a.pvp, a.coste_neto as coste, a.precio_medio_compra,
       case when coalesce(a.pvp, 0) <> 0 then round((a.pvp - coalesce(a.coste_neto, 0)) / a.pvp * 100, 2) end as margen_pct,
       a.igic_pct, (select sum(s.cantidad_actual) from articulo_almacen_stock s where s.articulo_codigo = a.codigo_interno) as stock,
       a.stock_minimo, a.stock_maximo, a.ultima_compra_fecha, a.ultima_venta_fecha, a.fecha_alta, a.fecha_baja,
       a.activo, a.web_publicado
  from articulo a
  left join familia f on f.codigo = a.familia_codigo
  left join proveedor p on p.codigo = a.proveedor_habitual_codigo;

create or replace view public.v_lst_stock with (security_invoker = true) as
select s.articulo_codigo as articulo, a.descripcion, a.familia_codigo as familia, f.descripcion as familia_desc, a.marca_codigo as marca,
       s.almacen_codigo as almacen, s.cantidad_actual as stock, s.cantidad_reservada as reservado, s.cantidad_disponible as disponible,
       a.stock_minimo, a.coste_neto as coste, round(s.cantidad_actual * coalesce(a.coste_neto, 0), 2) as valor_coste,
       a.pvp, round(s.cantidad_actual * coalesce(a.pvp, 0), 2) as valor_pvp, a.activo
  from articulo_almacen_stock s
  join articulo a on a.codigo_interno = s.articulo_codigo
  left join familia f on f.codigo = a.familia_codigo;

create or replace view public.v_lst_ventas with (security_invoker = true) as
select v.tienda_terminal_codigo as tienda, v.numero, v.fecha, extract(year from v.fecha)::int as anio, to_char(v.fecha, 'YYYY-MM') as mes,
       v.cliente_codigo as cliente, coalesce(c.nombre, v.nombre_cliente) as cliente_nombre, v.vendedor_codigo as vendedor,
       v.empleado_codigo as empleado, v.forma_pago_codigo as forma_pago, v.tipo_credito,
       v.subtotal, v.total, v.total_pagado, v.total_pendiente,
       (v.factura_numero is not null) as facturada, (v.anulada_en is not null) as anulada
  from venta v
  left join cliente c on c.codigo = v.cliente_codigo;

create or replace view public.v_lst_ventas_lineas with (security_invoker = true) as
select v.tienda_terminal_codigo as tienda, v.numero, v.fecha, extract(year from v.fecha)::int as anio, to_char(v.fecha, 'YYYY-MM') as mes,
       v.cliente_codigo as cliente, coalesce(c.nombre, v.nombre_cliente) as cliente_nombre, v.vendedor_codigo as vendedor,
       l.articulo_codigo as articulo, l.codigo_venta as referencia, l.descripcion,
       a.familia_codigo as familia, f.descripcion as familia_desc, a.marca_codigo as marca,
       l.cantidad, l.precio, l.descuento_pct, l.subtotal as base, l.total_igic as igic, (l.subtotal + coalesce(l.total_igic, 0)) as total,
       round(l.cantidad * coalesce(a.coste_neto, 0), 2) as coste, round(l.subtotal - l.cantidad * coalesce(a.coste_neto, 0), 2) as margen
  from venta v
  join venta_linea l on l.tienda_terminal_codigo = v.tienda_terminal_codigo and l.numero = v.numero
  left join cliente c on c.codigo = v.cliente_codigo
  left join articulo a on a.codigo_interno = l.articulo_codigo
  left join familia f on f.codigo = a.familia_codigo
 where v.anulada_en is null;

create or replace view public.v_lst_facturas with (security_invoker = true) as
select fa.tienda_terminal_codigo as tienda, fa.numero, fa.serie, fa.n_factura, fa.fecha_factura as fecha,
       extract(year from fa.fecha_factura)::int as anio, to_char(fa.fecha_factura, 'YYYY-MM') as mes,
       fa.cliente_codigo as cliente, coalesce(c.nombre, fa.nombre_cliente) as cliente_nombre, fa.vendedor_codigo as vendedor,
       fa.forma_pago_codigo as forma_pago, fa.estado, fa.total_base as base, fa.total_igic as igic, fa.total,
       fa.total_pagado as pagado, fa.total_pendiente as pendiente
  from factura fa
  left join cliente c on c.codigo = fa.cliente_codigo;

create or replace view public.v_lst_compras with (security_invoker = true) as
select pp.tienda_terminal_codigo as tienda, pp.numero, pp.fecha_hora::date as fecha, extract(year from pp.fecha_hora)::int as anio,
       to_char(pp.fecha_hora, 'YYYY-MM') as mes, pp.proveedor_codigo as proveedor, p.nombre as proveedor_nombre, p.tipo as tipo_proveedor,
       pp.estado, pp.numero_albaran_proveedor as albaran, pp.almacen_codigo as almacen, pp.base_imponible as base,
       pp.total_igic as igic, pp.total, pp.recibido, pp.pagado, pp.es_abono as abono
  from pedido_proveedor pp
  left join proveedor p on p.codigo = pp.proveedor_codigo;

create or replace view public.v_lst_compras_lineas with (security_invoker = true) as
select pp.tienda_terminal_codigo as tienda, pp.numero, pp.fecha_hora::date as fecha, extract(year from pp.fecha_hora)::int as anio,
       to_char(pp.fecha_hora, 'YYYY-MM') as mes, pp.proveedor_codigo as proveedor, p.nombre as proveedor_nombre, pp.estado,
       l.articulo_codigo as articulo, l.codigo_compra, l.descripcion, a.familia_codigo as familia, f.descripcion as familia_desc,
       l.cantidad, l.precio_compra, l.descuento_pct, l.coste_neto, round(coalesce(l.total_unidades, l.cantidad) * coalesce(l.coste_neto, 0), 2) as importe,
       l.recibido
  from pedido_proveedor pp
  join pedido_proveedor_linea l on l.tienda_terminal_codigo = pp.tienda_terminal_codigo and l.numero = pp.numero
  left join proveedor p on p.codigo = pp.proveedor_codigo
  left join articulo a on a.codigo_interno = l.articulo_codigo
  left join familia f on f.codigo = a.familia_codigo;

create or replace view public.v_lst_proveedores with (security_invoker = true) as
select p.codigo, p.nombre, p.tipo, p.razon_social, p.nif, p.poblacion, coalesce(nullif(p.telefono_fijo, ''), p.telefono_movil) as telefono,
       p.email, p.contacto, p.forma_pago_codigo as forma_pago, p.deuda_actual, p.total_comprado, p.pendiente_pago,
       p.fecha_alta, p.fecha_baja, p.fecha_ultima_compra, p.activo
  from proveedor p;

create or replace view public.v_lst_caja with (security_invoker = true) as
select m.tienda_terminal_codigo as tienda, m.numero, m.fecha, extract(year from m.fecha)::int as anio, to_char(m.fecha, 'YYYY-MM') as mes,
       m.tipo_movimiento, m.descripcion_tipo, m.concepto, m.documento, m.ingreso, m.gasto,
       coalesce(m.ingreso, 0) - coalesce(m.gasto, 0) as neto, m.forma_pago_codigo as forma_pago, m.cliente_codigo as cliente,
       m.empleado_codigo as empleado, m.activo
  from movimiento_caja m;

grant select on public.v_lst_clientes, public.v_lst_articulos, public.v_lst_stock, public.v_lst_ventas, public.v_lst_ventas_lineas,
  public.v_lst_facturas, public.v_lst_compras, public.v_lst_compras_lineas, public.v_lst_proveedores, public.v_lst_caja to authenticated;
revoke all on public.v_lst_clientes, public.v_lst_articulos, public.v_lst_stock, public.v_lst_ventas, public.v_lst_ventas_lineas,
  public.v_lst_facturas, public.v_lst_compras, public.v_lst_compras_lineas, public.v_lst_proveedores, public.v_lst_caja from anon;

-- ---------------------------------------------------------------- 2) ejecutar
create or replace function public.fn_listado_ejecutar(
  p_fuente text, p_columnas text[], p_filtros jsonb default '[]', p_agrupar text[] default '{}',
  p_sumar text[] default '{}', p_orden jsonb default '[]', p_limite integer default 5000)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public'
as $$
declare
  v_vista text := 'v_lst_' || p_fuente;
  v_tipos jsonb;
  v_where text := 'true';
  v_sel text;
  v_ord text := '';
  v_sql text;
  v_res jsonb;
  v_lim int := least(greatest(coalesce(p_limite, 5000), 1), 50000);
  f jsonb;
  o jsonb;
  c text;
  v_col text; v_op text; v_tipo text; v_val text; v_val2 text;
  v_agrupa boolean := coalesce(array_length(p_agrupar, 1), 0) > 0;
begin
  if p_fuente !~ '^[a-z_]+$' then raise exception 'Fuente no válida'; end if;
  select jsonb_object_agg(column_name, data_type) into v_tipos
    from information_schema.columns where table_schema = 'public' and table_name = v_vista;
  if v_tipos is null then raise exception 'No existe la fuente %', p_fuente; end if;

  foreach c in array coalesce(p_columnas, '{}') || coalesce(p_agrupar, '{}') || coalesce(p_sumar, '{}') loop
    if not v_tipos ? c then raise exception 'Columna no válida: %', c; end if;
  end loop;

  -- Filtros: {col, op, valor, valor2}
  for f in select * from jsonb_array_elements(coalesce(p_filtros, '[]')) loop
    v_col := f ->> 'col'; v_op := f ->> 'op'; v_val := f ->> 'valor'; v_val2 := f ->> 'valor2';
    if not v_tipos ? v_col then raise exception 'Columna no válida en filtro: %', v_col; end if;
    v_tipo := v_tipos ->> v_col;
    v_where := v_where || ' and ' || case v_op
      when '=' then format('%I = %L::%s', v_col, v_val, v_tipo)
      when '<>' then format('%I is distinct from %L::%s', v_col, v_val, v_tipo)
      when '>' then format('%I > %L::%s', v_col, v_val, v_tipo)
      when '>=' then format('%I >= %L::%s', v_col, v_val, v_tipo)
      when '<' then format('%I < %L::%s', v_col, v_val, v_tipo)
      when '<=' then format('%I <= %L::%s', v_col, v_val, v_tipo)
      when 'entre' then format('%I between %L::%s and %L::%s', v_col, v_val, v_tipo, v_val2, v_tipo)
      when 'contiene' then format('%I::text ilike %L', v_col, '%' || coalesce(v_val, '') || '%')
      when 'empieza' then format('%I::text ilike %L', v_col, coalesce(v_val, '') || '%')
      when 'en' then format('%I::text = any (%L::text[])', v_col, (select array_agg(trim(x)) from unnest(string_to_array(coalesce(v_val, ''), ',')) x))
      when 'vacio' then format('(%I is null or %I::text = '''')', v_col, v_col)
      when 'no_vacio' then format('(%I is not null and %I::text <> '''')', v_col, v_col)
      when 'si' then format('%I is true', v_col)
      when 'no' then format('%I is not true', v_col)
      else null end;
    if v_where is null then raise exception 'Operador no válido: %', v_op; end if;
  end loop;

  if v_agrupa then
    v_sel := (select string_agg(format('%I', g), ', ') from unnest(p_agrupar) g)
          || ', count(*) as registros'
          || coalesce((select string_agg(format(', sum(%I) as %I', s, s), '') from unnest(p_sumar) s), '');
  else
    v_sel := (select string_agg(format('%I', x), ', ') from unnest(p_columnas) x);
  end if;
  if v_sel is null then raise exception 'Elige al menos una columna'; end if;

  for o in select * from jsonb_array_elements(coalesce(p_orden, '[]')) loop
    c := o ->> 'col';
    if not (v_tipos ? c or (v_agrupa and c = 'registros')) then raise exception 'Columna no válida en orden: %', c; end if;
    if v_agrupa and not (c = 'registros' or c = any (p_agrupar) or c = any (p_sumar)) then continue; end if;
    v_ord := v_ord || case when v_ord = '' then ' order by ' else ', ' end
          || format('%I', c) || case when (o ->> 'desc')::boolean then ' desc nulls last' else ' asc nulls last' end;
  end loop;
  if v_ord = '' and v_agrupa then v_ord := ' order by ' || (select string_agg(format('%I', g), ', ') from unnest(p_agrupar) g); end if;

  v_sql := format('select %s from %I where %s', v_sel, v_vista, v_where)
        || case when v_agrupa then ' group by ' || (select string_agg(format('%I', g), ', ') from unnest(p_agrupar) g) else '' end
        || v_ord || format(' limit %s', v_lim + 1);
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (%s) t', v_sql) into v_res;
  return jsonb_build_object('filas', (select coalesce(jsonb_agg(e), '[]'::jsonb) from (select e from jsonb_array_elements(v_res) with ordinality as x(e, n) where n <= v_lim) z),
                            'truncado', jsonb_array_length(v_res) > v_lim);
end;
$$;
grant execute on function public.fn_listado_ejecutar(text, text[], jsonb, text[], text[], jsonb, integer) to authenticated;
revoke execute on function public.fn_listado_ejecutar(text, text[], jsonb, text[], text[], jsonb, integer) from anon, public;

-- ---------------------------------------------------------------- 3) listados guardados
create table if not exists public.listado_guardado (
  id bigint generated always as identity primary key,
  nombre text not null,
  fuente text not null,
  definicion jsonb not null,
  grupos bigint[],               -- null = todos los grupos
  creado_por text default public.fn_empleado_actual(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
comment on table public.listado_guardado is 'Generador de listados: listados guardados con nombre (definición = columnas, filtros, agrupar, sumar, orden). grupos = rol.id que lo ven; null = todos.';
alter table public.listado_guardado enable row level security;
do $$ begin
  create policy listado_guardado_select on public.listado_guardado for select to authenticated
    using (public.fn_es_administrador() or grupos is null or creado_por = public.fn_empleado_actual()
           or exists (select 1 from empleado e where e.auth_user_id = auth.uid() and e.rol_id = any (grupos)));
  create policy listado_guardado_insert on public.listado_guardado for insert to authenticated with check (true);
  create policy listado_guardado_update on public.listado_guardado for update to authenticated
    using (public.fn_es_administrador() or creado_por = public.fn_empleado_actual())
    with check (public.fn_es_administrador() or creado_por = public.fn_empleado_actual());
  create policy listado_guardado_delete on public.listado_guardado for delete to authenticated
    using (public.fn_es_administrador() or creado_por = public.fn_empleado_actual());
exception when duplicate_object then null; end $$;
grant select, insert, update, delete on public.listado_guardado to authenticated;

-- ---------------------------------------------------------------- 4) permiso y listados de ejemplo
insert into public.permiso (codigo, descripcion, modulo, tipo, orden)
values ('/listados', 'Generador de listados', 'Utilidades', 'menu', 1140)
on conflict (codigo) do nothing;
-- Lo tienen los grupos que ya tenían algún listado.
insert into public.rol_permiso (rol_id, permiso_codigo)
select distinct rol_id, '/listados' from public.rol_permiso
 where permiso_codigo like '/listados%' or permiso_codigo like '/listado-%' or permiso_codigo in ('/almacen/listados-articulos', '/caja/listado')
on conflict do nothing;

insert into public.listado_guardado (nombre, fuente, definicion)
select x.nombre, x.fuente, x.definicion::jsonb from (values
  ('Ventas por familia', 'ventas_lineas', '{"columnas":["familia","familia_desc"],"filtros":[],"agrupar":["familia","familia_desc"],"sumar":["cantidad","base","margen"],"orden":[{"col":"base","desc":true}]}'),
  ('Ventas por cliente', 'ventas_lineas', '{"columnas":["cliente","cliente_nombre"],"filtros":[],"agrupar":["cliente","cliente_nombre"],"sumar":["base","margen"],"orden":[{"col":"base","desc":true}]}'),
  ('Ventas por mes', 'ventas', '{"columnas":["mes"],"filtros":[{"col":"anulada","op":"no"}],"agrupar":["mes"],"sumar":["total","total_pendiente"],"orden":[{"col":"mes","desc":false}]}'),
  ('Artículos bajo stock mínimo', 'articulos', '{"columnas":["codigo","descripcion","familia","stock","stock_minimo","proveedor_nombre"],"filtros":[{"col":"stock_minimo","op":">","valor":"0"},{"col":"activo","op":"si"}],"agrupar":[],"sumar":[],"orden":[{"col":"familia","desc":false}]}'),
  ('Clientes con deuda', 'clientes', '{"columnas":["codigo","nombre","poblacion","telefono","limite_deuda","deuda_actual"],"filtros":[{"col":"deuda_actual","op":">","valor":"0"}],"agrupar":[],"sumar":[],"orden":[{"col":"deuda_actual","desc":true}]}'),
  ('Clientes por zona', 'clientes', '{"columnas":["zona","zona_desc"],"filtros":[{"col":"activo","op":"si"}],"agrupar":["zona","zona_desc"],"sumar":["deuda_actual"],"orden":[{"col":"zona","desc":false}]}'),
  ('Valor del stock por almacén', 'stock', '{"columnas":["almacen"],"filtros":[],"agrupar":["almacen"],"sumar":["stock","valor_coste","valor_pvp"],"orden":[{"col":"almacen","desc":false}]}'),
  ('Compras por proveedor', 'compras', '{"columnas":["proveedor","proveedor_nombre"],"filtros":[],"agrupar":["proveedor","proveedor_nombre"],"sumar":["base","total"],"orden":[{"col":"total","desc":true}]}'),
  ('Facturas pendientes de cobro', 'facturas', '{"columnas":["serie","n_factura","fecha","cliente_nombre","total","pendiente"],"filtros":[{"col":"pendiente","op":">","valor":"0"}],"agrupar":[],"sumar":[],"orden":[{"col":"fecha","desc":false}]}')
) as x(nombre, fuente, definicion)
where not exists (select 1 from public.listado_guardado g where g.nombre = x.nombre);

-- Artículos: columna bajo_minimo (stock por debajo del mínimo) y su listado de ejemplo
-- (aplicado como 20261029_listados_bajo_minimo).
create or replace view public.v_lst_articulos with (security_invoker = true) as
select a.codigo_interno as codigo, a.descripcion, a.codigo_venta as referencia, a.codigo_barras_principal as codigo_barras,
       a.familia_codigo as familia, f.descripcion as familia_desc, a.marca_codigo as marca,
       a.proveedor_habitual_codigo as proveedor, p.nombre as proveedor_nombre, a.codigo_compra_habitual as codigo_compra,
       a.pvp, a.coste_neto as coste, a.precio_medio_compra,
       case when coalesce(a.pvp, 0) <> 0 then round((a.pvp - coalesce(a.coste_neto, 0)) / a.pvp * 100, 2) end as margen_pct,
       a.igic_pct, st.stock,
       a.stock_minimo, a.stock_maximo, a.ultima_compra_fecha, a.ultima_venta_fecha, a.fecha_alta, a.fecha_baja,
       a.activo, a.web_publicado,
       (coalesce(a.stock_minimo, 0) > 0 and coalesce(st.stock, 0) < a.stock_minimo) as bajo_minimo
  from articulo a
  left join familia f on f.codigo = a.familia_codigo
  left join proveedor p on p.codigo = a.proveedor_habitual_codigo
  left join lateral (select sum(s.cantidad_actual) as stock from articulo_almacen_stock s where s.articulo_codigo = a.codigo_interno) st on true;
update public.listado_guardado set definicion = jsonb_set(definicion, '{filtros}', '[{"col":"bajo_minimo","op":"si"},{"col":"activo","op":"si"}]'::jsonb)
 where nombre = 'Artículos bajo stock mínimo';

-- Generador de listados: TODOS los campos de cada ficha (Luis, 29/10/2026). Cada vista v_lst_*
-- pasa a ser «tabla.* + columnas de ayuda» (nombres de cliente, familia, mes, año…), así que
-- cualquier campo que exista en la ficha se puede listar, filtrar, agrupar u ordenar. Los nombres
-- de antes se conservan (los listados guardados siguen valiendo). Campos que nunca se listan:
-- contraseñas y firmas (web_contrasena_hash, huella, huella_anterior, firma_electronica).
-- fn_listado_columnas da la lista de campos de una fuente. Idempotente.

drop view if exists public.v_lst_clientes, public.v_lst_articulos, public.v_lst_stock, public.v_lst_ventas, public.v_lst_ventas_lineas,
  public.v_lst_facturas, public.v_lst_compras, public.v_lst_compras_lineas, public.v_lst_proveedores, public.v_lst_caja;

create view public.v_lst_clientes with (security_invoker = true) as
select c.*, coalesce(nullif(c.telefono_fijo, ''), c.telefono_movil) as telefono, c.telefono_movil as movil, c.provincia_codigo as provincia,
       c.tipo_cliente_codigo as tipo_cliente, tc.descripcion as tipo_cliente_desc, c.zona_territorial_codigo as zona, z.descripcion as zona_desc,
       c.vendedor_codigo as vendedor, ve.nombre as vendedor_nombre, c.ruta_codigo as ruta, c.forma_pago_codigo as forma_pago,
       c.tarifa_nivel_defecto as tarifa
  from cliente c
  left join tipo_cliente tc on tc.codigo = c.tipo_cliente_codigo
  left join zona_territorial z on z.codigo = c.zona_territorial_codigo
  left join vendedor ve on ve.codigo = c.vendedor_codigo;

create view public.v_lst_articulos with (security_invoker = true) as
select a.*, a.codigo_interno as codigo, a.codigo_venta as referencia, a.codigo_barras_principal as codigo_barras,
       a.familia_codigo as familia, f.descripcion as familia_desc, a.marca_codigo as marca,
       a.proveedor_habitual_codigo as proveedor, p.nombre as proveedor_nombre, a.codigo_compra_habitual as codigo_compra, a.coste_neto as coste,
       case when coalesce(a.pvp, 0) <> 0 then round((a.pvp - coalesce(a.coste_neto, 0)) / a.pvp * 100, 2) end as margen_pct,
       st.stock, (coalesce(a.stock_minimo, 0) > 0 and coalesce(st.stock, 0) < a.stock_minimo) as bajo_minimo
  from articulo a
  left join familia f on f.codigo = a.familia_codigo
  left join proveedor p on p.codigo = a.proveedor_habitual_codigo
  left join lateral (select sum(s.cantidad_actual) as stock from articulo_almacen_stock s where s.articulo_codigo = a.codigo_interno) st on true;

create view public.v_lst_stock with (security_invoker = true) as
select s.*, s.articulo_codigo as articulo, a.descripcion, a.familia_codigo as familia, f.descripcion as familia_desc, a.marca_codigo as marca,
       s.almacen_codigo as almacen, s.cantidad_actual as stock, s.cantidad_reservada as reservado, s.cantidad_disponible as disponible,
       a.stock_minimo, a.coste_neto as coste, round(s.cantidad_actual * coalesce(a.coste_neto, 0), 2) as valor_coste,
       a.pvp, round(s.cantidad_actual * coalesce(a.pvp, 0), 2) as valor_pvp, a.activo
  from articulo_almacen_stock s
  join articulo a on a.codigo_interno = s.articulo_codigo
  left join familia f on f.codigo = a.familia_codigo;

create view public.v_lst_ventas with (security_invoker = true) as
select v.*, v.tienda_terminal_codigo as tienda, extract(year from v.fecha)::int as anio, to_char(v.fecha, 'YYYY-MM') as mes,
       v.cliente_codigo as cliente, coalesce(c.nombre, v.nombre_cliente) as cliente_nombre, v.vendedor_codigo as vendedor,
       v.empleado_codigo as empleado, v.forma_pago_codigo as forma_pago,
       (v.factura_numero is not null) as facturada, (v.anulada_en is not null) as anulada
  from venta v
  left join cliente c on c.codigo = v.cliente_codigo;

create view public.v_lst_ventas_lineas with (security_invoker = true) as
select l.*, v.tienda_terminal_codigo as tienda, extract(year from v.fecha)::int as anio, to_char(v.fecha, 'YYYY-MM') as mes,
       v.cliente_codigo as cliente, coalesce(c.nombre, v.nombre_cliente) as cliente_nombre, v.vendedor_codigo as vendedor,
       l.articulo_codigo as articulo, l.codigo_venta as referencia,
       a.familia_codigo as familia, f.descripcion as familia_desc, a.marca_codigo as marca,
       l.subtotal as base, l.total_igic as igic, (l.subtotal + coalesce(l.total_igic, 0)) as total,
       round(l.cantidad * coalesce(a.coste_neto, 0), 2) as coste, round(l.subtotal - l.cantidad * coalesce(a.coste_neto, 0), 2) as margen
  from venta v
  join venta_linea l on l.tienda_terminal_codigo = v.tienda_terminal_codigo and l.numero = v.numero
  left join cliente c on c.codigo = v.cliente_codigo
  left join articulo a on a.codigo_interno = l.articulo_codigo
  left join familia f on f.codigo = a.familia_codigo
 where v.anulada_en is null;

create view public.v_lst_facturas with (security_invoker = true) as
select fa.*, fa.tienda_terminal_codigo as tienda, fa.fecha_factura as fecha,
       extract(year from fa.fecha_factura)::int as anio, to_char(fa.fecha_factura, 'YYYY-MM') as mes,
       fa.cliente_codigo as cliente, coalesce(c.nombre, fa.nombre_cliente) as cliente_nombre, fa.vendedor_codigo as vendedor,
       fa.forma_pago_codigo as forma_pago, fa.total_base as base, fa.total_igic as igic,
       fa.total_pagado as pagado, fa.total_pendiente as pendiente
  from factura fa
  left join cliente c on c.codigo = fa.cliente_codigo;

create view public.v_lst_compras with (security_invoker = true) as
select pp.*, pp.tienda_terminal_codigo as tienda, pp.fecha_hora::date as fecha, extract(year from pp.fecha_hora)::int as anio,
       to_char(pp.fecha_hora, 'YYYY-MM') as mes, pp.proveedor_codigo as proveedor, p.nombre as proveedor_nombre, p.tipo as tipo_proveedor,
       pp.numero_albaran_proveedor as albaran, pp.almacen_codigo as almacen, pp.base_imponible as base,
       pp.total_igic as igic, pp.es_abono as abono
  from pedido_proveedor pp
  left join proveedor p on p.codigo = pp.proveedor_codigo;

create view public.v_lst_compras_lineas with (security_invoker = true) as
select l.*, pp.tienda_terminal_codigo as tienda, pp.fecha_hora::date as fecha, extract(year from pp.fecha_hora)::int as anio,
       to_char(pp.fecha_hora, 'YYYY-MM') as mes, pp.proveedor_codigo as proveedor, p.nombre as proveedor_nombre, pp.estado,
       l.articulo_codigo as articulo, a.familia_codigo as familia, f.descripcion as familia_desc,
       round(coalesce(l.total_unidades, l.cantidad) * coalesce(l.coste_neto, 0), 2) as importe
  from pedido_proveedor pp
  join pedido_proveedor_linea l on l.tienda_terminal_codigo = pp.tienda_terminal_codigo and l.numero = pp.numero
  left join proveedor p on p.codigo = pp.proveedor_codigo
  left join articulo a on a.codigo_interno = l.articulo_codigo
  left join familia f on f.codigo = a.familia_codigo;

create view public.v_lst_proveedores with (security_invoker = true) as
select p.*, coalesce(nullif(p.telefono_fijo, ''), p.telefono_movil) as telefono, p.forma_pago_codigo as forma_pago
  from proveedor p;

create view public.v_lst_caja with (security_invoker = true) as
select m.*, m.tienda_terminal_codigo as tienda, extract(year from m.fecha)::int as anio, to_char(m.fecha, 'YYYY-MM') as mes,
       coalesce(m.ingreso, 0) - coalesce(m.gasto, 0) as neto, m.forma_pago_codigo as forma_pago, m.cliente_codigo as cliente,
       m.empleado_codigo as empleado
  from movimiento_caja m;

grant select on public.v_lst_clientes, public.v_lst_articulos, public.v_lst_stock, public.v_lst_ventas, public.v_lst_ventas_lineas,
  public.v_lst_facturas, public.v_lst_compras, public.v_lst_compras_lineas, public.v_lst_proveedores, public.v_lst_caja to authenticated;
revoke all on public.v_lst_clientes, public.v_lst_articulos, public.v_lst_stock, public.v_lst_ventas, public.v_lst_ventas_lineas,
  public.v_lst_facturas, public.v_lst_compras, public.v_lst_compras_lineas, public.v_lst_proveedores, public.v_lst_caja from anon;

-- Campos que nunca se listan.
create or replace function public.fn_listado_campo_prohibido(p_col text)
returns boolean language sql immutable as $$
  select p_col in ('web_contrasena_hash', 'huella', 'huella_anterior', 'firma_electronica')
$$;

-- Campos de una fuente (para la pantalla).
create or replace function public.fn_listado_columnas(p_fuente text)
returns table (columna text, tipo text)
language sql
stable
security invoker
set search_path to 'public'
as $$
  select column_name::text, data_type::text from information_schema.columns
   where table_schema = 'public' and table_name = 'v_lst_' || p_fuente and not public.fn_listado_campo_prohibido(column_name)
   order by ordinal_position
$$;
grant execute on function public.fn_listado_columnas(text) to authenticated;
revoke execute on function public.fn_listado_columnas(text) from anon, public;

-- fn_listado_ejecutar: igual que antes, sin los campos prohibidos.
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
    from information_schema.columns where table_schema = 'public' and table_name = v_vista
     and not public.fn_listado_campo_prohibido(column_name);
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

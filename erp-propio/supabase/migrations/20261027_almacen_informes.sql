-- Menú Almacén: motor de filtros de los informes de artículos de GeminisWin (capturas 06-20
-- Listados de Artículos, 06-23 Listados de Movimientos de los Artículos y 06-24 Listados de
-- Etiquetas). Los filtros llegan en un jsonb con la misma forma que la pantalla:
--
--   por: 'articulo' | 'familia', nivel: 1|2|3, articulos: {modo, desde, hasta, lista}
--   alm_stock: {almacen: '' (sin almacenes) | '*' (todos) | código, op, v1, v2}
--   texto / pvp / coste / campo / fecha1 / fecha2: {campo|nivel, op, v1, v2}
--   almacenes / tiendas / proveedor / cliente / tercero / pedido: {modo, desde, hasta, lista, ...}
--   anulados: {no, si}, caract: {sin_stock, con_stock, generico, …}
--
-- op: no | igual | distinto | mayor | mayor_igual | menor | menor_igual | entre | empieza |
--     contiene | no_contiene | vacio | no_vacio | lista (valores separados por comas, «Múltiple»)
-- Todo se compone con format(%L / %I) sobre listas blancas de campos: nada del jsonb entra
-- en el SQL sin citar. SECURITY INVOKER (RLS de siempre).

create or replace function public.fn_inf_op(p_expr text, p_op text, p_v1 text, p_v2 text, p_tipo text default 'texto')
returns text language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v1 text := nullif(trim(coalesce(p_v1, '')), '');
  v2 text := nullif(trim(coalesce(p_v2, '')), '');
  c text := case p_tipo when 'num' then '::numeric' when 'fecha' then '::date' else '' end;
  e text;
  sym text;
begin
  if coalesce(p_op, 'no') in ('no', '') then return null; end if;
  if p_op in ('vacio', 'no_vacio') then
    if p_tipo = 'texto' then
      return format('coalesce(%s, '''') %s ''''', p_expr, case when p_op = 'vacio' then '=' else '<>' end);
    end if;
    return format('%s is %snull', p_expr, case when p_op = 'vacio' then '' else 'not ' end);
  end if;
  if v1 is null then return null; end if;
  if p_tipo = 'num' then
    v1 := replace(replace(v1, '.', ''), ',', '.');
    v2 := replace(replace(v2, '.', ''), ',', '.');
    if v1 !~ '^-?\d+(\.\d+)?$' then return null; end if;
    if v2 is not null and v2 !~ '^-?\d+(\.\d+)?$' then v2 := null; end if;
  end if;
  if p_op = 'lista' then
    return format('(%s)::text = any (%L::text[])', p_expr,
                  (select array_agg(trim(x)) from unnest(string_to_array(v1, ',')) x where trim(x) <> ''));
  end if;
  if p_tipo = 'texto' then
    e := format('upper(coalesce(%s, ''''))', p_expr);
    v1 := upper(v1);
    v2 := upper(v2);
    if p_op = 'empieza' then return format('starts_with(%s, %L)', e, v1); end if;
    if p_op = 'contiene' then return format('strpos(%s, %L) > 0', e, v1); end if;
    if p_op = 'no_contiene' then return format('strpos(%s, %L) = 0', e, v1); end if;
  else
    e := p_expr;
    if p_op in ('empieza', 'contiene', 'no_contiene') then
      return format('strpos((%s)::text, %L) %s', p_expr, v1, case when p_op = 'no_contiene' then '= 0' else '> 0' end);
    end if;
  end if;
  if p_op = 'entre' then
    if v2 is null then return format('%s >= %L%s', e, v1, c); end if;
    return format('%s between %L%s and %L%s', e, v1, c, v2, c);
  end if;
  sym := case p_op when 'igual' then '=' when 'distinto' then '<>' when 'mayor' then '>' when 'mayor_igual' then '>='
                   when 'menor' then '<' when 'menor_igual' then '<=' end;
  if sym is null then return null; end if;
  if p_op = 'distinto' then return format('%s is distinct from %L%s', e, v1, c); end if;
  return format('%s %s %L%s', e, sym, v1, c);
end;
$$;

-- Rango «Desde/Hasta · Cualquiera · Seleccionar» sobre una expresión de texto.
create or replace function public.fn_inf_rango(p_expr text, p jsonb)
returns text language plpgsql immutable set search_path = public, pg_temp as $$
declare
  d text := nullif(trim(coalesce(p->>'desde', '')), '');
  h text := nullif(trim(coalesce(p->>'hasta', '')), '');
  l text[];
begin
  if p is null then return null; end if;
  if p->>'modo' = 'rango' then
    if d is null and h is null then return null; end if;
    return concat_ws(' and ', case when d is not null then format('%s >= %L', p_expr, d) end,
                              case when h is not null then format('%s <= %L', p_expr, h) end);
  elsif p->>'modo' = 'seleccionar' then
    select array_agg(trim(x)) into l from jsonb_array_elements_text(coalesce(p->'lista', '[]'::jsonb)) x where trim(x) <> '';
    if l is null then return null; end if;
    return format('%s = any (%L::text[])', p_expr, l);
  end if;
  return null;
end;
$$;

-- Campos de artículo que se pueden usar en los desplegables de filtro: expresión y tipo.
create or replace function public.fn_inf_campo(p_campo text, out expr text, out tipo text)
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  t jsonb := '{
    "codigo_interno":"texto","descripcion":"texto","codigo_venta":"texto","codigo_compra_habitual":"texto",
    "codigo_barras_principal":"texto","descripcion_corta":"texto","campo_libre":"texto","talla":"texto","color":"texto",
    "ubicacion_1":"texto","ubicacion_2":"texto","marca_codigo":"texto","familia_codigo":"texto",
    "plantilla_tarifa_codigo":"texto","proveedor_habitual_codigo":"texto","unidad_medida":"texto",
    "web_categoria":"texto","web_fabricante":"texto",
    "igic_pct":"num","unidades_por_caja":"num","cajas_por_bulto":"num","stock_minimo":"num","stock_maximo":"num",
    "pedido_recomendado":"num","tipo_articulo":"num","control_lotes":"num","garantia_meses":"num",
    "descuento_maximo_cliente_pct":"num","impuesto2_pct":"num","coste_puro":"num","coste_neto":"num",
    "coste_bruto":"num","precio_liquidado":"num","precio_medio_compra":"num","coste_local":"num","pvp":"num",
    "ultima_compra_fecha":"fecha","ultima_venta_fecha":"fecha","fecha_alta":"fecha","fecha_baja":"fecha",
    "fecha_prevista_venta":"fecha","web_fecha_baja":"fecha","oferta_fecha_desde":"fecha","oferta_fecha_hasta":"fecha",
    "fecha_ultima_modificacion_pvp":"fecha"
  }';
begin
  tipo := t->>p_campo;
  if tipo is null then raise exception 'Campo de filtro no permitido: %', p_campo; end if;
  expr := case when p_campo = 'fecha_ultima_modificacion_pvp' then '(a.fecha_ultima_modificacion_pvp at time zone ''Atlantic/Canary'')::date'
               else 'a.' || quote_ident(p_campo) end;
end;
$$;

-- Almacenes que cuentan para el stock: el grupo «Almacenes» y, si se eligió uno, el de «Elegir Almacén».
create or replace function public.fn_inf_alm_cond(p jsonb, p_col text)
returns text language plpgsql immutable set search_path = public, pg_temp as $$
declare
  a text := coalesce(p->'alm_stock'->>'almacen', '');
begin
  return concat_ws(' and ',
    fn_inf_rango(p_col, p->'almacenes'),
    case when a not in ('', '*') then format('%s = %L', p_col, a) end);
end;
$$;

create or replace function public.fn_inf_stock_expr(p jsonb)
returns text language sql immutable set search_path = public, pg_temp as $$
  select format('(select coalesce(sum(s.cantidad_actual), 0) from articulo_almacen_stock s where s.articulo_codigo = a.codigo_interno%s)',
                coalesce(' and ' || nullif(fn_inf_alm_cond(p, 's.almacen_codigo'), ''), ''))
$$;

create or replace function public.fn_inf_pvp_expr(p_nivel int)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case when coalesce(p_nivel, 0) = 0
              then '(select coalesce(max(n.pvp), a.pvp) from articulo_precio_nivel n where n.articulo_codigo = a.codigo_interno and n.nivel_tarifa = 0)'
              else format('(select max(n.pvp) from articulo_precio_nivel n where n.articulo_codigo = a.codigo_interno and n.nivel_tarifa = %s)', p_nivel::int) end
$$;

-- Rango de «Tienda y Número del Pedido» sobre pedido_proveedor_linea (alias pl).
create or replace function public.fn_inf_pedido_cond(g jsonb)
returns text language plpgsql immutable set search_path = public, pg_temp as $$
declare
  td text := nullif(trim(coalesce(g->>'tienda_desde', '')), '');
  th text := nullif(trim(coalesce(g->>'tienda_hasta', '')), '');
  nd text := nullif(regexp_replace(coalesce(g->>'numero_desde', ''), '\D', '', 'g'), '');
  nh text := nullif(regexp_replace(coalesce(g->>'numero_hasta', ''), '\D', '', 'g'), '');
begin
  if g is null then return null; end if;
  if g->>'modo' = 'rango' then
    if td is null and th is null and nd is null and nh is null then return null; end if;
    return concat_ws(' and ',
      case when td is not null or nd is not null then format('(pl.tienda_terminal_codigo, pl.numero) >= (%L, %s)', coalesce(td, ''), coalesce(nd, '0')) end,
      case when th is not null or nh is not null then format('(pl.tienda_terminal_codigo, pl.numero) <= (%L, %s)', coalesce(th, 'ZZZ'), coalesce(nh, '999999999999')) end);
  end if;
  return fn_inf_rango('(pl.tienda_terminal_codigo || ''/'' || pl.numero)', g);
end;
$$;

-- Condición SQL (alias «a» = articulo) con todos los filtros de artículo del informe.
create or replace function public.fn_inf_where_articulo(p jsonb)
returns text language plpgsql stable set search_path = public, pg_temp as $$
declare
  w text[] := array[]::text[];
  x text;
  f record;
  g jsonb;
  k text;
  stock text := fn_inf_stock_expr(p);
  nivel int := coalesce((p->>'nivel')::int, 1);
  pares text[][] := array[
    ['sin_stock', 'con_stock'], ['generico', 'no_generico'], ['compuesto', 'no_compuesto'], ['web', 'no_web'],
    ['activados', 'anulados'], ['con_imagen', 'sin_imagen'], ['pvp_fijo', 'pvp_variable']];
  conds jsonb := jsonb_build_object(
    'sin_stock', stock || ' = 0', 'con_stock', stock || ' <> 0',
    'generico', 'a.generico', 'no_generico', 'not a.generico',
    'compuesto', '(a.compuesto or a.es_kit_de_componentes)', 'no_compuesto', 'not (a.compuesto or a.es_kit_de_componentes)',
    'web', 'a.web_publicado', 'no_web', 'not a.web_publicado',
    'activados', 'a.activo', 'anulados', 'not a.activo',
    'con_imagen', 'coalesce(a.imagen_url, '''') <> ''''', 'sin_imagen', 'coalesce(a.imagen_url, '''') = ''''',
    'pvp_fijo', 'a.pvp_fijo', 'pvp_variable', 'not a.pvp_fijo');
  i int;
begin
  -- Artículo o familia (nivel 1º = familia.nivel1, 2º = nivel2, 3º = código de familia).
  if coalesce(p->>'por', 'articulo') = 'familia' then
    x := fn_inf_rango(case nivel when 1 then '(select fa.nivel1 from familia fa where fa.codigo = a.familia_codigo)'
                                 when 2 then '(select fa.nivel2 from familia fa where fa.codigo = a.familia_codigo)'
                                 else 'a.familia_codigo' end, p->'articulos');
  else
    x := fn_inf_rango('a.codigo_interno', p->'articulos');
  end if;
  if x is not null then w := w || x; end if;

  -- Stock del almacén elegido (si no es «Sin Almacenes» y no se ha desactivado).
  if coalesce(p->'alm_stock'->>'almacen', '') <> '' and coalesce(p->>'aplicar_stock', 'true') <> 'false' then
    x := fn_inf_op(stock, p->'alm_stock'->>'op', p->'alm_stock'->>'v1', p->'alm_stock'->>'v2', 'num');
    if x is not null then w := w || x; end if;
  end if;

  foreach k in array array['texto', 'campo', 'fecha1', 'fecha2', 'coste'] loop
    g := p->k;
    if g is not null and coalesce(g->>'op', 'no') <> 'no' and coalesce(g->>'campo', '') <> '' then
      select * into f from fn_inf_campo(g->>'campo');
      x := fn_inf_op(f.expr, g->>'op', g->>'v1', g->>'v2', f.tipo);
      if x is not null then w := w || x; end if;
    end if;
  end loop;

  g := p->'pvp';
  if g is not null and coalesce(g->>'op', 'no') <> 'no' then
    x := fn_inf_op(fn_inf_pvp_expr(coalesce((g->>'nivel')::int, 0)), g->>'op', g->>'v1', g->>'v2', 'num');
    if x is not null then w := w || x; end if;
  end if;

  -- Proveedor: principal (habitual), cualquiera de la ficha, o con código de compra.
  g := p->'proveedor';
  if g is not null then
    if coalesce(g->>'tipo', 'principal') = 'principal' then
      x := fn_inf_rango('a.proveedor_habitual_codigo', g);
    else
      x := fn_inf_rango('ap.proveedor_codigo', g);
      if x is not null then
        x := format('exists (select 1 from articulo_proveedor ap where ap.articulo_codigo = a.codigo_interno and %s%s)', x,
                    case when g->>'tipo' = 'codigo' then ' and coalesce(ap.codigo_compra, '''') <> ''''' else '' end);
      end if;
    end if;
    if x is not null then w := w || x; end if;
  end if;

  -- Tienda y número del pedido a proveedor (Etiquetas): artículos que están en esos pedidos.
  x := fn_inf_pedido_cond(p->'pedido');
  if x is not null then
    w := w || format('exists (select 1 from pedido_proveedor_linea pl where pl.articulo_codigo = a.codigo_interno and %s)', x);
  end if;

  -- Art. Anulados: «No» = los activos, «Sí» = los anulados; los dos o ninguno = todos.
  if coalesce((p->'anulados'->>'no')::boolean, false) <> coalesce((p->'anulados'->>'si')::boolean, false) then
    w := w || case when (p->'anulados'->>'no')::boolean then 'a.activo' else 'not a.activo' end;
  end if;

  -- Características: de cada pareja, si solo hay una marcada se filtra por ella.
  for i in 1 .. array_length(pares, 1) loop
    if coalesce((p->'caract'->>pares[i][1])::boolean, false) <> coalesce((p->'caract'->>pares[i][2])::boolean, false) then
      w := w || (conds->>(case when (p->'caract'->>pares[i][1])::boolean then pares[i][1] else pares[i][2] end));
    end if;
  end loop;

  if coalesce(p->>'bajo_minimo', 'false') = 'true' then
    w := w || format('%s < coalesce(a.stock_minimo, 0)', stock);
  end if;

  return coalesce(nullif(array_to_string(w, ' and '), ''), 'true');
end;
$$;

-- ───────────── Listados de Artículos (06-20) y Etiquetas (06-24) ─────────────
create or replace function public.fn_informe_articulos(p jsonb)
returns table (
  codigo_interno text,
  descripcion text,
  codigo_venta text,
  codigo_barras text,
  codigo_compra text,
  familia_codigo text,
  marca_codigo text,
  proveedor_codigo text,
  igic_pct numeric,
  pvp0 numeric, pvp1 numeric, pvp2 numeric, pvp3 numeric, pvp4 numeric, pvp5 numeric, pvp6 numeric,
  coste numeric,
  stock numeric,
  stock_minimo numeric,
  stock_maximo numeric,
  valor numeric,
  ultima_compra date,
  ultima_venta date,
  fecha_mod_pvp timestamptz,
  activo boolean,
  unidades_pedido numeric,
  stocks jsonb,
  total_filas bigint,
  total_stock numeric,
  total_valor numeric
)
language plpgsql stable set search_path = public, pg_temp as $$
declare
  w text := fn_inf_where_articulo(p);
  st text := fn_inf_stock_expr(p);
  coste_campo text := coalesce(nullif(p->'coste'->>'campo', ''), 'precio_liquidado');
  orden text;
  ped text := 'null::numeric';
  g jsonb := p->'pedido';
  alm text := fn_inf_alm_cond(p, 's.almacen_codigo');
begin
  if coste_campo not in ('coste_puro', 'coste_neto', 'coste_bruto', 'precio_liquidado', 'precio_medio_compra', 'coste_local') then
    coste_campo := 'precio_liquidado';
  end if;
  orden := case p->>'orden'
             when 'descripcion' then 'f.descripcion, f.codigo_interno'
             when 'familia' then 'f.familia_codigo, f.codigo_interno'
             when 'familia_desc' then 'f.familia_codigo, f.descripcion, f.codigo_interno'
             when 'marca' then 'f.marca_codigo, f.codigo_interno'
             when 'proveedor' then 'f.proveedor_habitual_codigo, f.codigo_interno'
             when 'codigo_compra' then 'f.codigo_compra_habitual, f.codigo_interno'
             when 'stock' then 'f.stock_c desc, f.codigo_interno'
             else 'f.codigo_interno' end;
  if fn_inf_pedido_cond(g) is not null then
    ped := '(select sum(case when pl.recibido then coalesce(pl.unidades_recibidas, pl.total_unidades, pl.cantidad) else coalesce(pl.total_unidades, pl.cantidad) end)
             from pedido_proveedor_linea pl where pl.articulo_codigo = a.codigo_interno and ' || fn_inf_pedido_cond(g) || ')';
  end if;
  return query execute format($q$
    with f as (
      select a.*, %1$s as stock_c, a.%2$I as coste_c, %3$s as ud_ped
      from articulo a
      where %4$s
    )
    select f.codigo_interno, f.descripcion, f.codigo_venta, f.codigo_barras_principal, f.codigo_compra_habitual,
           f.familia_codigo, f.marca_codigo, f.proveedor_habitual_codigo, f.igic_pct,
           coalesce(pv.p0, f.pvp), pv.p1, pv.p2, pv.p3, pv.p4, pv.p5, pv.p6,
           f.coste_c, f.stock_c, f.stock_minimo, f.stock_maximo, round(f.stock_c * coalesce(f.coste_c, 0), 2),
           f.ultima_compra_fecha, f.ultima_venta_fecha, f.fecha_ultima_modificacion_pvp, f.activo, f.ud_ped,
           %5$s,
           count(*) over (), sum(f.stock_c) over (), sum(round(f.stock_c * coalesce(f.coste_c, 0), 2)) over ()
    from f
    left join lateral (
      select max(n.pvp) filter (where n.nivel_tarifa = 0) p0, max(n.pvp) filter (where n.nivel_tarifa = 1) p1,
             max(n.pvp) filter (where n.nivel_tarifa = 2) p2, max(n.pvp) filter (where n.nivel_tarifa = 3) p3,
             max(n.pvp) filter (where n.nivel_tarifa = 4) p4, max(n.pvp) filter (where n.nivel_tarifa = 5) p5,
             max(n.pvp) filter (where n.nivel_tarifa = 6) p6
      from articulo_precio_nivel n where n.articulo_codigo = f.codigo_interno
    ) pv on true
    order by %6$s
    limit %7$s offset %8$s
  $q$,
    st, coste_campo, ped, w,
    case when coalesce(p->>'con_stocks', 'false') = 'true'
         then format('(select jsonb_object_agg(s.almacen_codigo, s.cantidad_actual) from articulo_almacen_stock s where s.articulo_codigo = f.codigo_interno%s)',
                     coalesce(' and ' || nullif(alm, ''), ''))
         else 'null::jsonb' end,
    orden,
    greatest(1, least(coalesce((p->>'limite')::int, 200), 1000)),
    greatest(0, coalesce((p->>'desplazamiento')::int, 0)));
end;
$$;

-- ───────────── Listados de Movimientos de los Artículos (06-23) ─────────────
-- informe: todos | venta | compra | traspaso | regularizacion. Saldo acumulado por artículo y
-- almacén con TODOS los movimientos anteriores (es el stock real tras cada movimiento).
create or replace function public.fn_informe_movimientos(p jsonb)
returns table (
  id bigint,
  ocurrido_en timestamptz,
  fecha_documento date,
  articulo_codigo text,
  descripcion text,
  almacen_codigo text,
  tipo_movimiento text,
  documento_origen_tipo text,
  documento_origen_tienda_codigo text,
  documento_origen_numero bigint,
  documento_origen_linea integer,
  tercero_codigo text,
  tercero_nombre text,
  empleado_codigo text,
  entrada numeric,
  salida numeric,
  saldo numeric,
  costo_unitario numeric,
  observaciones text,
  total_filas bigint,
  total_entradas numeric,
  total_salidas numeric
)
language plpgsql stable set search_path = public, pg_temp as $$
declare
  w_art text := fn_inf_where_articulo(p || jsonb_build_object('aplicar_stock', coalesce(p->>'filtrando_stock', 'false')));
  w_alm text := coalesce(fn_inf_rango('m.almacen_codigo', p->'almacenes'), 'true');
  w text[] := array[]::text[];
  x text;
  tipos text[];
  fdoc text;
  orden text;
begin
  tipos := case p->>'informe'
             when 'venta' then array['venta', 'devolucion_cliente']
             when 'compra' then array['compra', 'devolucion_proveedor']
             when 'traspaso' then array['traspaso']
             when 'regularizacion' then array['regularizacion', 'inventario']
             else null end;
  if tipos is not null then w := w || format('b.tipo_movimiento = any (%L::text[])', tipos); end if;

  x := fn_inf_rango('coalesce(b.documento_origen_tienda_codigo, b.tienda_terminal_codigo)', p->'tiendas');
  if x is not null then w := w || x; end if;

  fdoc := case coalesce(p->'fecha'->>'tipo', 'llegada')
            when 'pedido' then 'coalesce(b.f_doc, b.f_mov)'
            when 'factura' then 'coalesce(b.f_fac, b.f_doc, b.f_mov)'
            else 'b.f_mov' end;
  if p->'fecha'->>'modo' = 'rango' then
    if coalesce(p->'fecha'->>'desde', '') <> '' then w := w || format('%s >= %L::date', fdoc, p->'fecha'->>'desde'); end if;
    if coalesce(p->'fecha'->>'hasta', '') <> '' then w := w || format('%s <= %L::date', fdoc, p->'fecha'->>'hasta'); end if;
  end if;

  x := fn_inf_rango(case coalesce(p->'tercero'->>'tipo', 'proveedor')
                      when 'vendedor' then 'b.vendedor'
                      when 'empleado' then 'b.empleado'
                      else 'b.proveedor' end, p->'tercero');
  if x is not null then w := w || x; end if;
  x := fn_inf_rango('b.cliente', p->'cliente');
  if x is not null then w := w || x; end if;

  orden := case p->>'orden'
             when 'fecha' then 'z.ocurrido_en, z.id'
             when 'documento' then 'z.documento_origen_tipo, z.documento_origen_tienda_codigo, z.documento_origen_numero, z.id'
             when 'descripcion' then 'z.descripcion, z.articulo_codigo, z.almacen_codigo, z.ocurrido_en, z.id'
             else 'z.articulo_codigo, z.almacen_codigo, z.ocurrido_en, z.id' end;

  return query execute format($q$
    with base as (
      select m.*,
             sum(m.sentido * m.cantidad) over (partition by m.articulo_codigo, m.almacen_codigo order by m.ocurrido_en, m.id) as saldo_acum,
             (m.ocurrido_en at time zone 'Atlantic/Canary')::date as f_mov,
             a.descripcion as art_desc
      from movimiento_stock m
      join articulo a on a.codigo_interno = m.articulo_codigo
      where %1$s and %2$s
    ),
    b as (
      select base.*,
             coalesce((v.fecha)::date, (pp.fecha_hora at time zone 'Atlantic/Canary')::date, tr.fecha::date) as f_doc,
             coalesce((select fc.fecha_factura from factura fc where fc.tienda_terminal_codigo = v.factura_tienda_codigo and fc.numero = v.factura_numero), pp.fecha_factura) as f_fac,
             v.cliente_codigo as cliente, v.nombre_cliente as cliente_nombre, v.vendedor_codigo as vendedor,
             pp.proveedor_codigo as proveedor,
             coalesce(base.empleado_codigo, v.empleado_codigo, tr.empleado_codigo) as empleado
      from base
      left join venta v on base.documento_origen_tipo = 'venta' and v.tienda_terminal_codigo = base.documento_origen_tienda_codigo and v.numero = base.documento_origen_numero
      left join pedido_proveedor pp on base.documento_origen_tipo = 'pedido_proveedor' and pp.tienda_terminal_codigo = base.documento_origen_tienda_codigo and pp.numero = base.documento_origen_numero
      left join traspaso_almacen tr on base.documento_origen_tipo = 'traspaso_almacen' and tr.tienda_terminal_codigo = base.documento_origen_tienda_codigo and tr.numero = base.documento_origen_numero
    ),
    z as (
      select b.id, b.ocurrido_en, b.f_doc, b.articulo_codigo, b.art_desc as descripcion, b.almacen_codigo, b.tipo_movimiento,
             b.documento_origen_tipo, b.documento_origen_tienda_codigo, b.documento_origen_numero, b.documento_origen_linea,
             coalesce(b.cliente, b.proveedor) as tercero,
             coalesce(b.cliente_nombre, (select pr.nombre from proveedor pr where pr.codigo = b.proveedor)) as tercero_nombre,
             b.empleado,
             case when b.sentido = 1 then b.cantidad else 0 end as ent,
             case when b.sentido = -1 then b.cantidad else 0 end as sal,
             b.saldo_acum, b.costo_unitario, b.observaciones
      from b
      where %3$s
    )
    select z.id, z.ocurrido_en, z.f_doc, z.articulo_codigo, z.descripcion, z.almacen_codigo, z.tipo_movimiento,
           z.documento_origen_tipo, z.documento_origen_tienda_codigo, z.documento_origen_numero, z.documento_origen_linea,
           z.tercero, z.tercero_nombre, z.empleado, z.ent, z.sal, z.saldo_acum, z.costo_unitario, z.observaciones,
           count(*) over (), sum(z.ent) over (), sum(z.sal) over ()
    from z
    order by %4$s
    limit %5$s offset %6$s
  $q$,
    w_art, w_alm,
    coalesce(nullif(array_to_string(w, ' and '), ''), 'true'), orden,
    greatest(1, least(coalesce((p->>'limite')::int, 200), 1000)),
    greatest(0, coalesce((p->>'desplazamiento')::int, 0)));
end;
$$;

-- Resumen por artículo y almacén (informe «Resumen de Movimientos»): saldo inicial antes de la
-- fecha desde, entradas, salidas y saldo final; con «Incluir artículos sin movimientos» salen
-- también los que tienen ficha de stock en esos almacenes y ningún movimiento en el periodo.
create or replace function public.fn_informe_movimientos_resumen(p jsonb)
returns table (
  articulo_codigo text,
  descripcion text,
  almacen_codigo text,
  saldo_inicial numeric,
  entradas numeric,
  salidas numeric,
  saldo_final numeric,
  movimientos bigint,
  total_filas bigint,
  total_entradas numeric,
  total_salidas numeric
)
language plpgsql stable set search_path = public, pg_temp as $$
declare
  w_art text := fn_inf_where_articulo(p || jsonb_build_object('aplicar_stock', coalesce(p->>'filtrando_stock', 'false')));
  w_alm text := coalesce(fn_inf_rango('m.almacen_codigo', p->'almacenes'), 'true');
  d text := case when p->'fecha'->>'modo' = 'rango' then nullif(p->'fecha'->>'desde', '') end;
  h text := case when p->'fecha'->>'modo' = 'rango' then nullif(p->'fecha'->>'hasta', '') end;
  en_periodo text;
begin
  en_periodo := concat_ws(' and ', 'true',
    case when d is not null then format('m.ocurrido_en >= fn_dia_canarias(%L::date)', d) end,
    case when h is not null then format('m.ocurrido_en < fn_dia_canarias(%L::date + 1)', h) end);
  return query execute format($q$
    with g as (
      select m.articulo_codigo, m.almacen_codigo,
             sum(case when %3$s then m.sentido * m.cantidad else 0 end) as ini,
             sum(case when %4$s and m.sentido = 1 then m.cantidad else 0 end) as ent,
             sum(case when %4$s and m.sentido = -1 then m.cantidad else 0 end) as sal,
             count(*) filter (where %4$s) as n
      from movimiento_stock m
      join articulo a on a.codigo_interno = m.articulo_codigo
      where %1$s and %2$s %5$s
      group by m.articulo_codigo, m.almacen_codigo
    ),
    u as (
      select g.* from g where g.n > 0 or %6$s
      union all
      select s.articulo_codigo, s.almacen_codigo, s.cantidad_actual, 0, 0, 0
      from articulo_almacen_stock s
      join articulo a on a.codigo_interno = s.articulo_codigo
      where %6$s and %7$s and %8$s
        and not exists (select 1 from g where g.articulo_codigo = s.articulo_codigo and g.almacen_codigo = s.almacen_codigo)
    )
    select u.articulo_codigo, a.descripcion, u.almacen_codigo, u.ini, u.ent, u.sal, u.ini + u.ent - u.sal, u.n,
           count(*) over (), sum(u.ent) over (), sum(u.sal) over ()
    from u join articulo a on a.codigo_interno = u.articulo_codigo
    order by u.articulo_codigo, u.almacen_codigo
    limit %9$s offset %10$s
  $q$,
    w_art, w_alm,
    case when d is not null then format('m.ocurrido_en < fn_dia_canarias(%L::date)', d) else 'false' end,
    en_periodo,
    case when h is not null then format('and m.ocurrido_en < fn_dia_canarias(%L::date + 1)', h) else '' end,
    case when coalesce(p->>'sin_movimientos', 'false') = 'true' then 'true' else 'false' end,
    w_art, coalesce(fn_inf_rango('s.almacen_codigo', p->'almacenes'), 'true'),
    greatest(1, least(coalesce((p->>'limite')::int, 200), 1000)),
    greatest(0, coalesce((p->>'desplazamiento')::int, 0)));
end;
$$;

grant execute on function public.fn_informe_articulos(jsonb) to authenticated;
grant execute on function public.fn_informe_movimientos(jsonb) to authenticated;
grant execute on function public.fn_informe_movimientos_resumen(jsonb) to authenticated;
revoke execute on function public.fn_informe_articulos(jsonb) from public, anon;
revoke execute on function public.fn_informe_movimientos(jsonb) from public, anon;
revoke execute on function public.fn_informe_movimientos_resumen(jsonb) from public, anon;

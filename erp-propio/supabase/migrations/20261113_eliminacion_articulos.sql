-- Almacén → Eliminación de Artículos, calcada de GeminisWin (capturas 9, 12/11/2026).
-- En GeminisWin esta opción solo se activa con clave especial: aquí la exige la base de datos
-- (fn_es_administrador), no solo la pantalla.
--
--   fn_eliminar_articulos_where(p)    → condición SQL de los filtros y las restricciones (texto).
--   fn_eliminar_articulos_listado(p)  → SOLO LECTURA: los artículos que cumplen (Pantalla,
--                                       Impresora, Examinar), con cuántos son.
--   fn_eliminar_articulos_baja(...)   → «Procesar» en modo «Dar de Baja a partir de la fecha».
--                                       No borra nada. La auditoría la deja el trigger de articulo
--                                       (trg_auditoria_articulo), una línea por artículo.
--
-- El BORRADO DEFINITIVO de artículos NO está programado: pendiente de decidir por la gerencia.
--
-- Los filtros comunes (rango de artículos/familias, stock, código, fechas, anulados,
-- características) reutilizan fn_inf_where_articulo de los informes de artículos
-- (20261027_almacen_informes.sql). Aquí solo se añade lo propio de esta pantalla.

create or replace function public.fn_eliminar_articulos_where(p jsonb)
returns text
language plpgsql stable set search_path = public, pg_temp as $$
declare
  w text[] := array[]::text[];
  x text;
  g jsonb;
  k text;
  col text;
  t text[] := array[]::text[];
  fam_web boolean := coalesce(p->>'por', 'articulo') = 'familia' and coalesce((p->>'familia_web')::boolean, false);
  hijo text := 'exists (select 1 from articulo_variante v join articulo pa on pa.codigo_interno = v.articulo_codigo '
            || 'where v.codigo_variante = a.codigo_interno and v.articulo_codigo <> a.codigo_interno and %s)';
  padre text := 'exists (select 1 from articulo_variante v where v.articulo_codigo = a.codigo_interno)';
begin
  -- 1) Lo que ya saben hacer los informes de artículos.
  x := fn_inf_where_articulo(jsonb_strip_nulls(jsonb_build_object(
         'por', case when fam_web then 'articulo' else coalesce(p->>'por', 'articulo') end,
         'nivel', coalesce((p->>'nivel')::int, 1),
         'articulos', case when fam_web then null else p->'articulos' end,
         'alm_stock', p->'alm_stock',
         'texto', p->'texto',
         'fecha1', p->'fecha1',
         'fecha2', p->'fecha2',
         'anulados', p->'anulados',
         'caract', p->'caract')));
  if x <> 'true' then w := w || x; end if;

  -- 2) «Filtrar por: Familia … Web»: por el código de la familia en la web.
  if fam_web then
    x := fn_inf_rango('(select fa.web_codigo from familia fa where fa.codigo = a.familia_codigo)', p->'articulos');
    if x is not null then w := w || x; end if;
  end if;

  -- 3) Fecha Ultima Compra / Ultima Venta / de Alta / de Baja (Desde/Hasta · Cualquiera).
  foreach k in array array['f_compra', 'f_venta', 'f_alta', 'f_baja'] loop
    g := p->k;
    if g->>'modo' = 'rango' then
      col := case k when 'f_compra' then 'a.ultima_compra_fecha' when 'f_venta' then 'a.ultima_venta_fecha'
                    when 'f_alta' then 'a.fecha_alta' else 'a.fecha_baja' end;
      if nullif(g->>'desde', '') is not null then w := w || format('%s >= %L::date', col, g->>'desde'); end if;
      if nullif(g->>'hasta', '') is not null then w := w || format('%s <= %L::date', col, g->>'hasta'); end if;
    end if;
  end loop;

  -- 4) «Filtrar por: Marca · Campo Libre · Proveedor».
  g := p->'tercero';
  x := fn_inf_rango(case coalesce(g->>'tipo', 'marca') when 'campo_libre' then 'a.campo_libre'
                                                       when 'proveedor' then 'a.proveedor_habitual_codigo'
                                                       else 'a.marca_codigo' end, g);
  if x is not null then w := w || x; end if;

  -- 5) Tallas y Colores: excluir (o quedarse solo con) padres e hijos.
  g := p->'tallas';
  if coalesce((g->>'padre_mismo')::boolean, false) then t := t || format('(%s and a.pvp_es_padre_de_variantes)', padre); end if;
  if coalesce((g->>'padre_distinto')::boolean, false) then t := t || format('(%s and not a.pvp_es_padre_de_variantes)', padre); end if;
  if coalesce((g->>'hijo_padre')::boolean, false) then t := t || format(hijo, 'pa.pvp_es_padre_de_variantes'); end if;
  if coalesce((g->>'hijo_propio')::boolean, false) then t := t || format(hijo, 'not pa.pvp_es_padre_de_variantes'); end if;
  if array_length(t, 1) > 0 then
    w := w || ((case when g->>'modo' = 'filtrar' then '' else 'not ' end) || '(' || array_to_string(t, ' or ') || ')');
  end if;

  -- 6) Restricciones para la Eliminación de los Artículos.
  g := p->'restr';
  if coalesce((g->>'ventas')::boolean, false) then
    w := w || 'not exists (select 1 from venta_linea vl where vl.articulo_codigo = a.codigo_interno)'::text;
    w := w || 'not exists (select 1 from pedido_cliente_linea pc where pc.articulo_codigo = a.codigo_interno)'::text;
  end if;
  if coalesce((g->>'compras')::boolean, false) then
    w := w || 'not exists (select 1 from pedido_proveedor_linea ppl where ppl.articulo_codigo = a.codigo_interno)'::text;
  end if;
  if coalesce((g->>'traspasos')::boolean, false) then
    w := w || 'not exists (select 1 from traspaso_almacen_linea tl where tl.articulo_codigo = a.codigo_interno)'::text;
  end if;
  if coalesce((g->>'stock')::boolean, false) then
    w := w || 'not exists (select 1 from articulo_almacen_stock st where st.articulo_codigo = a.codigo_interno and st.cantidad_actual > 0)'::text;
  end if;
  if coalesce((g->>'pvp_cero')::boolean, false) then
    w := w || format('coalesce(%s, 0) = 0', fn_inf_pvp_expr(0));
  end if;

  return coalesce(nullif(array_to_string(w, ' and '), ''), 'true');
end;
$$;

-- Solo lectura: lo que saldría por Pantalla, Impresora o Examinar.
create or replace function public.fn_eliminar_articulos_listado(p jsonb)
returns table (
  codigo_interno text,
  descripcion text,
  familia_codigo text,
  marca_codigo text,
  proveedor_codigo text,
  pvp numeric,
  stock numeric,
  ultima_compra date,
  ultima_venta date,
  fecha_alta date,
  fecha_baja date,
  activo boolean,
  web_publicado boolean,
  tiene_ventas boolean,
  tiene_compras boolean,
  tiene_traspasos boolean,
  total_filas bigint
)
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_orden text;
begin
  if not public.fn_es_administrador() then
    raise exception 'La Eliminación de Artículos es solo para administradores. Pídeselo a un administrador.' using errcode = '42501';
  end if;
  -- «Elegir y/o Filtrar y Ordenar según Código, …»: el campo elegido también ordena.
  select f.expr into v_orden from fn_inf_campo(coalesce(nullif(p->'texto'->>'campo', ''), 'codigo_interno')) f;
  return query execute format($q$
    select a.codigo_interno, a.descripcion, a.familia_codigo, a.marca_codigo, a.proveedor_habitual_codigo,
           %1$s::numeric,
           (select coalesce(sum(s.cantidad_actual), 0) from articulo_almacen_stock s where s.articulo_codigo = a.codigo_interno),
           a.ultima_compra_fecha, a.ultima_venta_fecha, a.fecha_alta, a.fecha_baja, a.activo, a.web_publicado,
           (exists (select 1 from venta_linea vl where vl.articulo_codigo = a.codigo_interno)
             or exists (select 1 from pedido_cliente_linea pc where pc.articulo_codigo = a.codigo_interno)),
           exists (select 1 from pedido_proveedor_linea ppl where ppl.articulo_codigo = a.codigo_interno),
           exists (select 1 from traspaso_almacen_linea tl where tl.articulo_codigo = a.codigo_interno),
           count(*) over ()
    from articulo a
    where %2$s
    order by %3$s, a.codigo_interno
    limit %4$s offset %5$s
  $q$,
    fn_inf_pvp_expr(0), fn_eliminar_articulos_where(p), v_orden,
    greatest(1, least(coalesce((p->>'limite')::int, 200), 1000)),
    greatest(0, coalesce((p->>'desplazamiento')::int, 0)));
end;
$$;

-- «Procesar» con «Al Procesar, No Eliminar Artículos, Dar de Baja a partir de la fecha».
-- Vuelve a calcular la lista en el servidor (no se fía de la que manda la pantalla) y, si se le
-- dice cuántos artículos vio el usuario al confirmar (p_esperados), se niega si ya no coinciden.
-- No borra nada: pone la fecha de baja y, si la fecha ya ha llegado, anula el artículo.
-- «Darlos de baja en la Web»: quita «publicar en web» y pone la fecha de baja web (los dos campos
-- de la ficha del artículo, pestaña Imagen/Web, que son los que mira la sincronización del catálogo).
create or replace function public.fn_eliminar_articulos_baja(
  p jsonb,
  p_fecha date,
  p_web boolean default false,
  p_esperados bigint default null
)
returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare
  v_cods text[];
  v_n bigint;
  v_hoy date := (now() at time zone 'Atlantic/Canary')::date;
  v_ya bigint;
  v_web bigint;
begin
  if auth.uid() is null or not public.fn_es_administrador() then
    raise exception 'Dar de baja artículos en bloque es solo para administradores. Pídeselo a un administrador.' using errcode = '42501';
  end if;
  if p_fecha is null then
    raise exception 'Falta la fecha de baja. Escríbela en «Dar de Baja a partir de la fecha» y vuelve a procesar.';
  end if;

  execute format('select array_agg(a.codigo_interno order by a.codigo_interno) from articulo a where %s', fn_eliminar_articulos_where(p))
    into v_cods;
  v_n := coalesce(array_length(v_cods, 1), 0);
  if p_esperados is not null and p_esperados <> v_n then
    raise exception 'La lista de artículos ha cambiado desde que la viste (eran %, ahora son %). Vuelve a pulsar Procesar para revisarla.', p_esperados, v_n;
  end if;
  if v_n = 0 then
    return jsonb_build_object('total', 0, 'dados_de_baja', 0, 'ya_de_baja', 0, 'baja_web', 0, 'fecha', p_fecha, 'anulados', p_fecha <= v_hoy);
  end if;

  select count(*) filter (where not a.activo and a.fecha_baja is not null),
         count(*) filter (where p_web and (a.web_publicado or a.web_fecha_baja is null))
    into v_ya, v_web
    from articulo a where a.codigo_interno = any (v_cods);

  -- Una sola sentencia: todo o nada. Los que ya estaban de baja conservan su fecha.
  update articulo a set
    fecha_baja = case when a.activo or a.fecha_baja is null then p_fecha else a.fecha_baja end,
    activo = case when p_fecha <= v_hoy then false else a.activo end,
    web_publicado = case when p_web then false else a.web_publicado end,
    web_fecha_baja = case when p_web and (a.web_publicado or a.web_fecha_baja is null) then p_fecha else a.web_fecha_baja end,
    actualizado_en = now()
  where a.codigo_interno = any (v_cods);

  return jsonb_build_object('total', v_n, 'dados_de_baja', v_n - v_ya, 'ya_de_baja', v_ya, 'baja_web', v_web,
                            'fecha', p_fecha, 'anulados', p_fecha <= v_hoy);
end;
$$;

revoke all on function public.fn_eliminar_articulos_where(jsonb) from public, anon;
revoke all on function public.fn_eliminar_articulos_listado(jsonb) from public, anon;
revoke all on function public.fn_eliminar_articulos_baja(jsonb, date, boolean, bigint) from public, anon;
grant execute on function public.fn_eliminar_articulos_where(jsonb) to authenticated, service_role;
grant execute on function public.fn_eliminar_articulos_listado(jsonb) to authenticated, service_role;
grant execute on function public.fn_eliminar_articulos_baja(jsonb, date, boolean, bigint) to authenticated, service_role;

-- La función de la pantalla anterior (baja por lista de códigos) sigue existiendo: se le exige
-- también ser administrador, para que no quede una puerta lateral a la baja en bloque.
create or replace function public.fn_articulos_eliminacion_baja(p_codigos text[])
returns table (codigo_interno text, resultado text)
language plpgsql set search_path = public, pg_temp as $$
declare
  c text;
begin
  -- [seguridad 20261028] solo quien tiene la pantalla; [20261113] y además administrador
  if not (public.fn_puede('/almacen/eliminacion-articulos') and public.fn_es_administrador()) then
    raise exception 'Dar de baja artículos en bloque es solo para administradores. Pídeselo a un administrador.' using errcode = '42501';
  end if;
  foreach c in array coalesce(p_codigos, array[]::text[]) loop
    if not exists (select 1 from articulo a where a.codigo_interno = c) then
      codigo_interno := c; resultado := 'No existe'; return next;
    elsif exists (select 1 from movimiento_stock m where m.articulo_codigo = c) then
      codigo_interno := c; resultado := 'Tiene movimientos de stock: no se da de baja'; return next;
    elsif exists (select 1 from articulo_almacen_stock s where s.articulo_codigo = c and s.cantidad_actual <> 0) then
      codigo_interno := c; resultado := 'Tiene stock: no se da de baja'; return next;
    elsif exists (select 1 from venta_linea v where v.articulo_codigo = c)
       or exists (select 1 from pedido_cliente_linea p where p.articulo_codigo = c)
       or exists (select 1 from pedido_proveedor_linea p where p.articulo_codigo = c) then
      codigo_interno := c; resultado := 'Está en ventas o pedidos: no se da de baja'; return next;
    else
      update articulo a set activo = false, fecha_baja = coalesce(a.fecha_baja, current_date), web_publicado = false where a.codigo_interno = c;
      codigo_interno := c; resultado := 'Dado de baja'; return next;
    end if;
  end loop;
end;
$$;

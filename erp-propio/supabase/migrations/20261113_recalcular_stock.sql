-- Almacén → Recalcular Stock, calcado de GeminisWin (capturas 02 y 03 del bloque 9, con clave
-- especial). En GeminisWin es un submenú con cuatro procesos directos:
--   Recalcular Stock · Recalcular Stock de Lotes · Recalcular Stock Reservado · Recalcular Stock Pedido
-- Aquí cada uno es una función que REHACE el dato a partir de los documentos:
--   fn_recalcular_stock            stock de cada artículo y almacén = suma de movimiento_stock
--   fn_recalcular_stock_lotes      cantidad de cada lote (articulo_lote) = suma de articulo_lote_movimiento
--   fn_recalcular_stock_reservado  reservado por artículo y almacén = unidades sin servir de los pedidos de cliente
--   fn_recalcular_stock_pedido     unidades pedidas del artículo (y por proveedor) = unidades sin recibir de los
--                                  pedidos a proveedor
-- Todas: SOLO ADMINISTRADORES (en GeminisWin piden la clave especial), security definer, sin acceso para
-- anon. Con p_aplicar = false (por defecto) NO cambian nada: solo cuentan lo que cambiaría, para que la
-- pantalla lo enseñe antes de confirmar. Con p_aplicar = true cambian el dato y dejan constancia en
-- recalculo_stock_registro (quién, cuándo y el valor de antes y de después de cada fila cambiada), porque
-- articulo_almacen_stock es un dato calculado que no lleva auditoría fila a fila.
-- Solo cambios aditivos. No se generan movimientos ni se toca ningún documento.

-- ───────────────────────── Registro de recálculos ─────────────────────────
create table if not exists public.recalculo_stock_registro (
  id bigint generated always as identity primary key,
  proceso text not null check (proceso in ('stock', 'lotes', 'reservado', 'pedido')),
  ejecutado_en timestamptz not null default now(),
  usuario_id uuid,
  empleado_codigo text,
  revisados integer not null default 0,
  cambiados integer not null default 0,
  -- Una entrada por fila cambiada, con el valor de antes y el de después (sirve para deshacer a mano).
  cambios jsonb not null default '[]'::jsonb
);
comment on table public.recalculo_stock_registro is
  'Almacén → Recalcular Stock: cada recálculo aplicado, quién lo lanzó y qué cambió (antes/después).';

alter table public.recalculo_stock_registro enable row level security;
revoke all on public.recalculo_stock_registro from public, anon;
grant select on public.recalculo_stock_registro to authenticated;
grant all on public.recalculo_stock_registro to service_role;
-- Solo lo leen los administradores. Nadie escribe a mano: lo rellenan las funciones (security definer).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recalculo_stock_registro' and policyname = 'recalculo_stock_registro_lee') then
    create policy recalculo_stock_registro_lee on public.recalculo_stock_registro
      for select to authenticated using ((select public.fn_es_administrador()));
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_auditoria_recalculo_stock_registro') then
    create trigger trg_auditoria_recalculo_stock_registro
      after insert or update or delete on public.recalculo_stock_registro
      for each row execute function public.fn_auditoria_trigger();
  end if;
end $$;

-- ───────────────────────── Piezas comunes ─────────────────────────
create or replace function public.fn_recalculo_stock_exigir_admin()
returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.fn_es_administrador() then
    raise exception 'Recalcular el stock es solo para administradores. Pídeselo a gerencia.' using errcode = '42501';
  end if;
end;
$$;

-- Apunta el recálculo aplicado y devuelve su número.
create or replace function public.fn_recalculo_stock_apuntar(p_proceso text, p_revisados integer, p_cambiados integer, p_cambios jsonb)
returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id bigint;
begin
  insert into recalculo_stock_registro (proceso, usuario_id, empleado_codigo, revisados, cambiados, cambios)
  values (p_proceso, auth.uid(), fn_empleado_actual(), p_revisados, p_cambiados, coalesce(p_cambios, '[]'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;
-- Solo la usan las funciones de abajo (que se ejecutan como su dueño).
revoke all on function public.fn_recalculo_stock_apuntar(text, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.fn_recalculo_stock_apuntar(text, integer, integer, jsonb) to service_role;

-- ───────────────────────── 1) Recalcular Stock ─────────────────────────
create or replace function public.fn_recalcular_stock(p_aplicar boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_revisados integer;
  v_cambiados integer;
  v_cambios jsonb;
  v_registro bigint;
begin
  perform fn_recalculo_stock_exigir_admin();
  if p_aplicar then
    -- Que no entre una venta entre la cuenta y el cambio.
    lock table movimiento_stock in share mode;
    lock table articulo_almacen_stock in share row exclusive mode;
  end if;

  with m as (
    select articulo_codigo, almacen_codigo, sum(sentido * cantidad) as q
    from movimiento_stock group by 1, 2
  ),
  d as (
    select coalesce(s.articulo_codigo, m.articulo_codigo) as art, coalesce(s.almacen_codigo, m.almacen_codigo) as alm,
           s.cantidad_actual as antes, coalesce(m.q, 0) as despues
    from articulo_almacen_stock s
    full join m on m.articulo_codigo = s.articulo_codigo and m.almacen_codigo = s.almacen_codigo
  )
  select count(distinct art), count(distinct art) filter (where coalesce(antes, 0) <> despues),
         coalesce(jsonb_agg(jsonb_build_object('articulo', art, 'almacen', alm, 'antes', antes, 'despues', despues) order by art, alm)
                  filter (where coalesce(antes, 0) <> despues), '[]'::jsonb)
    into v_revisados, v_cambiados, v_cambios
  from d;

  if p_aplicar and jsonb_array_length(v_cambios) > 0 then
    insert into articulo_almacen_stock (articulo_codigo, almacen_codigo, cantidad_actual)
    select c.articulo, c.almacen, c.despues
    from jsonb_to_recordset(v_cambios) as c(articulo text, almacen text, despues numeric)
    on conflict (articulo_codigo, almacen_codigo)
    do update set cantidad_actual = excluded.cantidad_actual, actualizado_en = now();
    v_registro := fn_recalculo_stock_apuntar('stock', v_revisados, v_cambiados, v_cambios);
  end if;

  return jsonb_build_object('proceso', 'stock', 'aplicado', coalesce(p_aplicar, false), 'revisados', v_revisados,
                            'cambiados', v_cambiados, 'filas_cambiadas', jsonb_array_length(v_cambios), 'registro', v_registro);
end;
$$;

-- ───────────────────────── 2) Recalcular Stock de Lotes ─────────────────────────
create or replace function public.fn_recalcular_stock_lotes(p_aplicar boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_revisados integer;
  v_cambiados integer;
  v_cambios jsonb;
  v_registro bigint;
begin
  perform fn_recalculo_stock_exigir_admin();
  if p_aplicar then
    lock table articulo_lote_movimiento in share mode;
    lock table articulo_lote in share row exclusive mode;
  end if;

  with d as (
    select l.id, l.articulo_codigo as art, l.lote, l.almacen_codigo as alm, l.cantidad as antes,
           coalesce((select sum(m.sentido * m.cantidad) from articulo_lote_movimiento m where m.lote_id = l.id), 0) as despues
    from articulo_lote l
  )
  select count(distinct art), count(distinct art) filter (where coalesce(antes, 0) <> despues),
         coalesce(jsonb_agg(jsonb_build_object('id', id, 'articulo', art, 'lote', lote, 'almacen', alm, 'antes', antes, 'despues', despues) order by id)
                  filter (where coalesce(antes, 0) <> despues), '[]'::jsonb)
    into v_revisados, v_cambiados, v_cambios
  from d;

  if p_aplicar and jsonb_array_length(v_cambios) > 0 then
    update articulo_lote l
       set cantidad = c.despues, actualizado_en = now()
      from jsonb_to_recordset(v_cambios) as c(id bigint, despues numeric)
     where l.id = c.id;
    v_registro := fn_recalculo_stock_apuntar('lotes', v_revisados, v_cambiados, v_cambios);
  end if;

  return jsonb_build_object('proceso', 'lotes', 'aplicado', coalesce(p_aplicar, false), 'revisados', v_revisados,
                            'cambiados', v_cambiados, 'filas_cambiadas', jsonb_array_length(v_cambios), 'registro', v_registro);
end;
$$;

-- ───────────────────────── 3) Recalcular Stock Reservado ─────────────────────────
-- Reservado = unidades sin servir (cantidad − unidades_liquidadas) de los pedidos de cliente vivos: los
-- mismos que enseña el Gestor de Pedidos (ni presupuestos, ni reparaciones, ni anulados) y sin entregar.
-- Se guarda por artículo y almacén (articulo_almacen_stock.cantidad_reservada; el disponible se calcula
-- solo). El almacén es el de la línea y, si no tiene, el del pedido.
create or replace function public.fn_recalcular_stock_reservado(p_aplicar boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_revisados integer;
  v_cambiados integer;
  v_cambios jsonb;
  v_sin_destino integer;
  v_registro bigint;
begin
  perform fn_recalculo_stock_exigir_admin();
  if p_aplicar then
    lock table articulo_almacen_stock in share row exclusive mode;
  end if;

  -- Líneas pendientes que no se pueden apuntar (artículo o almacén que no existe): se cuentan y se avisa.
  select count(*) into v_sin_destino
  from pedido_cliente_linea l
  join pedido_cliente c on c.tienda_terminal_codigo = l.tienda_terminal_codigo and c.numero = l.numero
  where not coalesce(c.es_presupuesto, false) and not coalesce(c.es_reparacion, false)
    and not coalesce(c.anulado, false) and not coalesce(c.entregado, false)
    and coalesce(l.cantidad, 0) - coalesce(l.unidades_liquidadas, 0) > 0
    and (not exists (select 1 from articulo a where a.codigo_interno = l.articulo_codigo)
         or not exists (select 1 from almacen al where al.codigo = coalesce(l.almacen_codigo, c.almacen_codigo)));

  with p as (
    select l.articulo_codigo as art, coalesce(l.almacen_codigo, c.almacen_codigo) as alm,
           sum(coalesce(l.cantidad, 0) - coalesce(l.unidades_liquidadas, 0)) as q
    from pedido_cliente_linea l
    join pedido_cliente c on c.tienda_terminal_codigo = l.tienda_terminal_codigo and c.numero = l.numero
    where not coalesce(c.es_presupuesto, false) and not coalesce(c.es_reparacion, false)
      and not coalesce(c.anulado, false) and not coalesce(c.entregado, false)
      and coalesce(l.cantidad, 0) - coalesce(l.unidades_liquidadas, 0) > 0
      and exists (select 1 from articulo a where a.codigo_interno = l.articulo_codigo)
      and exists (select 1 from almacen al where al.codigo = coalesce(l.almacen_codigo, c.almacen_codigo))
    group by 1, 2
  ),
  d as (
    select coalesce(s.articulo_codigo, p.art) as art, coalesce(s.almacen_codigo, p.alm) as alm,
           s.cantidad_reservada as antes, coalesce(p.q, 0) as despues
    from (select * from articulo_almacen_stock where coalesce(cantidad_reservada, 0) <> 0) s
    full join p on p.art = s.articulo_codigo and p.alm = s.almacen_codigo
  )
  select count(distinct art), count(distinct art) filter (where coalesce(antes, 0) <> despues),
         coalesce(jsonb_agg(jsonb_build_object('articulo', art, 'almacen', alm, 'antes', antes, 'despues', despues) order by art, alm)
                  filter (where coalesce(antes, 0) <> despues), '[]'::jsonb)
    into v_revisados, v_cambiados, v_cambios
  from d;

  if p_aplicar and jsonb_array_length(v_cambios) > 0 then
    insert into articulo_almacen_stock (articulo_codigo, almacen_codigo, cantidad_actual, cantidad_reservada)
    select c.articulo, c.almacen, 0, c.despues
    from jsonb_to_recordset(v_cambios) as c(articulo text, almacen text, despues numeric)
    on conflict (articulo_codigo, almacen_codigo)
    do update set cantidad_reservada = excluded.cantidad_reservada, actualizado_en = now();
    v_registro := fn_recalculo_stock_apuntar('reservado', v_revisados, v_cambiados, v_cambios);
  end if;

  return jsonb_build_object('proceso', 'reservado', 'aplicado', coalesce(p_aplicar, false), 'revisados', v_revisados,
                            'cambiados', v_cambiados, 'filas_cambiadas', jsonb_array_length(v_cambios),
                            'lineas_sin_apuntar', v_sin_destino, 'registro', v_registro);
end;
$$;

-- ───────────────────────── 4) Recalcular Stock Pedido ─────────────────────────
-- Pedido = unidades sin recibir (cantidad − unidades_recibidas) de las líneas no recibidas de los pedidos
-- a proveedor que no están recepcionados ni liquidados y no son abonos. Se guarda en el artículo
-- (articulo.unidades_pedidas) y en su ficha por proveedor (articulo_proveedor.unidades_pedidas, solo en
-- las fichas que ya existen).
create or replace function public.fn_recalcular_stock_pedido(p_aplicar boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_revisados integer;
  v_cambiados integer;
  v_cambios jsonb;
  v_cambios_prov jsonb;
  v_registro bigint;
begin
  perform fn_recalculo_stock_exigir_admin();

  with p as (
    select l.articulo_codigo as art, sum(coalesce(l.cantidad, 0) - coalesce(l.unidades_recibidas, 0)) as q
    from pedido_proveedor_linea l
    join pedido_proveedor c on c.tienda_terminal_codigo = l.tienda_terminal_codigo and c.numero = l.numero
    where not coalesce(c.recibido, false) and not coalesce(c.es_abono, false)
      and c.estado not in ('recepcionado', 'liquidado')
      and not coalesce(l.recibido, false)
      and coalesce(l.cantidad, 0) - coalesce(l.unidades_recibidas, 0) > 0
    group by 1
  ),
  d as (
    select a.codigo_interno as art, a.unidades_pedidas as antes, coalesce(p.q, 0) as despues
    from articulo a left join p on p.art = a.codigo_interno
    where coalesce(a.unidades_pedidas, 0) <> 0 or p.art is not null
  )
  select count(*), count(*) filter (where coalesce(antes, 0) <> despues),
         coalesce(jsonb_agg(jsonb_build_object('articulo', art, 'antes', antes, 'despues', despues) order by art)
                  filter (where coalesce(antes, 0) <> despues), '[]'::jsonb)
    into v_revisados, v_cambiados, v_cambios
  from d;

  with p as (
    select l.articulo_codigo as art, c.proveedor_codigo as prov, sum(coalesce(l.cantidad, 0) - coalesce(l.unidades_recibidas, 0)) as q
    from pedido_proveedor_linea l
    join pedido_proveedor c on c.tienda_terminal_codigo = l.tienda_terminal_codigo and c.numero = l.numero
    where not coalesce(c.recibido, false) and not coalesce(c.es_abono, false)
      and c.estado not in ('recepcionado', 'liquidado')
      and not coalesce(l.recibido, false)
      and coalesce(l.cantidad, 0) - coalesce(l.unidades_recibidas, 0) > 0
    group by 1, 2
  )
  select coalesce(jsonb_agg(jsonb_build_object('articulo', ap.articulo_codigo, 'proveedor', ap.proveedor_codigo,
                                               'antes', ap.unidades_pedidas, 'despues', coalesce(p.q, 0))
                            order by ap.articulo_codigo, ap.proveedor_codigo), '[]'::jsonb)
    into v_cambios_prov
  from articulo_proveedor ap
  left join p on p.art = ap.articulo_codigo and p.prov = ap.proveedor_codigo
  where coalesce(ap.unidades_pedidas, 0) <> coalesce(p.q, 0);

  if p_aplicar and (jsonb_array_length(v_cambios) > 0 or jsonb_array_length(v_cambios_prov) > 0) then
    update articulo a
       set unidades_pedidas = c.despues, actualizado_en = now()
      from jsonb_to_recordset(v_cambios) as c(articulo text, despues numeric)
     where a.codigo_interno = c.articulo;
    update articulo_proveedor ap
       set unidades_pedidas = c.despues
      from jsonb_to_recordset(v_cambios_prov) as c(articulo text, proveedor text, despues numeric)
     where ap.articulo_codigo = c.articulo and ap.proveedor_codigo = c.proveedor;
    v_registro := fn_recalculo_stock_apuntar('pedido', v_revisados, v_cambiados,
                                             jsonb_build_object('articulos', v_cambios, 'por_proveedor', v_cambios_prov));
  end if;

  return jsonb_build_object('proceso', 'pedido', 'aplicado', coalesce(p_aplicar, false), 'revisados', v_revisados,
                            'cambiados', v_cambiados, 'filas_cambiadas', jsonb_array_length(v_cambios),
                            'fichas_proveedor_cambiadas', jsonb_array_length(v_cambios_prov), 'registro', v_registro);
end;
$$;

-- ───────────────────────── Permisos ─────────────────────────
revoke all on function public.fn_recalculo_stock_exigir_admin() from public, anon;
grant execute on function public.fn_recalculo_stock_exigir_admin() to authenticated, service_role;
revoke all on function public.fn_recalcular_stock(boolean) from public, anon;
grant execute on function public.fn_recalcular_stock(boolean) to authenticated, service_role;
revoke all on function public.fn_recalcular_stock_lotes(boolean) from public, anon;
grant execute on function public.fn_recalcular_stock_lotes(boolean) to authenticated, service_role;
revoke all on function public.fn_recalcular_stock_reservado(boolean) from public, anon;
grant execute on function public.fn_recalcular_stock_reservado(boolean) to authenticated, service_role;
revoke all on function public.fn_recalcular_stock_pedido(boolean) from public, anon;
grant execute on function public.fn_recalcular_stock_pedido(boolean) to authenticated, service_role;

-- La función de la pantalla anterior (fn_recalcular_stock_aplicar, por almacén y rango de artículos) se
-- queda, pero pasa a exigir también administrador: antes bastaba con tener la pantalla en el grupo.
create or replace function public.fn_recalcular_stock_aplicar(
  p_almacen text default null,
  p_art_desde text default null,
  p_art_hasta text default null
)
returns integer
language plpgsql set search_path = public, pg_temp as $$
declare
  v_n integer := 0;
  v_i integer := 0;
begin
  -- [seguridad 20261028] solo quien tiene la pantalla (o administrador)
  -- [20261113] como en GeminisWin (clave especial): solo administradores
  perform public.fn_recalculo_stock_exigir_admin();
  update articulo_almacen_stock st
     set cantidad_actual = coalesce((select sum(mv.sentido * mv.cantidad) from movimiento_stock mv
                                     where mv.articulo_codigo = st.articulo_codigo and mv.almacen_codigo = st.almacen_codigo), 0),
         actualizado_en = now()
   where (nullif(p_almacen, '') is null or st.almacen_codigo = p_almacen)
     and (nullif(p_art_desde, '') is null or st.articulo_codigo >= p_art_desde)
     and (nullif(p_art_hasta, '') is null or st.articulo_codigo <= p_art_hasta)
     and st.cantidad_actual <> coalesce((select sum(mv.sentido * mv.cantidad) from movimiento_stock mv
                                         where mv.articulo_codigo = st.articulo_codigo and mv.almacen_codigo = st.almacen_codigo), 0);
  get diagnostics v_n = row_count;

  insert into articulo_almacen_stock (articulo_codigo, almacen_codigo, cantidad_actual)
  select mv.articulo_codigo, mv.almacen_codigo, sum(mv.sentido * mv.cantidad)
  from movimiento_stock mv
  where (nullif(p_almacen, '') is null or mv.almacen_codigo = p_almacen)
    and (nullif(p_art_desde, '') is null or mv.articulo_codigo >= p_art_desde)
    and (nullif(p_art_hasta, '') is null or mv.articulo_codigo <= p_art_hasta)
    and not exists (select 1 from articulo_almacen_stock st where st.articulo_codigo = mv.articulo_codigo and st.almacen_codigo = mv.almacen_codigo)
  group by 1, 2
  having sum(mv.sentido * mv.cantidad) <> 0;
  get diagnostics v_i = row_count;
  return v_n + v_i;
end;
$$;

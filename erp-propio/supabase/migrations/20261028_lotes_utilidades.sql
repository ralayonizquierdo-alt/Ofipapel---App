-- Control de lotes (Almacén → Control de Lotes) y dos utilidades de GeminisWin
-- (Utilidades → Stock A 0 de Familia, Utilidades → Elimina ArtiEnBlanco).
--
-- Lotes: hasta hoy solo existía la marca articulo.control_lotes / familia.control_lotes (códigos
-- de GeminisWin sin significado confirmado; todos a NULL o 0 en la carga). No había ninguna
-- tabla de lotes. Esto crea la estructura mínima:
--   - articulo_lote: un lote de un artículo en un almacén, con caducidad, entrada y cantidad.
--   - articulo_lote_movimiento: entradas, salidas y regularizaciones del lote; un trigger
--     mantiene articulo_lote.cantidad (igual que movimiento_stock mantiene el stock).
-- El stock del artículo (articulo_almacen_stock) NO se toca desde aquí: el lote es un desglose
-- informativo. Compras y ventas todavía no piden lote (pendiente de confirmar con Luis).

create table if not exists public.articulo_lote (
  id bigint generated always as identity primary key,
  articulo_codigo text not null references public.articulo (codigo_interno),
  lote text not null,
  almacen_codigo text not null references public.almacen (codigo),
  fecha_caducidad date,
  fecha_entrada date not null default current_date,
  cantidad numeric(14, 3) not null default 0,
  proveedor_codigo text,
  documento text,
  observaciones text,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint articulo_lote_unico unique (articulo_codigo, lote, almacen_codigo),
  constraint articulo_lote_lote_no_vacio check (btrim(lote) <> '')
);
create index if not exists articulo_lote_caducidad_idx on public.articulo_lote (fecha_caducidad);
create index if not exists articulo_lote_almacen_idx on public.articulo_lote (almacen_codigo, articulo_codigo);

create table if not exists public.articulo_lote_movimiento (
  id bigint generated always as identity primary key,
  lote_id bigint not null references public.articulo_lote (id),
  tipo text not null check (tipo in ('entrada', 'salida', 'regularizacion', 'stock_cero_familia')),
  sentido smallint not null check (sentido in (-1, 1)),
  cantidad numeric(14, 3) not null check (cantidad >= 0),
  ocurrido_en timestamptz not null default now(),
  documento text,
  observaciones text,
  empleado_codigo text,
  creado_en timestamptz not null default now()
);
create index if not exists articulo_lote_movimiento_lote_idx on public.articulo_lote_movimiento (lote_id, ocurrido_en);

alter table public.articulo_lote enable row level security;
alter table public.articulo_lote_movimiento enable row level security;
create policy autenticados_acceso_total_articulo_lote on public.articulo_lote for all to authenticated using (true) with check (true);
create policy autenticados_acceso_total_articulo_lote_movimiento on public.articulo_lote_movimiento for all to authenticated using (true) with check (true);

create or replace function public.fn_lote_movimiento_actualiza()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  update articulo_lote
     set cantidad = cantidad + new.sentido * new.cantidad,
         actualizado_en = now()
   where id = new.lote_id;
  return new;
end;
$$;

create trigger trg_lote_movimiento_actualiza after insert on public.articulo_lote_movimiento
  for each row execute function public.fn_lote_movimiento_actualiza();
create trigger trg_auditoria_articulo_lote after insert or update or delete on public.articulo_lote
  for each row execute function public.fn_auditoria_trigger();

-- Alta de movimiento de lote (crea el lote si no existe). Devuelve el id del lote.
-- p_tipo: 'entrada' suma, 'salida' resta (sin dejar el lote en negativo) y 'regularizacion'
-- deja el lote en p_cantidad exacta (apunta la diferencia).
create or replace function public.fn_lote_movimiento(
  p_articulo text,
  p_lote text,
  p_almacen text,
  p_tipo text,
  p_cantidad numeric,
  p_fecha_caducidad date default null,
  p_documento text default null,
  p_observaciones text default null
)
returns bigint
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id bigint;
  v_actual numeric;
  v_dif numeric;
  v_emp text := fn_empleado_actual();
begin
  if coalesce(btrim(p_lote), '') = '' then raise exception 'Indica el lote.'; end if;
  if p_tipo not in ('entrada', 'salida', 'regularizacion') then raise exception 'Tipo de movimiento de lote no válido: %', p_tipo; end if;
  if p_cantidad is null or p_cantidad < 0 then raise exception 'La cantidad no puede ser negativa.'; end if;
  if not exists (select 1 from articulo where codigo_interno = p_articulo) then raise exception 'No existe el artículo %', p_articulo; end if;
  if not exists (select 1 from almacen where codigo = p_almacen) then raise exception 'No existe el almacén %', p_almacen; end if;

  select id, cantidad into v_id, v_actual from articulo_lote
   where articulo_codigo = p_articulo and lote = btrim(p_lote) and almacen_codigo = p_almacen
   for update;
  if v_id is null then
    insert into articulo_lote (articulo_codigo, lote, almacen_codigo, fecha_caducidad, documento)
    values (p_articulo, btrim(p_lote), p_almacen, p_fecha_caducidad, p_documento)
    returning id, cantidad into v_id, v_actual;
  elsif p_fecha_caducidad is not null then
    update articulo_lote set fecha_caducidad = p_fecha_caducidad, actualizado_en = now() where id = v_id;
  end if;

  if p_tipo = 'regularizacion' then
    v_dif := p_cantidad - v_actual;
    if v_dif <> 0 then
      insert into articulo_lote_movimiento (lote_id, tipo, sentido, cantidad, documento, observaciones, empleado_codigo)
      values (v_id, 'regularizacion', case when v_dif > 0 then 1 else -1 end, abs(v_dif), p_documento, p_observaciones, v_emp);
    end if;
  elsif p_cantidad > 0 then
    if p_tipo = 'salida' and p_cantidad > v_actual then
      raise exception 'El lote % solo tiene % unidades en el almacén %.', btrim(p_lote), v_actual, p_almacen;
    end if;
    insert into articulo_lote_movimiento (lote_id, tipo, sentido, cantidad, documento, observaciones, empleado_codigo)
    values (v_id, p_tipo, case when p_tipo = 'entrada' then 1 else -1 end, p_cantidad, p_documento, p_observaciones, v_emp);
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Utilidades → Stock A 0 de Familia
-- Pone a 0 el stock de los artículos de una familia en un almacén con movimientos de
-- regularización (movimiento_stock: tipo 'regularizacion', origen 'stock_cero_familia'); el
-- trigger de movimiento_stock deja articulo_almacen_stock en 0. Nunca edita el stock a pelo.
-- p_subfamilias: incluye las familias cuyo código empieza por p_familia (niveles 4 y 6 dígitos).
-- ---------------------------------------------------------------------------------------------
create or replace function public.fn_stock_cero_familia_previa(p_familia text, p_almacen text, p_subfamilias boolean default false)
returns table (articulo_codigo text, descripcion text, familia_codigo text, cantidad numeric)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select s.articulo_codigo, a.descripcion, a.familia_codigo, s.cantidad_actual
  from articulo_almacen_stock s
  join articulo a on a.codigo_interno = s.articulo_codigo
  where s.almacen_codigo = p_almacen
    and s.cantidad_actual <> 0
    and coalesce(btrim(p_familia), '') <> ''
    and (a.familia_codigo = p_familia or (p_subfamilias and a.familia_codigo like p_familia || '%'))
  order by s.articulo_codigo
$$;

create or replace function public.fn_stock_cero_familia_aplicar(
  p_familia text,
  p_almacen text,
  p_subfamilias boolean default false,
  p_observaciones text default null
)
returns table (articulos integer, unidades_positivas numeric, unidades_negativas numeric)
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  r record;
  v_n integer := 0;
  v_pos numeric := 0;
  v_neg numeric := 0;
  v_emp text := fn_empleado_actual();
  v_obs text := coalesce(nullif(btrim(p_observaciones), ''), 'Stock a 0 de la familia ' || p_familia);
begin
  if coalesce(btrim(p_familia), '') = '' then raise exception 'Indica la familia.'; end if;
  if not exists (select 1 from familia where codigo = p_familia) then raise exception 'No existe la familia %', p_familia; end if;
  if not exists (select 1 from almacen where codigo = p_almacen) then raise exception 'No existe el almacén %', p_almacen; end if;

  for r in
    select s.articulo_codigo, s.cantidad_actual, a.coste_neto
    from articulo_almacen_stock s
    join articulo a on a.codigo_interno = s.articulo_codigo
    where s.almacen_codigo = p_almacen
      and s.cantidad_actual <> 0
      and (a.familia_codigo = p_familia or (p_subfamilias and a.familia_codigo like p_familia || '%'))
    for update of s
  loop
    insert into movimiento_stock (tipo_movimiento, sentido, almacen_codigo, articulo_codigo, cantidad, costo_unitario,
                                  documento_origen_tipo, empleado_codigo, observaciones, ocurrido_en)
    values ('regularizacion', case when r.cantidad_actual > 0 then -1 else 1 end, p_almacen, r.articulo_codigo,
            abs(r.cantidad_actual), r.coste_neto, 'stock_cero_familia', v_emp, v_obs, now());
    v_n := v_n + 1;
    if r.cantidad_actual > 0 then v_pos := v_pos + r.cantidad_actual; else v_neg := v_neg + abs(r.cantidad_actual); end if;
  end loop;

  -- Los lotes de esos artículos en ese almacén también quedan a 0 (con su movimiento).
  insert into articulo_lote_movimiento (lote_id, tipo, sentido, cantidad, observaciones, empleado_codigo)
  select l.id, 'stock_cero_familia', case when l.cantidad > 0 then -1 else 1 end, abs(l.cantidad), v_obs, v_emp
  from articulo_lote l
  join articulo a on a.codigo_interno = l.articulo_codigo
  where l.almacen_codigo = p_almacen
    and l.cantidad <> 0
    and (a.familia_codigo = p_familia or (p_subfamilias and a.familia_codigo like p_familia || '%'));

  articulos := v_n;
  unidades_positivas := v_pos;
  unidades_negativas := v_neg;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Utilidades → Elimina ArtiEnBlanco
-- Artículo «en blanco»: activo, con la descripción vacía (o solo puntos, guiones, asteriscos)
-- o sin datos mínimos (sin familia, sin PVP, sin coste y sin código de barras), y que no tiene
-- movimientos de stock, ni stock, ni aparece en ventas, pedidos, traspasos, inventarios,
-- peticiones ni lotes. Se dan de baja lógica (activo = false, fecha_baja), nunca se borran.
-- ---------------------------------------------------------------------------------------------
create or replace function public.fn_articulo_en_blanco_motivo(p_codigo text)
returns text
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select case
           when btrim(a.descripcion) ~ '^[[:space:].*_-]*$' then 'Sin descripción'
           when a.familia_codigo is null and coalesce(a.pvp, 0) = 0 and coalesce(a.coste_neto, 0) = 0
                and coalesce(btrim(a.codigo_barras_principal), '') = '' then 'Sin familia, PVP, coste ni código de barras'
         end
  from articulo a
  where a.codigo_interno = p_codigo
    and a.activo
    and not exists (select 1 from movimiento_stock m where m.articulo_codigo = a.codigo_interno)
    and not exists (select 1 from articulo_almacen_stock s where s.articulo_codigo = a.codigo_interno and s.cantidad_actual <> 0)
    and not exists (select 1 from venta_linea v where v.articulo_codigo = a.codigo_interno)
    and not exists (select 1 from pedido_cliente_linea p where p.articulo_codigo = a.codigo_interno)
    and not exists (select 1 from pedido_proveedor_linea p where p.articulo_codigo = a.codigo_interno)
    and not exists (select 1 from traspaso_almacen_linea t where t.articulo_codigo = a.codigo_interno)
    and not exists (select 1 from inventario_linea i where i.articulo_codigo = a.codigo_interno)
    and not exists (select 1 from peticion p where p.articulo_codigo = a.codigo_interno)
    and not exists (select 1 from articulo_lote l where l.articulo_codigo = a.codigo_interno)
$$;

create or replace function public.fn_articulos_en_blanco(p_limite integer default 1000)
returns table (codigo_interno text, descripcion text, familia_codigo text, pvp numeric, fecha_alta date, motivo text)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select a.codigo_interno, a.descripcion, a.familia_codigo, a.pvp, a.fecha_alta, m.motivo
  from articulo a
  cross join lateral (select fn_articulo_en_blanco_motivo(a.codigo_interno) as motivo) m
  where a.activo
    and (btrim(a.descripcion) ~ '^[[:space:].*_-]*$'
         or (a.familia_codigo is null and coalesce(a.pvp, 0) = 0 and coalesce(a.coste_neto, 0) = 0
             and coalesce(btrim(a.codigo_barras_principal), '') = ''))
    and m.motivo is not null
  order by a.codigo_interno
  limit greatest(1, least(coalesce(p_limite, 1000), 5000))
$$;

create or replace function public.fn_articulos_en_blanco_baja(p_codigos text[])
returns table (codigo_interno text, resultado text)
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  c text;
begin
  foreach c in array coalesce(p_codigos, array[]::text[]) loop
    codigo_interno := c;
    -- Se vuelve a comprobar en el momento: si ha cambiado desde la lista, no se toca.
    if fn_articulo_en_blanco_motivo(c) is null then
      resultado := 'Ya no está en blanco (o tiene movimientos): no se da de baja';
    else
      update articulo a set activo = false, fecha_baja = coalesce(a.fecha_baja, current_date), web_publicado = false
       where a.codigo_interno = c;
      resultado := 'Dado de baja';
    end if;
    return next;
  end loop;
end;
$$;

grant execute on function public.fn_lote_movimiento(text, text, text, text, numeric, date, text, text) to authenticated;
grant execute on function public.fn_stock_cero_familia_previa(text, text, boolean) to authenticated;
grant execute on function public.fn_stock_cero_familia_aplicar(text, text, boolean, text) to authenticated;
grant execute on function public.fn_articulo_en_blanco_motivo(text) to authenticated;
grant execute on function public.fn_articulos_en_blanco(integer) to authenticated;
grant execute on function public.fn_articulos_en_blanco_baja(text[]) to authenticated;
revoke execute on function public.fn_lote_movimiento(text, text, text, text, numeric, date, text, text) from public, anon;
revoke execute on function public.fn_stock_cero_familia_aplicar(text, text, boolean, text) from public, anon;
revoke execute on function public.fn_articulos_en_blanco_baja(text[]) from public, anon;

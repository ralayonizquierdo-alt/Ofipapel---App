-- Gestor de Pedidos 2.0: subida de tarifas de proveedor y comparativa de precios (18/11/2026).
--
-- Rober: «la posibilidad de subir las tarifas de los proveedores para que el propio ERP diga qué proveedores son más
-- baratos en artículos punteros que suelen compartir varios proveedores».
--
--  · Se sube el Excel/CSV de tarifa de un proveedor desde Gestor 2.0 → Tarifas. Cada línea se empareja con un
--    artículo: primero por la referencia de compra de ese proveedor (articulo_proveedor.codigo_compra, o la habitual
--    de la ficha si es su proveedor habitual), comparando solo letras y números («TN-248» = «TN248»); si no, por el
--    código de barras.
--  · Las tarifas se guardan aparte: NO cambian los costes que vienen de GeminisWin (GeminisWin manda en la ficha).
--    La última tarifa de cada proveedor es la «activa» y es la que usa la comparativa.
--  · Comparativa: artículos con precio en dos o más proveedores (coste de GeminisWin o tarifa activa, la más
--    reciente), ordenados por lo que pesan (venta de 12 meses × coste), con el más barato y el ahorro frente al
--    proveedor habitual.

create table if not exists public.compra_tarifa (
  id bigint generated always as identity primary key,
  proveedor_codigo text not null references public.proveedor(codigo),
  archivo text,
  fecha_tarifa date not null default current_date,
  filas integer not null default 0,
  emparejadas integer not null default 0,
  activa boolean not null default false,
  cargada_por text default public.fn_empleado_actual(),
  cargada_en timestamptz not null default now()
);
comment on table public.compra_tarifa is
  'Tarifas de proveedor subidas en Gestor 2.0 → Tarifas. Solo comparan precios; no tocan los costes de GeminisWin. La última de cada proveedor es la activa.';
create index if not exists compra_tarifa_proveedor_idx on public.compra_tarifa (proveedor_codigo, activa);

create table if not exists public.compra_tarifa_linea (
  tarifa_id bigint not null references public.compra_tarifa(id),
  linea integer not null,
  referencia text,
  ean text,
  descripcion text,
  precio numeric,
  descuento_pct numeric not null default 0,
  precio_neto numeric,
  articulo_codigo text references public.articulo(codigo_interno),
  emparejado_por text check (emparejado_por is null or emparejado_por in ('referencia', 'ean')),
  primary key (tarifa_id, linea)
);
create index if not exists compra_tarifa_linea_articulo_idx on public.compra_tarifa_linea (articulo_codigo) where articulo_codigo is not null;

do $$
declare t text;
begin
  foreach t in array array['compra_tarifa', 'compra_tarifa_linea'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policy where polname = t || '_lee' and polrelid = ('public.' || t)::regclass) then
      execute format('create policy %I on public.%I for select to authenticated using ((select public.fn_puede(''/gestor-pedidos-proveedor'')))', t || '_lee', t);
    end if;
    execute format('revoke all on public.%I from anon', t);
  end loop;
  if not exists (select 1 from pg_trigger where tgname = 'trg_auditoria_compra_tarifa') then
    create trigger trg_auditoria_compra_tarifa after insert or update on public.compra_tarifa
      for each row execute function public.fn_auditoria_trigger();
  end if;
end $$;

-- Referencia comparable: solo letras y números, en mayúsculas.
create or replace function public.fn_ref_normal(t text) returns text
language sql immutable parallel safe set search_path to 'pg_catalog' as $$
  select nullif(upper(regexp_replace(coalesce(t, ''), '[^A-Za-z0-9]', '', 'g')), '')
$$;

------------------------------------------------------------------------------------------------- carga
-- 1) Empieza una tarifa. 2) Se mandan las líneas por tandas. 3) Se cierra: cuenta, la deja activa y desactiva las
-- anteriores del proveedor.
create or replace function public.fn_compras_tarifa_crear(p_proveedor text, p_archivo text, p_fecha date default null)
returns bigint language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_id bigint;
begin
  if not fn_puede('/gestor-pedidos-proveedor') then
    raise exception 'No tienes permiso del Gestor de Pedidos a Proveedores. Pídelo a un administrador.' using errcode = '42501';
  end if;
  if not exists (select 1 from proveedor where codigo = p_proveedor) then raise exception 'No existe el proveedor %.', p_proveedor; end if;
  insert into compra_tarifa (proveedor_codigo, archivo, fecha_tarifa)
  values (p_proveedor, left(nullif(btrim(p_archivo), ''), 200), coalesce(p_fecha, current_date))
  returning id into v_id;
  return v_id;
end $$;

-- p_lineas: [{n, r (referencia), e (código de barras), d (descripción), p (precio), dto}]
create or replace function public.fn_compras_tarifa_lineas(p_tarifa bigint, p_lineas jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' set statement_timeout to '120s' as $$
declare v_prov text; v_n int;
begin
  if not fn_puede('/gestor-pedidos-proveedor') then
    raise exception 'No tienes permiso del Gestor de Pedidos a Proveedores. Pídelo a un administrador.' using errcode = '42501';
  end if;
  select proveedor_codigo into v_prov from compra_tarifa where id = p_tarifa and not activa;
  if v_prov is null then raise exception 'La tarifa % no existe o ya está cerrada.', p_tarifa; end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) > 5000 then
    raise exception 'Se esperan hasta 5.000 líneas por envío.';
  end if;

  with l as (
    select (x->>'n')::int n, left(nullif(btrim(x->>'r'), ''), 60) r, nullif(regexp_replace(coalesce(x->>'e', ''), '\D', '', 'g'), '') e,
           left(nullif(btrim(x->>'d'), ''), 200) d, (x->>'p')::numeric p, coalesce((x->>'dto')::numeric, 0) dto
      from jsonb_array_elements(p_lineas) x
     where (x->>'p') is not null and (x->>'p')::numeric >= 0 and (x->>'n') is not null
  ),
  por_ref as (
    select distinct on (l.n) l.n, ap.articulo_codigo art
      from l join articulo_proveedor ap on ap.proveedor_codigo = v_prov and fn_ref_normal(ap.codigo_compra) = fn_ref_normal(l.r)
     where fn_ref_normal(l.r) is not null
     order by l.n, ap.articulo_codigo
  ),
  por_ref2 as (
    select distinct on (l.n) l.n, ar.codigo_interno art
      from l join articulo ar on ar.proveedor_habitual_codigo = v_prov and fn_ref_normal(ar.codigo_compra_habitual) = fn_ref_normal(l.r)
     where fn_ref_normal(l.r) is not null and not exists (select 1 from por_ref q where q.n = l.n)
     order by l.n, ar.codigo_interno
  ),
  por_ean as (
    select distinct on (l.n) l.n, coalesce(b.articulo_codigo, ar.codigo_interno) art
      from l
      left join articulo_codigo_barras b on b.codigo_barras = l.e
      left join articulo ar on ar.codigo_barras_principal = l.e and b.articulo_codigo is null
     where l.e is not null and length(l.e) >= 8 and coalesce(b.articulo_codigo, ar.codigo_interno) is not null
       and not exists (select 1 from por_ref q where q.n = l.n) and not exists (select 1 from por_ref2 q where q.n = l.n)
     order by l.n, coalesce(b.articulo_codigo, ar.codigo_interno)
  )
  insert into compra_tarifa_linea (tarifa_id, linea, referencia, ean, descripcion, precio, descuento_pct, precio_neto, articulo_codigo, emparejado_por)
  select p_tarifa, l.n, l.r, l.e, l.d, l.p, l.dto, round(l.p * (1 - l.dto / 100), 4),
         coalesce(a.art, a2.art, e.art), case when coalesce(a.art, a2.art) is not null then 'referencia' when e.art is not null then 'ean' end
    from l
    left join por_ref a on a.n = l.n
    left join por_ref2 a2 on a2.n = l.n
    left join por_ean e on e.n = l.n
  on conflict (tarifa_id, linea) do nothing;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'recibidas', jsonb_array_length(p_lineas), 'guardadas', v_n);
end $$;

create or replace function public.fn_compras_tarifa_cerrar(p_tarifa bigint)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_prov text; v jsonb;
begin
  if not fn_puede('/gestor-pedidos-proveedor') then
    raise exception 'No tienes permiso del Gestor de Pedidos a Proveedores. Pídelo a un administrador.' using errcode = '42501';
  end if;
  select proveedor_codigo into v_prov from compra_tarifa where id = p_tarifa;
  if v_prov is null then raise exception 'La tarifa % no existe.', p_tarifa; end if;
  select jsonb_build_object('filas', count(*), 'emparejadas', count(articulo_codigo),
                            'por_referencia', count(*) filter (where emparejado_por = 'referencia'),
                            'por_ean', count(*) filter (where emparejado_por = 'ean'))
    into v from compra_tarifa_linea where tarifa_id = p_tarifa;
  if (v->>'filas')::int = 0 then raise exception 'La tarifa no tiene ninguna línea con precio.'; end if;
  update compra_tarifa set activa = false where proveedor_codigo = v_prov and activa and id <> p_tarifa;
  update compra_tarifa set activa = true, filas = (v->>'filas')::int, emparejadas = (v->>'emparejadas')::int where id = p_tarifa;
  return v || jsonb_build_object('ok', true, 'tarifa', p_tarifa, 'proveedor', v_prov);
end $$;

------------------------------------------------------------------------------------------------- consultas
create or replace function public.fn_compras_tarifas()
returns table(id bigint, proveedor_codigo text, proveedor_nombre text, archivo text, fecha_tarifa date, filas integer,
              emparejadas integer, activa boolean, cargada_en timestamptz, cargada_por text)
language sql stable set search_path to 'public' as $$
  select t.id, t.proveedor_codigo, p.nombre, t.archivo, t.fecha_tarifa, t.filas, t.emparejadas, t.activa, t.cargada_en, t.cargada_por
    from compra_tarifa t left join proveedor p on p.codigo = t.proveedor_codigo
   where t.filas > 0
   order by t.cargada_en desc
   limit 200
$$;

-- Precio de cada proveedor para un artículo: el de la tarifa activa si es más reciente que el de GeminisWin.
create or replace function public.fn_compras_precios_articulo(p_articulo text)
returns table(prov text, precio numeric, origen text, fecha date)
language sql stable set search_path to 'public' as $$
  with g as (
    select ap.proveedor_codigo prov, ap.coste_neto precio, 'GeminisWin'::text origen, ap.ultima_compra_fecha fecha
      from articulo_proveedor ap join proveedor p on p.codigo = ap.proveedor_codigo and coalesce(p.activo, true)
     where ap.articulo_codigo = p_articulo and ap.coste_neto > 0
       and (ap.ultima_compra_fecha is null or ap.ultima_compra_fecha >= current_date - 730) -- precios de compras de hace más de 2 años no valen para comparar
  ),
  t as (
    select distinct on (ct.proveedor_codigo) ct.proveedor_codigo prov, tl.precio_neto precio, 'Tarifa'::text origen, ct.fecha_tarifa fecha
      from compra_tarifa_linea tl join compra_tarifa ct on ct.id = tl.tarifa_id and ct.activa
     where tl.articulo_codigo = p_articulo and tl.precio_neto > 0
     order by ct.proveedor_codigo, tl.linea
  )
  select coalesce(t.prov, g.prov), case when t.prov is not null and (g.fecha is null or t.fecha >= g.fecha) then t.precio else g.precio end,
         case when t.prov is not null and (g.fecha is null or t.fecha >= g.fecha) then t.origen else g.origen end,
         case when t.prov is not null and (g.fecha is null or t.fecha >= g.fecha) then t.fecha else g.fecha end
    from g full join t on t.prov = g.prov
$$;

-- Qué cambia con una tarifa: precio nuevo frente al coste que tiene GeminisWin para ese proveedor.
create or replace function public.fn_compras_tarifa_cambios(p_tarifa bigint)
returns table(articulo_codigo text, descripcion text, referencia text, emparejado_por text, precio_tarifa numeric,
              coste_actual numeric, diferencia_pct numeric, venta_12m numeric, impacto_anual numeric,
              mejor_otro_proveedor text, mejor_otro_nombre text, mejor_otro_precio numeric)
language sql stable set search_path to 'public' as $$
  with t as (select proveedor_codigo prov from compra_tarifa where id = p_tarifa),
  l as (
    select distinct on (tl.articulo_codigo) tl.* from compra_tarifa_linea tl
     where tl.tarifa_id = p_tarifa and tl.articulo_codigo is not null and tl.precio_neto > 0
     order by tl.articulo_codigo, tl.linea
  )
  select l.articulo_codigo, ar.descripcion, l.referencia, l.emparejado_por, l.precio_neto,
         nullif(ap.coste_neto, 0), case when ap.coste_neto > 0 then round((l.precio_neto / ap.coste_neto - 1) * 100, 1) end,
         po.venta_12m, case when ap.coste_neto > 0 then round((l.precio_neto - ap.coste_neto) * coalesce(po.venta_12m, 0), 2) end,
         o.prov, o.nombre, o.precio
    from l cross join t
    join articulo ar on ar.codigo_interno = l.articulo_codigo
    left join articulo_proveedor ap on ap.articulo_codigo = l.articulo_codigo and ap.proveedor_codigo = t.prov
    left join compra_articulo_politica po on po.articulo_codigo = l.articulo_codigo
    left join lateral (
      select pp.prov, pr.nombre, pp.precio from public.fn_compras_precios_articulo(l.articulo_codigo) pp
        join proveedor pr on pr.codigo = pp.prov
       where pp.prov <> t.prov and pp.precio < l.precio_neto
       order by pp.precio limit 1
    ) o on true
$$;

-- Comparativa: artículos «punteros» con precio en 2 o más proveedores (precios de GeminisWin de los últimos 2 años o
-- de tarifas activas).
create or replace function public.fn_compras_comparativa(p_limite integer default 300, p_proveedor text default null)
returns table(articulo_codigo text, descripcion text, venta_12m numeric, proveedores integer,
              habitual_codigo text, habitual_nombre text, habitual_precio numeric,
              mejor_codigo text, mejor_nombre text, mejor_precio numeric, mejor_origen text, mejor_fecha date,
              ahorro_pct numeric, ahorro_anual numeric)
language sql stable set search_path to 'public' as $$
  with cand as (
    select x.articulo_codigo from (
      select ap.articulo_codigo from articulo_proveedor ap where ap.coste_neto > 0
      union all
      select distinct tl.articulo_codigo from compra_tarifa_linea tl join compra_tarifa ct on ct.id = tl.tarifa_id and ct.activa
       where tl.articulo_codigo is not null and tl.precio_neto > 0
    ) x group by 1 having count(*) >= 2
  ),
  top as (
    select c.articulo_codigo, ar.descripcion, ar.proveedor_habitual_codigo hab, po.venta_12m, coalesce(nullif(ar.coste_neto, 0), 0) coste
      from cand c
      join articulo ar on ar.codigo_interno = c.articulo_codigo and ar.fecha_baja is null and coalesce(ar.activo, true)
      join compra_articulo_politica po on po.articulo_codigo = c.articulo_codigo and po.venta_12m > 0
     where (p_proveedor is null or ar.proveedor_habitual_codigo = p_proveedor
            or exists (select 1 from compra_tarifa ct join compra_tarifa_linea tl on tl.tarifa_id = ct.id
                        where ct.activa and ct.proveedor_codigo = p_proveedor and tl.articulo_codigo = c.articulo_codigo))
     order by po.venta_12m * coalesce(nullif(ar.coste_neto, 0), 0) desc
     limit greatest(1, least(coalesce(p_limite, 300), 1000))
  )
  select t.articulo_codigo, t.descripcion, t.venta_12m, pr.n::integer,
         t.hab, ph.nombre, h.precio, m.prov, pm.nombre, m.precio, m.origen, m.fecha,
         case when h.precio > 0 and m.prov <> t.hab then round((1 - m.precio / h.precio) * 100, 1) end,
         case when h.precio > 0 and m.prov <> t.hab then round((h.precio - m.precio) * t.venta_12m, 2) end
    from top t
    cross join lateral (select count(*) n from fn_compras_precios_articulo(t.articulo_codigo)) pr
    left join lateral (select q.precio from fn_compras_precios_articulo(t.articulo_codigo) q where q.prov = t.hab) h on true
    left join lateral (select q.prov, q.precio, q.origen, q.fecha from fn_compras_precios_articulo(t.articulo_codigo) q order by q.precio, (q.prov = t.hab) desc limit 1) m on true
    left join proveedor ph on ph.codigo = t.hab
    left join proveedor pm on pm.codigo = m.prov
   where pr.n >= 2
   order by case when h.precio > 0 and m.prov <> t.hab then (h.precio - m.precio) * t.venta_12m else 0 end desc, t.venta_12m * h.precio desc nulls last
$$;

revoke all on function public.fn_compras_tarifa_crear(text, text, date) from public, anon;
revoke all on function public.fn_compras_tarifa_lineas(bigint, jsonb) from public, anon;
revoke all on function public.fn_compras_tarifa_cerrar(bigint) from public, anon;
revoke all on function public.fn_compras_tarifas() from public, anon;
revoke all on function public.fn_compras_tarifa_cambios(bigint) from public, anon;
revoke all on function public.fn_compras_precios_articulo(text) from public, anon;
revoke all on function public.fn_compras_comparativa(integer, text) from public, anon;
grant execute on function public.fn_compras_tarifa_crear(text, text, date) to authenticated;
grant execute on function public.fn_compras_tarifa_lineas(bigint, jsonb) to authenticated;
grant execute on function public.fn_compras_tarifa_cerrar(bigint) to authenticated;
grant execute on function public.fn_compras_tarifas() to authenticated;
grant execute on function public.fn_compras_tarifa_cambios(bigint) to authenticated;
grant execute on function public.fn_compras_precios_articulo(text) to authenticated;
grant execute on function public.fn_compras_comparativa(integer, text) to authenticated;

-- Ajuste tras la primera prueba con datos reales: para comparar solo valen precios de compras de los últimos 2 años
-- (sin fecha = nunca comprado, no vale) y no cuentan los proveedores genéricos (Proveedor Contado, Facturación
-- Obsoletos), que salían «más baratos» en casi todo.
insert into public.parametro (clave, valor, descripcion)
values ('compras.proveedores_no_comparar', '["00002", "00099"]'::jsonb,
        'Gestor de Pedidos 2.0 → Tarifas: proveedores que no cuentan en la comparativa de precios (Proveedor Contado, Facturación Obsoletos).')
on conflict (clave) do nothing;

create or replace function public.fn_compras_precios_articulo(p_articulo text)
returns table(prov text, precio numeric, origen text, fecha date)
language sql stable set search_path to 'public' as $$
  with fuera as (select jsonb_array_elements_text(coalesce((select q.valor from parametro q where q.clave = 'compras.proveedores_no_comparar'), '[]'::jsonb)) c),
  g as (
    select ap.proveedor_codigo prov, ap.coste_neto precio, 'GeminisWin'::text origen, ap.ultima_compra_fecha fecha
      from articulo_proveedor ap join proveedor p on p.codigo = ap.proveedor_codigo and coalesce(p.activo, true)
     where ap.articulo_codigo = p_articulo and ap.coste_neto > 0
       and ap.ultima_compra_fecha >= current_date - 730
       and ap.proveedor_codigo not in (select c from fuera)
  ),
  t as (
    select distinct on (ct.proveedor_codigo) ct.proveedor_codigo prov, tl.precio_neto precio, 'Tarifa'::text origen, ct.fecha_tarifa fecha
      from compra_tarifa_linea tl join compra_tarifa ct on ct.id = tl.tarifa_id and ct.activa
     where tl.articulo_codigo = p_articulo and tl.precio_neto > 0
     order by ct.proveedor_codigo, tl.linea
  )
  select coalesce(t.prov, g.prov), case when t.prov is not null and (g.fecha is null or t.fecha >= g.fecha) then t.precio else g.precio end,
         case when t.prov is not null and (g.fecha is null or t.fecha >= g.fecha) then t.origen else g.origen end,
         case when t.prov is not null and (g.fecha is null or t.fecha >= g.fecha) then t.fecha else g.fecha end
    from g full join t on t.prov = g.prov
$$;

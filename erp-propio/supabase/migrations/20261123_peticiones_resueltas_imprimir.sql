-- Peticiones RESUELTAS para preparar (Rober, 23/11/2026): «cuando la petición está resuelta (la mercancía ha llegado) es
-- cuando el vigilante tiene que proponerla para imprimir: con ese pedido en papel el almacén separa la mercancía y la pone
-- en ruta de reparto». Separadas por proveedor: el de la compra por la que llegó (la petición, al gestionarse, queda
-- asociada a una compra y por tanto a su proveedor).
-- · peticion_impresion: cuáles se han impreso ya, para proponer solo las nuevas (Virgilio, el vigilante).
-- · fn_peticiones_resueltas: las resueltas (GeminisWin estado 6 y ERP «resuelta») con su compra y recepción.
-- · fn_peticiones_marcar_impresas: las marca al imprimir.
-- · fn_peticiones_resueltas_nuevas: el número del globo rojo de la pestaña Peticiones (resueltas sin imprimir).
-- Solo las de los últimos 60 días: en GeminisWin quedan ~400 resueltas de 2019-2024 que nadie pasó a «Entregada»; eso es
-- limpieza de GeminisWin, no trabajo del almacén.
-- (fn_peticiones_por_proveedor, de un primer diseño descartado, se borra aparte desde el editor SQL.)

create table if not exists public.peticion_impresion (
  origen text not null check (origen in ('GW', 'ERP')),
  oficina text not null,
  numero bigint not null,
  impresa_en timestamptz not null default now(),
  impresa_por text default public.fn_empleado_actual(),
  primary key (origen, oficina, numero)
);
comment on table public.peticion_impresion is 'Peticiones resueltas ya impresas para el almacén (las nuevas son las que no están aquí). Las apunta fn_peticiones_marcar_impresas.';
alter table public.peticion_impresion enable row level security;
do $$
begin
  if not exists (select 1 from pg_policy where polname = 'peticion_impresion_lee') then
    create policy peticion_impresion_lee on public.peticion_impresion for select to authenticated
      using ((select public.fn_puede('/peticiones')) or (select public.fn_puede('/gestor-pedidos-proveedor')));
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_auditoria_peticion_impresion') then
    create trigger trg_auditoria_peticion_impresion after insert or update on public.peticion_impresion
      for each row execute function public.fn_auditoria_trigger();
  end if;
end $$;
revoke all on public.peticion_impresion from anon;

create or replace function public.fn_peticiones_resueltas(p_dias integer default 60, p_con_impresas boolean default false)
returns table (origen text, oficina text, numero bigint, fecha timestamptz, articulo_codigo text, referencia text, descripcion text,
               cantidad numeric, cliente_codigo text, cliente_nombre text, concepto text, proveedor_codigo text, proveedor_nombre text,
               compra text, recibida_en timestamptz, almacen text, impresa_en timestamptz)
language sql stable set search_path to 'public', 'pg_temp' as $$
  with r as (
    select 'GW'::text as origen, p.oficina, p.numero, p.fecha_hora, p.articulo_codigo, p.descripcion, p.cantidad, p.cliente_codigo,
           p.nombre_origen, p.concepto, coalesce(nullif(btrim(s.proveedor_codigo), ''), nullif(btrim(p.proveedor_codigo), '')) as prov,
           case when s.numero_pedido is not null then s.oficina_pedido || '-' || s.numero_pedido end as compra,
           s.fecha_recepcion, s.almacen_codigo
      from gw_peticion p
      left join lateral (select * from gw_peticion_seguimiento s where s.oficina = p.oficina and s.numero = p.numero
                          order by s.fecha_recepcion desc nulls last limit 1) s on true
     where p.estado = 6
    union all
    select 'ERP', p.tienda_terminal_codigo, p.numero, p.fecha_hora, p.articulo_codigo, p.descripcion, p.cantidad, p.origen_cliente_codigo,
           p.origen_nombre, p.concepto, coalesce(nullif(btrim(t.proveedor_codigo), ''), nullif(btrim(p.proveedor_codigo), '')),
           case when t.pedido_proveedor_numero is not null then t.pedido_proveedor_tienda_codigo || '-' || t.pedido_proveedor_numero end,
           t.fecha_recepcion, t.almacen_codigo
      from peticion p
      left join lateral (select * from peticion_tramitacion t where t.tienda_terminal_codigo = p.tienda_terminal_codigo and t.numero = p.numero
                          order by t.fecha_recepcion desc nulls last limit 1) t on true
     where p.estado = 'resuelta'
  )
  select r.origen, r.oficina, r.numero, r.fecha_hora, r.articulo_codigo,
         coalesce(nullif(btrim(a.codigo_compra_habitual), ''), r.articulo_codigo),
         coalesce(nullif(btrim(r.descripcion), ''), a.descripcion), r.cantidad, r.cliente_codigo,
         coalesce(nullif(btrim(r.nombre_origen), ''), c.nombre), r.concepto, r.prov, pr.nombre, r.compra,
         r.fecha_recepcion, r.almacen_codigo, i.impresa_en
    from r
    left join articulo a on a.codigo_interno = r.articulo_codigo
    left join cliente c on c.codigo = r.cliente_codigo
    left join proveedor pr on pr.codigo = r.prov
    left join peticion_impresion i on i.origen = r.origen and i.oficina = r.oficina and i.numero = r.numero
   where (p_con_impresas or i.impresa_en is null)
     and (coalesce(p_dias, 0) = 0 or coalesce(r.fecha_recepcion, r.fecha_hora) >= now() - make_interval(days => p_dias))
   order by pr.nombre nulls last, coalesce(r.nombre_origen, c.nombre), r.fecha_hora
$$;
revoke all on function public.fn_peticiones_resueltas(integer, boolean) from public, anon;
grant execute on function public.fn_peticiones_resueltas(integer, boolean) to authenticated;

-- p_peticiones: [{"origen":"GW","oficina":"54","numero":37462}, …]
create or replace function public.fn_peticiones_marcar_impresas(p_peticiones jsonb)
returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare n integer;
begin
  if not (fn_puede('/peticiones') or fn_puede('/gestor-pedidos-proveedor')) then
    raise exception 'No tienes permiso de Peticiones ni del Gestor de Pedidos.' using errcode = '42501';
  end if;
  insert into peticion_impresion (origen, oficina, numero)
  select x->>'origen', x->>'oficina', (x->>'numero')::bigint from jsonb_array_elements(coalesce(p_peticiones, '[]'::jsonb)) x
  on conflict (origen, oficina, numero) do update set impresa_en = now(), impresa_por = fn_empleado_actual();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.fn_peticiones_marcar_impresas(jsonb) from public, anon;
grant execute on function public.fn_peticiones_marcar_impresas(jsonb) to authenticated;

-- El globo rojo: cuántas resueltas de los últimos 60 días están sin imprimir.
create or replace function public.fn_peticiones_resueltas_nuevas()
returns integer language sql stable set search_path to 'public', 'pg_temp' as $$
  select count(*)::integer from public.fn_peticiones_resueltas(60, false)
$$;
revoke all on function public.fn_peticiones_resueltas_nuevas() from public, anon;
grant execute on function public.fn_peticiones_resueltas_nuevas() to authenticated;

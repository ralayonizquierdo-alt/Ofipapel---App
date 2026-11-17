-- Reparto (Rober, 17/11/2026):
--  1. EL ORDEN DEL REPARTIDOR MANDA EN TODOS LADOS. Todas las pantallas ordenan por reparto_linea.orden y
--     nada más: la app del repartidor, la vista de OFICINA/PEDIDOS, el parte para cerrar en GeminisWin y la
--     ficha del reparto en el ERP (RepartoFichaPage.tsx). Antes la app ponía siempre delante lo que venía de
--     un reparto anterior, aunque el repartidor lo hubiera movido, y las demás usaban otro desempate.
--  2. SE RECUERDA EL ORDEN PARA LAS SIGUIENTES VECES. Cada vez que el repartidor ordena su ruta se guarda,
--     por ruta + cliente + dirección, en qué punto de la ruta lo puso (de 0 a 1). Cuando llega un reparto
--     nuevo de esa ruta, sale ya ordenado así: primero lo que viene de un reparto anterior, y el resto por lo
--     recordado; lo que no tiene recuerdo conserva el sitio que le dio GeminisWin.
--  3. MAPA: cada punto donde se marcó un pedido lleva el cliente y la hora (para enseñarlos al pulsarlo).

create table if not exists public.reparto_orden_recordado (
  ruta_codigo text not null,
  cliente_codigo text not null,
  direccion text not null default '',
  posicion numeric not null,
  repartidor_codigo text,
  actualizado_en timestamptz not null default now(),
  primary key (ruta_codigo, cliente_codigo, direccion)
);
alter table public.reparto_orden_recordado enable row level security;   -- sin políticas: solo las funciones
revoke all on public.reparto_orden_recordado from public, anon, authenticated;

create or replace function reparto_privado.dir_norma(p text) returns text
language sql immutable as $$ select upper(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'))) $$;

-- Guarda el orden de un reparto como recuerdo de su ruta.
create or replace function reparto_privado.recordar_orden(p_tienda text, p_numero bigint, p_rep text) returns void
language sql security definer set search_path to 'public' as $$
  insert into reparto_orden_recordado (ruta_codigo, cliente_codigo, direccion, posicion, repartidor_codigo, actualizado_en)
  select x.ruta, x.cli, x.dir, avg(x.pos), p_rep, now()
    from (
      select r.ruta_codigo as ruta, coalesce(g.cliente_codigo, v.cliente_codigo) as cli, reparto_privado.dir_norma(l.direccion) as dir,
             (row_number() over (order by l.orden nulls last, l.venta_numero) - 0.5) / count(*) over () as pos
        from reparto_linea l
        join reparto r on r.tienda_terminal_codigo = l.tienda_terminal_codigo and r.numero = l.numero
        left join reparto_gw_venta g on r.origen = 'geminiswin' and g.venta_tienda_codigo = l.venta_tienda_codigo and g.venta_numero = l.venta_numero
        left join venta v on r.origen <> 'geminiswin' and v.tienda_terminal_codigo = l.venta_tienda_codigo and v.numero = l.venta_numero
       where l.tienda_terminal_codigo = p_tienda and l.numero = p_numero and l.estado <> 'anulado'
    ) x
   where x.ruta is not null and x.cli is not null
   group by x.ruta, x.cli, x.dir
  on conflict (ruta_codigo, cliente_codigo, direccion)
  do update set posicion = excluded.posicion, repartidor_codigo = excluded.repartidor_codigo, actualizado_en = excluded.actualizado_en
$$;

-- Ordena un reparto recién llegado: lo que viene de otro reparto, delante; el resto, por lo recordado.
create or replace function reparto_privado.aplicar_orden_recordado(p_tienda text, p_numero bigint) returns void
language sql security definer set search_path to 'public' as $$
  with base as (
    select l.venta_tienda_codigo as vt, l.venta_numero as vn, l.orden, (l.reparto_anterior_numero is not null) as prio,
           count(*) over () as n, m.posicion
      from reparto_linea l
      join reparto r on r.tienda_terminal_codigo = l.tienda_terminal_codigo and r.numero = l.numero
      left join reparto_gw_venta g on r.origen = 'geminiswin' and g.venta_tienda_codigo = l.venta_tienda_codigo and g.venta_numero = l.venta_numero
      left join venta v on r.origen <> 'geminiswin' and v.tienda_terminal_codigo = l.venta_tienda_codigo and v.numero = l.venta_numero
      left join reparto_orden_recordado m on m.ruta_codigo = r.ruta_codigo and m.cliente_codigo = coalesce(g.cliente_codigo, v.cliente_codigo)
                                         and m.direccion = reparto_privado.dir_norma(l.direccion)
     where l.tienda_terminal_codigo = p_tienda and l.numero = p_numero and l.estado <> 'anulado'
  ),
  ord as (
    select vt, vn, row_number() over (order by prio desc, coalesce(posicion, (coalesce(orden, n) - 0.5) / n), orden nulls last, vn) as nuevo
      from base
  )
  update reparto_linea l set orden = o.nuevo
    from ord o
   where l.tienda_terminal_codigo = p_tienda and l.numero = p_numero and l.venta_tienda_codigo = o.vt and l.venta_numero = o.vn
     and l.orden is distinct from o.nuevo
$$;
revoke all on function reparto_privado.dir_norma(text), reparto_privado.recordar_orden(text, bigint, text), reparto_privado.aplicar_orden_recordado(text, bigint) from public, anon, authenticated;

-- Al terminar de entrar un reparto nuevo (diferido: cuando ya tiene sus líneas), se ordena.
create or replace function public.fn_trg_reparto_orden_recordado() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    perform reparto_privado.aplicar_orden_recordado(new.tienda_terminal_codigo, new.numero);
  exception when others then
    raise warning 'No se pudo aplicar el orden recordado al reparto %/%: %', new.tienda_terminal_codigo, new.numero, sqlerrm;
  end;
  return null;
end $$;
revoke all on function public.fn_trg_reparto_orden_recordado() from public, anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_reparto_orden_recordado') then
    create constraint trigger trg_reparto_orden_recordado after insert on public.reparto
      deferrable initially deferred for each row execute function public.fn_trg_reparto_orden_recordado();
  end if;
end $$;

-- El repartidor ordena su ruta: se guarda el orden y se recuerda.
create or replace function public.fn_app_rep_orden(p_token uuid, p_tienda text, p_numero integer, p_orden jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_rep text := reparto_privado.sesion(p_token); e jsonb; i int := 0;
begin
  perform reparto_privado.reparto(v_rep, p_tienda, p_numero);
  for e in select * from jsonb_array_elements(coalesce(p_orden, '[]'::jsonb)) loop
    i := i + 1;
    update reparto_linea set orden = i
     where tienda_terminal_codigo = p_tienda and numero = p_numero and venta_tienda_codigo = e ->> 'vt' and venta_numero = (e ->> 'vn')::int
       and orden is distinct from i;
  end loop;
  perform reparto_privado.recordar_orden(p_tienda, p_numero, v_rep);
  return jsonb_build_object('ok', true);
end $$;

-- Mismo orden en todas las pantallas, y cliente y hora en los puntos del mapa.
do $$
declare v text; f regprocedure;
  viejo1 text := 'order by (l.reparto_anterior_numero is not null) desc, l.orden nulls last, l.poblacion, l.direccion, l.venta_numero';
  viejo0 text := 'order by l.orden nulls last, l.venta_numero';
  nuevo text := 'order by l.orden nulls last, l.poblacion, l.direccion, l.venta_numero';
  a text; b text;
begin
  foreach f in array array['public.fn_app_rep_todas_lineas(uuid,text,bigint)'::regprocedure,
                           (select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'fn_reparto_gw_partes')] loop
    v := pg_get_functiondef(f);
    if position(viejo1 in v) > 0 then execute replace(v, viejo1, nuevo);
    elsif position(nuevo in v) > 0 then null;
    elsif position(viejo0 in v) > 0 then execute replace(v, viejo0, nuevo);
    else raise exception 'no encuentro el orden en %', f; end if;
  end loop;

  v := pg_get_functiondef('public.fn_app_rep_lineas(uuid,text,integer)'::regprocedure);
  a := 'order by x.prio desc, x.orden nulls last,'; b := 'order by x.orden nulls last, x.prio desc,';
  if position(a in v) > 0 then execute replace(v, a, b);
  elsif position(b in v) = 0 then raise exception 'no encuentro el orden en fn_app_rep_lineas'; end if;

  select pg_get_functiondef(p.oid) into v from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = 'reparto_privado' and p.proname = 'seguimiento';
  a := 'else l.estado end)), ''[]''::jsonb)';
  b := 'else l.estado end, ''hora'', to_char(coalesce(l.entregado_en, l.intento2_en, l.intento1_en) at time zone ''Atlantic/Canary'', ''HH24:MI''), ''cliente'', coalesce((select nullif(g.nombre_cliente, '''') from reparto_gw_venta g where g.venta_tienda_codigo = l.venta_tienda_codigo and g.venta_numero = l.venta_numero), (select nullif(vv.nombre_cliente, '''') from venta vv where vv.tienda_terminal_codigo = l.venta_tienda_codigo and vv.numero = l.venta_numero), l.contacto))), ''[]''::jsonb)';
  if position('''cliente'', coalesce((select nullif(g.nombre_cliente' in v) = 0 then
    if position(a in v) = 0 then raise exception 'no encuentro los puntos en reparto_privado.seguimiento'; end if;
    execute replace(v, a, b);
  end if;
end $$;

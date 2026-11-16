-- App de repartidores: pasar un pedido a otro repartidor, con aceptación (Rober, 16/11/2026).
--
-- Un repartidor ofrece un pedido suyo sin entregar a otra ruta abierta; al repartidor de esa ruta le
-- sale el aviso y lo ACEPTA o lo RECHAZA. Si acepta, el pedido le aparece en su lista y es él quien lo
-- marca; el que lo ofreció deja de poder marcarlo.
--
-- El pedido NO cambia de reparto en la base de datos: sigue en su reparto de origen y lo que marque el
-- otro repartidor queda apuntado ahí. Así vale igual para los repartos de GeminisWin (donde el reparto
-- solo se reorganiza en GeminisWin y el puente borraría un cambio hecho aquí) y para los del ERP, y la
-- oficina cierra cada reparto con sus pedidos de siempre.
--
-- Sin disparador de auditoría: la propia tabla es el registro (nunca se borra; solo cambia de estado).

create table if not exists public.reparto_traspaso (
  id bigint generated always as identity primary key,
  tienda_terminal_codigo text not null,
  numero bigint not null,
  venta_tienda_codigo text not null,
  venta_numero bigint not null,
  de_repartidor text not null references public.repartidor(codigo),
  a_tienda text not null,
  a_numero bigint not null,
  a_repartidor text not null references public.repartidor(codigo),
  estado text not null default 'propuesto' check (estado in ('propuesto', 'aceptado', 'rechazado', 'cancelado')),
  motivo text,
  respuesta text,
  propuesto_en timestamptz not null default now(),
  resuelto_en timestamptz
);
create unique index if not exists reparto_traspaso_activo_uq on public.reparto_traspaso (tienda_terminal_codigo, numero, venta_tienda_codigo, venta_numero)
  where estado in ('propuesto', 'aceptado');
create index if not exists reparto_traspaso_destino_idx on public.reparto_traspaso (a_tienda, a_numero) where estado in ('propuesto', 'aceptado');
comment on table public.reparto_traspaso is
  'App de repartidores: pedidos que un repartidor pasa a otro (ofrecido, aceptado, rechazado o cancelado). El pedido no cambia de reparto.';
alter table public.reparto_traspaso enable row level security;
revoke all on public.reparto_traspaso from public, anon, authenticated;
grant select on public.reparto_traspaso to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reparto_traspaso' and policyname = 'reparto_traspaso_lee') then
    create policy reparto_traspaso_lee on public.reparto_traspaso for select to authenticated using ((select public.fn_puede('/repartos')));
  end if;
end $$;

-- ¿Puede este repartidor marcar este pedido? Si está traspasado y aceptado, solo quien lo aceptó.
create or replace function reparto_privado.linea_permiso(p_rep text, p_tienda text, p_numero bigint, p_vt text, p_vn bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare t reparto_traspaso;
begin
  select * into t from reparto_traspaso
   where tienda_terminal_codigo = p_tienda and numero = p_numero and venta_tienda_codigo = p_vt and venta_numero = p_vn and estado = 'aceptado';
  if found then
    if t.a_repartidor <> p_rep then
      raise exception 'Este pedido lo lleva ahora %.', coalesce((select coalesce(nullif(nombre_corto, ''), nombre) from repartidor where codigo = t.a_repartidor), t.a_repartidor);
    end if;
    if not exists (select 1 from reparto where tienda_terminal_codigo = p_tienda and numero = p_numero and estado = 2) then
      raise exception 'Ese reparto ya está cerrado.';
    end if;
  else
    perform reparto_privado.reparto(p_rep, p_tienda, p_numero::integer);
  end if;
end $$;

-- Marcar y comprobar pasan a usar ese permiso (mismo código de siempre, cambiando solo esa línea).
do $$
declare f text; v_def text;
begin
  foreach f in array array['public.fn_app_rep_marcar(uuid,text,integer,text,integer,text,text,text,timestamp with time zone,double precision,double precision)',
                           'public.fn_app_rep_comprobar(uuid,text,integer,text,integer,boolean)'] loop
    v_def := pg_get_functiondef(f::regprocedure);
    if position('reparto_privado.linea_permiso' in v_def) = 0 then
      if position('perform reparto_privado.reparto(v_rep, p_tienda, p_numero);' in v_def) = 0 then
        raise exception 'No encuentro la comprobación de reparto en %', f;
      end if;
      execute replace(v_def, 'perform reparto_privado.reparto(v_rep, p_tienda, p_numero);',
                             'perform reparto_privado.linea_permiso(v_rep, p_tienda, p_numero, p_vt, p_vn);');
    end if;
  end loop;
end $$;

-- Ofrecer un pedido mío, sin entregar, a otra ruta abierta.
create or replace function public.fn_app_rep_traspaso_proponer(p_token uuid, p_tienda text, p_numero integer, p_vt text, p_vn integer,
                                                               p_dest_tienda text, p_dest_numero integer, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rep text := reparto_privado.sesion(p_token); l reparto_linea; d reparto; v_id bigint;
begin
  perform reparto_privado.linea_permiso(v_rep, p_tienda, p_numero, p_vt, p_vn);
  select * into l from reparto_linea where tienda_terminal_codigo = p_tienda and numero = p_numero and venta_tienda_codigo = p_vt and venta_numero = p_vn for update;
  if not found then raise exception 'Ese pedido ya no está en esta ruta.'; end if;
  if l.estado not in ('pendiente', 'viene_anterior') then raise exception 'Solo se pueden pasar pedidos que están sin entregar.'; end if;
  if exists (select 1 from reparto_traspaso where tienda_terminal_codigo = p_tienda and numero = p_numero and venta_tienda_codigo = p_vt and venta_numero = p_vn
               and estado in ('propuesto', 'aceptado')) then
    raise exception 'Ese pedido ya está ofrecido o pasado a otra ruta.';
  end if;
  select * into d from reparto where tienda_terminal_codigo = p_dest_tienda and numero = p_dest_numero;
  if not found or d.estado <> 2 then raise exception 'La ruta de destino no está abierta.'; end if;
  if d.tienda_terminal_codigo = p_tienda and d.numero = p_numero then raise exception 'Es la misma ruta.'; end if;
  if d.repartidor_codigo is null then raise exception 'Esa ruta todavía no tiene repartidor: no hay a quién ofrecérselo.'; end if;
  if d.repartidor_codigo = v_rep then raise exception 'Esa ruta también es tuya.'; end if;
  insert into reparto_traspaso (tienda_terminal_codigo, numero, venta_tienda_codigo, venta_numero, de_repartidor, a_tienda, a_numero, a_repartidor, motivo)
  values (p_tienda, p_numero, p_vt, p_vn, v_rep, p_dest_tienda, p_dest_numero, d.repartidor_codigo, nullif(left(trim(p_motivo), 300), ''))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Lo que me ofrecen (para aceptar o rechazar) y las respuestas a lo que yo ofrecí.
create or replace function public.fn_app_rep_traspasos(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_rep text := reparto_privado.sesion(p_token);
begin
  return jsonb_build_object(
    'recibidos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'de', coalesce(nullif(rp.nombre_corto, ''), rp.nombre),
               'ruta_origen', coalesce(rro.descripcion, ro.ruta_codigo), 'ruta_destino', coalesce(rrd.descripcion, rd.ruta_codigo),
               'cliente', coalesce(nullif(g.nombre_cliente, ''), nullif(v.nombre_cliente, ''), l.contacto, 'Sin nombre'),
               'direccion', l.direccion, 'poblacion', l.poblacion, 'motivo', t.motivo, 'en', t.propuesto_en) order by t.propuesto_en)
        from reparto_traspaso t
        join reparto ro on ro.tienda_terminal_codigo = t.tienda_terminal_codigo and ro.numero = t.numero and ro.estado = 2
        join reparto rd on rd.tienda_terminal_codigo = t.a_tienda and rd.numero = t.a_numero and rd.estado = 2
        join reparto_linea l on l.tienda_terminal_codigo = t.tienda_terminal_codigo and l.numero = t.numero
                            and l.venta_tienda_codigo = t.venta_tienda_codigo and l.venta_numero = t.venta_numero
        left join repartidor rp on rp.codigo = t.de_repartidor
        left join ruta_reparto rro on rro.codigo = ro.ruta_codigo
        left join ruta_reparto rrd on rrd.codigo = rd.ruta_codigo
        left join venta v on ro.origen <> 'geminiswin' and v.tienda_terminal_codigo = l.venta_tienda_codigo and v.numero = l.venta_numero
        left join reparto_gw_venta g on ro.origen = 'geminiswin' and g.venta_tienda_codigo = l.venta_tienda_codigo and g.venta_numero = l.venta_numero
       where t.estado = 'propuesto' and t.a_repartidor = v_rep and l.estado in ('pendiente', 'viene_anterior')), '[]'::jsonb),
    'respuestas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'estado', t.estado, 'a', coalesce(nullif(rp.nombre_corto, ''), rp.nombre),
               'cliente', coalesce(nullif(g.nombre_cliente, ''), nullif(v.nombre_cliente, ''), l.contacto, 'Sin nombre'),
               'respuesta', t.respuesta, 'en', t.resuelto_en) order by t.resuelto_en desc)
        from reparto_traspaso t
        join reparto ro on ro.tienda_terminal_codigo = t.tienda_terminal_codigo and ro.numero = t.numero
        join reparto_linea l on l.tienda_terminal_codigo = t.tienda_terminal_codigo and l.numero = t.numero
                            and l.venta_tienda_codigo = t.venta_tienda_codigo and l.venta_numero = t.venta_numero
        left join repartidor rp on rp.codigo = t.a_repartidor
        left join venta v on ro.origen <> 'geminiswin' and v.tienda_terminal_codigo = l.venta_tienda_codigo and v.numero = l.venta_numero
        left join reparto_gw_venta g on ro.origen = 'geminiswin' and g.venta_tienda_codigo = l.venta_tienda_codigo and g.venta_numero = l.venta_numero
       where t.de_repartidor = v_rep and t.estado in ('aceptado', 'rechazado') and t.resuelto_en > now() - interval '3 hours'), '[]'::jsonb));
end $$;

-- Aceptar o rechazar lo que me ofrecen.
create or replace function public.fn_app_rep_traspaso_responder(p_token uuid, p_id bigint, p_aceptar boolean, p_nota text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rep text := reparto_privado.sesion(p_token); t reparto_traspaso;
begin
  select * into t from reparto_traspaso where id = p_id for update;
  if not found or t.a_repartidor <> v_rep then raise exception 'Ese pedido no te lo han ofrecido a ti.'; end if;
  if t.estado <> 'propuesto' then raise exception 'Ese ofrecimiento ya no está pendiente.'; end if;
  if p_aceptar and not exists (select 1 from reparto_linea l join reparto r on r.tienda_terminal_codigo = l.tienda_terminal_codigo and r.numero = l.numero
                                where l.tienda_terminal_codigo = t.tienda_terminal_codigo and l.numero = t.numero and l.venta_tienda_codigo = t.venta_tienda_codigo
                                  and l.venta_numero = t.venta_numero and l.estado in ('pendiente', 'viene_anterior') and r.estado = 2) then
    update reparto_traspaso set estado = 'cancelado', resuelto_en = now(), respuesta = 'El pedido ya no estaba pendiente' where id = p_id;
    return jsonb_build_object('ok', false, 'error', 'Ese pedido ya no está pendiente: no hace falta que lo lleves.');
  end if;
  update reparto_traspaso set estado = case when p_aceptar then 'aceptado' else 'rechazado' end, resuelto_en = now(),
         respuesta = nullif(left(trim(p_nota), 300), '') where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- Retirar un ofrecimiento que todavía no han contestado.
create or replace function public.fn_app_rep_traspaso_cancelar(p_token uuid, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rep text := reparto_privado.sesion(p_token);
begin
  update reparto_traspaso set estado = 'cancelado', resuelto_en = now() where id = p_id and de_repartidor = v_rep and estado = 'propuesto';
  if not found then raise exception 'Ya lo han contestado: no se puede retirar.'; end if;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.fn_app_rep_traspaso_proponer(uuid, text, integer, text, integer, text, integer, text) from public;
revoke execute on function public.fn_app_rep_traspasos(uuid) from public;
revoke execute on function public.fn_app_rep_traspaso_responder(uuid, bigint, boolean, text) from public;
revoke execute on function public.fn_app_rep_traspaso_cancelar(uuid, bigint) from public;
grant execute on function public.fn_app_rep_traspaso_proponer(uuid, text, integer, text, integer, text, integer, text) to anon, authenticated, service_role;
grant execute on function public.fn_app_rep_traspasos(uuid) to anon, authenticated, service_role;
grant execute on function public.fn_app_rep_traspaso_responder(uuid, bigint, boolean, text) to anon, authenticated, service_role;
grant execute on function public.fn_app_rep_traspaso_cancelar(uuid, bigint) to anon, authenticated, service_role;

-- Las rutas a las que se puede ofrecer: abiertas, con repartidor, de hoy o atrasadas (también las de GeminisWin para hoy).
create or replace function public.fn_app_rep_rutas_destino(p_token uuid) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare v_rep text := reparto_privado.sesion(p_token);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('tienda', r.tienda_terminal_codigo, 'numero', r.numero, 'fecha', r.fecha, 'ruta', r.ruta_codigo,
                                                      'ruta_nombre', coalesce(rr.descripcion, r.ruta_codigo),
                                                      'repartidor', (select coalesce(nullif(nombre_corto, ''), nombre) from repartidor where codigo = r.repartidor_codigo),
                                                      'pedidos', (select count(*) from reparto_linea l where l.tienda_terminal_codigo = r.tienda_terminal_codigo and l.numero = r.numero))
                                   order by r.fecha desc, r.ruta_codigo, r.numero)
                     from reparto r left join ruta_reparto rr on rr.codigo = r.ruta_codigo
                    where r.estado = 2 and r.fecha <= fn_app_rep_hoy() and r.repartidor_codigo is not null and r.repartidor_codigo <> v_rep), '[]'::jsonb);
end $function$;

-- La lista de una ruta: sus pedidos + los que me han pasado y acepté (que siguen siendo de su reparto: rt/rn).
create or replace function public.fn_app_rep_lineas(p_token uuid, p_tienda text, p_numero integer)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_rep text := reparto_privado.sesion(p_token); r reparto;
begin
  r := reparto_privado.reparto(v_rep, p_tienda, p_numero);
  return jsonb_build_object(
    'reparto', jsonb_build_object('tienda', r.tienda_terminal_codigo, 'numero', r.numero, 'fecha', r.fecha, 'ruta', r.ruta_codigo,
                                  'ruta_nombre', coalesce((select descripcion from ruta_reparto where codigo = r.ruta_codigo), r.ruta_codigo)),
    'lineas', coalesce((
      select jsonb_agg(x.j order by x.prio desc, x.orden nulls last, x.memoria nulls last, x.poblacion, x.direccion)
        from (
          select l.reparto_anterior_numero is not null as prio, case when aj.ajeno then null else l.orden end as orden, l.poblacion, l.direccion,
                 (select avg(h.orden) from reparto_linea h join reparto hr on hr.tienda_terminal_codigo = h.tienda_terminal_codigo and hr.numero = h.numero
                   join venta hv on hv.tienda_terminal_codigo = h.venta_tienda_codigo and hv.numero = h.venta_numero
                   where hr.ruta_codigo = r.ruta_codigo and hr.fecha > r.fecha - 120 and hr.estado = 4 and h.orden is not null
                     and hv.cliente_codigo = v.cliente_codigo) as memoria,
                 jsonb_build_object(
                   'vt', l.venta_tienda_codigo, 'vn', l.venta_numero, 'rt', l.tienda_terminal_codigo, 'rn', l.numero,
                   'estado', l.estado, 'orden', case when aj.ajeno then null else l.orden end,
                   'prioritario', l.reparto_anterior_numero is not null, 'antes', l.estado_observaciones,
                   'cliente', coalesce(nullif(g.nombre_cliente, ''), nullif(v.nombre_cliente, ''), c.nombre, l.contacto, 'Sin nombre'),
                   'cliente_codigo', coalesce(g.cliente_codigo, v.cliente_codigo),
                   'contacto', l.contacto, 'direccion', l.direccion, 'poblacion', l.poblacion, 'cp', l.codigo_postal,
                   'telefono', coalesce(nullif(l.telefono_movil, ''), nullif(l.telefono_fijo, '')),
                   'total', coalesce(g.total, v.total), 'pagado', coalesce(g.total_pagado, v.total_pagado),
                   'factura', case when ro.origen = 'geminiswin' then to_jsonb(g.factura_numero) else to_jsonb(v.factura_numero) end, 'bultos', l.bultos,
                   'contado', g.forma_pago = 1, 'forma_pago', g.forma_pago_texto,
                   'incidencia', l.incidencia, 'motivo', l.motivo_no_entrega, 'nota', l.nota_repartidor,
                   'intento1', l.intento1_en, 'intento2', l.intento2_en, 'entregado_en', l.entregado_en, 'comprobado', l.comprobado_en is not null,
                   -- Pedido que me han pasado desde otra ruta.
                   'viene_de', case when aj.ajeno then
                     'Ruta ' || coalesce((select descripcion from ruta_reparto where codigo = ro.ruta_codigo), ro.ruta_codigo)
                     || ' · ' || coalesce((select coalesce(nullif(nombre_corto, ''), nombre) from repartidor where codigo = tp.de_repartidor), tp.de_repartidor) end,
                   -- Pedido mío que he ofrecido (esperando) o que ya lleva otro.
                   'traspaso', case when tp.id is not null and not aj.ajeno then jsonb_build_object('id', tp.id, 'estado', tp.estado,
                     'a', coalesce((select coalesce(nullif(nombre_corto, ''), nombre) from repartidor where codigo = tp.a_repartidor), tp.a_repartidor)) end) as j
            from reparto_linea l
            join reparto ro on ro.tienda_terminal_codigo = l.tienda_terminal_codigo and ro.numero = l.numero
            left join reparto_traspaso tp on tp.tienda_terminal_codigo = l.tienda_terminal_codigo and tp.numero = l.numero
                                         and tp.venta_tienda_codigo = l.venta_tienda_codigo and tp.venta_numero = l.venta_numero
                                         and tp.estado in ('propuesto', 'aceptado')
            cross join lateral (select not (l.tienda_terminal_codigo = p_tienda and l.numero = p_numero) as ajeno) aj
            left join venta v on ro.origen <> 'geminiswin' and v.tienda_terminal_codigo = l.venta_tienda_codigo and v.numero = l.venta_numero
            left join reparto_gw_venta g on ro.origen = 'geminiswin' and g.venta_tienda_codigo = l.venta_tienda_codigo and g.venta_numero = l.venta_numero
            left join cliente c on c.codigo = v.cliente_codigo
           where l.estado <> 'anulado'
             and ((l.tienda_terminal_codigo = p_tienda and l.numero = p_numero)
                  or (tp.estado = 'aceptado' and tp.a_tienda = p_tienda and tp.a_numero = p_numero and ro.estado = 2))
        ) x), '[]'::jsonb));
end $function$;

-- Un repartidor de prueba (repartidor_pin.prueba) solo ve sus rutas de prueba y no puede quedarse una
-- ruta real que esté sin repartidor (antes, con tocarla, se la asignaba).
create or replace function public.fn_app_rep_repartos(p_token uuid)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_rep text := reparto_privado.sesion(p_token);
  v_prueba boolean := coalesce((select prueba from repartidor_pin where repartidor_codigo = v_rep), false);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'tienda', r.tienda_terminal_codigo, 'numero', r.numero, 'fecha', r.fecha, 'ruta', r.ruta_codigo,
             'ruta_nombre', coalesce(rr.descripcion, r.ruta_codigo), 'mio', r.repartidor_codigo = v_rep,
             'manana', r.fecha > fn_app_rep_hoy(),
             'pedidos', (select count(*) from reparto_linea l where l.tienda_terminal_codigo = r.tienda_terminal_codigo and l.numero = r.numero),
             'pendientes', (select count(*) from reparto_linea l where l.tienda_terminal_codigo = r.tienda_terminal_codigo and l.numero = r.numero
                              and l.estado in ('pendiente', 'viene_anterior')))
           order by r.fecha, (r.repartidor_codigo = v_rep) desc, r.ruta_codigo)
      from reparto r left join ruta_reparto rr on rr.codigo = r.ruta_codigo
     where r.estado = 2 and (r.fecha <= fn_app_rep_hoy() + 1 or r.origen = 'geminiswin')
       and (r.repartidor_codigo = v_rep or (r.repartidor_codigo is null and not v_prueba))), '[]'::jsonb);
end $function$;

create or replace function reparto_privado.reparto(p_rep text, p_tienda text, p_numero integer)
 returns reparto language plpgsql security definer set search_path to 'public'
as $function$
declare r reparto;
begin
  select * into r from reparto where tienda_terminal_codigo = p_tienda and numero = p_numero for update;
  if not found then raise exception 'Ese reparto no existe.'; end if;
  if r.estado <> 2 then raise exception 'Ese reparto ya está cerrado.'; end if;
  if r.repartidor_codigo is null then
    if coalesce((select prueba from repartidor_pin where repartidor_codigo = p_rep), false) then
      raise exception 'Un repartidor de prueba no puede coger una ruta real.';
    end if;
    update reparto set repartidor_codigo = p_rep where tienda_terminal_codigo = p_tienda and numero = p_numero;
    r.repartidor_codigo := p_rep;
  elsif r.repartidor_codigo <> p_rep then
    raise exception 'Esta ruta la lleva otro repartidor (%).', coalesce((select nombre_corto from repartidor where codigo = r.repartidor_codigo), r.repartidor_codigo);
  end if;
  return r;
end $function$;

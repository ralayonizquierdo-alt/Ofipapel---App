-- App de repartidores: entrada «OFICINA» para ver cómo van TODAS las rutas (Rober, 14/11/2026).
-- Mientras se trabaja con GeminisWin, la oficina no entra al ERP: desde la misma app, quien tenga la
-- marca «supervisor» ve todas las rutas, qué queda en cada una y el detalle factura por factura, para
-- saber cuándo se puede cerrar en GeminisWin. Solo lectura: no marca, no cierra y no envía ubicación.
alter table public.repartidor_pin add column if not exists supervisor boolean not null default false;

-- Ficha de apoyo (no es una persona): es la entrada de la oficina en la app. Su PIN se pone aparte.
insert into public.repartidor (codigo, nombre, nombre_corto) values ('OFI', 'OFICINA (ver todas las rutas)', 'OFICINA')
on conflict (codigo) do nothing;

-- La lista de la pantalla de entrada: los repartidores de las rutas del puente y, además, los supervisores.
create or replace function public.fn_app_rep_repartidores()
 returns table(codigo text, nombre text) language sql stable security definer set search_path to 'public'
as $function$
  select r.codigo, coalesce(nullif(r.nombre_corto, ''), split_part(r.nombre, ' ', 1))
    from repartidor r join repartidor_pin p on p.repartidor_codigo = r.codigo
   where not coalesce(r.deshabilitado, false)
     and (p.supervisor
          or coalesce((select jsonb_array_length(valor) from parametro where clave = 'reparto.puente_gw_rutas'), 0) = 0
          or exists (select 1 from ruta_reparto_repartidor rr
                      where rr.repartidor_codigo = r.codigo
                        and (select valor from parametro where clave = 'reparto.puente_gw_rutas') ? rr.ruta_codigo))
   order by p.supervisor, 2 $function$;

-- Todas las rutas de hoy y las que sigan abiertas (también las ya generadas para el día siguiente).
create or replace function public.fn_app_rep_todas(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_rep text := reparto_privado.sesion(p_token); v_hoy date := fn_app_rep_hoy();
begin
  if not coalesce((select supervisor from repartidor_pin where repartidor_codigo = v_rep), false) then
    return jsonb_build_object('supervisor', false);
  end if;
  return jsonb_build_object('supervisor', true, 'hoy', v_hoy, 'rutas', coalesce((
    select jsonb_agg(jsonb_build_object(
             'tienda', r.tienda_terminal_codigo, 'numero', r.numero, 'fecha', r.fecha, 'estado', r.estado, 'ruta', r.ruta_codigo,
             'ruta_nombre', coalesce(rr.descripcion, r.ruta_codigo),
             'repartidor', coalesce(nullif(rp.nombre_corto, ''), rp.nombre),
             'total', k.total, 'entregados', k.entregados, 'incidencias', k.incidencias, 'no_entregados', k.no_entregados, 'pendientes', k.pendientes,
             'ultimo', k.ultimo)
           order by r.fecha, r.ruta_codigo, r.numero)
      from reparto r
      left join ruta_reparto rr on rr.codigo = r.ruta_codigo
      left join repartidor rp on rp.codigo = r.repartidor_codigo
      cross join lateral (
        select count(*) total,
               count(*) filter (where l.estado in ('entregado', 'liquidado') and l.incidencia is null) entregados,
               count(*) filter (where l.estado in ('entregado', 'liquidado') and l.incidencia is not null) incidencias,
               count(*) filter (where l.estado = 'no_entregado') no_entregados,
               count(*) filter (where l.estado in ('pendiente', 'viene_anterior')) pendientes,
               max(greatest(l.entregado_en, l.intento1_en, l.intento2_en)) ultimo
          from reparto_linea l where l.tienda_terminal_codigo = r.tienda_terminal_codigo and l.numero = r.numero and l.estado <> 'anulado') k
     where r.estado = 2 or r.fecha = v_hoy), '[]'::jsonb));
end $$;
revoke execute on function public.fn_app_rep_todas(uuid) from public;
grant execute on function public.fn_app_rep_todas(uuid) to anon, authenticated, service_role;

-- El detalle de una ruta, factura por factura (solo supervisores).
create or replace function public.fn_app_rep_todas_lineas(p_token uuid, p_tienda text, p_numero bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_rep text := reparto_privado.sesion(p_token); r reparto;
begin
  if not coalesce((select supervisor from repartidor_pin where repartidor_codigo = v_rep), false) then
    raise exception 'Solo la oficina puede ver todas las rutas.' using errcode = '42501';
  end if;
  select * into r from reparto where tienda_terminal_codigo = p_tienda and numero = p_numero;
  if not found then raise exception 'Ese reparto no existe.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'vt', l.venta_tienda_codigo, 'vn', l.venta_numero, 'orden', l.orden,
             'estado', case when l.estado in ('entregado', 'liquidado') and l.incidencia is not null then 'incidencia'
                            when l.estado in ('entregado', 'liquidado') then 'entregado'
                            when l.estado = 'no_entregado' then 'no_entregado' else 'pendiente' end,
             'cliente', coalesce(nullif(g.nombre_cliente, ''), nullif(v.nombre_cliente, ''), l.contacto, 'Sin nombre'),
             'poblacion', l.poblacion,
             'factura', case when r.origen = 'geminiswin' then to_jsonb(g.factura_numero) else to_jsonb(v.factura_numero) end,
             'total', coalesce(g.total, v.total), 'pagado', coalesce(g.total_pagado, v.total_pagado), 'contado', g.forma_pago = 1,
             'incidencia', l.incidencia, 'motivo', l.motivo_no_entrega, 'nota', l.nota_repartidor,
             'hora', to_char(coalesce(l.entregado_en, l.intento2_en, l.intento1_en) at time zone 'Atlantic/Canary', 'HH24:MI'))
           order by l.orden nulls last, l.venta_numero)
      from reparto_linea l
      left join venta v on r.origen <> 'geminiswin' and v.tienda_terminal_codigo = l.venta_tienda_codigo and v.numero = l.venta_numero
      left join reparto_gw_venta g on r.origen = 'geminiswin' and g.venta_tienda_codigo = l.venta_tienda_codigo and g.venta_numero = l.venta_numero
     where l.tienda_terminal_codigo = p_tienda and l.numero = p_numero and l.estado <> 'anulado'), '[]'::jsonb);
end $$;
revoke execute on function public.fn_app_rep_todas_lineas(uuid, text, bigint) from public;
grant execute on function public.fn_app_rep_todas_lineas(uuid, text, bigint) to anon, authenticated, service_role;

-- La entrada devuelve además si es supervisor (la app le enseña entonces «Todas las rutas»).
create or replace function public.fn_app_rep_login(p_repartidor text, p_pin text, p_dispositivo text default null::text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare p repartidor_pin; v_token uuid; v_nombre text;
begin
  select * into p from repartidor_pin where repartidor_codigo = p_repartidor for update;
  if not found then raise exception 'Este repartidor no tiene PIN: pídelo en la oficina.'; end if;
  if p.bloqueado_hasta > now() then
    raise exception 'Demasiados intentos. Espera % min o pide ayuda en la oficina.', ceil(extract(epoch from p.bloqueado_hasta - now()) / 60)::int;
  end if;
  if p_pin is null or extensions.crypt(p_pin, p.pin_hash) <> p.pin_hash then
    update repartidor_pin set fallos = case when fallos + 1 >= 5 then 0 else fallos + 1 end,
                              bloqueado_hasta = case when fallos + 1 >= 5 then now() + interval '15 minutes' else bloqueado_hasta end
     where repartidor_codigo = p_repartidor;
    return jsonb_build_object('ok', false, 'error', case when p.fallos + 1 >= 5 then 'PIN incorrecto. Bloqueado 15 minutos.' else 'PIN incorrecto.' end);
  end if;
  update repartidor_pin set fallos = 0, bloqueado_hasta = null where repartidor_codigo = p_repartidor;
  insert into reparto_app_sesion (repartidor_codigo, dispositivo) values (p_repartidor, left(p_dispositivo, 200)) returning token into v_token;
  select coalesce(nullif(nombre_corto, ''), nombre) into v_nombre from repartidor where codigo = p_repartidor;
  return jsonb_build_object('ok', true, 'token', v_token, 'repartidor', p_repartidor, 'nombre', v_nombre,
                            'puede_cambiar_ruta', p.puede_cambiar_ruta, 'fichaje_persona', p.fichaje_persona, 'supervisor', p.supervisor);
end $function$;

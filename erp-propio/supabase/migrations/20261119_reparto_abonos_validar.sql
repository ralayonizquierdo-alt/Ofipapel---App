-- Abonos en reparto (Rober, 19/11/2026). Un abono (venta con importe negativo) que el repartidor marca como entregado
-- (lo ha recogido) no está terminado: la mercancía tarda unos días en llegar y la valida el almacén. Hasta entonces sale
-- en el cuadro «Por cobrar» (app de oficina y Control de Repartos del ERP), en su apartado «Abonos · pendientes de
-- validar en almacén», aunque su reparto ya se haya cerrado. David lo valida en el ERP con un botón y sale de la lista.
-- Solo abonos de repartos desde el 19/11/2026 (los anteriores no se validaban así).
alter table public.reparto_linea add column if not exists abono_validado_en timestamptz;
alter table public.reparto_linea add column if not exists abono_validado_por text;
comment on column public.reparto_linea.abono_validado_en is 'Abono recogido en reparto y validado en almacén (Control de Repartos, botón Validar).';

-- Lo que sale en «Por cobrar». p_sup: oficina (todo); p_caja: caja (solo contado cobrado, sin abonos).
create or replace function reparto_privado.por_cobrar(p_sup boolean, p_caja boolean)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
             'vt', l.venta_tienda_codigo, 'vn', l.venta_numero, 'rt', l.tienda_terminal_codigo, 'rn', l.numero,
             'ruta', r.ruta_codigo, 'ruta_nombre', coalesce(rr.descripcion, r.ruta_codigo), 'fecha', r.fecha,
             'repartidor', coalesce(nullif(rp.nombre_corto, ''), rp.nombre),
             'cliente', coalesce(nullif(g.nombre_cliente, ''), nullif(v.nombre_cliente, ''), l.contacto, 'Sin nombre'),
             'factura', case when r.origen = 'geminiswin' then to_jsonb(g.factura_numero) else to_jsonb(v.factura_numero) end,
             'total', coalesce(g.total, v.total),
             'pendiente', coalesce(g.total, v.total) - coalesce(g.total_pagado, v.total_pagado, 0),
             'contado', g.forma_pago = 1, 'forma_pago', g.forma_pago_texto,
             'no_cobro', l.motivo_no_cobro, 'medio', l.cobro_medio, 'incidencia', l.incidencia, 'nota', l.nota_repartidor,
             'hora', to_char(l.entregado_en at time zone 'Atlantic/Canary', 'HH24:MI'))
           order by r.ruta_codigo, r.numero, l.orden nulls last, l.venta_numero)
      from reparto r
      join reparto_linea l on l.tienda_terminal_codigo = r.tienda_terminal_codigo and l.numero = r.numero
      left join ruta_reparto rr on rr.codigo = r.ruta_codigo
      left join repartidor rp on rp.codigo = r.repartidor_codigo
      left join venta v on r.origen <> 'geminiswin' and v.tienda_terminal_codigo = l.venta_tienda_codigo and v.numero = l.venta_numero
      left join reparto_gw_venta g on r.origen = 'geminiswin' and g.venta_tienda_codigo = l.venta_tienda_codigo and g.venta_numero = l.venta_numero
     where (r.estado = 2 or (r.fecha = fn_app_rep_hoy() and not exists (select 1 from reparto n where n.ruta_codigo = r.ruta_codigo and n.numero > r.numero))
              or (p_caja and not p_sup and r.fecha > fn_app_rep_hoy() - 10)) and not r.oculto
       and l.estado = 'entregado'
       and (p_sup or (g.forma_pago = 1 and l.motivo_no_cobro is null))
       and coalesce(g.total, v.total) - coalesce(g.total_pagado, v.total_pagado, 0) > 0.005), '[]'::jsonb)
$$;

-- Abonos recogidos y sin validar en almacén (con 'abono': true, para el apartado propio del cuadro).
create or replace function reparto_privado.abonos_sin_validar()
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
             'abono', true, 'vt', l.venta_tienda_codigo, 'vn', l.venta_numero, 'rt', l.tienda_terminal_codigo, 'rn', l.numero,
             'ruta', r.ruta_codigo, 'ruta_nombre', coalesce(rr.descripcion, r.ruta_codigo), 'fecha', r.fecha,
             'repartidor', coalesce(nullif(rp.nombre_corto, ''), rp.nombre),
             'cliente', coalesce(nullif(g.nombre_cliente, ''), nullif(v.nombre_cliente, ''), l.contacto, 'Sin nombre'),
             'factura', case when r.origen = 'geminiswin' then to_jsonb(g.factura_numero) else to_jsonb(v.factura_numero) end,
             'total', coalesce(g.total, v.total), 'pendiente', coalesce(g.total, v.total),
             'contado', g.forma_pago = 1, 'forma_pago', g.forma_pago_texto,
             'no_cobro', null, 'medio', null, 'incidencia', l.incidencia, 'nota', l.nota_repartidor,
             'hora', to_char(l.entregado_en at time zone 'Atlantic/Canary', 'DD/MM HH24:MI'))
           order by l.entregado_en, l.venta_numero)
      from reparto r
      join reparto_linea l on l.tienda_terminal_codigo = r.tienda_terminal_codigo and l.numero = r.numero
      left join ruta_reparto rr on rr.codigo = r.ruta_codigo
      left join repartidor rp on rp.codigo = r.repartidor_codigo
      left join venta v on r.origen <> 'geminiswin' and v.tienda_terminal_codigo = l.venta_tienda_codigo and v.numero = l.venta_numero
      left join reparto_gw_venta g on r.origen = 'geminiswin' and g.venta_tienda_codigo = l.venta_tienda_codigo and g.venta_numero = l.venta_numero
     where not r.oculto and r.fecha >= date '2026-11-19'
       and l.estado in ('entregado', 'liquidado') and l.abono_validado_en is null
       and coalesce(g.total, v.total) < -0.005), '[]'::jsonb)
$$;

-- App de oficina: lo de siempre y, para la oficina (no para caja), los abonos sin validar.
create or replace function public.fn_app_rep_por_cobrar(p_token uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare v_rep text := reparto_privado.sesion(p_token); v_sup boolean; v_caja boolean;
begin
  select coalesce(supervisor, false), coalesce(solo_caja, false) into v_sup, v_caja from repartidor_pin where repartidor_codigo = v_rep;
  if not (coalesce(v_sup, false) or coalesce(v_caja, false)) then
    raise exception 'Solo la oficina puede ver las facturas por cobrar.' using errcode = '42501';
  end if;
  return reparto_privado.por_cobrar(coalesce(v_sup, false), coalesce(v_caja, false))
         || case when coalesce(v_sup, false) then reparto_privado.abonos_sin_validar() else '[]'::jsonb end;
end $$;

-- ERP (Control de Repartos): el mismo cuadro que ve la oficina en la app.
create or replace function public.fn_reparto_control_por_cobrar()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not fn_puede('/repartos') then
    raise exception 'No tienes permiso de Repartos. Pídelo a un administrador (Archivo → Usuarios y permisos).' using errcode = '42501';
  end if;
  return reparto_privado.por_cobrar(true, false) || reparto_privado.abonos_sin_validar();
end $$;

-- Validar un abono (ya ha llegado al almacén). p_ok = false lo deshace.
create or replace function public.fn_reparto_abono_validar(p_tienda text, p_numero bigint, p_vt text, p_vn bigint, p_ok boolean default true)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not fn_puede('/repartos') then
    raise exception 'No tienes permiso de Repartos. Pídelo a un administrador (Archivo → Usuarios y permisos).' using errcode = '42501';
  end if;
  update reparto_linea
     set abono_validado_en = case when p_ok then now() end,
         abono_validado_por = case when p_ok then coalesce(fn_empleado_actual(), 'ERP') end
   where tienda_terminal_codigo = p_tienda and numero = p_numero and venta_tienda_codigo = p_vt and venta_numero = p_vn;
  if not found then raise exception 'Ese abono no está en el reparto.'; end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function reparto_privado.por_cobrar(boolean, boolean) from public, anon, authenticated;
revoke all on function reparto_privado.abonos_sin_validar() from public, anon, authenticated;
revoke all on function public.fn_reparto_control_por_cobrar() from public, anon;
revoke all on function public.fn_reparto_abono_validar(text, bigint, text, bigint, boolean) from public, anon;
grant execute on function public.fn_reparto_control_por_cobrar() to authenticated;
grant execute on function public.fn_reparto_abono_validar(text, bigint, text, bigint, boolean) to authenticated;

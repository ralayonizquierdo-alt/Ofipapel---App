-- App de reparto, vista de oficina: «Por cobrar» (Rober y David, 17/11/2026).
--
-- Debajo de las rutas, la oficina ve en una sola lista las facturas ya entregadas que siguen con importe
-- pendiente: las que se pagan por remesa o transferencia, y las de contado que el repartidor no cobró (con
-- su motivo) o que cobró y todavía no ha liquidado en administración. Es informativa: los cobros se
-- siguen apuntando en GeminisWin, y una factura sale de la lista sola cuando allí queda pagada o liquidada.
--
-- Mismas rutas que «Todas las rutas»: las de hoy y las que sigan abiertas. Solo supervisores.
-- No se clasifica aquí: se devuelve la forma de pago tal cual y la app la agrupa con la misma regla que usa
-- para el rótulo de cada factura (remesa, transferencia, contado, Bizum).
create or replace function public.fn_app_rep_por_cobrar(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_rep text := reparto_privado.sesion(p_token); v_hoy date := fn_app_rep_hoy();
begin
  if not coalesce((select supervisor from repartidor_pin where repartidor_codigo = v_rep), false) then
    raise exception 'Solo la oficina puede ver las facturas por cobrar.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'vt', l.venta_tienda_codigo, 'vn', l.venta_numero,
             'ruta', r.ruta_codigo, 'ruta_nombre', coalesce(rr.descripcion, r.ruta_codigo), 'fecha', r.fecha,
             'repartidor', coalesce(nullif(rp.nombre_corto, ''), rp.nombre),
             'cliente', coalesce(nullif(g.nombre_cliente, ''), nullif(v.nombre_cliente, ''), l.contacto, 'Sin nombre'),
             'factura', case when r.origen = 'geminiswin' then to_jsonb(g.factura_numero) else to_jsonb(v.factura_numero) end,
             'total', coalesce(g.total, v.total),
             'pendiente', coalesce(g.total, v.total) - coalesce(g.total_pagado, v.total_pagado, 0),
             'contado', g.forma_pago = 1, 'forma_pago', g.forma_pago_texto,
             'no_cobro', l.motivo_no_cobro, 'incidencia', l.incidencia, 'nota', l.nota_repartidor,
             'hora', to_char(l.entregado_en at time zone 'Atlantic/Canary', 'HH24:MI'))
           order by r.ruta_codigo, r.numero, l.orden nulls last, l.venta_numero)
      from reparto r
      join reparto_linea l on l.tienda_terminal_codigo = r.tienda_terminal_codigo and l.numero = r.numero
      left join ruta_reparto rr on rr.codigo = r.ruta_codigo
      left join repartidor rp on rp.codigo = r.repartidor_codigo
      left join venta v on r.origen <> 'geminiswin' and v.tienda_terminal_codigo = l.venta_tienda_codigo and v.numero = l.venta_numero
      left join reparto_gw_venta g on r.origen = 'geminiswin' and g.venta_tienda_codigo = l.venta_tienda_codigo and g.venta_numero = l.venta_numero
     where (r.estado = 2 or r.fecha = v_hoy) and not r.oculto
       and l.estado = 'entregado'
       and coalesce(g.total, v.total) - coalesce(g.total_pagado, v.total_pagado, 0) > 0.005), '[]'::jsonb);
end $$;
revoke execute on function public.fn_app_rep_por_cobrar(uuid) from public;
grant execute on function public.fn_app_rep_por_cobrar(uuid) to anon, authenticated, service_role;

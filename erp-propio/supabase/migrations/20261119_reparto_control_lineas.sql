-- Control de Repartos (David/Rober, 19/11/2026): en cada ruta, un botón despliega sus pedidos como en la vista de
-- oficina de la app (cliente, importe, qué hacer, forma de pago, documento, población, estado y hora) con la marca de
-- «comprobado» para revisar y separar los albaranes y facturas. Y al pasar el ratón por cada puntito de la barra sale
-- ese pedido. Las líneas van en el MISMO orden que los puntos de fn_reparto_seguimiento (marcados por hora, luego el resto).
create or replace function public.fn_reparto_control_lineas(p_fecha date default null)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare v_dia date := coalesce(p_fecha, fn_app_rep_hoy());
begin
  if not fn_puede('/repartos') then
    raise exception 'No tienes permiso de Repartos. Pídelo a un administrador (Archivo → Usuarios y permisos).' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_object_agg(r.tienda_terminal_codigo || '-' || r.numero, coalesce((
      select jsonb_agg(jsonb_build_object(
               'vt', x.vt, 'vn', x.vn, 'estado', x.estado, 'cliente', x.cliente, 'poblacion', x.poblacion, 'factura', x.factura,
               'total', x.total, 'pagado', x.pagado, 'contado', x.contado, 'forma_pago', x.forma_pago, 'incidencia', x.incidencia,
               'motivo', x.motivo, 'no_cobro', x.no_cobro, 'medio', x.medio, 'nota', x.nota, 'hora', to_char(x.t at time zone 'Atlantic/Canary', 'HH24:MI'),
               'comprobado', x.comprobado)
             order by x.t is null, x.t, x.orden nulls last)
        from (select l.venta_tienda_codigo vt, l.venta_numero vn, l.orden,
                     case when l.estado = 'liquidado' then 'liquidado' when l.estado = 'entregado' and l.incidencia is not null then 'incidencia'
                          when l.estado = 'entregado' then 'entregado' when l.estado = 'no_entregado' then 'no_entregado' else 'pendiente' end estado,
                     case when l.estado in ('entregado', 'liquidado') then l.entregado_en
                          when l.estado = 'no_entregado' then coalesce(l.intento2_en, l.intento1_en) end t,
                     coalesce(nullif(g.nombre_cliente, ''), nullif(v.nombre_cliente, ''), l.contacto, 'Sin nombre') cliente,
                     l.poblacion, case when r.origen = 'geminiswin' then to_jsonb(g.factura_numero) else to_jsonb(v.factura_numero) end factura,
                     coalesce(g.total, v.total) total, coalesce(g.total_pagado, v.total_pagado) pagado, g.forma_pago = 1 contado,
                     g.forma_pago_texto forma_pago, l.incidencia, l.motivo_no_entrega motivo, l.motivo_no_cobro no_cobro, l.cobro_medio medio,
                     l.nota_repartidor nota, l.comprobado_en is not null comprobado
                from reparto_linea l
                left join venta v on r.origen <> 'geminiswin' and v.tienda_terminal_codigo = l.venta_tienda_codigo and v.numero = l.venta_numero
                left join reparto_gw_venta g on r.origen = 'geminiswin' and g.venta_tienda_codigo = l.venta_tienda_codigo and g.venta_numero = l.venta_numero
               where l.tienda_terminal_codigo = r.tienda_terminal_codigo and l.numero = r.numero and l.estado <> 'anulado') x), '[]'::jsonb))
      from reparto r
     where (r.fecha = v_dia or (r.estado = 2 and r.fecha < v_dia)) and not r.oculto), '{}'::jsonb);
end $$;

-- Marcar/desmarcar «comprobado» desde el ERP (lo mismo que el ① Comprobar de la app).
create or replace function public.fn_reparto_control_comprobar(p_tienda text, p_numero bigint, p_vt text, p_vn bigint, p_ok boolean)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not fn_puede('/repartos') then
    raise exception 'No tienes permiso de Repartos. Pídelo a un administrador (Archivo → Usuarios y permisos).' using errcode = '42501';
  end if;
  update reparto_linea set comprobado_en = case when p_ok then coalesce(comprobado_en, now()) end
   where tienda_terminal_codigo = p_tienda and numero = p_numero and venta_tienda_codigo = p_vt and venta_numero = p_vn;
  if not found then raise exception 'Ese pedido no está en el reparto.'; end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.fn_reparto_control_lineas(date) from public, anon;
revoke all on function public.fn_reparto_control_comprobar(text, bigint, text, bigint, boolean) from public, anon;
grant execute on function public.fn_reparto_control_lineas(date) to authenticated;
grant execute on function public.fn_reparto_control_comprobar(text, bigint, text, bigint, boolean) to authenticated;

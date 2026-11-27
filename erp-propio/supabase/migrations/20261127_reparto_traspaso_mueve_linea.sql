-- Traspaso de pedidos entre repartidores (Rober, 27/11/2026): la venta 54-2470658 la pasó Antonio (ruta 3) a Jesús
-- (ruta 4) desde la app y Jesús la entregó, pero en el ERP seguía saliendo en la ruta 3: el traspaso solo apuntaba
-- quién lo llevaba y la línea se quedaba en el reparto de origen (y el cobro, a nombre del de origen).
-- Ahora, al ACEPTAR, el pedido se mueve de verdad al reparto de destino (como «Cambiar de ruta» de la oficina,
-- queda en reparto_cambio_ruta) y el traspaso pasa a 'movido'. Si no se puede mover (reparto de destino cerrado
-- sin otro abierto…), se queda como antes ('aceptado').
alter table public.reparto_traspaso drop constraint reparto_traspaso_estado_check;
alter table public.reparto_traspaso add constraint reparto_traspaso_estado_check
  check (estado = any (array['propuesto', 'aceptado', 'rechazado', 'cancelado', 'movido']));

create or replace function reparto_privado.traspaso_mover(p_id bigint)
 returns boolean language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare t reparto_traspaso;
begin
  select * into t from reparto_traspaso where id = p_id and estado = 'aceptado' for update;
  if not found then return false; end if;
  begin
    perform reparto_privado.mover_linea(t.tienda_terminal_codigo, t.numero::integer, t.venta_tienda_codigo, t.venta_numero::integer,
      t.a_tienda, t.a_numero::integer,
      'Pasado desde la app de ' || coalesce((select coalesce(nullif(nombre_corto, ''), nombre) from repartidor where codigo = t.de_repartidor), t.de_repartidor)
        || ' a ' || coalesce((select coalesce(nullif(nombre_corto, ''), nombre) from repartidor where codigo = t.a_repartidor), t.a_repartidor),
      'App reparto · ' || t.a_repartidor);
  exception when others then
    return false;
  end;
  update reparto_traspaso set estado = 'movido' where id = p_id;
  return true;
end $$;

do $$
declare v text := pg_get_functiondef('public.fn_app_rep_traspaso_responder'::regproc);
begin
  if position('traspaso_mover' in v) > 0 then return; end if;
  if position(E'respuesta = nullif(left(trim(p_nota), 300), \'\') where id = p_id;\n  return jsonb_build_object(\'ok\', true);' in v) = 0 then raise exception 'responder: patrón'; end if;
  v := replace(v, E'respuesta = nullif(left(trim(p_nota), 300), \'\') where id = p_id;\n  return jsonb_build_object(\'ok\', true);',
    E'respuesta = nullif(left(trim(p_nota), 300), \'\') where id = p_id;\n  if p_aceptar then perform reparto_privado.traspaso_mover(p_id); end if;\n  return jsonb_build_object(\'ok\', true);');
  execute v;
end $$;

-- Los ya aceptados con los dos repartos abiertos (hoy): se mueven ya.
do $$
declare x record;
begin
  perform set_config('erp.origen', 'Claude Code · traspasos aceptados de hoy movidos a la ruta de destino', true);
  for x in select t.id from reparto_traspaso t
             join reparto ro on ro.tienda_terminal_codigo = t.tienda_terminal_codigo and ro.numero = t.numero and ro.estado = 2
             join reparto rd on rd.tienda_terminal_codigo = t.a_tienda and rd.numero = t.a_numero and rd.estado = 2
            where t.estado = 'aceptado' order by t.id
  loop
    perform reparto_privado.traspaso_mover(x.id);
  end loop;
end $$;

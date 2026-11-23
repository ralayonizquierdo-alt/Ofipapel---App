-- Cambiar un pedido de ruta desde la app, en la vista de la oficina (Rober, 23/11/2026). Solo supervisores (los que ven «Todas
-- las rutas»). Es un cambio directo, sin que el otro repartidor tenga que aceptarlo (eso es el traspaso entre repartidores):
-- mismo mover_linea que el ERP, que ya sabe pasar a una ruta cuyo reparto está cerrado (va al abierto más nuevo de esa ruta).
-- Queda anotado en reparto_cambio_ruta con quién lo hizo.
create or replace function public.fn_app_rep_oficina_cambiar_ruta(p_token uuid, p_tienda text, p_numero integer, p_vt text, p_vn integer,
                                                                  p_dest_tienda text, p_dest_numero integer, p_motivo text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rep text := reparto_privado.sesion(p_token);
begin
  if not coalesce((select supervisor from repartidor_pin where repartidor_codigo = v_rep), false) then
    raise exception 'Solo la oficina puede cambiar pedidos de ruta.' using errcode = '42501';
  end if;
  return reparto_privado.mover_linea(p_tienda, p_numero, p_vt, p_vn, p_dest_tienda, p_dest_numero, p_motivo,
           'Oficina ' || coalesce((select coalesce(nullif(nombre_corto, ''), nombre) from repartidor where codigo = v_rep), v_rep));
end $$;
revoke execute on function public.fn_app_rep_oficina_cambiar_ruta(uuid, text, integer, text, integer, text, integer, text) from public;
grant execute on function public.fn_app_rep_oficina_cambiar_ruta(uuid, text, integer, text, integer, text, integer, text) to anon, authenticated, service_role;

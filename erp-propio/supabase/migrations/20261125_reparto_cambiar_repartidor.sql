-- Rober, 25/11/2026: «no puedo cambiar los repartidores desde el ERP». La ficha del reparto guarda la ficha ENTERA con los datos
-- que tenía al abrirla, así que un cambio de repartidor se pisaba con valores viejos (pasó con Fran, 09:12 del 25/11).
-- Botón «Cambiar» junto al repartidor de cada ruta abierta en Control de Repartos: fn_reparto_cambiar_repartidor cambia SOLO el
-- repartidor (o lo deja sin asignar), deja anotado el cambio en la auditoría y avisa si el repartidor ya tiene otra ruta abierta ese día.
-- Aplicada en Supabase como migración «reparto_cambiar_repartidor»; probada con rollback (cambia, deja sin asignar, rechaza un
-- repartidor que no existe y un reparto cerrado).
create or replace function public.fn_reparto_cambiar_repartidor(p_tienda text, p_numero bigint, p_repartidor text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare s reparto; v_rep text := nullif(btrim(p_repartidor), ''); v_nombre text; v_otras int := 0;
begin
  perform reparto_privado.nexa_solo_admin();
  if not fn_puede('/repartos') then
    raise exception 'No tienes permiso de Repartos. Pídelo a un administrador (Archivo → Usuarios y permisos).' using errcode = '42501';
  end if;
  select * into s from reparto where tienda_terminal_codigo = p_tienda and numero = p_numero for update;
  if not found then raise exception 'Ese reparto no existe.'; end if;
  if s.estado <> 2 then raise exception 'Ese reparto ya está cerrado: no se le cambia el repartidor.'; end if;
  if v_rep is not null then
    select coalesce(nullif(nombre_corto, ''), nombre) into v_nombre from repartidor where codigo = v_rep and not deshabilitado;
    if v_nombre is null then raise exception 'Ese repartidor no existe o está desactivado.'; end if;
    select count(*) into v_otras from reparto o
     where o.estado = 2 and o.repartidor_codigo = v_rep and o.fecha = s.fecha and not (o.tienda_terminal_codigo = p_tienda and o.numero = p_numero);
  end if;
  perform set_config('erp.origen', 'Repartidor de la ruta ' || coalesce(s.ruta_codigo, '?') || ' (reparto ' || p_tienda || '-' || p_numero || '): ' ||
                     coalesce((select coalesce(nullif(nombre_corto, ''), nombre) from repartidor where codigo = s.repartidor_codigo), 'sin repartidor') ||
                     ' → ' || coalesce(v_nombre, 'sin repartidor') || ' (cambiado desde Control de Repartos)', true);
  update reparto set repartidor_codigo = v_rep, actualizado_en = now() where tienda_terminal_codigo = p_tienda and numero = p_numero;
  return jsonb_build_object('ok', true, 'repartidor', v_rep, 'nombre', v_nombre, 'otras_rutas_abiertas', v_otras);
end $function$;
revoke all on function public.fn_reparto_cambiar_repartidor(text, bigint, text) from public, anon;
grant execute on function public.fn_reparto_cambiar_repartidor(text, bigint, text) to authenticated;

-- Ubicación de los repartidores: solo en jornada y borrado a los 30 días (Rober, 13/11/2026).

-- 1) Solo se guarda durante la jornada: si ha fichado la salida, está en pausa o aún no ha fichado,
--    no se guarda nada aunque tenga la ruta abierta en la app. (Repartidor sin enlazar con Fichaje:
--    sigue como antes, con la ruta abierta.)  [APLICADA el 13/11/2026]
create or replace function public.fn_app_rep_posicion(p_token uuid, p_tienda text, p_numero integer, p_lat double precision, p_lng double precision, p_precision real default null::real)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_rep text := reparto_privado.sesion(p_token);
begin
  if p_lat is null or p_lng is null or p_lat not between 27 and 29.5 or p_lng not between -18.5 and -13 then
    return jsonb_build_object('ok', false);
  end if;
  if reparto_privado.fichaje(v_rep) in ('salida', 'pausa', 'sin_fichar') then
    return jsonb_build_object('ok', true, 'guardada', false, 'motivo', 'fuera_de_jornada');
  end if;
  if exists (select 1 from reparto where tienda_terminal_codigo = p_tienda and numero = p_numero and estado = 2 and repartidor_codigo = v_rep)
     and not exists (select 1 from reparto_posicion where repartidor_codigo = v_rep and en > now() - interval '20 seconds') then
    insert into reparto_posicion (repartidor_codigo, tienda_terminal_codigo, numero, lat, lng, precision_m) values (v_rep, p_tienda, p_numero, p_lat, p_lng, p_precision);
  end if;
  return jsonb_build_object('ok', true);
end $function$;

-- 2) Las posiciones de más de 30 días se borran solas, cada noche.
--    [PENDIENTE de aplicar a mano en Supabase → SQL Editor: lleva una orden de borrado]
select cron.schedule('erp_borrar_posiciones_reparto', '23 2 * * *',
  $$delete from public.reparto_posicion where en < now() - interval '30 days'$$);

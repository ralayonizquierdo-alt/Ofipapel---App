-- App de repartidores: fichar la entrada, las pausas y la salida sin salir de la app (Rober, 16/11/2026).
-- Antes había que ir a la app de Fichaje (otro PIN). Ahora el repartidor, que ya ha entrado con su PIN
-- personal de reparto, ficha desde aquí; el fichaje queda en las mismas tablas (fichaje_evento), con las
-- mismas reglas (qué toca después de qué, fuera de sitio, fuera de horario) y «App reparto» en el dispositivo.
-- Solo para repartidores enlazados en Archivo → Fichaje → Personas (fichaje_empleado.repartidor_codigo).
create or replace function public.fn_app_rep_fichar(p_token uuid, p_tipo text, p_lat double precision default null, p_lng double precision default null,
                                                    p_precision real default null, p_dispositivo text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rep text := reparto_privado.sesion(p_token); v_emp text; v_dia date := fichaje_privado.hoy(); v_estado text;
begin
  select empleado_codigo into v_emp from fichaje_empleado where repartidor_codigo = v_rep and activo;
  if v_emp is null then
    return jsonb_build_object('ok', false, 'error', 'Tu ficha de Fichaje no está enlazada con el reparto: pide en la oficina que lo hagan (Archivo → Fichaje → Personas).');
  end if;
  if p_tipo is null or p_tipo not in ('entrada', 'pausa_inicio', 'pausa_fin', 'salida') then raise exception 'Fichaje no válido.'; end if;
  perform pg_advisory_xact_lock(hashtext('fichaje:' || v_emp));
  v_estado := fichaje_privado.estado(v_emp, v_dia);
  if not (p_tipo = any (fichaje_privado.siguientes(v_estado))) then
    return jsonb_build_object('ok', false, 'estado', v_estado, 'error',
      'Ahora no toca «' || replace(p_tipo, '_', ' ') || '»: ' ||
      case v_estado when 'trabajando' then 'ya tienes la entrada fichada (puedes fichar pausa o salida).'
                    when 'pausa' then 'estás en pausa (ficha el fin de pausa).' else 'primero ficha la entrada.' end);
  end if;
  perform set_config('erp.origen', 'Fichaje · ' || v_emp || ' · App reparto', true);
  insert into fichaje_evento (empleado_codigo, tipo, dia, lat, lng, precision_m, fuera_de_sitio, fuera_de_horario, dispositivo)
  values (v_emp, p_tipo, v_dia, p_lat, p_lng, p_precision,
          fichaje_privado.fuera_de_sitio(v_emp, p_lat, p_lng), fichaje_privado.fuera_de_horario(v_emp, now()), left('App reparto · ' || coalesce(p_dispositivo, ''), 200));
  v_estado := fichaje_privado.estado(v_emp, v_dia);
  return jsonb_build_object('ok', true, 'estado', v_estado, 'siguientes', to_jsonb(fichaje_privado.siguientes(v_estado)),
    'hoy', coalesce((select jsonb_agg(jsonb_build_object('tipo', tipo, 'en', en) order by en, id)
                       from fichaje_evento where empleado_codigo = v_emp and dia = v_dia and anulado_por is null), '[]'::jsonb));
end $$;
revoke execute on function public.fn_app_rep_fichar(uuid, text, double precision, double precision, real, text) from public;
grant execute on function public.fn_app_rep_fichar(uuid, text, double precision, double precision, real, text) to anon, authenticated, service_role;

create or replace function public.fn_app_rep_fichaje_hoy(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_rep text := reparto_privado.sesion(p_token); v_emp text; v_dia date := fichaje_privado.hoy(); v_estado text;
begin
  select empleado_codigo into v_emp from fichaje_empleado where repartidor_codigo = v_rep and activo;
  if v_emp is null then return jsonb_build_object('estado', 'sin_vinculo', 'hoy', '[]'::jsonb); end if;
  v_estado := fichaje_privado.estado(v_emp, v_dia);
  return jsonb_build_object('estado', v_estado,
    'hoy', coalesce((select jsonb_agg(jsonb_build_object('tipo', tipo, 'en', en) order by en, id)
                       from fichaje_evento where empleado_codigo = v_emp and dia = v_dia and anulado_por is null), '[]'::jsonb));
end $$;
revoke execute on function public.fn_app_rep_fichaje_hoy(uuid) from public;
grant execute on function public.fn_app_rep_fichaje_hoy(uuid) to anon, authenticated, service_role;

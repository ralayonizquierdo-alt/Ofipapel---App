-- «Mi fichaje» (Rober, 03/11/2026): cada empleado ficha desde el ordenador que tenga más cerca, con el botón de la
-- barra de accesos del ERP. Ficha la persona que tiene la sesión abierta (fn_empleado_actual); en un puesto
-- compartido, «Otra persona» usa nombre + PIN (fn_fichaje_entrar / fn_fichaje_fichar).

create or replace function public.fn_fichaje_mio() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_emp text := fn_empleado_actual();
begin
  if v_emp is null then raise exception 'No hay empleado en esta sesión.'; end if;
  if not exists (select 1 from fichaje_empleado where empleado_codigo = v_emp and activo) then
    return jsonb_build_object('ok', false, 'empleado', v_emp,
      'error', 'No estás dado de alta en Fichaje: pídelo a gerencia (Archivo → Fichaje → Personas).');
  end if;
  return fichaje_privado.panel(v_emp);
end $$;

create or replace function public.fn_fichaje_fichar_mio(p_tipo text,
  p_lat double precision default null, p_lng double precision default null, p_precision real default null, p_dispositivo text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_emp text := fn_empleado_actual(); v_dia date := fichaje_privado.hoy(); v_estado text;
begin
  if v_emp is null then raise exception 'No hay empleado en esta sesión.'; end if;
  if not exists (select 1 from fichaje_empleado where empleado_codigo = v_emp and activo) then
    raise exception 'No estás dado de alta en Fichaje: pídelo a gerencia (Archivo → Fichaje → Personas).';
  end if;
  perform pg_advisory_xact_lock(hashtext('fichaje:' || v_emp));
  v_estado := fichaje_privado.estado(v_emp, v_dia);
  if not (p_tipo = any (fichaje_privado.siguientes(v_estado))) then
    raise exception 'Ahora no toca «%»: %.', replace(p_tipo, '_', ' '),
      case v_estado when 'trabajando' then 'ya tienes la entrada fichada (puedes fichar pausa o salida)'
                    when 'pausa' then 'estás en pausa (ficha el fin de pausa)' else 'primero ficha la entrada' end;
  end if;
  perform set_config('erp.origen', 'Mi fichaje (ERP)', true);
  insert into fichaje_evento (empleado_codigo, tipo, dia, lat, lng, precision_m, fuera_de_sitio, fuera_de_horario, dispositivo)
  values (v_emp, p_tipo, v_dia, p_lat, p_lng, p_precision,
          fichaje_privado.fuera_de_sitio(v_emp, p_lat, p_lng), fichaje_privado.fuera_de_horario(v_emp, now()),
          left('ERP · ' || coalesce(p_dispositivo, ''), 200));
  return fichaje_privado.panel(v_emp);
end $$;

grant execute on function public.fn_fichaje_mio() to authenticated;
grant execute on function public.fn_fichaje_fichar_mio(text, double precision, double precision, real, text) to authenticated;

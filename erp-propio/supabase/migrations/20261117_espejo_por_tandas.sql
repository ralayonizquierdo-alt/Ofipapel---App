-- Espejo de GeminisWin: cargar por tandas (17/11/2026).
--
-- Qué pasó: la primera vez que llegó una tabla mediana (CLIENTES, 13.607 fichas) el ERP intentó pasarlas
-- todas a su tabla en una sola orden. Tardó más de un minuto y la conexión se cortó a los 60 s (error 520),
-- así que no quedó nada cargado. Dos causas:
--
--   1. Cada ficha copiada dejaba además una línea en la auditoría. La auditoría es para lo que hacen las
--      personas en el ERP; una copia de lo que hay en GeminisWin no es un cambio de nadie, y con 1,5
--      millones de registros la habría llenado de ruido. El disparador de auditoría ya tenía previsto el
--      interruptor «erp.sin_auditoria» para las cargas: ahora el espejo lo usa.
--   2. No había tope: lo recibido y pendiente se cargaba todo de una vez. Ahora cada orden carga como mucho
--      unas 5.000 filas (por lotes enteros de recepción) y dice si queda más; quien llama repite.
--
-- «cargado_hasta» pasa a significar: todo lo recibido hasta ese instante (inclusive) ya está en el ERP.

create or replace function public.gw_reciente(p timestamptz)
returns boolean language sql stable as $$
  select p >= coalesce(nullif(current_setting('espejo.desde', true), '')::timestamptz, '-infinity'::timestamptz)
     and p <= coalesce(nullif(current_setting('espejo.hasta', true), '')::timestamptz, 'infinity'::timestamptz)
$$;

create or replace function public.fn_espejo_gw_procesar(p_tabla text, p_equipo text default null)
returns jsonb language plpgsql security definer
set search_path to 'public' set statement_timeout to '600s' as $$
declare v_pasos text[]; p text; v jsonb := '[]'::jsonb; v_r jsonb; v_ini timestamptz := clock_timestamp();
  v_desde timestamptz; v_hasta timestamptz; v_filas int; v_quedan boolean; v_max constant int := 5000;
begin
  select t.pasos into v_pasos from fn_espejo_gw_tablas() t where t.tabla = p_tabla;
  if v_pasos is null then raise exception 'El espejo no admite la tabla %.', p_tabla; end if;
  select coalesce((select cargado_hasta from espejo_gw_tabla where tabla = p_tabla), '-infinity'::timestamptz) into v_desde;

  -- Hasta dónde llega esta tanda: lotes enteros de recepción, sin pasar de v_max filas (uno al menos).
  select max(cargado_en) into v_hasta from (
    select cargado_en, sum(count(*)) over (order by cargado_en) acum
      from carga_dbf where tabla = p_tabla and cargado_en > v_desde group by cargado_en) x
   where acum <= v_max;
  if v_hasta is null then
    select min(cargado_en) into v_hasta from carga_dbf where tabla = p_tabla and cargado_en > v_desde;
  end if;
  if v_hasta is null then
    return jsonb_build_object('ok', true, 'filas', 0, 'quedan', false, 'segundos', 0);
  end if;
  select count(*) into v_filas from carga_dbf where tabla = p_tabla and cargado_en > v_desde and cargado_en <= v_hasta;

  perform set_config('erp.sin_auditoria', 'on', true);
  perform set_config('espejo.desde', (v_desde + interval '1 microsecond')::text, true);
  perform set_config('espejo.hasta', v_hasta::text, true);
  foreach p in array v_pasos loop
    execute format('select to_jsonb(public.%I())', 'fn_carga_gw_' || p) into v_r;
    v := v || jsonb_build_array(jsonb_build_object('paso', p, 'resultado', v_r));
  end loop;
  perform set_config('espejo.desde', '', true);
  perform set_config('espejo.hasta', '', true);
  perform set_config('erp.sin_auditoria', '', true);

  insert into espejo_gw_tabla (tabla, cargado_hasta) values (p_tabla, v_hasta)
  on conflict (tabla) do update set cargado_hasta = excluded.cargado_hasta;
  insert into espejo_gw_pasada (tabla, procesado, equipo) values (p_tabla, v, left(p_equipo, 60));
  select exists (select 1 from carga_dbf where tabla = p_tabla and cargado_en > v_hasta) into v_quedan;
  return jsonb_build_object('ok', true, 'filas', v_filas, 'quedan', v_quedan,
    'segundos', round(extract(epoch from clock_timestamp() - v_ini)::numeric, 1));
exception when others then
  perform set_config('espejo.desde', '', true);
  perform set_config('espejo.hasta', '', true);
  perform set_config('erp.sin_auditoria', '', true);
  insert into espejo_gw_pasada (tabla, error, equipo) values (p_tabla, left(sqlerrm, 500), left(p_equipo, 60));
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end $$;

revoke all on function public.fn_espejo_gw_procesar(text, text) from public, anon, authenticated;
grant execute on function public.fn_espejo_gw_procesar(text, text) to service_role;

-- Comprobado el 17/11/2026 con CLIENTES: 13.607 fichas en tres tandas de 11, 11 y 8 segundos; ninguna
-- línea nueva en la auditoría.

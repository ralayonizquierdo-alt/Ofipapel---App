-- Espejo de GeminisWin: datos para la pantalla de control (Archivo → Espejo de GeminisWin, 17/11/2026).
--
-- Por cada tabla que copia el espejo: cuántos registros han llegado de GeminisWin, cuántos faltan por pasar
-- a las tablas del ERP, cuántos hay ya en la tabla del ERP, cuándo llegó algo por última vez y el último
-- error (solo si es posterior a la última carga buena: un error ya superado no se enseña).
-- Solo administradores. No devuelve datos de clientes ni de artículos: contadores y fechas.
--
-- Sustituye a fn_espejo_gw_estado (20261117_espejo_geminiswin.sql), que se queda sin uso: borrarla en la
-- limpieza, junto con fn_contanet_carga_tmp y fn_compras2_lineas/_resumen.

create index if not exists espejo_gw_pasada_tabla_en_idx on public.espejo_gw_pasada (tabla, en desc);

create or replace function public.fn_espejo_gw_panel()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v jsonb := '[]'::jsonb; t record; v_dest text; v_n bigint; v_hasta timestamptz; v_ok timestamptz;
begin
  if not public.fn_es_administrador() then
    raise exception 'Solo un administrador puede ver el estado del espejo.' using errcode = '42501';
  end if;
  for t in select x.orden, x.tabla, x.pasos from fn_espejo_gw_tablas() x order by x.orden loop
    v_dest := case when t.tabla = 'ARTICULO' then 'articulo' else t.pasos[1] end;
    v_n := null;
    if to_regclass('public.' || quote_ident(v_dest)) is not null then
      execute format('select count(*) from public.%I', v_dest) into v_n;
    end if;
    select coalesce((select cargado_hasta from espejo_gw_tabla e where e.tabla = t.tabla), '-infinity'::timestamptz) into v_hasta;
    select max(p.en) into v_ok from espejo_gw_pasada p where p.tabla = t.tabla and p.procesado is not null;
    v := v || jsonb_build_array(jsonb_build_object(
      'tabla', t.tabla, 'destino', v_dest, 'en_erp', v_n,
      'recibidas', (select count(*) from carga_dbf c where c.tabla = t.tabla),
      'pendientes', (select count(*) from carga_dbf c where c.tabla = t.tabla and c.cargado_en > v_hasta),
      'ultima_recepcion', (select max(p.en) from espejo_gw_pasada p where p.tabla = t.tabla and p.procesado is null and p.error is null),
      'ultimo_cambio', (select max(p.en) from espejo_gw_pasada p where p.tabla = t.tabla and p.procesado is null and p.error is null and p.cambiadas > 0),
      'ultima_carga', v_ok,
      'ultimo_error', (select jsonb_build_object('en', p.en, 'texto', p.error) from espejo_gw_pasada p
                        where p.tabla = t.tabla and p.error is not null and p.en > coalesce(v_ok, '-infinity'::timestamptz)
                        order by p.en desc limit 1)));
  end loop;
  return jsonb_build_object('ahora', now(),
    'ultimo_contacto', (select max(en) from espejo_gw_pasada),
    'equipo', (select equipo from espejo_gw_pasada where equipo is not null order by en desc limit 1),
    'tablas', v);
end $$;

revoke all on function public.fn_espejo_gw_panel() from public, anon;
grant execute on function public.fn_espejo_gw_panel() to authenticated;

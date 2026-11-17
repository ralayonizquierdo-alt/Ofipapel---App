-- Espejo de GeminisWin: cargar solo lo que ha cambiado (17/11/2026).
-- La medida en el PC de Mónica dio 142.670 artículos, 381.022 stocks, 243.196 referencias de proveedor…
-- Las fn_carga_gw_* se hicieron para una carga de una vez: cada llamada volvía a pasar al ERP TODAS las
-- filas del volcado. Con el espejo, que avisa cada pocos minutos, eso no vale.
--  · gw_reciente(cargado_en): cierto si la fila llegó después de la última carga de su tabla. Fuera del
--    espejo (fn_carga_gw_todo a mano) es siempre cierto: todo sigue funcionando igual que antes.
--  · Las cargas de las tablas grandes solo leen filas recientes.
--  · fn_espejo_gw_procesar apunta hasta dónde ha cargado cada tabla (espejo_gw_tabla).

create or replace function public.gw_reciente(p timestamptz) returns boolean
language sql stable as $$
  select p >= coalesce(nullif(current_setting('espejo.desde', true), '')::timestamptz, '-infinity'::timestamptz)
$$;

create index if not exists carga_dbf_tabla_cargado_idx on public.carga_dbf (tabla, cargado_en);

create table if not exists public.espejo_gw_tabla (
  tabla text primary key,
  cargado_hasta timestamptz
);
alter table public.espejo_gw_tabla enable row level security;   -- sin políticas: solo las funciones
revoke all on public.espejo_gw_tabla from public, anon, authenticated;

create or replace function public.fn_espejo_gw_procesar(p_tabla text, p_equipo text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '600s'
as $$
declare v_pasos text[]; p text; v jsonb := '[]'::jsonb; v_r jsonb; v_ini timestamptz := clock_timestamp(); v_desde timestamptz;
begin
  select t.pasos into v_pasos from fn_espejo_gw_tablas() t where t.tabla = p_tabla;
  if v_pasos is null then raise exception 'El espejo no admite la tabla %.', p_tabla; end if;
  -- Dos minutos de margen hacia atrás: repetir filas no hace daño (todo es upsert); saltarse una, sí.
  select cargado_hasta - interval '2 minutes' into v_desde from espejo_gw_tabla where tabla = p_tabla;
  perform set_config('espejo.desde', coalesce(v_desde::text, ''), true);
  foreach p in array v_pasos loop
    execute format('select to_jsonb(public.%I())', 'fn_carga_gw_' || p) into v_r;
    v := v || jsonb_build_array(jsonb_build_object('paso', p, 'resultado', v_r));
  end loop;
  perform set_config('espejo.desde', '', true);
  insert into espejo_gw_tabla (tabla, cargado_hasta) values (p_tabla, v_ini)
  on conflict (tabla) do update set cargado_hasta = excluded.cargado_hasta;
  insert into espejo_gw_pasada (tabla, procesado, equipo) values (p_tabla, v, left(p_equipo, 60));
  return jsonb_build_object('ok', true, 'segundos', round(extract(epoch from clock_timestamp() - v_ini)::numeric, 1));
exception when others then
  perform set_config('espejo.desde', '', true);
  insert into espejo_gw_pasada (tabla, error, equipo) values (p_tabla, left(sqlerrm, 500), left(p_equipo, 60));
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end $$;
revoke all on function public.fn_espejo_gw_procesar(text, text) from public, anon, authenticated;
grant execute on function public.fn_espejo_gw_procesar(text, text) to service_role;

do $$
declare v text; par text[]; n int; cambios text[][] := array[
  array['fn_carga_gw_articulo', 'from carga_dbf where tabla = ''ARTICULO''),', 'from carga_dbf where tabla = ''ARTICULO'' and public.gw_reciente(cargado_en)),'],
  array['fn_carga_gw_articulo_precio_nivel', 'where c.tabla = ''ARTICULO''', 'where c.tabla = ''ARTICULO'' and public.gw_reciente(c.cargado_en)'],
  array['fn_carga_gw_marca', 'where a.tabla = ''ARTICULO'' and gw_t(datos,''MARCA'') is not null', 'where a.tabla = ''ARTICULO'' and public.gw_reciente(a.cargado_en) and gw_t(datos,''MARCA'') is not null'],
  array['fn_carga_gw_articulo_codigo_barras', 'from carga_dbf where tabla = ''ARTBARRA''),', 'from carga_dbf where tabla = ''ARTBARRA'' and public.gw_reciente(cargado_en)),'],
  array['fn_carga_gw_cliente', 'from carga_dbf where tabla = ''CLIENTES''),', 'from carga_dbf where tabla = ''CLIENTES'' and public.gw_reciente(cargado_en)),'],
  array['fn_carga_gw_articulo_almacen_stock', 'from carga_dbf where tabla = ''ARTICALM''),', 'from carga_dbf where tabla = ''ARTICALM'' and public.gw_reciente(cargado_en)),'],
  -- Referencias de proveedor: salen de dos tablas (ARTDPROV y ARTPROV). Se cargan enteros los artículos
  -- que hayan cambiado en cualquiera de las dos, para no dejar a medias sus referencias.
  array['fn_carga_gw_articulo_proveedor', 'with dp as (', 'with kk as materialized (select distinct datos->>''COD_INTERN'' art from carga_dbf where tabla in (''ARTDPROV'', ''ARTPROV'') and public.gw_reciente(cargado_en)), dp as ('],
  array['fn_carga_gw_articulo_proveedor', 'from carga_dbf where tabla = ''ARTDPROV''),', 'from carga_dbf where tabla = ''ARTDPROV'' and datos->>''COD_INTERN'' in (select art from kk)),'],
  array['fn_carga_gw_articulo_proveedor', 'from carga_dbf where tabla = ''ARTPROV'' group by 1, 2),', 'from carga_dbf where tabla = ''ARTPROV'' and datos->>''COD_INTERN'' in (select art from kk) group by 1, 2),']];
begin
  foreach par slice 1 in array cambios loop
    v := pg_get_functiondef(('public.' || par[1] || '()')::regprocedure);
    if position(par[3] in v) > 0 then continue; end if;
    if position(par[2] in v) = 0 then raise exception 'no encuentro «%» en %', par[2], par[1]; end if;
    execute replace(v, par[2], par[3]);
  end loop;
end $$;

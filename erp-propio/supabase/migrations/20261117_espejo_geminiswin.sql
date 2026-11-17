-- Espejo de GeminisWin, tanda 1 (maestros) — docs/PLAN_ESPEJO_GEMINISWIN.md (Rober, 17/11/2026).
-- Un programa en un PC de la oficina (scripts/geminiswin/espejo_geminiswin.py) lee los DBF de GeminisWin,
-- solo lectura, y manda cada pocos minutos lo que ha cambiado. Aquí está lo que lo recibe:
--  · fn_espejo_gw_recibir: guarda las filas en carga_dbf (el volcado en bruto que ya existía) si han cambiado.
--  · fn_espejo_gw_procesar: pasa una tabla de carga_dbf a su tabla del ERP con las fn_carga_gw_* de siempre
--    (docs/CARGA_GEMINISWIN.md), que son repetibles.
--  · espejo_gw_pasada: el registro de cada pasada, para la pantalla de control.
-- Solo las llama la función del servidor «espejo-gw-ingesta», con la misma clave del puente de reparto
-- (fn_reparto_gw_clave_ok). Nadie más tiene permiso.

create table if not exists public.espejo_gw_pasada (
  id bigint generated always as identity primary key,
  en timestamptz not null default now(),
  tabla text not null,
  recibidas integer not null default 0,
  cambiadas integer not null default 0,
  procesado jsonb,
  error text,
  equipo text
);
create index if not exists espejo_gw_pasada_en_idx on public.espejo_gw_pasada (en desc);
alter table public.espejo_gw_pasada enable row level security;
create policy espejo_gw_pasada_lee on public.espejo_gw_pasada for select to authenticated using (public.fn_es_administrador());
revoke all on public.espejo_gw_pasada from public, anon, authenticated;
grant select on public.espejo_gw_pasada to authenticated;

-- Las tablas de GeminisWin que admite el espejo y el paso de carga de cada una, en orden de dependencias.
create or replace function public.fn_espejo_gw_tablas()
returns table (orden integer, tabla text, pasos text[])
language sql immutable as $$
  values (1, 'PAISES', array['pais']), (2, 'PROVINCIAS', array['provincia']), (3, 'FOMA', array['forma_pago']),
         (4, 'ALMACEN', array['almacen']), (5, 'OFICINA', array['tienda_terminal']), (6, 'ZONATERR', array['zona_territorial']),
         (7, 'RUTAS', array['ruta_reparto']), (8, 'RUTAZONA', array['ruta_reparto_zona']), (9, 'REPARTIDOR', array['repartidor']),
         (10, 'RUTAREPA', array['ruta_reparto_repartidor']), (11, 'VENDEDOR', array['vendedor']), (12, 'TRANSPOR', array['transportista']),
         (13, 'PLANTTAR', array['plantilla_tarifa']), (14, 'FAMILIAS', array['familia']), (15, 'MARCAS', array['marca']),
         (16, 'PROVEEDO', array['proveedor']), (17, 'TIPOCLIE', array['tipo_cliente']), (18, 'CLIENTES', array['cliente']),
         (19, 'ARTICULO', array['marca', 'articulo', 'articulo_precio_nivel']), (20, 'ARTBARRA', array['articulo_codigo_barras']),
         (21, 'ARTDPROV', array['articulo_proveedor']), (22, 'ARTPROV', array['articulo_proveedor']),
         (23, 'ARTICALM', array['articulo_almacen_stock']), (24, 'CLIENART', array['cliente_articulo_precio'])
$$;

-- Recibe un lote de filas de una tabla. Solo escribe las que son nuevas o han cambiado.
create or replace function public.fn_espejo_gw_recibir(p_tabla text, p_filas jsonb, p_equipo text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '120s'
as $$
declare v_rec integer; v_cam integer;
begin
  if not exists (select 1 from fn_espejo_gw_tablas() t where t.tabla = p_tabla) then
    raise exception 'El espejo no admite la tabla %.', p_tabla;
  end if;
  if jsonb_typeof(p_filas) is distinct from 'array' then raise exception 'Faltan las filas.'; end if;
  v_rec := jsonb_array_length(p_filas);
  insert into carga_dbf (tabla, clave, datos, cargado_en)
  select p_tabla, f ->> 'c', f -> 'd', now()
    from jsonb_array_elements(p_filas) f
   where f ->> 'c' is not null and jsonb_typeof(f -> 'd') = 'object'
  on conflict (tabla, clave) do update set datos = excluded.datos, cargado_en = excluded.cargado_en
   where carga_dbf.datos is distinct from excluded.datos;
  get diagnostics v_cam = row_count;
  insert into espejo_gw_pasada (tabla, recibidas, cambiadas, equipo) values (p_tabla, v_rec, v_cam, left(p_equipo, 60));
  return jsonb_build_object('ok', true, 'recibidas', v_rec, 'cambiadas', v_cam);
end $$;

-- Pasa al ERP lo recibido de una tabla (sus pasos de carga, en orden).
create or replace function public.fn_espejo_gw_procesar(p_tabla text, p_equipo text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '600s'
as $$
declare v_pasos text[]; p text; v jsonb := '[]'::jsonb; v_r jsonb;
begin
  select t.pasos into v_pasos from fn_espejo_gw_tablas() t where t.tabla = p_tabla;
  if v_pasos is null then raise exception 'El espejo no admite la tabla %.', p_tabla; end if;
  foreach p in array v_pasos loop
    execute format('select to_jsonb(public.%I())', 'fn_carga_gw_' || p) into v_r;
    v := v || jsonb_build_array(jsonb_build_object('paso', p, 'resultado', v_r));
  end loop;
  insert into espejo_gw_pasada (tabla, procesado, equipo) values (p_tabla, v, left(p_equipo, 60));
  return jsonb_build_object('ok', true, 'pasos', v);
exception when others then
  insert into espejo_gw_pasada (tabla, error, equipo) values (p_tabla, left(sqlerrm, 500), left(p_equipo, 60));
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end $$;

-- Para la pantalla de control: cuándo llegó lo último de cada tabla y cuántas filas hay.
create or replace function public.fn_espejo_gw_estado()
returns table (tabla text, filas bigint, ultima_recepcion timestamptz, ultimo_cambio timestamptz, ultimo_error text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.tabla,
         (select count(*) from carga_dbf c where c.tabla = t.tabla),
         (select max(p.en) from espejo_gw_pasada p where p.tabla = t.tabla and p.procesado is null and p.error is null),
         (select max(p.en) from espejo_gw_pasada p where p.tabla = t.tabla and p.cambiadas > 0),
         (select p.error from espejo_gw_pasada p where p.tabla = t.tabla and p.error is not null and p.en > now() - interval '1 day' order by p.en desc limit 1)
    from fn_espejo_gw_tablas() t
   where public.fn_es_administrador()
   order by t.orden
$$;

revoke all on function public.fn_espejo_gw_tablas(), public.fn_espejo_gw_recibir(text, jsonb, text), public.fn_espejo_gw_procesar(text, text), public.fn_espejo_gw_estado() from public, anon, authenticated;
grant execute on function public.fn_espejo_gw_tablas(), public.fn_espejo_gw_recibir(text, jsonb, text), public.fn_espejo_gw_procesar(text, text) to service_role;
grant execute on function public.fn_espejo_gw_estado() to authenticated;

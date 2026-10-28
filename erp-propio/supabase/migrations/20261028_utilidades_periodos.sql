-- Utilidades y periodos (28/10/2026)
--  · Archivo → Periodos o Ejercicios / Seleccionar Periodo: tabla `ejercicio`.
--  · Utilidades → Examinar: visor de solo lectura para administradores (fn_examinar).
--  · Utilidades → Copia de Seguridad: lista de tablas con su clave primaria (fn_tablas_erp),
--    para paginar de 1000 en 1000 con un orden estable.
-- Nada de esto escribe en tablas de negocio: las funciones son SECURITY INVOKER (respetan RLS)
-- y las de consulta ponen la transacción en solo lectura.

-- ---------------------------------------------------------------- ejercicio
create table if not exists public.ejercicio (
  anio integer primary key check (anio between 1900 and 2999),
  descripcion text,
  fecha_inicio date not null,
  fecha_fin date not null,
  cerrado boolean not null default false,
  activo boolean not null default false,
  creado_en timestamptz not null default now(),
  constraint ejercicio_fechas_ck check (fecha_fin >= fecha_inicio)
);

comment on table public.ejercicio is
  'Periodos o ejercicios de trabajo (Archivo → Periodos o Ejercicios). «activo» = el que se propone por defecto al entrar; cada puesto puede elegir otro con Seleccionar Periodo (se guarda en el navegador). No afecta a la contabilidad.';

-- Solo un ejercicio activo a la vez.
create unique index if not exists ejercicio_un_activo on public.ejercicio ((true)) where activo;

alter table public.ejercicio enable row level security;

create policy ejercicio_select on public.ejercicio for select to authenticated using (true);
create policy ejercicio_insert on public.ejercicio for insert to authenticated with check (public.fn_es_administrador());
create policy ejercicio_update on public.ejercicio for update to authenticated
  using (public.fn_es_administrador()) with check (public.fn_es_administrador());
-- Sin política de borrado: un ejercicio no se borra (se marca cerrado).

grant select, insert, update on public.ejercicio to authenticated;

insert into public.ejercicio (anio, descripcion, fecha_inicio, fecha_fin, cerrado, activo)
values (2025, 'Periodo 2025', '2025-01-01', '2025-12-31', false, false),
       (2026, 'Periodo 2026', '2026-01-01', '2026-12-31', false, true)
on conflict (anio) do nothing;

-- Marca un ejercicio como activo (y desmarca el anterior). Invoker: lo limita la RLS (administradores).
create or replace function public.fn_ejercicio_activar(p_anio integer)
returns void
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  if not exists (select 1 from ejercicio where anio = p_anio) then
    raise exception 'No existe el ejercicio %', p_anio;
  end if;
  update ejercicio set activo = false where activo and anio <> p_anio;
  update ejercicio set activo = true where anio = p_anio and not activo;
end;
$$;

grant execute on function public.fn_ejercicio_activar(integer) to authenticated;

-- ---------------------------------------------------------------- tablas del ERP
-- Tablas del esquema public que el usuario puede leer, con columnas, clave primaria y filas
-- estimadas (null si la tabla aún no se ha analizado). Solo las que el usuario puede leer.
create or replace function public.fn_tablas_erp()
returns table (tabla text, columnas jsonb, pk text[], filas_estimadas bigint)
language sql
stable
security invoker
set search_path to 'public', 'pg_catalog'
as $$
  select c.relname::text,
         (select coalesce(jsonb_agg(jsonb_build_object('nombre', a.attname, 'tipo', format_type(a.atttypid, a.atttypmod)) order by a.attnum), '[]'::jsonb)
            from pg_attribute a
           where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped),
         coalesce((select array_agg(a.attname::text order by k.ord)
                     from pg_index i
                     cross join lateral unnest(i.indkey) with ordinality as k(attnum, ord)
                     join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
                    where i.indrelid = c.oid and i.indisprimary), '{}'::text[]),
         case when c.reltuples < 0 then null else c.reltuples::bigint end -- -1 = nunca analizada
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p')
     and has_table_privilege(c.oid, 'select')
   order by c.relname;
$$;

grant execute on function public.fn_tablas_erp() to authenticated;

-- ---------------------------------------------------------------- Examinar
-- Una página de una tabla con filtros «contiene» por columna. Solo administradores, solo lectura,
-- con los permisos (RLS) del propio usuario.
create or replace function public.fn_examinar(
  p_tabla text,
  p_filtros jsonb default '{}'::jsonb,
  p_orden text default null,
  p_desc boolean default false,
  p_desde integer default 0,
  p_limite integer default 100
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_catalog'
as $$
declare
  v_oid oid;
  v_where text := '';
  v_orden text;
  v_k text;
  v_v text;
  v_total bigint;
  v_filas jsonb;
  v_limite integer := least(greatest(coalesce(p_limite, 100), 1), 500);
  v_desde integer := greatest(coalesce(p_desde, 0), 0);
begin
  set local transaction_read_only = on;
  set local statement_timeout = '10s';

  if not public.fn_es_administrador() then
    raise exception 'Examinar: solo para administradores';
  end if;

  select c.oid into v_oid
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname = p_tabla;
  if v_oid is null then
    raise exception 'Examinar: la tabla % no existe', p_tabla;
  end if;

  for v_k, v_v in select key, value from jsonb_each_text(coalesce(p_filtros, '{}'::jsonb)) loop
    if v_v is null or btrim(v_v) = '' then continue; end if;
    if not exists (select 1 from pg_attribute where attrelid = v_oid and attname = v_k and attnum > 0 and not attisdropped) then
      raise exception 'Examinar: la columna % no existe', v_k;
    end if;
    v_where := v_where || format(' and %I::text ilike %L', v_k, '%' || v_v || '%');
  end loop;

  if p_orden is not null and p_orden <> '' then
    if not exists (select 1 from pg_attribute where attrelid = v_oid and attname = p_orden and attnum > 0 and not attisdropped) then
      raise exception 'Examinar: la columna % no existe', p_orden;
    end if;
    v_orden := format('%I %s nulls last', p_orden, case when p_desc then 'desc' else 'asc' end);
  else
    -- Por la clave primaria, si la hay.
    select string_agg(format('%I', a.attname), ', ' order by k.ord) into v_orden
      from pg_index i
      cross join lateral unnest(i.indkey) with ordinality as k(attnum, ord)
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
     where i.indrelid = v_oid and i.indisprimary;
  end if;

  execute format('select count(*) from public.%I where true%s', p_tabla, v_where) into v_total;
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from public.%I where true%s %s offset %s limit %s) t',
    p_tabla, v_where, case when v_orden is not null then 'order by ' || v_orden else '' end, v_desde, v_limite)
    into v_filas;

  return jsonb_build_object('total', v_total, 'filas', v_filas);
end;
$$;

grant execute on function public.fn_examinar(text, jsonb, text, boolean, integer, integer) to authenticated;

-- Textos legales y detalle de la auditoría (Luis, 30/10/2026):
--  1. Auditoría: cada apunte guarda además el nombre del registro (cliente, artículo, descripción…)
--     en registro_nombre, para que la lista diga qué ficha o documento se cambió.
--  2. «Fichero de textos legales autorizados y denegados»: auditoria_conformidad guarda ahora el
--     resultado (aceptado / denegado: «Ahora no» en el aviso de entrada). Se pueden registrar varias
--     denegaciones; aceptación, una por empleado y versión.
--  3. Cada versión de un texto legal queda guardada tal cual (auditoria_documento_version), para
--     poder enseñar exactamente el texto que autorizó o denegó cada empleado.
--  4. Las conformidades ya no se apuntan en la auditoría (son su propio registro, inmutable).
--  Pantalla: Archivo → Textos legales (solo super administradores).

alter table public.auditoria add column if not exists registro_nombre text;
comment on column public.auditoria.registro_nombre is 'Nombre del registro cambiado (cliente, artículo, descripción…), para la lista.';

create or replace function public.fn_auditoria_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_pk text;
  v_campos text[];
  v_antes jsonb;
  v_despues jsonb;
  v_emp text := fn_empleado_actual();
begin
  if auth.uid() is null and current_setting('erp.sin_auditoria', true) = 'on' then
    return coalesce(new, old);
  end if;
  -- Sin conformidad con el texto legal (y si se le exige): no puede modificar.
  if auth.uid() is not null and tg_table_name <> 'auditoria_conformidad'
     and current_setting('erp.conformidad_ok', true) is distinct from coalesce(v_emp, '-') then
    if not fn_conformidad_al_dia(v_emp) then
      raise exception 'No puedes modificar datos hasta que des tu conformidad al aviso legal de la auditoría. Sal del programa y vuelve a entrar para leerlo.'
        using errcode = '42501';
    end if;
    perform set_config('erp.conformidad_ok', coalesce(v_emp, '-'), true);
  end if;

  v_old := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old := (select coalesce(jsonb_object_agg(k, case when k like '%\_base64' and v <> 'null' then to_jsonb(length(v #>> '{}') || ' caracteres') else v end), v_old)
              from jsonb_each(v_old) as x(k, v));
  v_new := (select coalesce(jsonb_object_agg(k, case when k like '%\_base64' and v <> 'null' then to_jsonb(length(v #>> '{}') || ' caracteres') else v end), v_new)
              from jsonb_each(v_new) as x(k, v));
  v_row := coalesce(v_new, v_old);

  if tg_op = 'UPDATE' then
    select array_agg(e.key order by e.key), jsonb_object_agg(e.key, v_old -> e.key), jsonb_object_agg(e.key, e.value)
      into v_campos, v_antes, v_despues
      from jsonb_each(v_new) e
     where e.key not in ('actualizado_en', 'creado_en', 'fecha_hora_actualizacion')
       and (v_old -> e.key) is distinct from e.value;
    if v_campos is null then
      return new;
    end if;
  else
    v_antes := v_old;
    v_despues := v_new;
  end if;

  select string_agg(coalesce(v_row ->> a.attname, ''), '-' order by array_position(i.indkey::int2[], a.attnum))
    into v_pk
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
   where i.indrelid = tg_relid and i.indisprimary;

  insert into auditoria (tabla, operacion, registro_pk, empleado_codigo, datos_antes, datos_despues, ocurrido_en,
                         tienda_terminal_codigo, campos, usuario_id, registro_nombre)
  values (tg_table_name, tg_op, coalesce(v_pk, ''), v_emp, v_antes, v_despues, now(),
          v_row ->> 'tienda_terminal_codigo', v_campos, auth.uid(),
          left(coalesce(v_row ->> 'nombre_cliente', v_row ->> 'nombre', v_row ->> 'descripcion', v_row ->> 'titulo', v_row ->> 'concepto'), 80));
  return coalesce(new, old);
end;
$$;

-- Versiones de los textos legales, tal cual se enseñaron.
create table if not exists public.auditoria_documento_version (
  documento_id bigint not null references public.auditoria_documento (id),
  version text not null,
  titulo text not null,
  contenido text,
  creado_en timestamptz not null default now(),
  primary key (documento_id, version)
);
comment on table public.auditoria_documento_version is 'Cada versión (md5 de título y texto) de los documentos legales, guardada tal cual. Inmutable.';
alter table public.auditoria_documento_version enable row level security;
drop policy if exists auditoria_documento_version_lee on public.auditoria_documento_version;
create policy auditoria_documento_version_lee on public.auditoria_documento_version for select to authenticated
  using (public.fn_es_super_administrador());

create or replace function public.fn_documento_guardar_version()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into auditoria_documento_version (documento_id, version, titulo, contenido)
  values (new.id, fn_documento_version(new.titulo, new.contenido), new.titulo, new.contenido)
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists trg_documento_guardar_version on public.auditoria_documento;
create trigger trg_documento_guardar_version after insert or update of titulo, contenido on public.auditoria_documento
  for each row execute function public.fn_documento_guardar_version();
insert into public.auditoria_documento_version (documento_id, version, titulo, contenido)
select id, public.fn_documento_version(titulo, contenido), titulo, contenido from public.auditoria_documento
on conflict do nothing;

create or replace function public.fn_documento_version_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Las versiones de los textos legales no se pueden modificar ni borrar.';
end;
$$;
drop trigger if exists trg_documento_version_inmutable on public.auditoria_documento_version;
create trigger trg_documento_version_inmutable before update or delete on public.auditoria_documento_version
  for each row execute function public.fn_documento_version_inmutable();

-- Conformidades: aceptadas y denegadas.
alter table public.auditoria_conformidad add column if not exists resultado text not null default 'aceptado';
alter table public.auditoria_conformidad drop constraint if exists auditoria_conformidad_resultado_check;
alter table public.auditoria_conformidad add constraint auditoria_conformidad_resultado_check check (resultado in ('aceptado', 'denegado'));
alter table public.auditoria_conformidad drop constraint if exists auditoria_conformidad_documento_id_version_empleado_codigo_key;
create unique index if not exists auditoria_conformidad_una_aceptada
  on public.auditoria_conformidad (documento_id, version, empleado_codigo) where resultado = 'aceptado';
drop trigger if exists trg_auditoria_auditoria_conformidad on public.auditoria_conformidad;

create or replace function public.fn_conformidad_al_dia(p_empleado text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_empleado is null
      or not coalesce((select e.conformidad_obligatoria from empleado e where e.codigo = p_empleado), false)
      or not exists (select 1 from auditoria_documento d
                      where d.activo and d.requiere_conformidad
                        and not exists (select 1 from auditoria_conformidad c
                                         where c.documento_id = d.id and c.empleado_codigo = p_empleado and c.resultado = 'aceptado'
                                           and c.version = fn_documento_version(d.titulo, d.contenido)))
$$;

create or replace function public.fn_conformidad_pendiente()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'titulo', d.titulo, 'contenido', d.contenido,
                                               'version', fn_documento_version(d.titulo, d.contenido),
                                               'bloquea', coalesce((select e.conformidad_obligatoria from empleado e where e.codigo = fn_empleado_actual()), true))
                            order by d.id), '[]')
    from auditoria_documento d
   where d.activo and d.requiere_conformidad and fn_empleado_actual() is not null
     and not exists (select 1 from auditoria_conformidad c
                      where c.documento_id = d.id and c.empleado_codigo = fn_empleado_actual() and c.resultado = 'aceptado'
                        and c.version = fn_documento_version(d.titulo, d.contenido))
$$;

create or replace function public.fn_dar_conformidad(p_documento bigint, p_version text)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_emp text := fn_empleado_actual();
  v_fecha timestamptz;
begin
  if v_emp is null then
    raise exception 'No hay un empleado conectado.';
  end if;
  if not exists (select 1 from auditoria_documento d
                  where d.id = p_documento and d.activo and d.requiere_conformidad
                    and fn_documento_version(d.titulo, d.contenido) = p_version) then
    raise exception 'El documento ha cambiado: vuelve a leerlo.';
  end if;
  insert into auditoria_conformidad (documento_id, version, empleado_codigo, usuario_id, resultado)
  values (p_documento, p_version, v_emp, auth.uid(), 'aceptado')
  on conflict (documento_id, version, empleado_codigo) where resultado = 'aceptado' do nothing;
  select aceptado_en into v_fecha from auditoria_conformidad
   where documento_id = p_documento and version = p_version and empleado_codigo = v_emp and resultado = 'aceptado';
  return v_fecha;
end;
$$;

-- «Ahora no» en el aviso de entrada: queda como denegada (con día y hora).
create or replace function public.fn_denegar_conformidad(p_documento bigint, p_version text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_emp text := fn_empleado_actual();
begin
  if v_emp is null then
    raise exception 'No hay un empleado conectado.';
  end if;
  if exists (select 1 from auditoria_documento d where d.id = p_documento and fn_documento_version(d.titulo, d.contenido) = p_version) then
    insert into auditoria_conformidad (documento_id, version, empleado_codigo, usuario_id, resultado)
    values (p_documento, p_version, v_emp, auth.uid(), 'denegado');
  end if;
end;
$$;
grant execute on function public.fn_denegar_conformidad(bigint, text) to authenticated;
revoke execute on function public.fn_denegar_conformidad(bigint, text) from anon, public;

create or replace function public.fn_auditoria_conformidades()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v jsonb;
begin
  if not fn_es_super_administrador() then
    raise exception 'Solo los super administradores pueden ver las conformidades.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'documentos', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'titulo', d.titulo) order by d.id)
                              from auditoria_documento d where d.activo and d.requiere_conformidad), '[]'),
    'empleados', coalesce((
      select jsonb_agg(jsonb_build_object(
               'codigo', e.codigo, 'nombre', e.nombre, 'numero', e.numero_operario, 'activo', e.activo,
               'usuario', e.auth_user_id is not null, 'super', e.super_administrador, 'obligatoria', e.conformidad_obligatoria,
               'cambios', (select count(*) from auditoria a where a.empleado_codigo = e.codigo and a.operacion in ('INSERT', 'UPDATE', 'DELETE')),
               'ultimo_cambio', (select max(a.ocurrido_en) from auditoria a where a.empleado_codigo = e.codigo and a.operacion in ('INSERT', 'UPDATE', 'DELETE')),
               'conformidades', coalesce((
                  select jsonb_agg(jsonb_build_object(
                           'documento', d.id,
                           'aceptado_en', (select c.aceptado_en from auditoria_conformidad c
                                            where c.documento_id = d.id and c.empleado_codigo = e.codigo and c.resultado = 'aceptado'
                                              and c.version = fn_documento_version(d.titulo, d.contenido)),
                           'version_anterior', (select max(c.aceptado_en) from auditoria_conformidad c
                                                 where c.documento_id = d.id and c.empleado_codigo = e.codigo and c.resultado = 'aceptado'
                                                   and c.version <> fn_documento_version(d.titulo, d.contenido)),
                           'denegaciones', (select count(*) from auditoria_conformidad c
                                             where c.documento_id = d.id and c.empleado_codigo = e.codigo and c.resultado = 'denegado'
                                               and c.version = fn_documento_version(d.titulo, d.contenido)))
                         order by d.id)
                    from auditoria_documento d where d.activo and d.requiere_conformidad), '[]'))
             order by (e.auth_user_id is null), e.nombre)
        from empleado e where e.activo), '[]'))
    into v;
  return v;
end;
$$;

-- Fichero de textos legales autorizados y denegados.
create or replace function public.fn_textos_legales_registro(p_desde date, p_hasta date, p_empleado text default null, p_resultado text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not fn_es_super_administrador() then
    raise exception 'Solo los super administradores pueden ver los textos legales.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'fecha', c.aceptado_en, 'resultado', c.resultado, 'empleado', c.empleado_codigo,
             'empleado_nombre', e.nombre, 'empleado_numero', e.numero_operario,
             'documento', c.documento_id, 'version', c.version, 'titulo', coalesce(v.titulo, d.titulo),
             'vigente', c.version = fn_documento_version(d.titulo, d.contenido))
           order by c.aceptado_en desc, c.id desc)
      from auditoria_conformidad c
      join auditoria_documento d on d.id = c.documento_id
      left join auditoria_documento_version v on v.documento_id = c.documento_id and v.version = c.version
      left join empleado e on e.codigo = c.empleado_codigo
     where c.aceptado_en >= (p_desde::timestamp at time zone 'Atlantic/Canary')
       and c.aceptado_en < ((p_hasta + 1)::timestamp at time zone 'Atlantic/Canary')
       and (p_empleado is null or c.empleado_codigo = p_empleado)
       and (p_resultado is null or c.resultado = p_resultado)), '[]');
end;
$$;
grant execute on function public.fn_textos_legales_registro(date, date, text, text) to authenticated;
revoke execute on function public.fn_textos_legales_registro(date, date, text, text) from anon, public;

-- La consulta de la auditoría devuelve también el nombre del registro.
create or replace function public.fn_auditoria_consultar(
  p_desde date,
  p_hasta date,
  p_empleado text default null,
  p_tabla text default null,
  p_operacion text default null,
  p_texto text default null,
  p_limite integer default 200,
  p_desplazamiento integer default 0)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v jsonb;
  v_desde timestamptz := (p_desde::timestamp at time zone 'Atlantic/Canary');
  v_hasta timestamptz := ((p_hasta + 1)::timestamp at time zone 'Atlantic/Canary');
  v_texto text := nullif(btrim(coalesce(p_texto, '')), '');
begin
  if not fn_es_super_administrador() then
    raise exception 'Solo los super administradores pueden consultar la auditoría.' using errcode = '42501';
  end if;
  if coalesce(p_desplazamiento, 0) = 0 then
    perform fn_auditoria_depurar();
    insert into auditoria (tabla, operacion, registro_pk, empleado_codigo, datos_despues, ocurrido_en, usuario_id)
    values ('auditoria', 'CONSULTA', '', fn_empleado_actual(),
            jsonb_strip_nulls(jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'empleado', p_empleado, 'tabla', p_tabla,
                                                 'operacion', p_operacion, 'texto', v_texto)),
            now(), auth.uid());
  end if;

  with f as (
    select a.*
      from auditoria a
     where a.ocurrido_en >= v_desde and a.ocurrido_en < v_hasta
       and (p_empleado is null or a.empleado_codigo = p_empleado)
       and (p_tabla is null or a.tabla = p_tabla)
       and (p_operacion is null or a.operacion = p_operacion)
       and (v_texto is null or a.registro_pk ilike '%' || v_texto || '%' or a.registro_nombre ilike '%' || v_texto || '%'
            or a.datos_despues::text ilike '%' || v_texto || '%' or a.datos_antes::text ilike '%' || v_texto || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'filas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'ocurrido_en', x.ocurrido_en, 'tabla', x.tabla, 'operacion', x.operacion, 'registro', x.registro_pk, 'nombre', x.registro_nombre,
               'tienda', x.tienda_terminal_codigo, 'empleado', x.empleado_codigo, 'empleado_nombre', e.nombre,
               'empleado_numero', e.numero_operario, 'campos', x.campos, 'antes', x.datos_antes, 'despues', x.datos_despues)
             order by x.ocurrido_en desc, x.id desc)
        from (select * from f order by ocurrido_en desc, id desc limit greatest(1, least(coalesce(p_limite, 200), 1000))
              offset greatest(0, coalesce(p_desplazamiento, 0))) x
        left join empleado e on e.codigo = x.empleado_codigo), '[]'))
    into v;
  return v;
end;
$$;
grant execute on function public.fn_auditoria_consultar(date, date, text, text, text, text, integer, integer) to authenticated;
revoke execute on function public.fn_auditoria_consultar(date, date, text, text, text, text, integer, integer) from anon, public;

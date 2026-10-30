-- Sin conformidad, sin cambios (Luis, 30/10/2026): mientras un empleado no haya dado su
-- conformidad al texto legal vigente de la auditoría, la base de datos no le deja modificar nada
-- (solo consultar). Los super administradores pueden, empleado a empleado, dejarle trabajar igual
-- (empleado.conformidad_obligatoria = false) desde Auditoría → Conformidades.
-- Se comprueba en fn_auditoria_trigger, que está en todas las tablas modificables; una vez
-- comprobado en la transacción, no se repite (erp.conformidad_ok).
-- De paso: «erp.sin_auditoria» solo vale para procesos del servidor (sin usuario conectado);
-- antes se miraba current_user, que dentro de una función security definer es siempre el dueño.

alter table public.empleado add column if not exists conformidad_obligatoria boolean not null default true;
comment on column public.empleado.conformidad_obligatoria is 'Si es true y no ha dado su conformidad al texto legal de la auditoría, no puede modificar datos. Lo cambian los super administradores.';

-- ¿El empleado conectado puede modificar datos? (conformidad dada o no obligatoria)
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
                                         where c.documento_id = d.id and c.empleado_codigo = p_empleado
                                           and c.version = fn_documento_version(d.titulo, d.contenido)))
$$;

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
                         tienda_terminal_codigo, campos, usuario_id)
  values (tg_table_name, tg_op, coalesce(v_pk, ''), v_emp, v_antes, v_despues, now(),
          v_row ->> 'tienda_terminal_codigo', v_campos, auth.uid());
  return coalesce(new, old);
end;
$$;

-- Lo pendiente del empleado conectado, y si mientras tanto queda bloqueado.
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
                      where c.documento_id = d.id and c.empleado_codigo = fn_empleado_actual()
                        and c.version = fn_documento_version(d.titulo, d.contenido))
$$;

-- Super administradores: exigir o no la conformidad a un empleado para dejarle modificar.
create or replace function public.fn_conformidad_obligatoria(p_empleado text, p_obligatoria boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not fn_es_super_administrador() then
    raise exception 'Solo los super administradores pueden cambiar esto.' using errcode = '42501';
  end if;
  update empleado set conformidad_obligatoria = p_obligatoria where codigo = p_empleado;
end;
$$;
grant execute on function public.fn_conformidad_obligatoria(text, boolean) to authenticated;
revoke execute on function public.fn_conformidad_obligatoria(text, boolean) from anon, public;

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
                                            where c.documento_id = d.id and c.empleado_codigo = e.codigo
                                              and c.version = fn_documento_version(d.titulo, d.contenido)),
                           'version_anterior', (select max(c.aceptado_en) from auditoria_conformidad c
                                                 where c.documento_id = d.id and c.empleado_codigo = e.codigo
                                                   and c.version <> fn_documento_version(d.titulo, d.contenido)))
                         order by d.id)
                    from auditoria_documento d where d.activo and d.requiere_conformidad), '[]'))
             order by (e.auth_user_id is null), e.nombre)
        from empleado e where e.activo), '[]'))
    into v;
  return v;
end;
$$;

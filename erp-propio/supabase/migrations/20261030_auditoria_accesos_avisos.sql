-- Auditoría, segunda vuelta (Luis, 30/10/2026), con el diseño del boceto:
--  1. Entradas y salidas del programa, contraseñas fallidas e intentos fuera de horario: se apuntan
--     en la propia auditoría (tabla 'acceso', operaciones ENTRADA / SALIDA / FALLO_CLAVE /
--     FUERA_HORARIO) con fn_registrar_acceso. Las contraseñas fallidas se apuntan sin sesión (anon),
--     como mucho 20 por conexión cada 10 minutos.
--  2. Cada apunte (y cada aceptación o denegación del texto legal) guarda la conexión (IP) y el
--     equipo (navegador) desde los que se hizo, sacados de la propia petición.
--  3. Lo que no hace una persona (procesos del servidor, web, cargas) sale como «Sistema»
--     (columna origen; un proceso puede precisarlo con set local erp.origen = 'Web').
--  4. Avisos para los super administradores (fn_auditoria_avisos): borrados, precios por debajo del
--     coste, cambios de permisos / grupos / super administradores / periodos, contraseñas fallidas e
--     intentos fuera de horario. «Visto» por cada super administrador (auditoria_aviso_visto).
--  5. Historial de una ficha (fn_auditoria_historial), para el botón «Historial» de cada ventana.
--  6. fn_auditoria_consultar con filtro «¿Modificó?» y el grupo de acceso de cada empleado.

alter table public.auditoria
  add column if not exists ip text,
  add column if not exists dispositivo text,
  add column if not exists origen text;
comment on column public.auditoria.ip is 'Conexión (IP) desde la que se hizo.';
comment on column public.auditoria.dispositivo is 'Equipo / navegador (user-agent) desde el que se hizo.';
comment on column public.auditoria.origen is 'Si no lo hizo una persona con sesión: Sistema, Web…';

alter table public.auditoria drop constraint if exists auditoria_operacion_check;
alter table public.auditoria add constraint auditoria_operacion_check
  check (operacion = any (array['INSERT', 'UPDATE', 'DELETE', 'CONSULTA', 'DEPURACION', 'ENTRADA', 'SALIDA', 'FALLO_CLAVE', 'FUERA_HORARIO']));

alter table public.auditoria_conformidad
  add column if not exists ip text,
  add column if not exists dispositivo text;

-- Datos de la petición en curso (PostgREST deja las cabeceras en request.headers).
create or replace function public.fn_peticion_cabecera(p_nombre text)
returns text
language sql
stable
as $$ select nullif(current_setting('request.headers', true), '')::json ->> p_nombre $$;

create or replace function public.fn_peticion_ip()
returns text
language sql
stable
as $$
  select left(coalesce(fn_peticion_cabecera('cf-connecting-ip'), fn_peticion_cabecera('x-real-ip'),
                       btrim(split_part(fn_peticion_cabecera('x-forwarded-for'), ',', 1))), 60)
$$;

create or replace function public.fn_peticion_dispositivo()
returns text
language sql
stable
as $$ select left(fn_peticion_cabecera('user-agent'), 300) $$;

create or replace function public.fn_peticion_origen()
returns text
language sql
stable
as $$ select case when auth.uid() is null then coalesce(nullif(current_setting('erp.origen', true), ''), 'Sistema') end $$;

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
                         tienda_terminal_codigo, campos, usuario_id, registro_nombre, ip, dispositivo, origen)
  values (tg_table_name, tg_op, coalesce(v_pk, ''), v_emp, v_antes, v_despues, now(),
          v_row ->> 'tienda_terminal_codigo', v_campos, auth.uid(),
          left(coalesce(v_row ->> 'nombre_cliente', v_row ->> 'nombre', v_row ->> 'descripcion', v_row ->> 'titulo', v_row ->> 'concepto'), 80),
          fn_peticion_ip(), fn_peticion_dispositivo(), fn_peticion_origen());
  return coalesce(new, old);
end;
$$;


-- Entradas, salidas, contraseñas fallidas e intentos fuera de horario.
create or replace function public.fn_registrar_acceso(p_tipo text, p_tienda text default null, p_usuario text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_tipo text := upper(btrim(coalesce(p_tipo, '')));
  v_emp text := fn_empleado_actual();
  v_usuario text := left(lower(btrim(coalesce(p_usuario, ''))), 100);
  v_ip text := fn_peticion_ip();
begin
  if v_tipo not in ('ENTRADA', 'SALIDA', 'FALLO_CLAVE', 'FUERA_HORARIO') then
    raise exception 'Tipo de acceso no válido.';
  end if;
  if v_tipo <> 'FALLO_CLAVE' and auth.uid() is null then
    raise exception 'No hay sesión.';
  end if;
  if v_tipo = 'FALLO_CLAVE' then
    if (select count(*) from auditoria where operacion = 'FALLO_CLAVE' and ip is not distinct from v_ip
          and ocurrido_en > now() - interval '10 minutes') >= 20 then
      return;
    end if;
    select e.codigo into v_emp
      from empleado e join auth.users u on u.id = e.auth_user_id
     where lower(u.email) = v_usuario or lower(split_part(u.email, '@', 1)) = split_part(v_usuario, '@', 1)
     limit 1;
  end if;
  insert into auditoria (tabla, operacion, registro_pk, empleado_codigo, datos_despues, ocurrido_en, tienda_terminal_codigo,
                         usuario_id, ip, dispositivo, registro_nombre)
  values ('acceso', v_tipo, coalesce(nullif(v_usuario, ''), ''), v_emp,
          jsonb_strip_nulls(jsonb_build_object('usuario', nullif(v_usuario, ''))), now(), nullif(btrim(coalesce(p_tienda, '')), ''),
          auth.uid(), v_ip, fn_peticion_dispositivo(),
          case v_tipo when 'ENTRADA' then 'Entrada al programa' when 'SALIDA' then 'Salida del programa'
                      when 'FALLO_CLAVE' then 'Contraseña incorrecta' else 'Intento fuera de horario' end);
end;
$$;
grant execute on function public.fn_registrar_acceso(text, text, text) to anon, authenticated;
revoke execute on function public.fn_registrar_acceso(text, text, text) from public;

-- Conformidad: con conexión y equipo.
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
  insert into auditoria_conformidad (documento_id, version, empleado_codigo, usuario_id, resultado, ip, dispositivo)
  values (p_documento, p_version, v_emp, auth.uid(), 'aceptado', fn_peticion_ip(), fn_peticion_dispositivo())
  on conflict (documento_id, version, empleado_codigo) where resultado = 'aceptado' do nothing;
  select aceptado_en into v_fecha from auditoria_conformidad
   where documento_id = p_documento and version = p_version and empleado_codigo = v_emp and resultado = 'aceptado';
  return v_fecha;
end;
$$;

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
    insert into auditoria_conformidad (documento_id, version, empleado_codigo, usuario_id, resultado, ip, dispositivo)
    values (p_documento, p_version, v_emp, auth.uid(), 'denegado', fn_peticion_ip(), fn_peticion_dispositivo());
  end if;
end;
$$;

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
             'grupo', case when e.super_administrador then 'Super admin' else r.nombre end,
             'documento', c.documento_id, 'version', c.version, 'titulo', coalesce(v.titulo, d.titulo),
             'vigente', c.version = fn_documento_version(d.titulo, d.contenido), 'ip', c.ip, 'dispositivo', c.dispositivo)
           order by c.aceptado_en desc, c.id desc)
      from auditoria_conformidad c
      join auditoria_documento d on d.id = c.documento_id
      left join auditoria_documento_version v on v.documento_id = c.documento_id and v.version = c.version
      left join empleado e on e.codigo = c.empleado_codigo
      left join rol r on r.id = e.rol_id
     where c.aceptado_en >= (p_desde::timestamp at time zone 'Atlantic/Canary')
       and c.aceptado_en < ((p_hasta + 1)::timestamp at time zone 'Atlantic/Canary')
       and (p_empleado is null or c.empleado_codigo = p_empleado)
       and (p_resultado is null or c.resultado = p_resultado)), '[]');
end;
$$;

-- Una fila de la auditoría para la pantalla (con el grupo de acceso del empleado).
create or replace function public.fn_auditoria_fila(a public.auditoria, p_motivo text default null)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', a.id, 'ocurrido_en', a.ocurrido_en, 'tabla', a.tabla, 'operacion', a.operacion, 'registro', a.registro_pk,
    'nombre', a.registro_nombre, 'tienda', a.tienda_terminal_codigo, 'empleado', a.empleado_codigo,
    'empleado_nombre', e.nombre, 'empleado_numero', e.numero_operario,
    'grupo', case when e.super_administrador then 'Super admin' else r.nombre end,
    'campos', a.campos, 'antes', a.datos_antes, 'despues', a.datos_despues,
    'ip', a.ip, 'dispositivo', a.dispositivo, 'origen', a.origen, 'motivo', p_motivo))
    from (select 1) x
    left join empleado e on e.codigo = a.empleado_codigo
    left join rol r on r.id = e.rol_id
$$;

drop function if exists public.fn_auditoria_consultar(date, date, text, text, text, text, integer, integer);
create or replace function public.fn_auditoria_consultar(
  p_desde date,
  p_hasta date,
  p_empleado text default null,
  p_tabla text default null,
  p_operacion text default null,
  p_texto text default null,
  p_limite integer default 200,
  p_desplazamiento integer default 0,
  p_modifico boolean default null)
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
    insert into auditoria (tabla, operacion, registro_pk, empleado_codigo, datos_despues, ocurrido_en, usuario_id, ip, dispositivo)
    values ('auditoria', 'CONSULTA', '', fn_empleado_actual(),
            jsonb_strip_nulls(jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'empleado', p_empleado, 'tabla', p_tabla,
                                                 'operacion', p_operacion, 'texto', v_texto, 'modifico', p_modifico)),
            now(), auth.uid(), fn_peticion_ip(), fn_peticion_dispositivo());
  end if;

  with f as (
    select a.*
      from auditoria a
     where a.ocurrido_en >= v_desde and a.ocurrido_en < v_hasta
       and (p_empleado is null or a.empleado_codigo = p_empleado)
       and (p_tabla is null or a.tabla = p_tabla)
       and (p_operacion is null or a.operacion = p_operacion)
       and (p_modifico is null or (a.operacion in ('INSERT', 'UPDATE', 'DELETE')) = p_modifico)
       and (v_texto is null or a.registro_pk ilike '%' || v_texto || '%' or a.registro_nombre ilike '%' || v_texto || '%'
            or a.datos_despues::text ilike '%' || v_texto || '%' or a.datos_antes::text ilike '%' || v_texto || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'filas', coalesce((
      select jsonb_agg(fn_auditoria_fila(x) order by x.ocurrido_en desc, x.id desc)
        from (select * from f order by ocurrido_en desc, id desc limit greatest(1, least(coalesce(p_limite, 200), 1000))
              offset greatest(0, coalesce(p_desplazamiento, 0))) x), '[]'))
    into v;
  return v;
end;
$$;
grant execute on function public.fn_auditoria_consultar(date, date, text, text, text, text, integer, integer, boolean) to authenticated;
revoke execute on function public.fn_auditoria_consultar(date, date, text, text, text, text, integer, integer, boolean) from anon, public;

-- Historial de una ficha: sus apuntes y los de sus líneas (tabla_linea con clave que empieza igual).
create or replace function public.fn_auditoria_historial(p_tabla text, p_pk text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not fn_es_super_administrador() then
    raise exception 'Solo los super administradores pueden ver el historial.' using errcode = '42501';
  end if;
  insert into auditoria (tabla, operacion, registro_pk, empleado_codigo, datos_despues, ocurrido_en, usuario_id, ip, dispositivo)
  values ('auditoria', 'CONSULTA', '', fn_empleado_actual(), jsonb_build_object('historial', p_tabla, 'registro', p_pk),
          now(), auth.uid(), fn_peticion_ip(), fn_peticion_dispositivo());
  return coalesce((
    select jsonb_agg(fn_auditoria_fila(a) order by a.ocurrido_en desc, a.id desc)
      from auditoria a
     where (a.tabla = p_tabla and a.registro_pk = p_pk)
        or (a.tabla = p_tabla || '_linea' and a.registro_pk like p_pk || '-%')), '[]');
end;
$$;
grant execute on function public.fn_auditoria_historial(text, text) to authenticated;
revoke execute on function public.fn_auditoria_historial(text, text) from anon, public;

-- Avisos para los super administradores.
create table if not exists public.auditoria_aviso_visto (
  empleado_codigo text primary key references public.empleado (codigo),
  visto_hasta timestamptz not null default now()
);
alter table public.auditoria_aviso_visto enable row level security;
-- Sin políticas: solo se usa desde las funciones de abajo (y sin auditoría: es solo «hasta dónde he visto»).

create or replace function public.fn_auditoria_avisos(p_dias integer default 30)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_visto timestamptz;
begin
  if not fn_es_super_administrador() then
    return jsonb_build_object('pendientes', 0, 'lista', '[]'::jsonb);
  end if;
  select visto_hasta into v_visto from auditoria_aviso_visto where empleado_codigo = fn_empleado_actual();
  return (
    with av as (
      select a, m.motivo
        from auditoria a
        cross join lateral (
          select case
            when a.operacion = 'DELETE' and a.tabla not like '%\_linea' and a.tabla not in ('articulo_favorito', 'listado_guardado', 'auditoria_aviso_visto')
              then 'Borrado'
            when a.operacion = 'FALLO_CLAVE' then 'Contraseña incorrecta'
            when a.operacion = 'FUERA_HORARIO' then 'Intento fuera de horario'
            when a.tabla in ('rol', 'rol_permiso', 'permiso', 'empleado_acceso', 'empleado_permiso', 'ejercicio') then 'Cambio de permisos / periodos'
            when a.tabla = 'empleado' and (a.operacion <> 'UPDATE'
                   or a.campos && array['super_administrador', 'rol_id', 'auth_user_id', 'activo', 'conformidad_obligatoria'])
              then 'Cambio de empleado / acceso'
            when a.tabla = 'articulo' and a.operacion = 'UPDATE' and 'pvp' = any (a.campos)
                 and exists (select 1 from articulo x where x.codigo_interno = a.registro_pk
                               and coalesce(nullif(x.coste_neto, 0), nullif(x.precio_medio_compra, 0)) > 0
                               and (a.datos_despues ->> 'pvp')::numeric / (1 + coalesce(x.igic_pct, 0) / 100)
                                   < coalesce(nullif(x.coste_neto, 0), x.precio_medio_compra))
              then 'Precio por debajo del coste'
          end as motivo) m
       where a.ocurrido_en > now() - make_interval(days => greatest(1, coalesce(p_dias, 30)))
         and m.motivo is not null
    )
    select jsonb_build_object(
      'pendientes', (select count(*) from av where (av.a).ocurrido_en > coalesce(v_visto, '-infinity')),
      'visto_hasta', v_visto,
      'lista', coalesce((select jsonb_agg(fn_auditoria_fila(av.a, av.motivo) order by (av.a).ocurrido_en desc)
                           from (select * from av order by (av.a).ocurrido_en desc limit 300) av), '[]'::jsonb)));
end;
$$;
grant execute on function public.fn_auditoria_avisos(integer) to authenticated;
revoke execute on function public.fn_auditoria_avisos(integer) from anon, public;

create or replace function public.fn_auditoria_avisos_vistos()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not fn_es_super_administrador() then
    return;
  end if;
  insert into auditoria_aviso_visto (empleado_codigo, visto_hasta) values (fn_empleado_actual(), now())
  on conflict (empleado_codigo) do update set visto_hasta = excluded.visto_hasta;
end;
$$;
grant execute on function public.fn_auditoria_avisos_vistos() to authenticated;
revoke execute on function public.fn_auditoria_avisos_vistos() from anon, public;

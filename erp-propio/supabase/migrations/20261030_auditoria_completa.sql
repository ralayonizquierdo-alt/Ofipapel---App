-- AUDITORÍA (Luis, 30/10/2026). Decisiones de Luis:
--  · Se registra solo cuando hay cambios, y qué cambió (no se registra quién solo mira una ficha).
--  · Se guarda 5 años.
--  · La consultan solo los super administradores (Luis, David —Dpto. ventas— y Rober —Dpto. compras—),
--    en Archivo → Auditoría; cada consulta queda también registrada.
--
-- Qué hace:
--  1. fn_auditoria_trigger en TODAS las tablas modificables (antes solo 7). De cada alta, cambio o
--     baja: tabla, clave del registro, empleado, usuario, tienda, fecha y hora; en los cambios solo
--     los campos que cambian (antes → después). Un «guardar» sin cambios no deja rastro.
--     Fuera: tablas que ya son registro o que se recalculan solas (ver v_excluidas).
--     movimiento_stock ya es un registro de entradas y salidas: solo se auditan sus cambios y bajas.
--  2. La auditoría no se puede modificar ni borrar (ni con la clave de servicio), salvo la depuración
--     de lo que tenga más de 5 años, que hace fn_auditoria_consultar al consultar.
--  3. Lectura solo para super administradores (antes cualquier empleado podía leerla).
--  4. fn_auditoria_consultar: búsqueda con filtros para la pantalla; apunta la consulta.
--  5. Las cargas masivas desde GeminisWin, hechas en el servidor, pueden saltarse la auditoría con
--     set local erp.sin_auditoria = 'on' (un empleado desde el programa no puede).

alter table public.auditoria
  add column if not exists tienda_terminal_codigo text,
  add column if not exists campos text[],
  add column if not exists usuario_id uuid;
comment on column public.auditoria.campos is 'En un cambio (UPDATE), los campos que cambiaron. datos_antes/datos_despues guardan solo esos campos.';
comment on column public.auditoria.tienda_terminal_codigo is 'Tienda/terminal del registro cambiado, si la tiene.';
comment on column public.auditoria.usuario_id is 'Usuario de acceso (auth.uid()) que hizo el cambio.';

-- Además de altas, cambios y bajas: las consultas de la auditoría y su depuración a los 5 años.
alter table public.auditoria drop constraint if exists auditoria_operacion_check;
alter table public.auditoria add constraint auditoria_operacion_check
  check (operacion = any (array['INSERT', 'UPDATE', 'DELETE', 'CONSULTA', 'DEPURACION']));

create index if not exists auditoria_ocurrido_idx on public.auditoria (ocurrido_en desc);
create index if not exists auditoria_tabla_pk_idx on public.auditoria (tabla, registro_pk);
create index if not exists auditoria_empleado_idx on public.auditoria (empleado_codigo, ocurrido_en desc);

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
begin
  if current_user not in ('authenticated', 'anon') and current_setting('erp.sin_auditoria', true) = 'on' then
    return coalesce(new, old);
  end if;
  v_old := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_row := coalesce(v_new, v_old);

  if tg_op = 'UPDATE' then
    select array_agg(e.key order by e.key), jsonb_object_agg(e.key, v_old -> e.key), jsonb_object_agg(e.key, e.value)
      into v_campos, v_antes, v_despues
      from jsonb_each(v_new) e
     where e.key not in ('actualizado_en', 'creado_en', 'fecha_hora_actualizacion')
       and (v_old -> e.key) is distinct from e.value;
    if v_campos is null then
      return new; -- guardado sin cambios: nada que apuntar
    end if;
  else
    v_antes := v_old;
    v_despues := v_new;
  end if;

  -- Clave del registro: los campos de la clave primaria, unidos con «-» (p. ej. «01-40»).
  select string_agg(coalesce(v_row ->> a.attname, ''), '-' order by array_position(i.indkey::int2[], a.attnum))
    into v_pk
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
   where i.indrelid = tg_relid and i.indisprimary;

  insert into auditoria (tabla, operacion, registro_pk, empleado_codigo, datos_antes, datos_despues, ocurrido_en,
                         tienda_terminal_codigo, campos, usuario_id)
  values (tg_table_name, tg_op, coalesce(v_pk, ''), fn_empleado_actual(), v_antes, v_despues, now(),
          v_row ->> 'tienda_terminal_codigo', v_campos, auth.uid());
  return coalesce(new, old);
end;
$$;

-- Trigger en todas las tablas, menos las que ya son un registro o se recalculan solas.
do $$
declare
  t text;
  v_excluidas text[] := array[
    'auditoria',                      -- la propia auditoría
    'carga_dbf',                      -- carga de datos de GeminisWin
    'coordinacion_notas',             -- notas internas entre los chats de desarrollo
    'secuencia_numeracion',           -- contadores de números de documento
    'web_sincronizacion_log',         -- ya es un registro
    'registro_facturacion',           -- VeriFactu: ya es inmutable y encadenado
    'articulo_almacen_stock',         -- saldo de stock, se recalcula solo desde movimiento_stock
    'cliente_deuda_recalculo',        -- cálculo automático
    'punto_restauracion_stock_linea', -- copia de stock, se genera sola
    'movimiento_stock'                -- ya es un registro (más abajo: solo cambios y bajas)
  ];
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename <> all (v_excluidas) loop
    execute format('drop trigger if exists %I on public.%I', 'trg_auditoria_' || t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.fn_auditoria_trigger()',
                   'trg_auditoria_' || t, t);
  end loop;
  drop trigger if exists trg_auditoria_movimiento_stock on public.movimiento_stock;
  create trigger trg_auditoria_movimiento_stock after update or delete on public.movimiento_stock
    for each row execute function public.fn_auditoria_trigger();
end $$;

-- Inmutable de verdad: ni la clave de servicio puede cambiarla o borrarla. Solo la depuración de
-- lo que tiene más de 5 años (fn_auditoria_depurar marca la transacción con erp.depurar_auditoria).
create or replace function public.fn_auditoria_inmutable()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' and current_setting('erp.depurar_auditoria', true) = 'on'
     and old.ocurrido_en < now() - interval '5 years' then
    return old;
  end if;
  raise exception 'La auditoría no se puede modificar ni borrar.';
end;
$$;
drop trigger if exists trg_auditoria_inmutable on public.auditoria;
create trigger trg_auditoria_inmutable before update or delete on public.auditoria
  for each row execute function public.fn_auditoria_inmutable();

create or replace function public.fn_auditoria_sin_vaciar()
returns trigger
language plpgsql
as $$
begin
  raise exception 'La auditoría no se puede vaciar.';
end;
$$;
drop trigger if exists trg_auditoria_sin_vaciar on public.auditoria;
create trigger trg_auditoria_sin_vaciar before truncate on public.auditoria
  for each statement execute function public.fn_auditoria_sin_vaciar();

create or replace function public.fn_auditoria_depurar()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  n integer;
begin
  perform set_config('erp.depurar_auditoria', 'on', true);
  delete from auditoria where ocurrido_en < now() - interval '5 years';
  get diagnostics n = row_count;
  perform set_config('erp.depurar_auditoria', 'off', true);
  if n > 0 then
    insert into auditoria (tabla, operacion, registro_pk, empleado_codigo, datos_despues, ocurrido_en, usuario_id)
    values ('auditoria', 'DEPURACION', '', fn_empleado_actual(), jsonb_build_object('borrados', n, 'anteriores_a', now() - interval '5 years'), now(), auth.uid());
  end if;
  return n;
end;
$$;
revoke execute on function public.fn_auditoria_depurar() from public, anon, authenticated;

-- Lectura: solo super administradores.
drop policy if exists autenticados_acceso_total_auditoria on public.auditoria;
drop policy if exists auditoria_lectura_super on public.auditoria;
create policy auditoria_lectura_super on public.auditoria for select to authenticated using (public.fn_es_super_administrador());

-- Consulta para Archivo → Auditoría. Comprueba que es super administrador, depura lo de más de
-- 5 años y apunta la consulta (en la primera página) antes de devolver los resultados.
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
       and (v_texto is null or a.registro_pk ilike '%' || v_texto || '%'
            or a.datos_despues::text ilike '%' || v_texto || '%' or a.datos_antes::text ilike '%' || v_texto || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'filas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'ocurrido_en', x.ocurrido_en, 'tabla', x.tabla, 'operacion', x.operacion, 'registro', x.registro_pk,
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

-- Tablas auditadas (para el desplegable de la pantalla).
create or replace function public.fn_auditoria_tablas()
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select array_agg(distinct c.relname::text order by c.relname::text)
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where t.tgname like 'trg_auditoria\_%' and t.tgname <> 'trg_auditoria_inmutable' and t.tgname <> 'trg_auditoria_sin_vaciar'
$$;
grant execute on function public.fn_auditoria_tablas() to authenticated;
revoke execute on function public.fn_auditoria_tablas() from anon, public;

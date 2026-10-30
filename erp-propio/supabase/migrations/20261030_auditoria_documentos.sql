-- Auditoría → Documentos legales (Luis, 30/10/2026): el texto de información a los empleados
-- sobre el registro de cambios (art. 87 LOPDGDD) y cualquier otro documento que se quiera adjuntar
-- (copias firmadas, actualizaciones, informes…). Cada documento: título, texto y, si se quiere, un
-- archivo (PDF, imagen, Word…) guardado aquí mismo en base64 (máx. 8 MB).
-- Solo super administradores. No se borran: se retiran (activo = false); los cambios quedan en la
-- auditoría como todo lo demás.

-- La auditoría guarda de los archivos adjuntos (columnas *_base64) solo su tamaño.
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
  -- Archivos adjuntos (columnas *_base64): en la auditoría solo su tamaño, no el archivo entero.
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

create table if not exists public.auditoria_documento (
  id bigint generated always as identity primary key,
  titulo text not null,
  contenido text,
  archivo_nombre text,
  archivo_tipo text,
  archivo_base64 text,
  activo boolean not null default true,
  creado_por text references public.empleado (codigo),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint auditoria_documento_archivo_max check (archivo_base64 is null or length(archivo_base64) <= 11200000)
);
comment on table public.auditoria_documento is 'Documentos legales de la auditoría (aviso a empleados y adjuntos). Solo super administradores; no se borran, se retiran.';

alter table public.auditoria_documento enable row level security;
drop policy if exists auditoria_documento_lee on public.auditoria_documento;
drop policy if exists auditoria_documento_alta on public.auditoria_documento;
drop policy if exists auditoria_documento_cambia on public.auditoria_documento;
create policy auditoria_documento_lee on public.auditoria_documento for select to authenticated using (public.fn_es_super_administrador());
create policy auditoria_documento_alta on public.auditoria_documento for insert to authenticated with check (public.fn_es_super_administrador());
create policy auditoria_documento_cambia on public.auditoria_documento for update to authenticated
  using (public.fn_es_super_administrador()) with check (public.fn_es_super_administrador());
-- Sin política de borrado: no se borran.

create or replace function public.fn_auditoria_documento_antes()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    new.creado_por := coalesce(new.creado_por, public.fn_empleado_actual());
    new.creado_en := now();
  else
    new.creado_por := old.creado_por;
    new.creado_en := old.creado_en;
  end if;
  new.actualizado_en := now();
  return new;
end;
$$;
drop trigger if exists trg_auditoria_documento_antes on public.auditoria_documento;
create trigger trg_auditoria_documento_antes before insert or update on public.auditoria_documento
  for each row execute function public.fn_auditoria_documento_antes();

drop trigger if exists trg_auditoria_auditoria_documento on public.auditoria_documento;
create trigger trg_auditoria_auditoria_documento after insert or update or delete on public.auditoria_documento
  for each row execute function public.fn_auditoria_trigger();

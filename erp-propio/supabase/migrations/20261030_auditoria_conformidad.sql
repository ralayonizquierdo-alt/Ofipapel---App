-- Conformidad con el texto legal de la auditoría (Luis, 30/10/2026): al entrar al ERP, a cada
-- empleado le sale el aviso legal (documentos con requiere_conformidad) hasta que da su
-- conformidad. Queda registrada (empleado, usuario, día y hora, y la versión exacta del texto: si
-- el texto cambia, hay que volver a darla). En Auditoría → Conformidades, los super administradores
-- ven quién la ha dado y quién hace cambios en el programa.

alter table public.auditoria_documento add column if not exists requiere_conformidad boolean not null default false;
comment on column public.auditoria_documento.requiere_conformidad is 'Se enseña a cada empleado al entrar hasta que da su conformidad (versión = md5 de título y texto).';

create or replace function public.fn_documento_version(p_titulo text, p_contenido text)
returns text
language sql
immutable
as $$ select md5(coalesce(p_titulo, '') || E'\n' || coalesce(p_contenido, '')) $$;

create table if not exists public.auditoria_conformidad (
  id bigint generated always as identity primary key,
  documento_id bigint not null references public.auditoria_documento (id),
  version text not null,
  empleado_codigo text not null references public.empleado (codigo),
  usuario_id uuid,
  aceptado_en timestamptz not null default now(),
  unique (documento_id, version, empleado_codigo)
);
comment on table public.auditoria_conformidad is 'Conformidades de los empleados con los documentos legales de la auditoría. Inmutable.';

alter table public.auditoria_conformidad enable row level security;
drop policy if exists auditoria_conformidad_lee on public.auditoria_conformidad;
create policy auditoria_conformidad_lee on public.auditoria_conformidad for select to authenticated
  using (public.fn_es_super_administrador() or empleado_codigo = public.fn_empleado_actual());
-- Altas solo con fn_dar_conformidad; ni cambios ni bajas.

create or replace function public.fn_auditoria_conformidad_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Las conformidades no se pueden modificar ni borrar.';
end;
$$;
drop trigger if exists trg_auditoria_conformidad_inmutable on public.auditoria_conformidad;
create trigger trg_auditoria_conformidad_inmutable before update or delete on public.auditoria_conformidad
  for each row execute function public.fn_auditoria_conformidad_inmutable();
drop trigger if exists trg_auditoria_auditoria_conformidad on public.auditoria_conformidad;
create trigger trg_auditoria_auditoria_conformidad after insert on public.auditoria_conformidad
  for each row execute function public.fn_auditoria_trigger();

-- Lo que le falta por aceptar al empleado conectado (el texto lo puede leer aunque no sea super administrador).
create or replace function public.fn_conformidad_pendiente()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'titulo', d.titulo, 'contenido', d.contenido,
                                               'version', fn_documento_version(d.titulo, d.contenido)) order by d.id), '[]')
    from auditoria_documento d
   where d.activo and d.requiere_conformidad and fn_empleado_actual() is not null
     and not exists (select 1 from auditoria_conformidad c
                      where c.documento_id = d.id and c.empleado_codigo = fn_empleado_actual()
                        and c.version = fn_documento_version(d.titulo, d.contenido))
$$;
grant execute on function public.fn_conformidad_pendiente() to authenticated;
revoke execute on function public.fn_conformidad_pendiente() from anon, public;

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
  insert into auditoria_conformidad (documento_id, version, empleado_codigo, usuario_id)
  values (p_documento, p_version, v_emp, auth.uid())
  on conflict (documento_id, version, empleado_codigo) do nothing;
  select aceptado_en into v_fecha from auditoria_conformidad
   where documento_id = p_documento and version = p_version and empleado_codigo = v_emp;
  return v_fecha;
end;
$$;
grant execute on function public.fn_dar_conformidad(bigint, text) to authenticated;
revoke execute on function public.fn_dar_conformidad(bigint, text) from anon, public;

-- Listado para Auditoría → Conformidades: cada empleado, si tiene usuario de acceso, cuántos cambios
-- ha hecho y el último, y si ha dado la conformidad a la versión vigente de cada documento.
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
               'usuario', e.auth_user_id is not null, 'super', e.super_administrador,
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
grant execute on function public.fn_auditoria_conformidades() to authenticated;
revoke execute on function public.fn_auditoria_conformidades() from anon, public;

-- El aviso a los empleados (documento 1) es el que pide conformidad.
update public.auditoria_documento set requiere_conformidad = true
 where id = 1 and titulo like 'Información a los empleados%';

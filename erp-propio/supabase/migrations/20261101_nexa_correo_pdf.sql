-- NEXA: guardar PDFs y enviar correos (01/11/2026).
--  · nexa_documento: los PDF que NEXA crea (en el bucket privado «nexa-documentos», carpeta = id del usuario).
--  · nexa_correo: los correos que NEXA PREPARA. NEXA nunca envía: el envío lo hace el botón «Enviar» de la tarjeta, que
--    llama a la función «nexa» con accion = enviar_correo (comprueba usuario, permiso y estado, y envía por la API de correo).
--  · permiso «accion:nexa-enviar-correo»: quién puede enviar (administradores y GERENCIA).
-- Se pueden leer/crear/actualizar solo los propios. Con auditoría como el resto de tablas.

create table if not exists public.nexa_documento (
  id bigint generated always as identity primary key,
  usuario_id uuid not null default auth.uid(),
  nombre text not null,
  ruta text not null unique,
  bytes integer,
  creado_en timestamptz not null default now()
);
create table if not exists public.nexa_correo (
  id bigint generated always as identity primary key,
  usuario_id uuid not null default auth.uid(),
  para text[] not null,
  cc text[] not null default '{}',
  asunto text not null,
  cuerpo text not null,
  documentos bigint[] not null default '{}',
  estado text not null default 'borrador' check (estado in ('borrador', 'enviado', 'cancelado')),
  creado_en timestamptz not null default now(),
  enviado_en timestamptz,
  proveedor_id text,
  error text
);
comment on table public.nexa_correo is 'Correos preparados por NEXA. Solo se envían con el botón Enviar de la tarjeta (acción enviar_correo de la función nexa).';
comment on table public.nexa_documento is 'PDF creados por NEXA (Storage: bucket nexa-documentos, carpeta = id de usuario).';

alter table public.nexa_documento enable row level security;
alter table public.nexa_correo enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'nexa_documento' and policyname = 'nexa_documento_propio') then
    create policy nexa_documento_propio on public.nexa_documento for all to authenticated
      using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'nexa_correo' and policyname = 'nexa_correo_lee') then
    create policy nexa_correo_lee on public.nexa_correo for select to authenticated using (usuario_id = auth.uid());
    create policy nexa_correo_alta on public.nexa_correo for insert to authenticated with check (usuario_id = auth.uid() and estado = 'borrador');
    create policy nexa_correo_modifica on public.nexa_correo for update to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
  end if;
end $$;
revoke all on public.nexa_documento, public.nexa_correo from anon;
grant select, insert, update, delete on public.nexa_documento to authenticated;
grant select, insert, update on public.nexa_correo to authenticated;

create or replace trigger trg_auditoria_nexa_documento after insert or update or delete on public.nexa_documento
  for each row execute function public.fn_auditoria_trigger();
create or replace trigger trg_auditoria_nexa_correo after insert or update or delete on public.nexa_correo
  for each row execute function public.fn_auditoria_trigger();

-- Bucket privado y políticas (cada usuario, su carpeta).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nexa-documentos', 'nexa-documentos', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'nexa_documentos_propio') then
    create policy nexa_documentos_propio on storage.objects for all to authenticated
      using (bucket_id = 'nexa-documentos' and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = 'nexa-documentos' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;

-- Permiso para enviar correos (administradores siempre; el resto, por grupo en Grupos de Acceso).
insert into public.permiso (codigo, descripcion, modulo, orden)
values ('accion:nexa-enviar-correo', 'NEXA: enviar correos', 'Utilidades', 1141)
on conflict (codigo) do nothing;
insert into public.rol_permiso (rol_id, permiso_codigo)
select r.id, 'accion:nexa-enviar-correo' from public.rol r where r.codigo = 'GERENCIA'
on conflict do nothing;

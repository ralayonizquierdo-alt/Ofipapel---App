-- Gestor de Roturas · FASE 2: adjuntos (fotos de la rotura, facturas de abono, albaranes…).
-- Sustituye a Vercel Blob de RAX-OS. Almacenamiento PRIVADO de Supabase: nada es público; los
-- ficheros se ven con enlaces firmados de pocos minutos, y solo quien tiene permiso de Roturas.
-- Ruta de cada fichero: «<id del expediente>/<uuid>-<nombre>». Un fichero subido no se cambia ni se
-- borra desde el navegador (no hay política de UPDATE ni DELETE): es parte del expediente.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('roturas', 'roturas', false, 15728640, array[
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
  'message/rfc822', 'application/vnd.ms-outlook', 'text/plain'
])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'roturas_lee') then
    create policy roturas_lee on storage.objects for select to authenticated
      using (bucket_id = 'roturas' and public.fn_rotura_ve());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'roturas_sube') then
    create policy roturas_sube on storage.objects for insert to authenticated
      with check (
        bucket_id = 'roturas' and public.fn_rotura_ve()
        and (storage.foldername(name))[1] ~ '^[0-9]+$'
        and exists (select 1 from public.rotura_expediente x
                     where x.id = ((storage.foldername(name))[1])::bigint and x.anulado_en is null)
      );
  end if;
end $$;

create unique index if not exists rotura_documento_ruta_uidx on public.rotura_documento (ruta);

/** Apunta en el expediente un fichero YA subido al almacenamiento. */
create or replace function public.fn_rotura_documento_registrar(p_expediente bigint, p_tipo text, p_nombre text, p_ruta text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; v_tipo text := upper(btrim(coalesce(p_tipo, ''))); v_nombre text := nullif(btrim(p_nombre), ''); v_ruta text := btrim(coalesce(p_ruta, ''));
begin
  if not public.fn_rotura_ve() then raise exception 'Sin permiso de Roturas.' using errcode = '42501'; end if;
  if not exists (select 1 from public.rotura_expediente where id = p_expediente and anulado_en is null) then
    raise exception 'El expediente no existe o está anulado.' using errcode = '22023';
  end if;
  if v_tipo not in ('FOTO', 'PDF', 'EMAIL', 'FACTURA', 'ALBARAN', 'EXCEL', 'ABONO', 'OTRO') then
    raise exception 'Tipo de documento no válido.' using errcode = '22023';
  end if;
  if v_nombre is null then raise exception 'Falta el nombre del fichero.' using errcode = '22023'; end if;
  if v_ruta not like p_expediente::text || '/%' or v_ruta like '%..%' then
    raise exception 'La ruta del fichero no corresponde a este expediente.' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'roturas' and o.name = v_ruta) then
    raise exception 'El fichero no está subido.' using errcode = '22023';
  end if;
  insert into public.rotura_documento (expediente_id, tipo, nombre, ruta, creado_por)
  values (p_expediente, v_tipo, left(v_nombre, 200), v_ruta, public.fn_empleado_actual())
  on conflict (ruta) do nothing
  returning id into v_id;
  if v_id is null then select id into v_id from public.rotura_documento where ruta = v_ruta; end if;
  return jsonb_build_object('id', v_id, 'ruta', v_ruta);
end $$;

revoke execute on function public.fn_rotura_documento_registrar(bigint, text, text, text) from public, anon;
grant execute on function public.fn_rotura_documento_registrar(bigint, text, text, text) to authenticated, service_role;

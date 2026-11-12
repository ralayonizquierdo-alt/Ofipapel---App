-- Gestor de Roturas · FASE 4: reclamación al proveedor por correo, con el PDF adjunto.
--
-- Compras marca los expedientes «Pendiente de Compras» de UN proveedor y pulsa «Reclamar». El
-- programa genera el PDF (lista de artículos + fotos), lo guarda en el almacenamiento privado y
-- esta función: deja el correo en la cola (sale por Microsoft 365 desde el buzón de Compras, con
-- el PDF adjunto), pasa los expedientes a «Reclamado al proveedor» y lo apunta en el historial.
--
-- Novedad general del ERP: la cola de correo admite ADJUNTOS (correo_pendiente.adjuntos), que la
-- función correo-enviar lee del almacenamiento privado. Antes solo mandaba texto.

alter table public.correo_pendiente add column if not exists adjuntos jsonb;
comment on column public.correo_pendiente.adjuntos is
  'Ficheros a adjuntar, del almacenamiento privado: [{"bucket":"roturas","ruta":"12/abc.pdf","nombre":"reclamacion.pdf"}]. Los lee correo-enviar.';

alter table public.rotura_expediente add column if not exists reclamacion_correo_id bigint;
alter table public.rotura_expediente add column if not exists reclamacion_pdf text;

/** Reclama al proveedor uno o varios expedientes (todos del mismo proveedor). */
create or replace function public.fn_rotura_reclamar(p_ids bigint[], p_para text, p_asunto text, p_cuerpo text, p_pdf_ruta text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_quien text := public.fn_empleado_actual();
  v_n integer; v_prov integer; v_mal text; v_correo bigint; v_primero bigint;
  v_para text := regexp_replace(coalesce(p_para, ''), '\s', '', 'g');
  v_asunto text := nullif(btrim(p_asunto), '');
  v_cuerpo text := nullif(btrim(p_cuerpo), '');
  v_ruta text := btrim(coalesce(p_pdf_ruta, ''));
  v_html text; d text;
begin
  if not public.fn_puede('/gestor-roturas') then raise exception 'Sin permiso para reclamar a proveedores.' using errcode = '42501'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'No has marcado ningún expediente.' using errcode = '22023'; end if;

  perform 1 from public.rotura_expediente where id = any (p_ids) for update;
  select count(*), count(distinct proveedor_codigo), min(id),
         min(numero) filter (where anulado_en is not null or estado <> 'PENDIENTE_COMPRAS')
    into v_n, v_prov, v_primero, v_mal
    from public.rotura_expediente where id = any (p_ids);
  if v_n <> cardinality(p_ids) then raise exception 'Alguno de los expedientes marcados no existe.' using errcode = '22023'; end if;
  if v_mal is not null then raise exception '% ya no está pendiente de reclamar.', v_mal using errcode = '22023'; end if;
  if v_prov > 1 then raise exception 'Todos los expedientes de una reclamación tienen que ser del mismo proveedor.' using errcode = '22023'; end if;

  if v_para = '' then raise exception 'Falta el correo del proveedor.' using errcode = '22023'; end if;
  foreach d in array regexp_split_to_array(v_para, '[;,]') loop
    if d <> '' and d !~ '^[^@\s;,]+@[^@\s;,]+\.[^@\s;,]+$' then raise exception 'El correo «%» no es válido.', d using errcode = '22023'; end if;
  end loop;
  if v_asunto is null or v_cuerpo is null then raise exception 'Falta el asunto o el texto del correo.' using errcode = '22023'; end if;
  if v_ruta not like v_primero::text || '/%' or v_ruta like '%..%'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'roturas' and o.name = v_ruta) then
    raise exception 'No se encuentra el PDF de la reclamación.' using errcode = '22023';
  end if;

  -- El texto se escribe como texto llano: se pasa a HTML sin dejar colar etiquetas.
  v_html := '<div style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">'
         || replace(replace(replace(v_cuerpo, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</div>';
  insert into public.correo_pendiente (para, asunto, cuerpo_html, origen, buzon, adjuntos)
  values (v_para, left(v_asunto, 200), v_html, 'rotura_reclamacion', 'compras',
          jsonb_build_array(jsonb_build_object('bucket', 'roturas', 'ruta', v_ruta, 'nombre', 'reclamacion-ofipapel.pdf')))
  returning id into v_correo;

  insert into public.rotura_documento (expediente_id, tipo, nombre, ruta, creado_por)
  values (v_primero, 'PDF', 'Reclamación al proveedor.pdf', v_ruta, v_quien)
  on conflict (ruta) do nothing;

  insert into public.rotura_historial (expediente_id, estado_anterior, estado_nuevo, empleado_codigo, observaciones)
  select id, estado, 'ABONO_PROVEEDOR', v_quien, 'Reclamación enviada a ' || v_para
    from public.rotura_expediente where id = any (p_ids);
  update public.rotura_expediente
     set estado = 'ABONO_PROVEEDOR', reclamacion_enviada_en = now(), reclamacion_correo_id = v_correo, reclamacion_pdf = v_ruta
   where id = any (p_ids);
  return jsonb_build_object('correo_id', v_correo, 'expedientes', v_n);
end $$;

/** Cómo va el correo de una reclamación (enviado, pendiente o con error), para enseñarlo en el Gestor. */
create or replace function public.fn_rotura_correos(p_ids bigint[]) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'para', c.para, 'enviado_en', c.enviado_en, 'intentos', c.intentos, 'error', c.error)), '[]'::jsonb)
    from public.correo_pendiente c
   where public.fn_puede('/gestor-roturas') and c.origen = 'rotura_reclamacion' and c.id = any (p_ids)
$$;

/** Vuelve a poner en la cola un correo de reclamación que no salió (p. ej. tras corregir el buzón). */
create or replace function public.fn_rotura_correo_reintentar(p_correo bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.fn_puede('/gestor-roturas') then raise exception 'Sin permiso.' using errcode = '42501'; end if;
  update public.correo_pendiente set intentos = 0, error = null
   where id = p_correo and origen = 'rotura_reclamacion' and enviado_en is null;
  if not found then raise exception 'Ese correo ya se envió o no es una reclamación.' using errcode = '22023'; end if;
end $$;

revoke execute on function public.fn_rotura_reclamar(bigint[], text, text, text, text), public.fn_rotura_correos(bigint[]),
  public.fn_rotura_correo_reintentar(bigint) from public, anon;
grant execute on function public.fn_rotura_reclamar(bigint[], text, text, text, text), public.fn_rotura_correos(bigint[]),
  public.fn_rotura_correo_reintentar(bigint) to authenticated, service_role;

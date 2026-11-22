-- Presupuestos, pedidos y proformas por correo con el PDF adjunto (Rober, 22/11/2026): desde Imprimir → documento →
-- «Correo». El navegador hace el PDF (el mismo de «PDF»), lo sube a un almacén PRIVADO y esta función deja el correo en
-- la cola de siempre (correo_pendiente, buzón general = el correo remitente del ERP), que envía «correo-enviar» por
-- Microsoft 365 con el adjunto. Queda apuntado en presupuesto_correo y un presupuesto en borrador pasa a «enviado».
-- Sale del correo de QUIEN LO ENVÍA (Rober: lo usan sobre todo los comerciales): correo_pendiente.remitente = el e-mail
-- de su ficha de empleado; queda en sus Enviados y las respuestas le llegan a él. Si no tiene correo en la ficha, NO se
-- envía: lo pone un administrador. (WhatsApp, Telegram… van por «Compartir» del dispositivo de cada uno: no pasan por aquí.)

alter table public.correo_pendiente add column if not exists remitente text;
comment on column public.correo_pendiente.remitente is
  'Buzón desde el que sale (el de quien lo envía). Vacío = el del buzón (general, compras, administración). Lo usa correo-enviar.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos_venta', 'documentos_venta', false, 3145728, array['application/pdf'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'documentos_venta_sube') then
    create policy documentos_venta_sube on storage.objects for insert to authenticated
      with check (bucket_id = 'documentos_venta' and (select public.fn_puede_alguno('{/pedidos,/presupuestos}'::text[]))
                  and name ~ '^[A-Za-z0-9]{1,4}-[0-9]+/[A-Za-z0-9._-]+\.pdf$');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'documentos_venta_lee') then
    create policy documentos_venta_lee on storage.objects for select to authenticated
      using (bucket_id = 'documentos_venta' and (select public.fn_puede_alguno('{/pedidos,/presupuestos}'::text[])));
  end if;
end $$;

create or replace function public.fn_documento_venta_enviar(p_tienda text, p_numero bigint, p_para text, p_asunto text, p_texto text,
                                                           p_ruta text, p_nombre text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_para text := btrim(coalesce(p_para, '')); d text; v_html text; v_id bigint; v_ruta text := btrim(coalesce(p_ruta, ''));
        v_presu boolean; v_estado text; v_remitente text;
begin
  if not fn_puede_alguno('{/pedidos,/presupuestos}'::text[]) then
    raise exception 'No tienes permiso de Pedidos ni de Presupuestos.' using errcode = '42501';
  end if;
  select es_presupuesto, presupuesto_estado into v_presu, v_estado from pedido_cliente where tienda_terminal_codigo = p_tienda and numero = p_numero;
  if not found then raise exception 'No encuentro el documento % de la tienda %.', p_numero, p_tienda; end if;
  if v_para = '' then raise exception 'Falta el correo del cliente.' using errcode = '22023'; end if;
  foreach d in array regexp_split_to_array(v_para, '\s*[;,]\s*') loop
    if d <> '' and d !~ '^[^@\s;,]+@[^@\s;,]+\.[^@\s;,]+$' then raise exception 'El correo «%» no es válido.', d using errcode = '22023'; end if;
  end loop;
  if nullif(btrim(p_asunto), '') is null or nullif(btrim(p_texto), '') is null then
    raise exception 'Falta el asunto o el texto del correo.' using errcode = '22023';
  end if;
  if v_ruta not like p_tienda || '-' || p_numero::text || '/%' or v_ruta like '%..%'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'documentos_venta' and o.name = v_ruta) then
    raise exception 'El PDF no está subido.' using errcode = '22023';
  end if;
  v_html := '<div style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">'
         || replace(replace(replace(p_texto, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</div>';
  select nullif(btrim(e.email), '') into v_remitente from empleado e where e.codigo = fn_empleado_actual();
  if v_remitente is not null and v_remitente !~ '^[^@\s;,]+@[^@\s;,]+\.[^@\s;,]+$' then v_remitente := null; end if;
  if v_remitente is null then
    raise exception 'No tienes correo en tu ficha de empleado: pide a un administrador que lo ponga (Archivo → Empleados) para poder enviar desde tu correo.' using errcode = '22023';
  end if;
  insert into correo_pendiente (para, asunto, cuerpo_html, origen, buzon, adjuntos, remitente)
  values (v_para, left(btrim(p_asunto), 200), v_html, 'documento_venta', 'general',
          jsonb_build_array(jsonb_build_object('bucket', 'documentos_venta', 'ruta', v_ruta,
                                               'nombre', coalesce(nullif(btrim(p_nombre), ''), 'documento-ofipapel.pdf'))),
          v_remitente)
  returning id into v_id;
  insert into presupuesto_correo (tienda_terminal_codigo, numero, para, asunto, cuerpo)
  values (p_tienda, p_numero, v_para, left(btrim(p_asunto), 200) || ' (con PDF)', p_texto);
  if v_presu and coalesce(v_estado, 'borrador') = 'borrador' then
    update pedido_cliente set presupuesto_estado = 'enviado' where tienda_terminal_codigo = p_tienda and numero = p_numero;
  end if;
  return jsonb_build_object('ok', true, 'correo_id', v_id, 'remitente', v_remitente);
end $$;
revoke all on function public.fn_documento_venta_enviar(text, bigint, text, text, text, text, text) from public, anon;
grant execute on function public.fn_documento_venta_enviar(text, bigint, text, text, text, text, text) to authenticated;

-- Para ver cómo va el envío (enviado o error) sin dar acceso a la cola.
create or replace function public.fn_documento_venta_correo_estado(p_id bigint)
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select jsonb_build_object('enviado_en', enviado_en, 'error', error)
    from correo_pendiente where id = p_id and origen = 'documento_venta' and fn_puede_alguno('{/pedidos,/presupuestos}'::text[])
$$;
revoke all on function public.fn_documento_venta_correo_estado(bigint) from public, anon;
grant execute on function public.fn_documento_venta_correo_estado(bigint) to authenticated;

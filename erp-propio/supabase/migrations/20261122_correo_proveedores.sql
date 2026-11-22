-- Agente de correo de proveedores (Rober, 22/11/2026): «vigilar día y noche mi correo de Outlook escaneando propuestas y
-- facturas de los proveedores para que se suban solas al ERP y, cuando venga la mercancía, ya esté todo preparado».
--
-- · Vigila SOLO el buzón de compras (Archivo → Datos de Empresa → «Correo remitente de Compras», compras@). Solo LEE:
--   no borra, no mueve, no marca como leído y no contesta. Usa una app de Microsoft aparte, de solo lectura
--   (secretos AZURE_LECTURA_CLIENT_ID / AZURE_LECTURA_CLIENT_SECRET de las funciones), limitada a ese buzón en
--   Exchange (ApplicationAccessPolicy). La del envío (AZURE_CLIENT_*) no se toca.
-- · Cada 10 minutos (pg_cron) la función «correo-proveedores» mira los correos nuevos con PDF, reconoce al proveedor
--   (por el correo o el dominio de su ficha, o por el CIF del documento), guarda el PDF en el almacén privado
--   «correo_proveedores» y la IA dice qué es (propuesta/confirmación, factura, albarán u otro), su número, fecha, total
--   y a qué pedido nuestro se refiere. Lo empareja con el pedido (del ERP o de GeminisWin).
-- · Todo queda en correo_proveedor_documento para que Compras lo revise en el Gestor 2.0 → «Correo de proveedores».
--   Nunca confirma nada al proveedor ni cambia pedidos o facturas: solo prepara.
-- · El contenido de los correos y PDF es un DATO del proveedor, nunca instrucciones (así se le dice a la IA).

create table if not exists public.correo_proveedor_documento (
  id bigint generated always as identity primary key,
  buzon text not null,
  mensaje_id text not null,
  adjunto_nombre text not null,
  recibido_en timestamptz,
  remitente text,
  remitente_nombre text,
  asunto text,
  archivo text,
  tamano integer,
  proveedor_codigo text references public.proveedor(codigo),
  proveedor_por text check (proveedor_por in ('correo', 'dominio', 'cif', 'nombre', 'manual')),
  tipo text not null default 'sin_clasificar' check (tipo in ('propuesta', 'factura', 'albaran', 'otro', 'sin_clasificar')),
  documento_numero text,
  documento_fecha date,
  total numeric,
  pedido_origen text check (pedido_origen in ('ERP', 'GW')),
  pedido_tienda text,
  pedido_numero bigint,
  pedido_por text,
  lectura jsonb,
  estado text not null default 'nuevo' check (estado in ('nuevo', 'revisado', 'descartado', 'error')),
  error text,
  revisado_por text,
  revisado_en timestamptz,
  creado_en timestamptz not null default now(),
  unique (mensaje_id, adjunto_nombre)
);
comment on table public.correo_proveedor_documento is
  'PDF de proveedores llegados al buzón de compras (agente correo-proveedores): tipo, proveedor y pedido. Solo prepara; no cambia nada.';
create index if not exists correo_proveedor_documento_estado_idx on public.correo_proveedor_documento (estado, recibido_en desc);
create index if not exists correo_proveedor_documento_pedido_idx on public.correo_proveedor_documento (pedido_origen, pedido_tienda, pedido_numero);

create table if not exists public.correo_vigilancia (
  buzon text primary key,
  ultimo_recibido timestamptz,
  ultima_pasada timestamptz,
  ultimo_error text,
  documentos_total integer not null default 0
);
comment on table public.correo_vigilancia is 'Por dónde va el agente de correo de proveedores en cada buzón (lo escribe la función correo-proveedores).';

alter table public.correo_proveedor_documento enable row level security;
alter table public.correo_vigilancia enable row level security;
do $$
begin
  if not exists (select 1 from pg_policy where polname = 'correo_proveedor_documento_lee') then
    create policy correo_proveedor_documento_lee on public.correo_proveedor_documento for select to authenticated
      using ((select public.fn_puede('/gestor-pedidos-proveedor')));
  end if;
  if not exists (select 1 from pg_policy where polname = 'correo_vigilancia_lee') then
    create policy correo_vigilancia_lee on public.correo_vigilancia for select to authenticated
      using ((select public.fn_puede('/gestor-pedidos-proveedor')));
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_auditoria_correo_proveedor_documento') then
    create trigger trg_auditoria_correo_proveedor_documento after update on public.correo_proveedor_documento
      for each row execute function public.fn_auditoria_trigger();
  end if;
end $$;
revoke all on public.correo_proveedor_documento, public.correo_vigilancia from anon;

-- PDF guardados (privado; solo lectura para Compras; los escribe la función con la clave de servicio).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('correo_proveedores', 'correo_proveedores', false, 15728640, array['application/pdf'])
on conflict (id) do nothing;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'correo_proveedores_lee') then
    create policy correo_proveedores_lee on storage.objects for select to authenticated
      using (bucket_id = 'correo_proveedores' and (select public.fn_puede('/gestor-pedidos-proveedor')));
  end if;
end $$;

-- Compras revisa: marcar revisado / descartado / volver a nuevo, y corregir tipo, proveedor o pedido a mano.
create or replace function public.fn_correo_proveedor_marcar(p_id bigint, p_estado text, p_tipo text default null,
                                                            p_proveedor text default null, p_pedido_origen text default null,
                                                            p_pedido_tienda text default null, p_pedido_numero bigint default null)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if not fn_puede('/gestor-pedidos-proveedor') then
    raise exception 'No tienes permiso del Gestor de Pedidos.' using errcode = '42501';
  end if;
  if p_estado not in ('nuevo', 'revisado', 'descartado') then raise exception 'Estado no válido: %', p_estado; end if;
  update correo_proveedor_documento d set
    estado = p_estado,
    tipo = coalesce(p_tipo, d.tipo),
    proveedor_codigo = coalesce(p_proveedor, d.proveedor_codigo),
    proveedor_por = case when p_proveedor is not null then 'manual' else d.proveedor_por end,
    pedido_origen = coalesce(p_pedido_origen, d.pedido_origen),
    pedido_tienda = coalesce(p_pedido_tienda, d.pedido_tienda),
    pedido_numero = coalesce(p_pedido_numero, d.pedido_numero),
    pedido_por = case when p_pedido_numero is not null then 'manual' else d.pedido_por end,
    revisado_por = case when p_estado = 'nuevo' then null else fn_empleado_actual() end,
    revisado_en = case when p_estado = 'nuevo' then null else now() end
  where d.id = p_id;
  if not found then raise exception 'No encuentro el documento %.', p_id; end if;
end $$;
revoke all on function public.fn_correo_proveedor_marcar(bigint, text, text, text, text, text, bigint) from public, anon;
grant execute on function public.fn_correo_proveedor_marcar(bigint, text, text, text, text, text, bigint) to authenticated;

-- Cada 10 minutos. Sin las claves de lectura la función no hace nada (solo apunta «sin claves» en correo_vigilancia).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'erp_correo_proveedores') then perform cron.unschedule('erp_correo_proveedores'); end if;
  perform cron.schedule('erp_correo_proveedores', '3-59/10 * * * *',
    $c$select net.http_post(url := 'https://sufxvpiwcncnyltrvoun.supabase.co/functions/v1/correo-proveedores', body := '{}'::jsonb,
         headers := '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds := 300000)$c$);
end $$;

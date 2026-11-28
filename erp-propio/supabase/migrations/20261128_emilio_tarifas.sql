-- E-milio recoge las TARIFAS de los proveedores (Rober, 28/11/2026: «aparte de reconocer esas tarifas y subirlas al ERP,
-- también las guarde en la carpeta que tenemos destinada para ello, y en otra carpeta más… en red, para que las consulten
-- todos»).
--
-- · tipo «tarifa» en correo_proveedor_documento. E-milio coge ya también Excel y CSV, no solo PDF.
-- · nombre_ordenado de una tarifa: «PROVEEDOR_AAAA-MM-DD.ext». Lo pone un trigger, así sale igual venga del correo, de
--   «Subir tarifa» o de reclasificar a mano un documento como tarifa.
-- · Las carpetas (la de Rober y la de red) son de la oficina: la nube no llega. Las copia el programa del PC
--   scripts/correo/copiar_correo.py, que llama a la función «correo-copias» con su propia clave (tabla
--   reparto_privado.puente_copias, solo la huella). Al copiar, se apunta copiado_en / copia_ruta.
-- · «Subir tarifa» (Gestor 2.0 → Correo de proveedores) para las que no llegan por correo: fn_correo_tarifa_subir.

alter table public.correo_proveedor_documento drop constraint if exists correo_proveedor_documento_tipo_check;
alter table public.correo_proveedor_documento add constraint correo_proveedor_documento_tipo_check
  check (tipo = any (array['propuesta', 'factura', 'albaran', 'tarifa', 'otro', 'sin_clasificar']));

-- Excel, CSV y ODS además de PDF (Microsoft a veces da los Excel como octet-stream).
update storage.buckets set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.oasis.opendocument.spreadsheet',
  'text/csv',
  'text/plain',
  'application/octet-stream'
] where id = 'correo_proveedores';

-- «Subir tarifa» sube el fichero desde el navegador, solo a la carpeta tarifas/ y con permiso del Gestor de Pedidos.
do $$
begin
  if not exists (select 1 from pg_policy where polname = 'correo_proveedores_sube_tarifa' and polrelid = 'storage.objects'::regclass) then
    create policy correo_proveedores_sube_tarifa on storage.objects for insert to authenticated
      with check (bucket_id = 'correo_proveedores' and (storage.foldername(name))[1] = 'tarifas'
                  and (select public.fn_puede('/gestor-pedidos-proveedor')));
  end if;
end $$;

-- Nombre ordenado de las tarifas.
create or replace function public.fn_correo_nombre_tarifa()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_prov text;
  v_ext text;
begin
  if new.tipo <> 'tarifa' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.nombre_ordenado is not null and old.tipo = 'tarifa'
     and new.proveedor_codigo is not distinct from old.proveedor_codigo then
    return new;
  end if;
  select p.nombre into v_prov from proveedor p where p.codigo = new.proveedor_codigo;
  v_prov := coalesce(v_prov, new.lectura->>'proveedor_nombre', new.remitente_nombre, new.remitente, 'PROVEEDOR');
  v_prov := upper(regexp_replace(regexp_replace(trim(v_prov), '[\\/:*?"<>|.]+', ' ', 'g'), '\s+', ' ', 'g'));
  v_prov := left(trim(v_prov), 50);
  v_ext := lower(coalesce(substring(new.adjunto_nombre from '\.([A-Za-z0-9]{2,5})$'), 'pdf'));
  new.nombre_ordenado := v_prov || '_'
    || to_char(coalesce(new.documento_fecha, (coalesce(new.recibido_en, now()) at time zone 'Atlantic/Canary')::date), 'YYYY-MM-DD')
    || '.' || v_ext;
  -- Si cambia el nombre de una tarifa ya copiada, se vuelve a copiar con el nombre bueno.
  if tg_op = 'UPDATE' and new.nombre_ordenado is distinct from old.nombre_ordenado then
    new.copiado_en := null;
    new.copia_ruta := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_correo_nombre_tarifa on public.correo_proveedor_documento;
create trigger trg_correo_nombre_tarifa before insert or update of tipo, proveedor_codigo on public.correo_proveedor_documento
  for each row execute function public.fn_correo_nombre_tarifa();

-- «Subir tarifa»: el fichero ya está en tarifas/… (lo sube el navegador); aquí se apunta.
create or replace function public.fn_correo_tarifa_subir(p_archivo text, p_nombre text, p_proveedor text, p_fecha date default null, p_tamano integer default null)
returns bigint language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_id bigint;
begin
  if not fn_puede('/gestor-pedidos-proveedor') then
    raise exception 'No tienes permiso del Gestor de Pedidos.' using errcode = '42501';
  end if;
  if p_archivo is null or p_archivo !~ '^tarifas/' then raise exception 'Fichero no válido.'; end if;
  if not exists (select 1 from proveedor where codigo = p_proveedor) then raise exception 'No encuentro el proveedor %.', p_proveedor; end if;
  insert into correo_proveedor_documento (buzon, mensaje_id, adjunto_nombre, recibido_en, remitente, remitente_nombre, asunto,
                                          archivo, tamano, proveedor_codigo, proveedor_por, tipo, documento_fecha, estado)
  values ('subida a mano', 'manual-' || p_archivo, left(p_nombre, 200), now(), null, fn_empleado_actual()::text, 'Tarifa subida a mano',
          p_archivo, p_tamano, p_proveedor, 'manual', 'tarifa', p_fecha, 'nuevo')
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.fn_correo_tarifa_subir(text, text, text, date, integer) from public, anon;
grant execute on function public.fn_correo_tarifa_subir(text, text, text, date, integer) to authenticated;

-- Clave del programa que copia a las carpetas de la oficina (solo la huella; la clave vive en ese PC).
create table if not exists reparto_privado.puente_copias (
  id smallserial primary key,
  equipo text not null,
  clave_sha256 text not null unique,
  creado_en timestamptz not null default now()
);
revoke all on reparto_privado.puente_copias from public, anon, authenticated;

create or replace function public.fn_correo_copias_clave_ok(p_clave text)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select length(coalesce(p_clave, '')) >= 32
     and exists (select 1 from reparto_privado.puente_copias c where c.clave_sha256 = encode(sha256(convert_to(p_clave, 'UTF8')), 'hex'))
$$;
revoke all on function public.fn_correo_copias_clave_ok(text) from public, anon, authenticated;

-- Qué tipos se copian a carpetas: de momento solo tarifas. Las facturas, cuando Rober diga su carpeta.
insert into public.parametro (clave, valor, descripcion)
values ('correo.copiar_tipos', '["tarifa"]', 'Tipos de documento de E-milio que el programa del PC copia a las carpetas de la oficina (copiar_correo.py).')
on conflict (clave) do nothing;

-- Ficha de E-milio en el hub (agente_funcion): Excel y tarifas.
update public.agente set que_hace =
  'E-milio vigila los e-mails de los puestos de trabajo (hoy, el buzón de compras; solo lee) y deja en el Gestor 2.0 → '
  || '«Correo de proveedores» los PDF, Excel y CSV de los proveedores: propuestas, facturas, albaranes y tarifas, con su '
  || 'proveedor y su pedido. Cruza cada documento con su pedido con IA y avisa de lo que falta, viene de menos o cambia de '
  || 'precio. Las tarifas las guarda en el ERP y el programa del PC las copia a la carpeta de tarifas de Rober y a la de red. '
  || 'No contesta a nadie ni cambia pedidos.'
where codigo = 'correo_proveedores';

do $$
begin
  if not exists (select 1 from agente_funcion where agente = 'correo_proveedores' and texto like '%tarifas de precios%') then
    update agente_funcion set orden = orden + 100 where agente = 'correo_proveedores' and orden >= 5;
    update agente_funcion set orden = orden - 99 where agente = 'correo_proveedores' and orden >= 105;
    insert into agente_funcion (agente, orden, texto, activa) values ('correo_proveedores', 5,
      'Reconozco las tarifas de precios que mandan los proveedores y las guardo en el ERP con su proveedor y su fecha, para que el Gestor de compras pida cada artículo al más barato. Además las copio con su nombre ordenado a la carpeta de tarifas de Rober y a la carpeta de tarifas en red, para que las consulte todo el mundo.',
      false);
  end if;
  update agente_funcion set texto = 'Cojo los PDF, Excel y CSV de los proveedores y digo qué son: propuesta o confirmación de pedido, factura, albarán o tarifa de precios.',
                            actualizado_en = now()
   where agente = 'correo_proveedores' and orden = 2;
end $$;

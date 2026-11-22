-- Firma de los correos que envía el ERP desde el buzón de un empleado (Rober, 22/11/2026: «los pies de los mail deben
-- tener un formato bonito… una faldilla guapa con nuestros colores»). Arriba el logo, una raya verde, el nombre, el
-- cargo, el correo y el teléfono; abajo una franja verde con la empresa, la dirección y la web.
--  · Nombre y cargo: los de la ficha del empleado (Archivo → Empleados → «Nombre en la firma» y «Cargo»). Si están
--    vacíos: el nombre de la ficha en mayúsculas/minúsculas y el grupo de permisos como cargo (menos «Administrador»).
--  · Empresa, dirección, teléfono y web: Archivo → Datos de Empresa.
--  · El logo va DENTRO del correo (imagen incrustada «cid:logo-ofipapel»): lo añade correo-enviar, así se ve aunque
--    el programa de correo bloquee las imágenes de internet.

alter table public.empleado add column if not exists cargo text;
alter table public.empleado add column if not exists nombre_firma text;
comment on column public.empleado.cargo is 'Cargo en la firma de los correos (p. ej. «Jefe de Compras»). Vacío = el grupo de permisos.';
comment on column public.empleado.nombre_firma is 'Nombre en la firma de los correos (p. ej. «Roberto Alayón»). Vacío = el nombre de la ficha.';

-- Texto plano → HTML seguro (sin etiquetas).
create or replace function public.fn_html_texto(p text)
returns text language sql immutable set search_path to 'public', 'pg_temp' as $$
  select replace(replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;')
$$;

create or replace function public.fn_firma_correo_html(p_empleado text)
returns text language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare e record; m record; v_nombre text; v_cargo text; v_tel text; v_web text; v_dir text; v_email text; v_empresa text;
begin
  select em.nombre, em.nombre_firma, em.cargo, em.email, r.nombre as rol into e
    from empleado em left join rol r on r.id = em.rol_id where em.codigo = p_empleado;
  if not found then return ''; end if;
  select coalesce(nullif(btrim(nombre), ''), 'Ofipapel') as nombre, direccion, codigo_postal, poblacion, telefono_fijo, telefono_movil, web,
         (select replace(p.nombre, 'S/C De ', '') from provincia p where p.codigo = empresa.provincia_codigo) as provincia
    into m from empresa order by codigo limit 1;

  v_nombre := coalesce(nullif(btrim(e.nombre_firma), ''), initcap(lower(btrim(e.nombre))));
  -- Sin cargo en la ficha: el del grupo (los comerciales firman «Asesor Comercial»; los administradores, sin cargo).
  v_cargo := coalesce(nullif(btrim(e.cargo), ''),
                      case when e.rol is null or e.rol ilike 'administrador%' then null
                           when e.rol ilike 'comercial%' then 'Asesor Comercial' else e.rol end);
  v_email := nullif(btrim(e.email), '');
  v_tel := coalesce(nullif(btrim(m.telefono_fijo), ''), nullif(btrim(m.telefono_movil), ''));
  v_web := regexp_replace(coalesce(nullif(btrim(m.web), ''), ''), '^https?://', '');
  v_empresa := regexp_replace(replace(initcap(lower(m.nombre)), ' De ', ' de '), ',\s*S\.l\.$', ', S.L.');
  v_dir := nullif(concat_ws(' &nbsp;·&nbsp; ',
             fn_html_texto(nullif(btrim(m.direccion), '')),
             fn_html_texto(nullif(btrim(concat_ws(' ', nullif(btrim(m.codigo_postal), ''), nullif(btrim(m.poblacion), ''))), '')),
             fn_html_texto(m.provincia),
             case when v_web <> '' then '<a href="https://' || fn_html_texto(v_web) || '" style="color:#ffffff;font-weight:bold;text-decoration:none">'
                                        || fn_html_texto(v_web) || '</a>' end), '');

  -- Arriba: logo, raya verde, nombre, cargo, correo y teléfono. Abajo: «faldilla» verde con la empresa, la dirección y la web.
  return
    '<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;color:#2b2b2b;width:560px">'
    || '<tr><td style="padding:0 0 14px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr>'
    || '<td style="padding:0 20px 0 2px;vertical-align:middle"><img src="cid:logo-ofipapel" width="150" alt="Ofipapel" style="display:block;border:0;width:150px;height:auto"></td>'
    || '<td style="border-left:3px solid #3DAF3D;padding:2px 0 2px 18px;vertical-align:middle">'
    || '<div style="font-size:19px;line-height:24px;font-weight:bold;color:#1A5C1A">' || fn_html_texto(v_nombre) || '</div>'
    || coalesce('<div style="font-size:11px;line-height:16px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:#3DAF3D">' || fn_html_texto(v_cargo) || '</div>', '')
    || '<div style="height:10px;line-height:10px;font-size:10px">&nbsp;</div>'
    || coalesce('<div style="font-size:13px;line-height:20px"><span style="color:#3DAF3D;font-weight:bold">&#9993;</span>&nbsp; <a href="mailto:'
                || fn_html_texto(v_email) || '" style="color:#2b2b2b;text-decoration:none">' || fn_html_texto(v_email) || '</a></div>', '')
    || coalesce('<div style="font-size:13px;line-height:20px"><span style="color:#3DAF3D;font-weight:bold">&#9742;</span>&nbsp; <a href="tel:+34'
                || regexp_replace(v_tel, '\D', '', 'g') || '" style="color:#2b2b2b;text-decoration:none">' || fn_html_texto(v_tel) || '</a></div>', '')
    || '</td></tr></table></td></tr>'
    || '<tr><td bgcolor="#1A5C1A" style="background-color:#1A5C1A;background-image:linear-gradient(90deg,#1A5C1A 0%,#237523 55%,#3DAF3D 100%);border-radius:10px 10px 0 0;padding:11px 18px;color:#ffffff">'
    || '<div style="font-size:13px;line-height:18px;font-weight:bold;letter-spacing:.3px;color:#ffffff">' || fn_html_texto(v_empresa) || '</div>'
    || coalesce('<div style="font-size:12px;line-height:18px;color:#e4f4e2">' || v_dir || '</div>', '')
    || '</td></tr>'
    || '<tr><td bgcolor="#C1D48A" style="background-color:#C1D48A;height:5px;line-height:5px;font-size:0;border-radius:0 0 10px 10px">&nbsp;</td></tr>'
    || '</table>';
end $$;
revoke all on function public.fn_firma_correo_html(text) from public, anon;
grant execute on function public.fn_firma_correo_html(text) to authenticated;


-- El correo del documento lleva la firma debajo del texto.
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
         || replace(replace(replace(p_texto, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</div>'
         || fn_firma_correo_html(fn_empleado_actual());
  select nullif(btrim(e.email), '') into v_remitente from empleado e where e.codigo = fn_empleado_actual();
  if v_remitente is not null and v_remitente !~ '^[^@\s;,]+@[^@\s;,]+\.[^@\s;,]+$' then v_remitente := null; end if;
  -- Solo buzones de la empresa (mismo dominio que el correo remitente del ERP): Microsoft 365 no envía desde otros.
  if v_remitente is not null and lower(split_part(v_remitente, '@', 2)) <> lower(split_part(coalesce((select correo_remitente from empresa order by codigo limit 1), ''), '@', 2)) then
    raise exception 'Tu correo (%) no es de la empresa: el ERP solo puede enviar desde los buzones de Ofipapel. Usa «Compartir» para enviarlo con tu aplicación.', v_remitente using errcode = '22023';
  end if;
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


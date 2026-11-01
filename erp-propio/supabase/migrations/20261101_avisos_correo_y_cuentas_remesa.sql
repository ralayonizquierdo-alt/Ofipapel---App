-- (Luis, 01/11/2026, «adelante») Dos cosas de las remesas:
--
-- A) AVISOS POR CORREO de las devoluciones a los encargados de ventas.
--    · Parámetro «avisos.correos_devoluciones» (Archivo → Parámetros → Generales → Avisos por correo):
--      uno o varios correos separados por comas.
--    · Al devolverse un recibo se pone en la cola un correo para cada uno; cada mañana (lunes a sábado)
--      un recordatorio si queda alguna devolución sin decidir.
--    · correo_pendiente es la cola; la función del servidor «correo-enviar» la envía con el correo de la
--      empresa (Archivo → Datos de Empresa: servidor SMTP, usuario, puerto 465 + SSL). La contraseña NO
--      está en la base de datos ni en el programa: es el secreto SMTP_PASSWORD de las funciones de
--      Supabase (Project Settings → Edge Functions → Secrets). Sin ella los correos esperan en la cola.
--    · pg_cron llama a «correo-enviar» cada 10 minutos (pg_net).
--
-- B) CUENTAS DE CONTROL DE REMESAS (PGC):
--    · 4312 «Clientes, efectos comerciales en gestión de cobro»: al enviar la remesa al banco los recibos
--      pasan de la cuenta del cliente (430…) a la 4312. Su saldo = remesas enviadas sin cobrar.
--    · 4315 «Clientes, efectos comerciales impagados»: al devolverse un recibo pasa a la 4315 (contra el
--      banco). Su saldo = recibos devueltos pendientes de cobrar. Cuando el cliente paga ese recibo por
--      otra vía, el cobro sale de la 4315 (o de la 436 si se pasó a dudoso cobro).
--    · El abono de la remesa hace un solo asiento: banco (neto) + comisión / 4312 (total), y los cobros
--      quedan enlazados a él (Generar Asientos ya no los vuelve a contabilizar).

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- A. Cola de correos ------------------------------------------------------------------------------------
create table if not exists public.correo_pendiente (
  id bigint generated always as identity primary key,
  para text not null,
  asunto text not null,
  cuerpo_html text not null,
  origen text,
  creado_en timestamptz not null default now(),
  enviado_en timestamptz,
  intentos integer not null default 0,
  error text
);
create index if not exists correo_pendiente_cola_idx on public.correo_pendiente (creado_en) where enviado_en is null;
alter table public.correo_pendiente enable row level security;
drop policy if exists correo_pendiente_lee on public.correo_pendiente;
create policy correo_pendiente_lee on public.correo_pendiente for select to authenticated using (public.fn_es_administrador() or public.fn_es_super_administrador());

create or replace function public.fn_parametro_texto(p_clave text)
returns text language sql stable security definer set search_path = public as $$
  select nullif(btrim(valor #>> '{}'), '') from parametro where clave = p_clave
$$;

-- Pone un correo en la cola para cada dirección de la lista (separadas por comas o punto y coma).
create or replace function public.fn_correo_encolar(p_para text, p_asunto text, p_cuerpo text, p_origen text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare d text; n int := 0;
begin
  for d in select btrim(x) from regexp_split_to_table(coalesce(p_para, ''), '[,;]') x loop
    continue when d !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
    insert into correo_pendiente (para, asunto, cuerpo_html, origen) values (d, p_asunto, p_cuerpo, p_origen);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.fn_correo_encolar(text, text, text, text) from public, anon, authenticated;

-- Correo al devolverse un recibo.
create or replace function public.fn_remesa_recibo_aviso_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare c cliente; veces int; para text := fn_parametro_texto('avisos.correos_devoluciones');
begin
  if new.estado = 'devuelto' and old.estado is distinct from 'devuelto' and para is not null then
    select * into c from cliente where codigo = new.cliente_codigo;
    select count(*) into veces from remesa_recibo where cliente_codigo = new.cliente_codigo and estado = 'devuelto';
    perform fn_correo_encolar(para,
      format('Recibo devuelto: %s · %s €', coalesce(nullif(c.razon_social, ''), c.nombre, new.cliente_codigo), to_char(new.importe, 'FM999G999G990D00')),
      format('<p>El banco ha devuelto un recibo:</p><ul><li><b>Cliente:</b> %s · %s</li><li><b>Teléfono:</b> %s</li><li><b>Recibo:</b> %s (%s)</li>'
             || '<li><b>Importe:</b> %s €%s</li><li><b>Devuelto el:</b> %s</li><li><b>Devoluciones de este cliente:</b> %s</li></ul>'
             || '<p>%s</p><p>Hay que decidir qué hacer en <b>Avatar → Contabilidad → Remesas SEPA → Devoluciones</b>.</p>',
             new.cliente_codigo, coalesce(nullif(c.razon_social, ''), c.nombre, ''), coalesce(c.telefono_movil, c.telefono_fijo, '—'),
             new.e2e, coalesce(new.concepto, ''), to_char(new.importe, 'FM999G999G990D00'),
             case when coalesce(new.gasto_devolucion, 0) > 0 then ' + ' || to_char(new.gasto_devolucion, 'FM990D00') || ' € de gastos' else '' end,
             to_char(coalesce(new.devuelto_en, current_date), 'DD/MM/YYYY'), veces,
             case when veces >= 2 then '<b style="color:#c42b1c">⚠ Es la ' || veces || '.ª devolución de este cliente: se propone bloquearle el crédito.</b>' else '' end),
      'devolucion:' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_remesa_recibo_aviso on public.remesa_recibo;
create trigger trg_remesa_recibo_aviso after update of estado on public.remesa_recibo for each row execute function public.fn_remesa_recibo_aviso_trg();

-- Recordatorio diario de devoluciones sin decidir.
create or replace function public.fn_correo_recordatorio_devoluciones()
returns integer language plpgsql security definer set search_path = public as $$
declare n int; filas text; para text := fn_parametro_texto('avisos.correos_devoluciones');
begin
  if para is null then return 0; end if;
  select count(*), string_agg(format('<li>%s · %s · %s € (devuelto el %s)</li>', x.cliente_codigo, coalesce(nullif(c.razon_social, ''), c.nombre, ''),
           to_char(x.importe, 'FM999G999G990D00'), to_char(x.devuelto_en, 'DD/MM/YYYY')), '' order by x.devuelto_en)
    into n, filas
    from remesa_recibo x left join cliente c on c.codigo = x.cliente_codigo
   where x.estado = 'devuelto' and x.decision is null;
  if n = 0 then return 0; end if;
  return fn_correo_encolar(para, format('Recordatorio: %s recibo(s) devuelto(s) sin decidir', n),
    '<p>Siguen pendientes de decidir estas devoluciones:</p><ul>' || filas || '</ul><p>Avatar → Contabilidad → Remesas SEPA → Devoluciones.</p>',
    'recordatorio_devoluciones');
end $$;
revoke execute on function public.fn_correo_recordatorio_devoluciones() from public, anon, authenticated;

-- Tareas programadas: recordatorio (lunes a sábado, 8:31 UTC ≈ 8:31 en Canarias en invierno) y envío de la cola.
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('erp_recordatorio_devoluciones', 'erp_enviar_correos');
  perform cron.schedule('erp_recordatorio_devoluciones', '31 8 * * 1-6', 'select public.fn_correo_recordatorio_devoluciones()');
  perform cron.schedule('erp_enviar_correos', '*/10 * * * *',
    $c$select net.http_post(url := 'https://sufxvpiwcncnyltrvoun.supabase.co/functions/v1/correo-enviar', body := '{}'::jsonb,
         headers := '{"Content-Type": "application/json"}'::jsonb) where exists (select 1 from public.correo_pendiente where enviado_en is null and intentos < 5)$c$);
end $$;

-- B. Cuentas 4312 / 4315 --------------------------------------------------------------------------------
insert into public.cuenta_contable (empresa_id, codigo, descripcion, tipo)
select public.fn_contab_empresa_principal(), x.c, x.d, 'Activo'
  from (values ('43120000', 'Clientes, efectos comerciales en gestión de cobro'), ('43150000', 'Clientes, efectos comerciales impagados'),
               ('43600000', 'Clientes de dudoso cobro')) x(c, d)
on conflict do nothing;

alter table public.remesa add column if not exists asiento_envio_id bigint references public.asiento (id);
alter table public.remesa add column if not exists asiento_abono_id bigint references public.asiento (id);

-- Cuenta en la que está la deuda de un vencimiento que ya se devolvió: 4315 (o 436 si se pasó a dudoso
-- cobro). Null si nunca se devolvió (está en la cuenta del cliente).
create or replace function public.fn_contab_cuenta_impagado(p_tienda text, p_codigo bigint)
returns text language sql stable security definer set search_path = public as $$
  select case when bool_or(coalesce(r.decision, '[]') ? 'dudoso_cobro') then '43600000' else '43150000' end
    from cobro_cliente k
    join cobro_cliente k0 on k0.factura_tienda_codigo = k.factura_tienda_codigo and k0.factura_numero = k.factura_numero
                         and k0.id_pago is not distinct from k.id_pago
    join remesa_recibo r on r.cobro_tienda_codigo = k0.tienda_terminal_codigo and r.cobro_codigo = k0.codigo_pago and r.estado = 'devuelto'
   where k.tienda_terminal_codigo = p_tienda and k.codigo_pago = p_codigo and k.factura_numero is not null
  having count(*) > 0
$$;

-- Asiento del envío de una remesa: 4312 al Debe / cuenta de cada recibo (cliente, o 4315 si es uno
-- devuelto que se vuelve a pasar) al Haber.
create or replace function public.fn_remesa_asiento_envio(p_id bigint, p_fecha date)
returns bigint language plpgsql security definer set search_path = public as $$
declare re remesa; ap contab_apunte_t[] := '{}'; x record; v_id bigint;
begin
  select * into re from remesa where id = p_id for update;
  if re.asiento_envio_id is not null then return re.asiento_envio_id; end if;
  for x in select r.*, coalesce(fn_contab_cuenta_impagado(r.cobro_tienda_codigo, r.cobro_codigo), fn_contab_cuenta_cliente(r.cliente_codigo)) cta
             from remesa_recibo r where r.remesa_id = p_id and r.estado = 'incluido' loop
    ap := ap || fn_contab_ap(x.cta, -x.importe, 'Remesa ' || re.referencia || ' · ' || x.e2e, x.e2e);
  end loop;
  if cardinality(ap) = 0 then return null; end if;
  ap := ap || fn_contab_ap('43120000', re.total, 'Remesa ' || re.referencia || ' enviada al banco', re.referencia);
  v_id := fn_contab_crear_asiento(p_fecha, 'Remesa ' || re.referencia || ' enviada al banco', 'remesa_envio', null, re.id, re.referencia, ap, '[]', null, false, null, null);
  update remesa set asiento_envio_id = v_id where id = p_id;
  return v_id;
end $$;
revoke execute on function public.fn_remesa_asiento_envio(bigint, date) from public, anon, authenticated;

create or replace function public.fn_remesa_marcar(p_id bigint, p_estado text, p_xml text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r remesa;
begin
  perform fn_remesa_permiso();
  select * into r from remesa where id = p_id for update;
  if not found then raise exception 'No existe la remesa %.', p_id; end if;
  if r.estado in ('abonada', 'anulada') then raise exception 'La remesa % ya está %.', r.referencia, r.estado; end if;
  if p_estado = 'generada' then
    update remesa set estado = case when estado = 'enviada' then 'enviada' else 'generada' end, fichero_xml = p_xml, generada_en = now() where id = p_id;
  elsif p_estado = 'enviada' then
    if r.fichero_xml is null then raise exception 'Primero descarga el fichero de la remesa.'; end if;
    update remesa set estado = 'enviada' where id = p_id;
    perform fn_remesa_asiento_envio(p_id, (now() at time zone 'Atlantic/Canary')::date);
  elsif p_estado = 'anulada' then
    if r.asiento_envio_id is not null then
      perform fn_contab_anular_interno(r.asiento_envio_id, 'Remesa ' || r.referencia || ' anulada');
    end if;
    update remesa set estado = 'anulada' where id = p_id;
    update remesa_recibo set estado = 'anulado' where remesa_id = p_id and estado = 'incluido';
  else
    raise exception 'Estado no válido.';
  end if;
end $$;

-- Al anular o devolver un cobro: si su asiento es el abono de una remesa (lleva varios cobros), no se
-- deshace entero: asiento solo de ese recibo, banco al Haber contra 4315 (devolución) o la cuenta
-- donde estaba la deuda (anulación a mano).
create or replace function public.fn_contab_revertir_cobro(p_tienda text, p_codigo bigint, p_motivo text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare g record; ap contab_apunte_t[]; v_id bigint; v_fecha date; v_imp numeric; v_banco text; v_cta text; k cobro_cliente;
begin
  v_fecha := coalesce(nullif(current_setting('erp.fecha_reversion', true), '')::date, (now() at time zone 'Atlantic/Canary')::date);
  for g in select a.*, ad.importe doc_importe from asiento_documento ad join asiento a on a.id = ad.asiento_id
            where ad.activo and ad.doc_tipo = 'cobro' and ad.tienda_codigo = p_tienda and ad.numero = p_codigo and a.estado <> 'anulado' loop
    if g.estado = 'correcto' and g.origen_tipo = 'remesa' then
      select * into k from cobro_cliente where tienda_terminal_codigo = p_tienda and codigo_pago = p_codigo;
      v_imp := coalesce(g.doc_importe, k.importe_cobrado);
      select p.cuenta into v_banco from apunte p where p.asiento_id = g.id and p.debe > 0 and p.cuenta like '57%' order by p.debe desc limit 1;
      v_cta := case when current_setting('erp.devolucion', true) = 'on' then '43150000'
                    else coalesce(fn_contab_cuenta_impagado(p_tienda, p_codigo), fn_contab_cuenta_cliente(k.cliente_codigo)) end;
      ap := array[fn_contab_ap(v_cta, v_imp, left(coalesce(nullif(btrim(p_motivo), ''), 'Anulación cobro') || ' · ' || g.concepto, 120), g.origen_referencia),
                  fn_contab_ap(v_banco, -v_imp, left(coalesce(nullif(btrim(p_motivo), ''), 'Anulación cobro') || ' · ' || g.concepto, 120), g.origen_referencia)];
      v_id := fn_contab_crear_asiento(greatest(v_fecha, g.fecha),
                left(case when current_setting('erp.devolucion', true) = 'on' then 'Recibo devuelto ' else 'Anulación cobro ' end || p_tienda || '-' || p_codigo
                     || coalesce(' (' || nullif(btrim(p_motivo), '') || ')', ''), 200),
                'cobro_anulacion', p_tienda, p_codigo, g.origen_referencia, ap, '[]'::jsonb, null, false, null, null);
    elsif g.estado = 'correcto' then
      select coalesce(array_agg(fn_contab_ap(p.cuenta, p.haber - p.debe, 'Anulación: ' || coalesce(p.concepto, g.concepto), p.documento,
               p.nif, p.tercero_nombre, p.igic_tipo, -p.igic_base) order by p.linea), '{}')
        into ap from apunte p where p.asiento_id = g.id;
      v_id := fn_contab_crear_asiento(greatest(v_fecha, g.fecha), left('Anulación de ' || g.concepto || coalesce(' (' || nullif(btrim(p_motivo), '') || ')', ''), 200),
                'cobro_anulacion', p_tienda, p_codigo, g.origen_referencia, ap, '[]'::jsonb, null, false, null, g.id);
    else
      perform fn_contab_anular_interno(g.id, 'Cobro anulado o devuelto');
    end if;
    update asiento_documento set activo = false where asiento_id = g.id and doc_tipo = 'cobro' and tienda_codigo = p_tienda and numero = p_codigo;
  end loop;
  return v_id;
end $$;
revoke execute on function public.fn_contab_revertir_cobro(text, bigint, text) from public, anon, authenticated;

-- Conciliación: abono de remesa con un solo asiento (banco + comisión / 4312) enlazado a sus cobros;
-- devolución con 4315 (por el disparador) y gastos aparte.
create or replace function public.fn_concilia_confirmar(p_mov bigint)
returns void language plpgsql security definer set search_path = public as $$
declare x record; prop jsonb; re remesa; rc record; v_as bigint; ap contab_apunte_t[]; docs jsonb := '[]'; v_com numeric;
begin
  select * into x from fn_concilia_mov(p_mov);
  prop := (x.m).propuesta;
  if coalesce(prop->>'tipo', '') not in ('remesa', 'devolucion') then
    perform fn_concilia_confirmar_base(p_mov);
    return;
  end if;
  if prop->>'tipo' = 'remesa' then
    select * into re from remesa where id = (prop->>'remesa_id')::bigint for update;
    if not found or re.estado not in ('generada', 'enviada') then raise exception 'La remesa ya no está pendiente de abono.'; end if;
    -- Si no se marcó como enviada, el asiento del envío (430 → 4312) se hace ahora.
    perform fn_remesa_asiento_envio(re.id, least((x.m).fecha_operacion, (now() at time zone 'Atlantic/Canary')::date));
    for rc in select r.*, k.factura_tienda_codigo ft, k.factura_numero fn, k.forma_pago_codigo fp
                from remesa_recibo r join cobro_cliente k on k.tienda_terminal_codigo = r.cobro_tienda_codigo and k.codigo_pago = r.cobro_codigo
               where r.remesa_id = re.id and r.estado = 'incluido' loop
      if rc.fn is null then raise exception 'El recibo % no es de una factura.', rc.e2e; end if;
      perform fn_cobro_cliente_cobrar(jsonb_build_object(
        'factura_t', rc.ft, 'factura_n', rc.fn, 'importe', rc.importe, 'fecha_pago', (x.m).fecha_operacion,
        'forma_pago_codigo', rc.fp, 'cuenta_contable', (x.b).cuenta_contable, 'numero_documento_pago', rc.e2e,
        'concepto', 'Remesa ' || re.referencia, 'vencimiento_t', rc.cobro_tienda_codigo, 'vencimiento_codigo', rc.cobro_codigo));
      update remesa_recibo set estado = 'cobrado' where id = rc.id;
      docs := docs || jsonb_build_object('tipo', 'cobro', 'tienda', rc.cobro_tienda_codigo, 'numero', rc.cobro_codigo,
                                         'fecha', (x.m).fecha_operacion, 'importe', rc.importe);
    end loop;
    v_com := coalesce((prop->>'comision')::numeric, 0);
    ap := array[fn_contab_ap((x.b).cuenta_contable, re.total - v_com, 'Abono remesa ' || re.referencia, re.referencia)];
    if v_com > 0 then
      ap := ap || fn_contab_ap((x.b).cuenta_comisiones, v_com, 'Comisión remesa ' || re.referencia, re.referencia);
    end if;
    ap := ap || fn_contab_ap('43120000', -re.total, 'Abono remesa ' || re.referencia, re.referencia);
    v_as := fn_contab_crear_asiento((x.m).fecha_operacion, 'Abono remesa ' || re.referencia, 'remesa', null, re.id, re.referencia, ap, docs, null, false, null, null);
    update remesa set estado = 'abonada', abonada_en = (x.m).fecha_operacion, abono_movimiento_id = p_mov,
                      comision = v_com, asiento_abono_id = v_as where id = re.id;
    update extracto_movimiento set conciliado = true, conciliado_tipo = 'remesa', asiento_generado_id = v_as,
           nota = 'Remesa ' || re.referencia, conciliado_en = now(), conciliado_por = fn_empleado_actual() where id = p_mov;
  else
    select r.*, rm.referencia into rc from remesa_recibo r join remesa rm on rm.id = r.remesa_id where r.id = (prop->>'recibo_id')::bigint for update of r;
    if not found or rc.estado <> 'cobrado' then raise exception 'El recibo ya no está cobrado.'; end if;
    -- El recibo vuelve a quedar pendiente; el disparador hace el asiento 4315 / banco con la fecha del cargo.
    perform set_config('erp.fecha_reversion', (x.m).fecha_operacion::text, true);
    perform set_config('erp.devolucion', 'on', true);
    perform fn_cobro_cliente_anular(rc.cobro_tienda_codigo, rc.cobro_codigo, 'Devuelto por el banco (' || rc.e2e || ')');
    perform set_config('erp.devolucion', '', true);
    perform set_config('erp.fecha_reversion', '', true);
    -- deja de ser domiciliado: no vuelve solo a la próxima remesa; el cliente paga por otros medios
    -- salvo que el jefe de ventas decida volver a remesarlo (fn_remesa_devolucion_decidir).
    update cobro_cliente set es_domiciliado = false, actualizado_en = now()
     where activo and estado_cobro = 'pendiente' and tienda_terminal_codigo = rc.cobro_tienda_codigo and codigo_pago = rc.cobro_codigo;
    if coalesce((prop->>'gasto')::numeric, 0) > 0 then
      ap := array[fn_contab_ap((x.b).cuenta_comisiones, (prop->>'gasto')::numeric, 'Gastos devolución ' || rc.e2e, rc.e2e),
                  fn_contab_ap((x.b).cuenta_contable, -(prop->>'gasto')::numeric, 'Gastos devolución ' || rc.e2e, rc.e2e)];
      v_as := fn_contab_crear_asiento((x.m).fecha_operacion, 'Gastos devolución recibo ' || rc.e2e, 'manual', null, null, 'banco:' || p_mov, ap, '[]', null, false, null, null);
    end if;
    update remesa_recibo set estado = 'devuelto', devuelto_en = (x.m).fecha_operacion, devolucion_movimiento_id = p_mov,
                             gasto_devolucion = (prop->>'gasto')::numeric where id = rc.id;
    update extracto_movimiento set conciliado = true, conciliado_tipo = 'devolucion', asiento_generado_id = v_as,
           nota = 'Devolución ' || rc.e2e, conciliado_en = now(), conciliado_por = fn_empleado_actual() where id = p_mov;
  end if;
end $$;

-- Dudoso cobro: la deuda pasa de la 4315 (recibo devuelto) a la 436.
do $$
declare def text;
begin
  def := pg_get_functiondef('public.fn_remesa_devolucion_decidir(bigint, text[], text, date)'::regprocedure);
  if def !~ 'desde la 4315' then
    def := replace(def, $x$        cta := fn_contab_cuenta_cliente(r.cliente_codigo);
        ap := array[fn_contab_ap(v_436,$x$, $x$        cta := '43150000'; -- desde la 4315 (recibo devuelto)
        ap := array[fn_contab_ap(v_436,$x$);
    if def !~ 'desde la 4315' then raise exception 'no aplicado (dudoso)'; end if;
    execute def;
  end if;
end $$;

-- Generar Asientos: el cobro de un recibo que se devolvió sale de la 4315 (o de la 436), no de la 430.
do $$
declare def text;
begin
  def := pg_get_functiondef('public.fn_contab_generar(date, date, text[], text, text)'::regprocedure);
  if def !~ 'fn_contab_cuenta_impagado' then
    def := replace(def, 'cta_cli := public.fn_contab_cuenta_cliente(c.cliente_codigo);',
                        'cta_cli := coalesce(public.fn_contab_cuenta_impagado(c.tienda_terminal_codigo, c.codigo_pago), public.fn_contab_cuenta_cliente(c.cliente_codigo));');
    if def !~ 'fn_contab_cuenta_impagado' then raise exception 'no aplicado (generar)'; end if;
    execute def;
  end if;
end $$;

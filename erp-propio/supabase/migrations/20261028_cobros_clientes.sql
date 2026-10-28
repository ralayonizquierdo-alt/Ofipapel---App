-- Gestor de pagos de clientes (cobros) — Facturación → Gestor de Pagos de Clientes y
-- Clientes → Pagos de Clientes, Cobros. Tabla PAGOSCLI de GeminisWin → cobro_cliente.
--
-- Toda la lógica del cobro vive aquí (no en la pantalla):
--   · fn_cobro_cliente_cobrar(p jsonb)        cobra (total o parcial) una factura o una venta
--   · fn_cobro_cliente_anular(t, codigo, motivo) anula un cobro y deshace su efecto
--   · fn_cobro_generar_vencimientos(t, n)     crea los vencimientos pendientes de una factura
-- Un cobro con forma de pago de contado genera un ingreso en la caja abierta de la tienda
-- (movimiento_caja tipo COB, documento «cobro»: la contabilidad ya lo excluye de los asientos
-- de caja porque lo contabiliza como cobro). Al cobrar o anular se actualizan total_pagado,
-- total_pendiente, fecha_pago, numero_pagos y estado de la factura y de sus albaranes, o de la
-- venta si se cobra una venta sin facturar.

-- 1. Columnas de enlace del cobro: forma de pago y movimiento de caja que generó.
alter table public.cobro_cliente add column if not exists forma_pago_codigo text;
alter table public.cobro_cliente add column if not exists movimiento_tienda_codigo text;
alter table public.cobro_cliente add column if not exists movimiento_numero bigint;
create index if not exists idx_cobro_cliente_factura on public.cobro_cliente (factura_tienda_codigo, factura_numero);
create index if not exists idx_cobro_cliente_venta on public.cobro_cliente (venta_relacionada_tienda_codigo, venta_relacionada_numero);
create index if not exists idx_cobro_cliente_cliente on public.cobro_cliente (cliente_codigo);

-- 2. La factura sigue siendo inmutable (VeriFactu), salvo su situación de cobro: lo pagado, lo
--    pendiente, la fecha de pago, el nº de pagos y el estado emitida/parcial/pagada no forman
--    parte del registro de facturación ni de su huella.
create or replace function public.fn_factura_bloquear_modificacion()
 returns trigger
 language plpgsql
as $function$
declare
  v_cobro constant text[] := array['total_pagado', 'total_pagos', 'total_pendiente', 'fecha_pago', 'numero_pagos', 'estado', 'actualizado_en'];
begin
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - v_cobro) = (to_jsonb(old) - v_cobro)
     and (new.estado is not distinct from old.estado
          or (coalesce(old.estado, 'emitida') in ('emitida', 'parcial', 'pagada') and new.estado in ('emitida', 'parcial', 'pagada'))) then
    return new;
  end if;
  raise exception 'Las facturas son inmutables (obligación legal Veri*Factu): no se pueden editar ni borrar. Emite una factura rectificativa en su lugar.';
end;
$function$;

-- 3. Suma (o resta, si p_importe < 0) un cobro a la factura y reparte lo cobrado entre sus
--    albaranes (los más antiguos primero; al anular, se quita empezando por los más recientes).
create or replace function public.fn_cobro_aplicar_factura(p_tienda text, p_numero bigint, p_importe numeric, p_fecha date, p_n_pagos int)
 returns void
 language plpgsql
 set search_path to 'public'
as $function$
declare
  f public.factura;
  v_pagado numeric;
  v_pend numeric;
  v_resto numeric := abs(p_importe);
  v_x numeric;
  a record;
begin
  select * into f from public.factura where tienda_terminal_codigo = p_tienda and numero = p_numero for update;
  if not found then raise exception 'No existe la factura %-%.', p_tienda, p_numero; end if;
  v_pagado := round(coalesce(f.total_pagado, 0) + p_importe, 3);
  v_pend := round(coalesce(f.total, 0) - v_pagado, 3);
  update public.factura
     set total_pagado = v_pagado,
         total_pendiente = v_pend,
         numero_pagos = greatest(coalesce(numero_pagos, 0) + p_n_pagos, 0),
         fecha_pago = case when coalesce(f.total, 0) <> 0 and abs(v_pend) <= 0.005 then coalesce(p_fecha, f.fecha_pago) else null end,
         estado = case when coalesce(f.estado, 'emitida') not in ('emitida', 'parcial', 'pagada') then f.estado
                       when coalesce(f.total, 0) <> 0 and abs(v_pend) <= 0.005 then 'pagada'
                       when abs(v_pagado) > 0.005 then 'parcial'
                       else 'emitida' end
   where tienda_terminal_codigo = p_tienda and numero = p_numero;

  -- Albaranes de la factura: el cobro de la factura también los da por cobrados.
  if p_importe > 0 then
    for a in select v.tienda_terminal_codigo t, v.numero n, coalesce(v.total, 0) total, coalesce(v.total_pagado, 0) pagado
               from public.venta v
              where v.factura_tienda_codigo = p_tienda and v.factura_numero = p_numero
                and coalesce(v.total, 0) - coalesce(v.total_pagado, 0) > 0.005
              order by v.fecha, v.tienda_terminal_codigo, v.numero
    loop
      exit when v_resto <= 0.005;
      v_x := least(v_resto, a.total - a.pagado);
      update public.venta
         set total_pagado = round(a.pagado + v_x, 3),
             total_pendiente = greatest(round(a.total - a.pagado - v_x, 3), 0),
             fecha_pago = case when a.total - a.pagado - v_x <= 0.005 then p_fecha else fecha_pago end
       where tienda_terminal_codigo = a.t and numero = a.n;
      v_resto := v_resto - v_x;
    end loop;
  elsif p_importe < 0 then
    for a in select v.tienda_terminal_codigo t, v.numero n, coalesce(v.total, 0) total, coalesce(v.total_pagado, 0) pagado
               from public.venta v
              where v.factura_tienda_codigo = p_tienda and v.factura_numero = p_numero and coalesce(v.total_pagado, 0) > 0.005
              order by v.fecha desc, v.tienda_terminal_codigo desc, v.numero desc
    loop
      exit when v_resto <= 0.005;
      v_x := least(v_resto, a.pagado);
      update public.venta
         set total_pagado = round(a.pagado - v_x, 3),
             total_pendiente = greatest(round(a.total - a.pagado + v_x, 3), 0),
             fecha_pago = null
       where tienda_terminal_codigo = a.t and numero = a.n;
      v_resto := v_resto - v_x;
    end loop;
  end if;
end $function$;

-- 4. Lo mismo para una venta (ticket o albarán) sin facturar.
create or replace function public.fn_cobro_aplicar_venta(p_tienda text, p_numero bigint, p_importe numeric, p_fecha date, p_tipo_contado smallint)
 returns void
 language plpgsql
 set search_path to 'public'
as $function$
declare v public.venta; v_pagado numeric;
begin
  select * into v from public.venta where tienda_terminal_codigo = p_tienda and numero = p_numero for update;
  if not found then raise exception 'No existe la venta %-%.', p_tienda, p_numero; end if;
  v_pagado := round(coalesce(v.total_pagado, 0) + p_importe, 3);
  update public.venta
     set total_pagado = v_pagado,
         total_pendiente = greatest(round(coalesce(v.total, 0) - v_pagado, 3), 0),
         fecha_pago = case when coalesce(v.total, 0) - v_pagado <= 0.005 then coalesce(p_fecha, v.fecha_pago) else null end,
         total_efectivo = case when p_tipo_contado = 1 then round(coalesce(v.total_efectivo, 0) + p_importe, 3) else total_efectivo end,
         total_tarjeta = case when p_tipo_contado = 2 then round(coalesce(v.total_tarjeta, 0) + p_importe, 3) else total_tarjeta end,
         total_cheque = case when p_tipo_contado = 3 then round(coalesce(v.total_cheque, 0) + p_importe, 3) else total_cheque end
   where tienda_terminal_codigo = p_tienda and numero = p_numero;
end $function$;

-- 5. Texto de tipo_pago a partir de la forma de pago (el mismo que guarda el TPV y que usa la
--    contabilidad para elegir la cuenta: efectivo → caja, tarjeta → tarjetas, resto → bancos).
create or replace function public.fn_cobro_tipo_pago(fp public.forma_pago)
 returns text
 language sql
 immutable
as $function$
  select case when fp.codigo is null then null
              when fp.tipo = 4 and coalesce(fp.tipo_contado, 1) = 1 then 'efectivo'
              when fp.tipo = 4 and fp.tipo_contado = 2 then 'tarjeta'
              when fp.tipo = 4 and fp.tipo_contado = 3 then 'cheque'
              else fp.descripcion end
$function$;

-- 6. Cobrar. Parámetros (jsonb):
--    tienda            terminal donde se registra el cobro (y su caja); por defecto la del documento
--    factura_t / factura_n   factura a cobrar          (o bien)
--    venta_t / venta_n       venta sin facturar a cobrar
--    vencimiento_t / vencimiento_codigo  vencimiento que se cobra primero (opcional)
--    importe, fecha_pago, forma_pago_codigo, numero_documento_pago, concepto, cuenta_contable
-- Aplica el importe a los vencimientos pendientes (el indicado primero, luego por fecha de
-- vencimiento); si un vencimiento se cobra en parte, queda cobrado por lo entregado y se crea
-- otro pendiente por el resto. Lo que sobre (o si no hay vencimientos) se apunta como cobro
-- suelto. No deja cobrar más de lo pendiente.
create or replace function public.fn_cobro_cliente_cobrar(p jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_fac_t text := nullif(p->>'factura_t', '');
  v_fac_n bigint := nullif(p->>'factura_n', '')::bigint;
  v_vta_t text := nullif(p->>'venta_t', '');
  v_vta_n bigint := nullif(p->>'venta_n', '')::bigint;
  v_imp numeric := round(coalesce(nullif(p->>'importe', '')::numeric, 0), 3);
  v_fecha date := coalesce(nullif(p->>'fecha_pago', '')::date, (now() at time zone 'Atlantic/Canary')::date);
  v_doc_pago text := nullif(trim(coalesce(p->>'numero_documento_pago', '')), '');
  v_concepto text := nullif(trim(coalesce(p->>'concepto', '')), '');
  v_cuenta text := nullif(trim(coalesce(p->>'cuenta_contable', '')), '');
  v_venc_t text := nullif(p->>'vencimiento_t', '');
  v_venc_c bigint := nullif(p->>'vencimiento_codigo', '')::bigint;
  v_tienda text;
  v_cliente text;
  v_ref text;
  v_pend numeric;
  fp public.forma_pago;
  f public.factura;
  v public.venta;
  k public.cobro_cliente;
  v_ej bigint;
  v_mov bigint;
  v_resto numeric;
  v_falta numeric;
  v_cod bigint;
  v_codigos bigint[] := '{}';
  v_tipo_pago text;
begin
  if auth.uid() is null and session_user not in ('postgres', 'supabase_admin') then raise exception 'Sin sesión'; end if;
  if v_imp <= 0 then raise exception 'El importe a cobrar tiene que ser mayor que 0.'; end if;

  if v_fac_n is not null then
    select * into f from public.factura where tienda_terminal_codigo = v_fac_t and numero = v_fac_n for update;
    if not found then raise exception 'No existe la factura %-%.', v_fac_t, v_fac_n; end if;
    if public.fn_factura_anulada(v_fac_t, v_fac_n) then raise exception 'La factura %-% está anulada: no se puede cobrar.', v_fac_t, v_fac_n; end if;
    v_pend := round(coalesce(f.total_pendiente, coalesce(f.total, 0) - coalesce(f.total_pagado, 0)), 3);
    v_cliente := f.cliente_codigo;
    v_ref := 'Fra. ' || coalesce(f.serie, '') || '-' || coalesce(f.n_factura::text, f.numero::text);
    v_tienda := coalesce(nullif(p->>'tienda', ''), f.tienda_terminal_codigo);
  elsif v_vta_n is not null then
    select * into v from public.venta where tienda_terminal_codigo = v_vta_t and numero = v_vta_n for update;
    if not found then raise exception 'No existe la venta %-%.', v_vta_t, v_vta_n; end if;
    if v.anulada_en is not null then raise exception 'La venta %-% está anulada.', v_vta_t, v_vta_n; end if;
    if coalesce(v.aplazada, false) then raise exception 'La venta %-% está aplazada: complétala antes de cobrarla.', v_vta_t, v_vta_n; end if;
    if v.factura_numero is not null then
      raise exception 'La venta %-% está facturada en la factura %-%: cobra la factura.', v_vta_t, v_vta_n, v.factura_tienda_codigo, v.factura_numero;
    end if;
    v_pend := round(coalesce(v.total_pendiente, coalesce(v.total, 0) - coalesce(v.total_pagado, 0)), 3);
    v_cliente := v.cliente_codigo;
    v_ref := 'Venta ' || v.tienda_terminal_codigo || '-' || v.numero;
    v_tienda := coalesce(nullif(p->>'tienda', ''), v.tienda_terminal_codigo);
  else
    raise exception 'Indica la factura o la venta que se cobra.';
  end if;

  if v_pend <= 0.005 then raise exception '% no tiene importe pendiente de cobro.', v_ref; end if;
  if v_imp > v_pend + 0.005 then
    raise exception 'El importe (%) supera lo pendiente de % (%).', to_char(v_imp, 'FM999G999G990D00'), v_ref, to_char(v_pend, 'FM999G999G990D00');
  end if;

  select * into fp from public.forma_pago where codigo = nullif(p->>'forma_pago_codigo', '');
  if fp.codigo is null then raise exception 'Indica la forma de pago del cobro.'; end if;
  v_tipo_pago := public.fn_cobro_tipo_pago(fp);
  v_concepto := coalesce(v_concepto, 'Cobro ' || v_ref);

  -- Contado: ingreso en la caja abierta de la tienda.
  if fp.tipo = 4 then
    select ejercicio into v_ej from public.caja_apertura_cierre where tienda_terminal_codigo = v_tienda and not cerrado limit 1;
    if v_ej is null then
      raise exception 'No hay caja abierta en la tienda %: ábrela en Caja → Apertura de Caja para cobrar al contado.', v_tienda;
    end if;
    v_mov := public.fn_siguiente_numero(v_tienda, 'caja', '');
    insert into public.movimiento_caja (tienda_terminal_codigo, numero, fecha, hora, documento, es_ingreso, ingreso, gasto, concepto,
      tipo_movimiento, ajeno_tienda_codigo, ajeno_codigo, ajeno_codigo_2, forma_pago_codigo, tipo_forma_pago, tipo_contado,
      cliente_codigo, empleado_codigo, turno_tienda_codigo, turno_numero)
    values (v_tienda, v_mov, v_fecha, to_char(now() at time zone 'Atlantic/Canary', 'HH24:MI:SS'), 'cobro', true, v_imp, 0,
      left(v_concepto || ' - Cli. ' || coalesce(v_cliente, ''), 200), 'COB', coalesce(v_fac_t, v_vta_t), coalesce(v_fac_n, v_vta_n), v_ref,
      fp.codigo, 4, coalesce(fp.tipo_contado, 1), v_cliente, public.fn_empleado_actual(), v_tienda, v_ej);
  end if;

  -- Vencimientos pendientes del documento.
  v_resto := v_imp;
  for k in
    select * from public.cobro_cliente c
     where c.activo and coalesce(c.estado_cobro, '') = 'pendiente'
       and ((v_fac_n is not null and c.factura_tienda_codigo = v_fac_t and c.factura_numero = v_fac_n)
         or (v_vta_n is not null and c.venta_relacionada_tienda_codigo = v_vta_t and c.venta_relacionada_numero = v_vta_n))
     order by coalesce(c.tienda_terminal_codigo = v_venc_t and c.codigo_pago = v_venc_c, false) desc, c.fecha_vencimiento nulls last, c.codigo_pago
     for update
  loop
    exit when v_resto <= 0.005;
    v_falta := round(coalesce(k.cuota, 0) - coalesce(k.importe_cobrado, 0), 3);
    continue when v_falta <= 0.005;
    if v_resto >= v_falta - 0.005 then
      update public.cobro_cliente
         set estado_cobro = 'cobrado', importe_cobrado = coalesce(k.importe_cobrado, 0) + v_falta, fecha_pago = v_fecha,
             forma_pago_codigo = fp.codigo, tipo_pago = v_tipo_pago, numero_documento_pago = coalesce(v_doc_pago, numero_documento_pago),
             cuenta_contable = coalesce(v_cuenta, cuenta_contable), es_efecto = coalesce(fp.tipo = 2, false), es_domiciliado = coalesce(fp.domiciliacion_bancaria, false),
             movimiento_tienda_codigo = case when v_mov is not null then v_tienda end, movimiento_numero = v_mov, actualizado_en = now()
       where tienda_terminal_codigo = k.tienda_terminal_codigo and codigo_pago = k.codigo_pago;
      v_resto := round(v_resto - v_falta, 3);
    else
      -- Cobro parcial del vencimiento: queda cobrado por lo entregado y el resto, pendiente aparte.
      update public.cobro_cliente
         set estado_cobro = 'cobrado', cuota = coalesce(k.importe_cobrado, 0) + v_resto, importe_cobrado = coalesce(k.importe_cobrado, 0) + v_resto,
             fecha_pago = v_fecha, forma_pago_codigo = fp.codigo, tipo_pago = v_tipo_pago,
             numero_documento_pago = coalesce(v_doc_pago, numero_documento_pago), cuenta_contable = coalesce(v_cuenta, cuenta_contable),
             es_efecto = coalesce(fp.tipo = 2, false), es_domiciliado = coalesce(fp.domiciliacion_bancaria, false),
             movimiento_tienda_codigo = case when v_mov is not null then v_tienda end, movimiento_numero = v_mov, actualizado_en = now()
       where tienda_terminal_codigo = k.tienda_terminal_codigo and codigo_pago = k.codigo_pago;
      v_cod := public.fn_siguiente_numero(k.tienda_terminal_codigo, 'pago', '');
      insert into public.cobro_cliente (tienda_terminal_codigo, codigo_pago, cliente_codigo, factura_tienda_codigo, factura_numero,
        numero_factura_externo, id_pago, fecha, fecha_vencimiento, cuota, importe_cobrado, estado_cobro, tipo_pago, forma_pago_codigo,
        es_efecto, es_domiciliado, concepto, venta_relacionada_tienda_codigo, venta_relacionada_numero, cuenta_contable)
      values (k.tienda_terminal_codigo, v_cod, k.cliente_codigo, k.factura_tienda_codigo, k.factura_numero, k.numero_factura_externo,
        k.id_pago, k.fecha, k.fecha_vencimiento, round(v_falta - v_resto, 3), 0, 'pendiente', k.tipo_pago, k.forma_pago_codigo,
        k.es_efecto, k.es_domiciliado, k.concepto, k.venta_relacionada_tienda_codigo, k.venta_relacionada_numero, k.cuenta_contable);
      v_resto := 0;
    end if;
    v_codigos := v_codigos || k.codigo_pago;
  end loop;

  -- Lo que no cubre ningún vencimiento: cobro suelto.
  if v_resto > 0.005 then
    v_cod := public.fn_siguiente_numero(v_tienda, 'pago', '');
    insert into public.cobro_cliente (tienda_terminal_codigo, codigo_pago, cliente_codigo, factura_tienda_codigo, factura_numero,
      numero_factura_externo, fecha, fecha_pago, fecha_vencimiento, cuota, importe_cobrado, estado_cobro, tipo_pago, forma_pago_codigo,
      es_efecto, es_domiciliado, concepto, numero_documento_pago, venta_relacionada_tienda_codigo, venta_relacionada_numero,
      cuenta_contable, movimiento_tienda_codigo, movimiento_numero)
    values (v_tienda, v_cod, v_cliente, v_fac_t, v_fac_n,
      case when v_fac_n is not null then coalesce(f.serie, '') || '-' || coalesce(f.n_factura::text, '') end,
      v_fecha, v_fecha, v_fecha, v_resto, v_resto, 'cobrado', v_tipo_pago, fp.codigo,
      coalesce(fp.tipo = 2, false), coalesce(fp.domiciliacion_bancaria, false), v_concepto, v_doc_pago, v_vta_t, v_vta_n,
      v_cuenta, case when v_mov is not null then v_tienda end, v_mov);
    v_codigos := v_codigos || v_cod;
  end if;

  if v_fac_n is not null then
    perform public.fn_cobro_aplicar_factura(v_fac_t, v_fac_n, v_imp, v_fecha, 1);
  else
    perform public.fn_cobro_aplicar_venta(v_vta_t, v_vta_n, v_imp, v_fecha, case when fp.tipo = 4 then coalesce(fp.tipo_contado, 1) end::smallint);
  end if;

  return jsonb_build_object('tienda', v_tienda, 'codigos', to_jsonb(v_codigos), 'movimiento', v_mov, 'importe', v_imp,
    'pendiente', round(v_pend - v_imp, 3));
end $function$;

-- 7. Anular un cobro. Si era un vencimiento generado (id_pago), vuelve a quedar pendiente; si era
--    un cobro suelto, se da de baja (baja lógica). El ingreso de caja se descuenta del movimiento
--    si su caja sigue abierta; si ya se cerró, se apunta una salida en la caja abierta.
create or replace function public.fn_cobro_cliente_anular(p_tienda text, p_codigo bigint, p_motivo text default null)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  k public.cobro_cliente;
  m public.movimiento_caja;
  hermano public.cobro_cliente;
  v_imp numeric;
  v_abierta boolean;
  v_ej bigint;
  v_mov bigint;
  v_tc smallint;
begin
  if auth.uid() is null and session_user not in ('postgres', 'supabase_admin') then raise exception 'Sin sesión'; end if;
  select * into k from public.cobro_cliente where tienda_terminal_codigo = p_tienda and codigo_pago = p_codigo for update;
  if not found then raise exception 'No existe el cobro %-%.', p_tienda, p_codigo; end if;
  if not k.activo or coalesce(k.estado_cobro, '') <> 'cobrado' then
    raise exception 'El cobro %-% no está cobrado: no hay nada que anular.', p_tienda, p_codigo;
  end if;
  if k.factura_numero is null and k.venta_relacionada_numero is not null
     and exists (select 1 from public.venta v where v.tienda_terminal_codigo = k.venta_relacionada_tienda_codigo
                   and v.numero = k.venta_relacionada_numero and v.fecha = coalesce(k.fecha_pago, k.fecha)
                   and k.concepto like 'Venta %') then
    raise exception 'El cobro %-% se hizo al grabar la venta en el TPV: anúlalo desde la propia venta.', p_tienda, p_codigo;
  end if;
  v_imp := round(coalesce(k.importe_cobrado, 0), 3);

  -- Caja
  if k.movimiento_numero is not null then
    select * into m from public.movimiento_caja where tienda_terminal_codigo = k.movimiento_tienda_codigo and numero = k.movimiento_numero for update;
    if found then
      v_tc := m.tipo_contado;
      select not c.cerrado into v_abierta from public.caja_apertura_cierre c
       where c.tienda_terminal_codigo = m.turno_tienda_codigo and c.ejercicio = m.turno_numero;
      if coalesce(v_abierta, false) then
        update public.movimiento_caja
           set ingreso = greatest(round(coalesce(ingreso, 0) - v_imp, 3), 0),
               concepto = left(case when coalesce(ingreso, 0) - v_imp <= 0.005 then 'ANULADO — ' else 'Anul. parcial — ' end || coalesce(concepto, ''), 200),
               actualizado_en = now()
         where tienda_terminal_codigo = m.tienda_terminal_codigo and numero = m.numero;
      else
        select ejercicio into v_ej from public.caja_apertura_cierre where tienda_terminal_codigo = k.movimiento_tienda_codigo and not cerrado limit 1;
        if v_ej is null then
          raise exception 'El cobro entró en una caja ya cerrada y no hay caja abierta en la tienda % para devolver el importe: abre la caja.', k.movimiento_tienda_codigo;
        end if;
        v_mov := public.fn_siguiente_numero(k.movimiento_tienda_codigo, 'caja', '');
        insert into public.movimiento_caja (tienda_terminal_codigo, numero, fecha, hora, documento, es_ingreso, ingreso, gasto, concepto,
          tipo_movimiento, ajeno_tienda_codigo, ajeno_codigo, ajeno_codigo_2, forma_pago_codigo, tipo_forma_pago, tipo_contado,
          cliente_codigo, empleado_codigo, turno_tienda_codigo, turno_numero)
        values (k.movimiento_tienda_codigo, v_mov, (now() at time zone 'Atlantic/Canary')::date, to_char(now() at time zone 'Atlantic/Canary', 'HH24:MI:SS'),
          'cobro', false, 0, v_imp, left('Anulación cobro ' || p_tienda || '-' || p_codigo || ' - ' || coalesce(k.concepto, ''), 200), 'COB',
          m.ajeno_tienda_codigo, m.ajeno_codigo, m.ajeno_codigo_2, m.forma_pago_codigo, m.tipo_forma_pago, m.tipo_contado,
          k.cliente_codigo, public.fn_empleado_actual(), k.movimiento_tienda_codigo, v_ej);
      end if;
    end if;
  end if;

  -- El cobro
  if k.id_pago is not null then
    -- Vencimiento generado: vuelve a pendiente (juntándose con el resto pendiente del mismo plazo).
    select * into hermano from public.cobro_cliente c
     where c.activo and coalesce(c.estado_cobro, '') = 'pendiente' and c.id_pago = k.id_pago
       and c.factura_tienda_codigo is not distinct from k.factura_tienda_codigo and c.factura_numero is not distinct from k.factura_numero
       and c.venta_relacionada_tienda_codigo is not distinct from k.venta_relacionada_tienda_codigo
       and c.venta_relacionada_numero is not distinct from k.venta_relacionada_numero
     limit 1 for update;
    if found then
      update public.cobro_cliente set cuota = round(coalesce(cuota, 0) + v_imp, 3), actualizado_en = now()
       where tienda_terminal_codigo = hermano.tienda_terminal_codigo and codigo_pago = hermano.codigo_pago;
      update public.cobro_cliente
         set activo = false, estado_cobro = 'anulado', actualizado_en = now(),
             concepto = left('ANULADO' || coalesce(' (' || nullif(trim(p_motivo), '') || ')', '') || ' — ' || coalesce(concepto, ''), 200)
       where tienda_terminal_codigo = p_tienda and codigo_pago = p_codigo;
    else
      update public.cobro_cliente
         set estado_cobro = 'pendiente', importe_cobrado = 0, fecha_pago = null, numero_documento_pago = null,
             movimiento_tienda_codigo = null, movimiento_numero = null, actualizado_en = now()
       where tienda_terminal_codigo = p_tienda and codigo_pago = p_codigo;
    end if;
  else
    update public.cobro_cliente
       set activo = false, estado_cobro = 'anulado', actualizado_en = now(),
           concepto = left('ANULADO' || coalesce(' (' || nullif(trim(p_motivo), '') || ')', '') || ' — ' || coalesce(concepto, ''), 200)
     where tienda_terminal_codigo = p_tienda and codigo_pago = p_codigo;
  end if;

  -- Documento
  if k.factura_numero is not null then
    perform public.fn_cobro_aplicar_factura(k.factura_tienda_codigo, k.factura_numero, -v_imp, null, -1);
  elsif k.venta_relacionada_numero is not null then
    perform public.fn_cobro_aplicar_venta(k.venta_relacionada_tienda_codigo, k.venta_relacionada_numero, -v_imp, null, v_tc);
  end if;

  return jsonb_build_object('importe', v_imp, 'movimiento_salida', v_mov);
end $function$;

-- 8. Generar los vencimientos pendientes de una factura (botón «G. Pagos Factura» del gestor; la
--    ficha de la factura hace lo mismo con «Generar Pagos»). Plazos: días de pago 1 y 2 de la
--    ficha del cliente o, si no tiene, nº de pagos y cadencias de la forma de pago.
create or replace function public.fn_cobro_generar_vencimientos(p_tienda text, p_numero bigint)
 returns int
 language plpgsql
 set search_path to 'public'
as $function$
declare
  f public.factura;
  c public.cliente;
  fp public.forma_pago;
  v_pend numeric;
  v_dias int[] := '{}';
  v_n int;
  v_acum int := 0;
  v_cuota numeric;
  v_rep numeric := 0;
  v_id int;
  v_cod bigint;
  i int;
begin
  if auth.uid() is null and session_user not in ('postgres', 'supabase_admin') then raise exception 'Sin sesión'; end if;
  select * into f from public.factura where tienda_terminal_codigo = p_tienda and numero = p_numero;
  if not found then raise exception 'No existe la factura %-%.', p_tienda, p_numero; end if;
  if public.fn_factura_anulada(p_tienda, p_numero) then raise exception 'La factura %-% está anulada.', p_tienda, p_numero; end if;
  select round(coalesce(f.total_pendiente, coalesce(f.total, 0) - coalesce(f.total_pagado, 0))
               - coalesce(sum(coalesce(k.cuota, 0) - coalesce(k.importe_cobrado, 0)), 0), 3)
    into v_pend
    from public.cobro_cliente k
   where k.activo and coalesce(k.estado_cobro, '') = 'pendiente' and k.factura_tienda_codigo = p_tienda and k.factura_numero = p_numero;
  if v_pend <= 0.005 then return 0; end if;

  select * into c from public.cliente where codigo = f.cliente_codigo;
  select * into fp from public.forma_pago where codigo = f.forma_pago_codigo;
  if coalesce(c.dias_pago_1, 0) > 0 then v_dias := v_dias || c.dias_pago_1::int; end if;
  if coalesce(c.dias_pago_2, 0) > 0 then v_dias := v_dias || c.dias_pago_2::int; end if;
  if cardinality(v_dias) = 0 then
    v_n := greatest(coalesce(fp.generador_num_pagos, 1), 1);
    for i in 0 .. v_n - 1 loop
      v_acum := v_acum + coalesce((array[fp.cadencia_nivel0, fp.cadencia_nivel1, fp.cadencia_nivel2, fp.cadencia_nivel3,
                                         fp.cadencia_nivel4, fp.cadencia_nivel5, fp.cadencia_nivel6])[least(i, 6) + 1], 0)::int;
      v_dias := v_dias || v_acum;
    end loop;
  end if;
  v_n := cardinality(v_dias);
  select coalesce(max(id_pago), 0) into v_id from public.cobro_cliente where factura_tienda_codigo = p_tienda and factura_numero = p_numero;
  for i in 1 .. v_n loop
    v_cuota := case when i = v_n then round(v_pend - v_rep, 3) else round(v_pend / v_n, 2) end;
    v_rep := v_rep + v_cuota;
    v_cod := public.fn_siguiente_numero(p_tienda, 'pago', '');
    insert into public.cobro_cliente (tienda_terminal_codigo, codigo_pago, cliente_codigo, factura_tienda_codigo, factura_numero,
      numero_factura_externo, id_pago, fecha, fecha_vencimiento, cuota, importe_cobrado, estado_cobro, tipo_pago, forma_pago_codigo,
      es_efecto, es_domiciliado, concepto)
    values (p_tienda, v_cod, f.cliente_codigo, p_tienda, p_numero, coalesce(f.serie, '') || '-' || coalesce(f.n_factura::text, ''),
      v_id + i, (now() at time zone 'Atlantic/Canary')::date, f.fecha_factura + v_dias[i], v_cuota, 0, 'pendiente',
      public.fn_cobro_tipo_pago(fp), fp.codigo, coalesce(fp.tipo = 2, false), coalesce(fp.domiciliacion_bancaria, false),
      'Fra. ' || coalesce(f.serie, '') || '-' || coalesce(f.n_factura::text, '') || ' ' || i || ' de ' || v_n);
  end loop;
  return v_n;
end $function$;

grant execute on function public.fn_cobro_cliente_cobrar(jsonb) to authenticated;
grant execute on function public.fn_cobro_cliente_anular(text, bigint, text) to authenticated;
grant execute on function public.fn_cobro_generar_vencimientos(text, bigint) to authenticated;

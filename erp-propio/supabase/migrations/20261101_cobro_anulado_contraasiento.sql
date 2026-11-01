-- Fallo corregido (Luis, 01/11/2026; incidencia del Registro de incidencias): al anular un cobro a mano
-- (fn_cobro_cliente_anular) o al devolverse un recibo, el asiento del cobro seguía vigente y, como el
-- cobro conserva su tienda/código y su asiento_documento seguía activo, si después se volvía a cobrar
-- fn_contab_generar ya no lo contabilizaba.
--
-- Arreglo, en un único sitio para todos los caminos: disparador en cobro_cliente. Cuando un cobro deja
-- de estar cobrado (pasa a pendiente/anulado o se desactiva):
--   · si su asiento es correcto, contraasiento (mismos apuntes con signo contrario) con fecha de hoy
--     o la que se pase en 'erp.fecha_reversion' (la Conciliación pasa la del cargo del banco);
--   · si su asiento tenía error (nunca contó), se anula;
--   · en los dos casos el asiento_documento del cobro queda inactivo, para que el cobro se vuelva a
--     contabilizar cuando se cobre de nuevo.

create or replace function public.fn_contab_revertir_cobro(p_tienda text, p_codigo bigint, p_motivo text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare g record; ap contab_apunte_t[]; v_id bigint; v_fecha date;
begin
  v_fecha := coalesce(nullif(current_setting('erp.fecha_reversion', true), '')::date, (now() at time zone 'Atlantic/Canary')::date);
  for g in select a.* from asiento_documento ad join asiento a on a.id = ad.asiento_id
            where ad.activo and ad.doc_tipo = 'cobro' and ad.tienda_codigo = p_tienda and ad.numero = p_codigo and a.estado <> 'anulado' loop
    if g.estado = 'correcto' then
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

create or replace function public.fn_cobro_cliente_revertir_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.estado_cobro = 'cobrado' and old.activo
     and (coalesce(new.estado_cobro, '') <> 'cobrado' or not new.activo) then
    perform fn_contab_revertir_cobro(old.tienda_terminal_codigo, old.codigo_pago, new.concepto);
  end if;
  return new;
end $$;

drop trigger if exists trg_cobro_cliente_revertir on public.cobro_cliente;
create trigger trg_cobro_cliente_revertir after update of estado_cobro, activo on public.cobro_cliente
  for each row execute function public.fn_cobro_cliente_revertir_trg();

-- La Conciliación (devolución de un recibo) ya no hace el asiento del cliente: lo hace el disparador
-- (contraasiento del cobro con la fecha del cargo). Solo queda el de los gastos del banco.
create or replace function public.fn_concilia_confirmar(p_mov bigint)
returns void language plpgsql security definer set search_path = public as $$
declare x record; prop jsonb; re remesa; rc record; v_as bigint; ap contab_apunte_t[];
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
    for rc in select r.*, k.factura_tienda_codigo ft, k.factura_numero fn, k.forma_pago_codigo fp
                from remesa_recibo r join cobro_cliente k on k.tienda_terminal_codigo = r.cobro_tienda_codigo and k.codigo_pago = r.cobro_codigo
               where r.remesa_id = re.id and r.estado = 'incluido' loop
      if rc.fn is null then raise exception 'El recibo % no es de una factura.', rc.e2e; end if;
      perform fn_cobro_cliente_cobrar(jsonb_build_object(
        'factura_t', rc.ft, 'factura_n', rc.fn, 'importe', rc.importe, 'fecha_pago', (x.m).fecha_operacion,
        'forma_pago_codigo', rc.fp, 'cuenta_contable', (x.b).cuenta_contable, 'numero_documento_pago', rc.e2e,
        'concepto', 'Remesa ' || re.referencia, 'vencimiento_t', rc.cobro_tienda_codigo, 'vencimiento_codigo', rc.cobro_codigo));
      update remesa_recibo set estado = 'cobrado' where id = rc.id;
    end loop;
    if coalesce((prop->>'comision')::numeric, 0) > 0 then
      ap := array[fn_contab_ap((x.b).cuenta_comisiones, (prop->>'comision')::numeric, 'Comisión remesa ' || re.referencia, re.referencia),
                  fn_contab_ap((x.b).cuenta_contable, -(prop->>'comision')::numeric, 'Comisión remesa ' || re.referencia, re.referencia)];
      v_as := fn_contab_crear_asiento((x.m).fecha_operacion, 'Comisión remesa ' || re.referencia, 'manual', null, null, 'banco:' || p_mov, ap, '[]', null, false, null, null);
    end if;
    update remesa set estado = 'abonada', abonada_en = (x.m).fecha_operacion, abono_movimiento_id = p_mov,
                      comision = (prop->>'comision')::numeric where id = re.id;
    update extracto_movimiento set conciliado = true, conciliado_tipo = 'remesa', asiento_generado_id = v_as,
           nota = 'Remesa ' || re.referencia, conciliado_en = now(), conciliado_por = fn_empleado_actual() where id = p_mov;
  else
    select r.*, rm.referencia into rc from remesa_recibo r join remesa rm on rm.id = r.remesa_id where r.id = (prop->>'recibo_id')::bigint for update of r;
    if not found or rc.estado <> 'cobrado' then raise exception 'El recibo ya no está cobrado.'; end if;
    -- El recibo vuelve a quedar pendiente (sube la deuda del cliente); el disparador contraasienta su
    -- cobro con la fecha del cargo de la devolución.
    perform set_config('erp.fecha_reversion', (x.m).fecha_operacion::text, true);
    perform fn_cobro_cliente_anular(rc.cobro_tienda_codigo, rc.cobro_codigo, 'Devuelto por el banco (' || rc.e2e || ')');
    perform set_config('erp.fecha_reversion', '', true);
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

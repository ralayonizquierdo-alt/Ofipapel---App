-- Facturación de albaranes (GeminisWin: Facturación → Generar Facturas / Facturas).
--
-- A los clientes de CRÉDITO se les hacen albaranes (ventas a crédito, sin registro VeriFactu).
-- A fin de periodo se FACTURAN juntos: una factura F1 por cliente (o una por albarán), con su
-- desglose de IGIC en factura_impuesto_tramo. Al insertar en `factura`, el trigger
-- trg_factura_verifactu_alta genera el registro VeriFactu encadenado; al enlazar cada albarán
-- (venta.factura_tienda_codigo / factura_numero) queda bloqueado por trg_venta_verifactu_bloqueo.
-- Todo en UNA transacción (una llamada RPC): o se factura todo o nada.

-- Desglose de IGIC de un albarán (por tipo), con el descuento de pie aplicado.
create or replace function public.fn_venta_desglose_igic(p_tienda text, p_numero bigint)
returns table (tipo_pct numeric, base numeric, cuota numeric)
language plpgsql stable
set search_path to 'public'
as $$
declare
  v public.venta;
  v_factor numeric;
begin
  select * into v from public.venta where tienda_terminal_codigo = p_tienda and numero = p_numero;
  if not found then return; end if;
  v_factor := 1 - coalesce(v.descuento_pie_pct, 0) / 100;
  if exists (select 1 from public.venta_linea l where l.tienda_terminal_codigo = p_tienda and l.numero = p_numero) then
    return query
      select x.pct, x.b, round(x.b * (x.pct + coalesce(v.igic_pie_pct, 0)) / 100, 2)
        from (select coalesce(l.igic_pct, 0) as pct, round(sum(coalesce(l.subtotal, 0)) * v_factor, 2) as b
                from public.venta_linea l
               where l.tienda_terminal_codigo = p_tienda and l.numero = p_numero
               group by coalesce(l.igic_pct, 0)) x
       order by x.pct;
  else
    return query select case when coalesce(v.subtotal_2, 0) = 0 then 0::numeric
                             else round(coalesce(v.total_igic_pie, 0) / v.subtotal_2 * 100, 1) end,
                        round(coalesce(v.subtotal_2, 0), 2), round(coalesce(v.total_igic_pie, 0), 2);
  end if;
end $$;

-- Genera las facturas de los albaranes indicados. p_albaranes: [{"t":"01","n":123}, …]
-- p_tienda_factura: tienda en la que se numeran las facturas (null = la de cada albarán).
-- p_serie: serie de facturación (null = la primera serie normal activa de la tienda).
-- p_por_albaran: una factura por albarán en vez de una por cliente.
create or replace function public.fn_facturar_albaranes(
  p_albaranes jsonb,
  p_fecha_factura date default current_date,
  p_tienda_factura text default null,
  p_serie text default null,
  p_fecha_desde date default null,
  p_fecha_hasta date default null,
  p_por_albaran boolean default false,
  p_observaciones text default null
) returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_claves record;
  g record;
  v public.venta;
  c public.cliente;
  v_tienda text;
  v_serie text;
  v_numero bigint;
  v_nfac bigint;
  v_base numeric;
  v_igic numeric;
  v_nif text;
  v_tipo text;
  v_tramo int;
  t record;
  v_res jsonb := '[]'::jsonb;
  v_empleado text := public.fn_empleado_actual();
  v_n int;
begin
  if p_albaranes is null or jsonb_array_length(p_albaranes) = 0 then
    raise exception 'No hay albaranes seleccionados.';
  end if;

  -- Albaranes pedidos, bloqueados y comprobados (pendientes de facturar)
  create temp table tmp_fac_alb (t text, n bigint, cliente text, sucursal text, fecha date, grupo text) on commit drop;
  create temp table tmp_fac_tramo (grupo text, tipo_pct numeric, base numeric, cuota numeric) on commit drop;
  for v_claves in select distinct (e->>'t') as t, (e->>'n')::bigint as n from jsonb_array_elements(p_albaranes) e loop
    select * into v from public.venta where tienda_terminal_codigo = v_claves.t and numero = v_claves.n for update;
    if not found then raise exception 'No existe el albarán %-%.', v_claves.t, v_claves.n; end if;
    if not public.fn_venta_es_albaran(v) then raise exception 'La venta %-% no es a crédito (albarán): no se factura aquí.', v.tienda_terminal_codigo, v.numero; end if;
    if v.factura_numero is not null then
      raise exception 'El albarán %-% ya está facturado en la factura %-%.', v.tienda_terminal_codigo, v.numero, v.factura_tienda_codigo, v.factura_numero;
    end if;
    if v.anulada_en is not null then raise exception 'El albarán %-% está anulado.', v.tienda_terminal_codigo, v.numero; end if;
    if v.aplazada then raise exception 'El albarán %-% está aplazado: complétalo antes de facturarlo.', v.tienda_terminal_codigo, v.numero; end if;
    insert into tmp_fac_alb values (v.tienda_terminal_codigo, v.numero, v.cliente_codigo, v.cliente_sucursal_codigo, v.fecha,
      case when p_por_albaran then v.tienda_terminal_codigo || '-' || v.numero
           else coalesce(p_tienda_factura, v.tienda_terminal_codigo) || '|' || v.cliente_codigo || '|' || coalesce(v.cliente_sucursal_codigo, '') end);
  end loop;

  -- Desglose por tipo de IGIC de cada grupo (suma de los desgloses de cada albarán)
  insert into tmp_fac_tramo
    select a.grupo, d.tipo_pct, sum(d.base), sum(d.cuota)
      from tmp_fac_alb a cross join lateral public.fn_venta_desglose_igic(a.t, a.n) d
     group by a.grupo, d.tipo_pct;

  -- Una factura por grupo (cliente [+ sucursal] [+ tienda] o albarán)
  for g in
    select a.grupo, min(a.cliente) as cliente, min(a.sucursal) as sucursal, min(a.t) as t_min, max(a.t) as t_max,
           min(a.fecha) as f_min, max(a.fecha) as f_max
      from tmp_fac_alb a group by a.grupo order by min(a.cliente), a.grupo
  loop
    select * into c from public.cliente where codigo = g.cliente;
    v_tienda := coalesce(p_tienda_factura, g.t_min);
    if p_serie is not null and p_serie <> '' then
      v_serie := p_serie;
      if not exists (select 1 from public.serie_facturacion s where s.tienda_terminal_codigo = v_tienda and s.serie = v_serie) then
        raise exception 'La serie % no existe en la tienda %.', v_serie, v_tienda;
      end if;
    else
      select s.serie into v_serie from public.serie_facturacion s
       where s.tienda_terminal_codigo = v_tienda and not s.es_serie_rectificativas
       order by s.activa_verifactu desc, s.serie limit 1;
      if v_serie is null then
        raise exception 'La tienda % no tiene ninguna serie de facturación: créala antes de facturar.', v_tienda;
      end if;
    end if;

    select count(*) into v_n from tmp_fac_tramo x where x.grupo = g.grupo;
    if v_n > 9 then raise exception 'La factura del cliente % tendría más de 9 tipos de IGIC distintos.', g.cliente; end if;
    select coalesce(sum(x.base), 0), coalesce(sum(x.cuota), 0) into v_base, v_igic from tmp_fac_tramo x where x.grupo = g.grupo;

    v_nif := nullif(trim(coalesce(c.nif, '')), '');
    if v_nif is not null then
      v_tipo := 'F1';
    elsif abs(v_base + v_igic) <= 3000 then
      v_tipo := 'F2';
    else
      raise exception 'El cliente % no tiene NIF y la factura supera 3.000 €: pon el NIF en su ficha.', g.cliente;
    end if;

    v_numero := public.fn_siguiente_numero(v_tienda, 'factura', '');
    v_nfac := public.fn_siguiente_numero(v_tienda, 'factura', v_serie);
    while exists (select 1 from public.factura f where f.serie = v_serie and f.n_factura = v_nfac) loop
      v_nfac := public.fn_siguiente_numero(v_tienda, 'factura', v_serie);
    end loop;
    while exists (select 1 from public.factura f where f.tienda_terminal_codigo = v_tienda and f.numero = v_numero) loop
      v_numero := public.fn_siguiente_numero(v_tienda, 'factura', '');
    end loop;

    insert into public.factura (
      tienda_terminal_codigo, numero, serie, n_factura, cliente_codigo, cliente_sucursal_codigo, nombre_cliente, nif_cliente,
      vendedor_codigo, empleado_codigo, oficina_desde_codigo, oficina_hasta_codigo, fecha_desde, fecha_hasta,
      fecha_factura, hora_factura, estado, subtotal, descuento_pie_pct, total_descuento, total_base, total_igic,
      retencion_pct, total_retencion, otros_gastos, total, total_pagado, total_pagos, total_pendiente, numero_pagos,
      dias_pago, es_factura_global, forma_pago_codigo, observaciones, tipo_factura)
    select v_tienda, v_numero, v_serie, v_nfac, g.cliente, g.sucursal,
           coalesce(nullif(c.razon_social, ''), c.nombre), v_nif,
           coalesce(c.vendedor_codigo, min(v2.vendedor_codigo)), v_empleado, g.t_min, g.t_max,
           coalesce(p_fecha_desde, g.f_min), coalesce(p_fecha_hasta, g.f_max),
           coalesce(p_fecha_factura, current_date), to_char(now() at time zone 'Atlantic/Canary', 'HH24:MI'), 'emitida',
           round(sum(coalesce(v2.subtotal, 0)), 2), 0, round(sum(coalesce(v2.total_descuento_pie, 0)), 2), v_base, v_igic,
           0, 0, 0, v_base + v_igic, round(sum(coalesce(v2.total_pagado, 0)), 2), 0,
           v_base + v_igic - round(sum(coalesce(v2.total_pagado, 0)), 2), 0,
           c.dias_pago_1, not p_por_albaran, coalesce(c.forma_pago_codigo, min(v2.forma_pago_codigo)),
           nullif(trim(coalesce(p_observaciones, '')), ''), v_tipo
      from tmp_fac_alb a join public.venta v2 on v2.tienda_terminal_codigo = a.t and v2.numero = a.n
     where a.grupo = g.grupo;

    v_tramo := 0;
    for t in select x.tipo_pct, x.base, x.cuota from tmp_fac_tramo x where x.grupo = g.grupo order by x.tipo_pct loop
      v_tramo := v_tramo + 1;
      insert into public.factura_impuesto_tramo (tienda_terminal_codigo, numero, tramo, tipo_pct, base_imponible, cuota_igic)
      values (v_tienda, v_numero, v_tramo, t.tipo_pct, t.base, t.cuota);
    end loop;

    update public.venta v3 set factura_tienda_codigo = v_tienda, factura_numero = v_numero
      from tmp_fac_alb a
     where a.grupo = g.grupo and v3.tienda_terminal_codigo = a.t and v3.numero = a.n;

    v_res := v_res || jsonb_build_object('t', v_tienda, 'numero', v_numero, 'serie', v_serie, 'n_factura', v_nfac,
      'cliente', g.cliente, 'total', v_base + v_igic, 'tipo', v_tipo,
      'albaranes', (select count(*) from tmp_fac_alb a where a.grupo = g.grupo));
  end loop;
  return v_res;
end $$;

-- Anulación de una factura de cliente: registro VeriFactu de anulación y, si se pide, los
-- albaranes vuelven a quedar pendientes de facturar (la factura anulada no cuenta).
create or replace function public.fn_anular_factura_cliente(p_tienda text, p_numero bigint, p_motivo text, p_liberar_albaranes boolean default true)
returns registro_facturacion
language plpgsql
security invoker
set search_path to 'public'
as $$
declare r public.registro_facturacion;
begin
  if nullif(trim(coalesce(p_motivo, '')), '') is null then raise exception 'Indica el motivo de la anulación.'; end if;
  r := public.fn_verifactu_anular_factura(p_tienda, p_numero, p_motivo);
  if p_liberar_albaranes then
    update public.venta set factura_tienda_codigo = null, factura_numero = null
     where factura_tienda_codigo = p_tienda and factura_numero = p_numero;
  end if;
  return r;
end $$;

-- Rectificativa (R1, por diferencias) que abona íntegramente una factura emitida: mismos tramos
-- de IGIC en negativo. Se numera en la serie de rectificativas de la tienda (o en la misma serie).
create or replace function public.fn_rectificar_factura_cliente(p_tienda text, p_numero bigint, p_motivo text)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  f public.factura;
  v_serie text;
  v_numero bigint;
  v_nfac bigint;
begin
  if nullif(trim(coalesce(p_motivo, '')), '') is null then raise exception 'Indica el motivo de la rectificación.'; end if;
  select * into f from public.factura where tienda_terminal_codigo = p_tienda and numero = p_numero;
  if not found then raise exception 'No existe la factura %-%.', p_tienda, p_numero; end if;
  if f.tipo_factura like 'R%' then raise exception 'La factura %-% ya es una rectificativa.', p_tienda, p_numero; end if;
  if exists (select 1 from public.registro_facturacion where origen_tipo = 'factura' and origen_tienda_codigo = p_tienda
               and origen_numero = p_numero and tipo_registro = 'anulacion') then
    raise exception 'La factura %-% está anulada: no se rectifica.', p_tienda, p_numero;
  end if;
  if exists (select 1 from public.factura where factura_rectificada_tienda_codigo = p_tienda and factura_rectificada_numero = p_numero) then
    raise exception 'La factura %-% ya tiene una rectificativa.', p_tienda, p_numero;
  end if;
  select s.serie into v_serie from public.serie_facturacion s
   where s.tienda_terminal_codigo = p_tienda and s.es_serie_rectificativas order by s.serie limit 1;
  v_serie := coalesce(v_serie, f.serie);
  v_numero := public.fn_siguiente_numero(p_tienda, 'factura', '');
  while exists (select 1 from public.factura x where x.tienda_terminal_codigo = p_tienda and x.numero = v_numero) loop
    v_numero := public.fn_siguiente_numero(p_tienda, 'factura', '');
  end loop;
  v_nfac := public.fn_siguiente_numero(p_tienda, 'factura', v_serie);
  while exists (select 1 from public.factura x where x.serie = v_serie and x.n_factura = v_nfac) loop
    v_nfac := public.fn_siguiente_numero(p_tienda, 'factura', v_serie);
  end loop;
  insert into public.factura (
    tienda_terminal_codigo, numero, serie, n_factura, cliente_codigo, cliente_sucursal_codigo, nombre_cliente, nif_cliente,
    vendedor_codigo, empleado_codigo, oficina_desde_codigo, oficina_hasta_codigo, fecha_desde, fecha_hasta, fecha_factura,
    hora_factura, estado, subtotal, descuento_pie_pct, total_descuento, total_base, total_igic, retencion_pct, total_retencion,
    otros_gastos, total, total_pagado, total_pagos, total_pendiente, numero_pagos, dias_pago, es_factura_global,
    forma_pago_codigo, observaciones, tipo_factura, factura_rectificada_tienda_codigo, factura_rectificada_numero)
  values (
    p_tienda, v_numero, v_serie, v_nfac, f.cliente_codigo, f.cliente_sucursal_codigo, f.nombre_cliente, f.nif_cliente,
    f.vendedor_codigo, public.fn_empleado_actual(), f.oficina_desde_codigo, f.oficina_hasta_codigo, f.fecha_desde, f.fecha_hasta,
    current_date, to_char(now() at time zone 'Atlantic/Canary', 'HH24:MI'), 'emitida', -coalesce(f.subtotal, 0), 0,
    -coalesce(f.total_descuento, 0), -coalesce(f.total_base, 0), -coalesce(f.total_igic, 0), f.retencion_pct,
    -coalesce(f.total_retencion, 0), -coalesce(f.otros_gastos, 0), -f.total, 0, 0, -f.total, 0, f.dias_pago, f.es_factura_global,
    f.forma_pago_codigo, 'Rectifica la factura ' || f.serie || '-' || f.n_factura || ': ' || trim(p_motivo),
    case when f.tipo_factura = 'F2' then 'R5' else 'R1' end, p_tienda, p_numero);
  insert into public.factura_impuesto_tramo (tienda_terminal_codigo, numero, tramo, tipo_pct, base_imponible, cuota_igic)
    select p_tienda, v_numero, t.tramo, t.tipo_pct, -coalesce(t.base_imponible, 0), -coalesce(t.cuota_igic, 0)
      from public.factura_impuesto_tramo t where t.tienda_terminal_codigo = p_tienda and t.numero = p_numero;
  return jsonb_build_object('t', p_tienda, 'numero', v_numero, 'serie', v_serie, 'n_factura', v_nfac);
end $$;

grant execute on function public.fn_venta_desglose_igic(text, bigint) to authenticated;
grant execute on function public.fn_facturar_albaranes(jsonb, date, text, text, date, date, boolean, text) to authenticated;
grant execute on function public.fn_anular_factura_cliente(text, bigint, text, boolean) to authenticated;
grant execute on function public.fn_rectificar_factura_cliente(text, bigint, text) to authenticated;

-- Bloqueo de ventas (VeriFactu): igual que antes, con UNA excepción: si la factura de un albarán
-- está ANULADA (registro VeriFactu de anulación), se permite desenlazar el albarán (factura_* a
-- null, sin tocar nada más) para volver a facturarlo.
create or replace function public.fn_venta_verifactu_bloqueo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_que text;
begin
  if exists (select 1 from public.registro_facturacion
              where origen_tipo = 'venta' and origen_tienda_codigo = old.tienda_terminal_codigo
                and origen_numero = old.numero and tipo_registro = 'alta') then
    v_que := 'emitida (VeriFactu)';
  elsif old.factura_numero is not null then
    v_que := format('facturada en la factura %s-%s', old.factura_tienda_codigo, old.factura_numero);
    if tg_op = 'UPDATE' and new.factura_numero is null and new.factura_tienda_codigo is null
       and exists (select 1 from public.registro_facturacion
                    where origen_tipo = 'factura' and origen_tienda_codigo = old.factura_tienda_codigo
                      and origen_numero = old.factura_numero and tipo_registro = 'anulacion')
       and (new.tienda_terminal_codigo, new.numero, new.fecha, new.cliente_codigo, new.nombre_cliente, new.nif_cliente,
            new.subtotal, new.descuento_pie_pct, new.total_descuento_pie, new.subtotal_2, new.igic_pie_pct,
            new.total_igic_pie, new.total, new.aplazada, new.venta_rectificada_tienda_codigo, new.venta_rectificada_numero)
           is not distinct from
           (old.tienda_terminal_codigo, old.numero, old.fecha, old.cliente_codigo, old.nombre_cliente, old.nif_cliente,
            old.subtotal, old.descuento_pie_pct, old.total_descuento_pie, old.subtotal_2, old.igic_pie_pct,
            old.total_igic_pie, old.total, old.aplazada, old.venta_rectificada_tienda_codigo, old.venta_rectificada_numero) then
      return new; -- factura anulada: el albarán vuelve a estar pendiente de facturar
    end if;
  else
    return case when tg_op <> 'UPDATE' then old else new end;
  end if;
  if tg_op <> 'UPDATE' then
    raise exception 'Venta %-% %: no se puede eliminar. Usa «Eliminar» en la ficha para anularla o haz una rectificativa.', old.tienda_terminal_codigo, old.numero, v_que;
  end if;
  if (new.tienda_terminal_codigo, new.numero, new.fecha, new.cliente_codigo, new.nombre_cliente, new.nif_cliente,
      new.subtotal, new.descuento_pie_pct, new.total_descuento_pie, new.subtotal_2, new.igic_pie_pct,
      new.total_igic_pie, new.total, new.aplazada, new.venta_rectificada_tienda_codigo, new.venta_rectificada_numero,
      new.factura_tienda_codigo, new.factura_numero)
     is distinct from
     (old.tienda_terminal_codigo, old.numero, old.fecha, old.cliente_codigo, old.nombre_cliente, old.nif_cliente,
      old.subtotal, old.descuento_pie_pct, old.total_descuento_pie, old.subtotal_2, old.igic_pie_pct,
      old.total_igic_pie, old.total, old.aplazada, old.venta_rectificada_tienda_codigo, old.venta_rectificada_numero,
      old.factura_tienda_codigo, old.factura_numero) then
    raise exception 'Venta %-% %: no se pueden modificar importes, líneas, cliente ni fecha. Las correcciones se hacen con una rectificativa.', old.tienda_terminal_codigo, old.numero, v_que;
  end if;
  if old.anulada_en is not null and new.anulada_en is distinct from old.anulada_en then
    raise exception 'Venta %-% anulada: la anulación no se puede deshacer.', old.tienda_terminal_codigo, old.numero;
  end if;
  return new;
end $function$;

-- Ctrl+Intro en «Facturas Clientes»: fuente 'factura' en gw_lista_ordenada (nº de factura, Id.,
-- fecha, cliente). Los números van con ceros a la izquierda para ordenarse como números.
do $do$
declare
  v_def text := pg_get_functiondef('public.gw_lista_ordenada(text,text,text,text,text,text,integer,boolean)'::regprocedure);
  v_nuevo text;
  v_case text := $c$    when 'factura' then
      v_from := '(select f.*, lpad(f.n_factura::text, 12, ''0'') as n_factura_ord, lpad(f.numero::text, 12, ''0'') as id_ord, '
        || 'to_char(f.fecha_factura, ''YYYYMMDD'') as fecha_ord, coalesce(nullif(c.nombre, ''''), f.nombre_cliente) as cliente_nombre '
        || 'from factura f left join cliente c on c.codigo = f.cliente_codigo) t';
      v_key := '(t.tienda_terminal_codigo || ''|'' || t.numero::text)';
      v_campos := array['n_factura_ord', 'id_ord', 'fecha_ord', 'cliente_codigo', 'cliente_nombre'];
      v_cols := 'jsonb_build_object(''tienda_terminal_codigo'', t.tienda_terminal_codigo, ''numero'', t.numero, '
        || '''serie'', t.serie, ''n_factura'', t.n_factura, ''fecha_factura'', to_char(t.fecha_factura, ''DD/MM/YYYY''), '
        || '''cliente_codigo'', t.cliente_codigo, ''cliente_nombre'', t.cliente_nombre, ''tipo_factura'', t.tipo_factura, '
        || '''total'', t.total)';
$c$;
begin
  if position('when ''factura'' then' in v_def) > 0 then
    return;
  end if;
  v_nuevo := replace(v_def, E'    else\n      raise exception ''Lista ordenada: fuente no permitida', v_case || E'    else\n      raise exception ''Lista ordenada: fuente no permitida');
  if v_nuevo = v_def then
    raise exception 'No se encontró el punto de inserción en gw_lista_ordenada';
  end if;
  execute v_nuevo;
end $do$;

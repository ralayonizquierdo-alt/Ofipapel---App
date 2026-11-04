-- Facturación → Generar Facturas, calcada del «Generador de facturas» de GeminisWin (capturas ZIP 7, 04/11/2026).
-- El desplegable «Proceso a Generar» tiene cuatro opciones:
--   cliente          Crear facturas agrupando albaranes por cliente
--   cliente_tienda   Crear facturas agrupando albaranes por cliente y tienda
--   sucursal         Crear facturas agrupando albaranes por cada sucursal del cliente
--   sucursal_tienda  Crear facturas agrupando los albaranes por cada sucursal del cliente y por tienda
-- Hasta ahora fn_facturar_albaranes agrupaba siempre como «sucursal_tienda». La lógica pasa a
-- fn_facturar_albaranes_proceso (mismo cuerpo, con la agrupación como parámetro) y la función de
-- siempre la llama con «sucursal_tienda», así que quien la usaba sigue igual.

create or replace function public.fn_facturar_albaranes_proceso(
  p_albaranes jsonb,
  p_fecha_factura date,
  p_tienda_factura text,
  p_serie text,
  p_fecha_desde date,
  p_fecha_hasta date,
  p_por_albaran boolean,
  p_observaciones text,
  p_agrupar text)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
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
  v_agrupar text := coalesce(nullif(p_agrupar, ''), 'sucursal_tienda');
begin
  -- [seguridad 20261028] solo quien tiene la pantalla (o administrador)
  if not (public.fn_puede('/generar-facturas')) then
    raise exception 'No tienes permiso para generar facturas.' using errcode = '42501';
  end if;
  if v_agrupar not in ('cliente', 'cliente_tienda', 'sucursal', 'sucursal_tienda') then
    raise exception 'Proceso a generar desconocido: %. Elige una opción del desplegable «Proceso a Generar».', p_agrupar;
  end if;
  if p_albaranes is null or jsonb_array_length(p_albaranes) = 0 then
    raise exception 'No hay albaranes seleccionados.';
  end if;

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
      case
        when p_por_albaran then v.tienda_terminal_codigo || '-' || v.numero
        when v_agrupar = 'cliente' then coalesce(p_tienda_factura, '') || '|' || v.cliente_codigo
        when v_agrupar = 'cliente_tienda' then coalesce(p_tienda_factura, v.tienda_terminal_codigo) || '|' || v.cliente_codigo
        when v_agrupar = 'sucursal' then coalesce(p_tienda_factura, '') || '|' || v.cliente_codigo || '|' || coalesce(v.cliente_sucursal_codigo, '')
        else coalesce(p_tienda_factura, v.tienda_terminal_codigo) || '|' || v.cliente_codigo || '|' || coalesce(v.cliente_sucursal_codigo, '')
      end);
  end loop;

  insert into tmp_fac_tramo
    select a.grupo, d.tipo_pct, sum(d.base), sum(d.cuota)
      from tmp_fac_alb a cross join lateral public.fn_venta_desglose_igic(a.t, a.n) d
     group by a.grupo, d.tipo_pct;

  for g in
    select a.grupo, min(a.cliente) as cliente,
           case when v_agrupar in ('cliente', 'cliente_tienda') and count(distinct coalesce(a.sucursal, '')) > 1 then null else min(a.sucursal) end as sucursal,
           min(a.t) as t_min, max(a.t) as t_max,
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
end $function$;

comment on function public.fn_facturar_albaranes_proceso(jsonb, date, text, text, date, date, boolean, text, text) is
  'Generar Facturas: factura albaranes agrupando según «Proceso a Generar» (cliente, cliente_tienda, sucursal, sucursal_tienda).';

grant execute on function public.fn_facturar_albaranes_proceso(jsonb, date, text, text, date, date, boolean, text, text) to authenticated;

-- La función de siempre: mismo comportamiento (por sucursal del cliente y por tienda).
create or replace function public.fn_facturar_albaranes(p_albaranes jsonb, p_fecha_factura date default current_date, p_tienda_factura text default null::text, p_serie text default null::text, p_fecha_desde date default null::date, p_fecha_hasta date default null::date, p_por_albaran boolean default false, p_observaciones text default null::text)
 returns jsonb
 language sql
 set search_path to 'public'
as $function$
  select public.fn_facturar_albaranes_proceso(p_albaranes, p_fecha_factura, p_tienda_factura, p_serie, p_fecha_desde, p_fecha_hasta, p_por_albaran, p_observaciones, 'sucursal_tienda');
$function$;

-- NEXA: la nueva función tiene el mismo nivel que la de siempre.
insert into public.nexa_operacion (codigo, descripcion, tipo, objeto, accion, nivel, permiso, bloqueada, notas) values
  ('funcion:fn_facturar_albaranes_proceso', 'Facturar albaranes (Generar Facturas, según el proceso elegido)', 'funcion', 'fn_facturar_albaranes_proceso', '*', 4, null, false, null)
on conflict (codigo) do nothing;

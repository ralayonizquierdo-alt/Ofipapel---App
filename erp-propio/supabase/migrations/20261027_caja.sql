-- Menú Caja calcado de GeminisWin: Mov. de Caja, Listado de Caja (Informes de caja),
-- Entrada / Salida en caja, Apertura / Cierre de Caja y Aperturas y Cierres.
--
-- 1. movimiento_caja: baja lógica (activo) y enlace automático con la caja abierta de su
--    tienda/terminal (turno_tienda_codigo / turno_numero = caja_apertura_cierre).
-- 2. caja_apertura_cierre: una sola caja abierta por tienda/terminal; columnas de la pestaña
--    «Datos Generales» que faltaban (gastos por clase de forma de pago y efectos pendientes).
-- 3. Funciones: totales de una caja (en vivo o al cierre), abrir, cerrar y entrada/salida rápida.
-- 4. gw_lista_ordenada_caja: lista ordenada (Ctrl+Intro) de movimientos, aperturas y empleados,
--    con el mismo formato que gw_lista_ordenada.
--
-- Clases de forma de pago (forma_pago.tipo / movimiento_caja.tipo_forma_pago):
--   1 crédito · 2 efecto · 3 banco · 4 contado.  Tipo contado: 1 efectivo · 2 tarjeta · 3 cheque.
-- Tipos de movimiento (TIPOMOV de GeminisWin): VTA Ventas Contado · PED Pedidos · COB Cobros ·
--   PAG Pagos · USU Usuario (entradas/salidas a mano) · CIE Cierres.

------------------------------------------------------------------------------ movimiento_caja
alter table public.movimiento_caja add column if not exists activo boolean not null default true;
comment on column public.movimiento_caja.activo is
  'Baja lógica (Eliminar en Mov. de Caja). Al darlo de baja los importes pasan a 0 y el concepto guarda el importe anulado.';
comment on column public.movimiento_caja.turno_tienda_codigo is
  'Caja (apertura/cierre) en la que entra el movimiento: caja_apertura_cierre.tienda_terminal_codigo. Lo rellena el trigger con la caja abierta.';
comment on column public.movimiento_caja.turno_numero is
  'Caja (apertura/cierre) en la que entra el movimiento: caja_apertura_cierre.ejercicio (Número de la apertura).';
comment on column public.movimiento_caja.tipo_contado is '1 efectivo · 2 tarjeta · 3 cheque (TIPOCONT de GeminisWin).';
comment on column public.movimiento_caja.tipo_forma_pago is '1 crédito · 2 efecto · 3 banco · 4 contado (TIPOFP de GeminisWin).';

create index if not exists movimiento_caja_turno_idx on public.movimiento_caja (turno_tienda_codigo, turno_numero);
create index if not exists movimiento_caja_fecha_idx on public.movimiento_caja (fecha);

create or replace function public.fn_movimiento_caja_antes()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.turno_numero is null then
    select c.tienda_terminal_codigo, c.ejercicio into new.turno_tienda_codigo, new.turno_numero
      from public.caja_apertura_cierre c
     where c.tienda_terminal_codigo = new.tienda_terminal_codigo and not c.cerrado
     order by c.ejercicio desc limit 1;
  end if;
  if new.descripcion_tipo is null then
    new.descripcion_tipo := case new.tipo_movimiento
      when 'VTA' then 'Ventas Contado' when 'PED' then 'Pedidos' when 'COB' then 'Cobros'
      when 'PAG' then 'Pagos' when 'USU' then 'Usuario' when 'CIE' then 'Cierres' end;
  end if;
  return new;
end $$;

create or replace trigger trg_movimiento_caja_antes before insert on public.movimiento_caja
  for each row execute function public.fn_movimiento_caja_antes();

-- Datos de prueba existentes (tienda 01): el TPV guardaba tipo_contado 0 = efectivo.
update public.movimiento_caja set tipo_contado = 1, tipo_forma_pago = 4, forma_pago_codigo = coalesce(forma_pago_codigo, '01')
 where tipo_movimiento = 'VTA' and tipo_contado = 0;
update public.movimiento_caja m set turno_tienda_codigo = c.tienda_terminal_codigo, turno_numero = c.ejercicio
  from public.caja_apertura_cierre c
 where m.turno_numero is null and c.tienda_terminal_codigo = m.tienda_terminal_codigo and not c.cerrado
   and m.fecha >= (c.fecha_apertura at time zone 'Atlantic/Canary')::date;
update public.movimiento_caja set descripcion_tipo = case tipo_movimiento
      when 'VTA' then 'Ventas Contado' when 'PED' then 'Pedidos' when 'COB' then 'Cobros'
      when 'PAG' then 'Pagos' when 'USU' then 'Usuario' when 'CIE' then 'Cierres' end
 where descripcion_tipo is null;

-------------------------------------------------------------------------- caja_apertura_cierre
create unique index if not exists caja_apertura_cierre_una_abierta
  on public.caja_apertura_cierre (tienda_terminal_codigo) where not cerrado;

alter table public.caja_apertura_cierre
  add column if not exists gasto_bancos numeric,
  add column if not exists gasto_efectos numeric,
  add column if not exists gasto_credito numeric,
  add column if not exists gasto_contado numeric,
  add column if not exists gasto_efectivo numeric,
  add column if not exists gasto_tarjeta numeric,
  add column if not exists gasto_cheque numeric,
  add column if not exists efectos_pend_cobros_ejercicio numeric,
  add column if not exists efectos_pend_pagos_ejercicio numeric,
  add column if not exists efectos_pend_cobros_cierre numeric,
  add column if not exists efectos_pend_pagos_cierre numeric;

comment on column public.caja_apertura_cierre.ejercicio is 'Número de la apertura de caja de la tienda/terminal (Número en Aperturas y Cierres).';
comment on column public.caja_apertura_cierre.total_bancos is 'Totales del Cierre · Ingresos · Bancos.';
comment on column public.caja_apertura_cierre.total_efectos is 'Totales del Cierre · Ingresos · Efectos.';
comment on column public.caja_apertura_cierre.total_credito is 'Totales del Cierre · Ingresos · Crédito (incluye lo pendiente de las ventas a crédito).';
comment on column public.caja_apertura_cierre.total_contado is 'Totales del Cierre · Ingresos · Contado.';
comment on column public.caja_apertura_cierre.total_ingreso is 'Totales del Cierre · Ingresos · Totales.';
comment on column public.caja_apertura_cierre.total_gasto is 'Totales del Cierre · Gastos · Totales.';
comment on column public.caja_apertura_cierre.total_ejercicio is 'Totales del Cierre · Total Ejerc. · Totales (ingresos - gastos).';
comment on column public.caja_apertura_cierre.total_efectivo is 'Desglose de los pagos de contado · Ingresos · Total Efectivo.';
comment on column public.caja_apertura_cierre.total_tarjeta is 'Desglose de los pagos de contado · Ingresos · Total Tarjetas.';
comment on column public.caja_apertura_cierre.total_cheque is 'Desglose de los pagos de contado · Ingresos · Total Cheques.';
comment on column public.caja_apertura_cierre.total_arqueo is 'Total Arqueo: efectivo contado al cerrar.';
comment on column public.caja_apertura_cierre.sobrante is 'Sobrante (descuadre): arqueo - (fondo de apertura + efectivo neto del ejercicio).';
comment on column public.caja_apertura_cierre.total_a_retirar is 'Efectivo Retirado: arqueo - fondo al cierre.';
comment on column public.caja_apertura_cierre.fondo_final is 'Fondo al Cierre (queda en el cajón para la siguiente apertura).';
comment on column public.caja_apertura_cierre.gasto_bancos is 'Totales del Cierre · Gastos · Bancos.';
comment on column public.caja_apertura_cierre.gasto_efectos is 'Totales del Cierre · Gastos · Efectos.';
comment on column public.caja_apertura_cierre.gasto_credito is 'Totales del Cierre · Gastos · Crédito.';
comment on column public.caja_apertura_cierre.gasto_contado is 'Totales del Cierre · Gastos · Contado.';
comment on column public.caja_apertura_cierre.gasto_efectivo is 'Desglose · Gastos · Total Efectivo.';
comment on column public.caja_apertura_cierre.gasto_tarjeta is 'Desglose · Gastos · Total Tarjetas.';
comment on column public.caja_apertura_cierre.gasto_cheque is 'Desglose · Gastos · Total Cheques.';
comment on column public.caja_apertura_cierre.efectos_pend_cobros_ejercicio is 'Efectos Pendientes Generados en el Ejercicio · Cobros.';
comment on column public.caja_apertura_cierre.efectos_pend_pagos_ejercicio is 'Efectos Pendientes Generados en el Ejercicio · Pagos.';
comment on column public.caja_apertura_cierre.efectos_pend_cobros_cierre is 'Totales Efectos Pendientes de esta oficina al cierre · Cobros.';
comment on column public.caja_apertura_cierre.efectos_pend_pagos_cierre is 'Totales Efectos Pendientes de esta oficina al cierre · Pagos.';

------------------------------------------------------------------------------------ funciones
-- Totales de una caja: en vivo si está abierta (hasta ahora) o recalculados si está cerrada.
create or replace function public.fn_caja_totales(p_tienda text, p_ejercicio bigint)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  c public.caja_apertura_cierre;
  desde timestamptz; hasta timestamptz;
  r jsonb; cred numeric; ec numeric; ep numeric; ecc numeric; epc numeric;
begin
  select * into c from public.caja_apertura_cierre where tienda_terminal_codigo = p_tienda and ejercicio = p_ejercicio;
  if not found then raise exception 'No existe la apertura de caja %-%', p_tienda, p_ejercicio; end if;
  desde := c.fecha_apertura;
  hasta := coalesce(c.fecha_cierre, now());

  with m as (
    select coalesce(m.ingreso, 0) ing, coalesce(m.gasto, 0) gas,
           coalesce(m.tipo_forma_pago, fp.tipo, 4) tf,
           coalesce(nullif(m.tipo_contado, 0), fp.tipo_contado, 1) tc
      from public.movimiento_caja m
      left join public.forma_pago fp on fp.codigo = m.forma_pago_codigo
     where m.activo
       and ((m.turno_tienda_codigo = p_tienda and m.turno_numero = p_ejercicio)
         or (m.turno_numero is null and m.tienda_terminal_codigo = p_tienda
             and m.fecha between (desde at time zone 'Atlantic/Canary')::date and (hasta at time zone 'Atlantic/Canary')::date))
  )
  select jsonb_build_object(
    'movimientos', count(*),
    'ing_bancos', coalesce(sum(ing) filter (where tf = 3), 0),
    'ing_efectos', coalesce(sum(ing) filter (where tf = 2), 0),
    'ing_credito', coalesce(sum(ing) filter (where tf = 1), 0),
    'ing_contado', coalesce(sum(ing) filter (where tf = 4), 0),
    'gas_bancos', coalesce(sum(gas) filter (where tf = 3), 0),
    'gas_efectos', coalesce(sum(gas) filter (where tf = 2), 0),
    'gas_credito', coalesce(sum(gas) filter (where tf = 1), 0),
    'gas_contado', coalesce(sum(gas) filter (where tf = 4), 0),
    'ing_efectivo', coalesce(sum(ing) filter (where tf = 4 and tc = 1), 0),
    'ing_tarjeta', coalesce(sum(ing) filter (where tf = 4 and tc = 2), 0),
    'ing_cheque', coalesce(sum(ing) filter (where tf = 4 and tc = 3), 0),
    'gas_efectivo', coalesce(sum(gas) filter (where tf = 4 and tc = 1), 0),
    'gas_tarjeta', coalesce(sum(gas) filter (where tf = 4 and tc = 2), 0),
    'gas_cheque', coalesce(sum(gas) filter (where tf = 4 and tc = 3), 0))
    into r from m;

  -- Crédito: lo que queda pendiente de las ventas emitidas en la tienda durante la caja.
  select coalesce(sum(v.total_pendiente), 0) into cred
    from public.venta v
   where v.tienda_terminal_codigo = p_tienda and not coalesce(v.aplazada, false) and v.anulada_en is null
     and coalesce(v.creado_en, v.fecha::timestamptz) between desde and hasta;

  select coalesce(sum(coalesce(k.cuota, 0) - coalesce(k.importe_cobrado, 0)) filter (where k.fecha between (desde at time zone 'Atlantic/Canary')::date and (hasta at time zone 'Atlantic/Canary')::date), 0),
         coalesce(sum(coalesce(k.cuota, 0) - coalesce(k.importe_cobrado, 0)), 0)
    into ec, ecc
    from public.cobro_cliente k
   where k.tienda_terminal_codigo = p_tienda and k.activo and k.es_efecto and coalesce(k.estado_cobro, '') <> 'cobrado';

  select coalesce(sum(coalesce(p.cuota, 0) - coalesce(p.importe_pagado, 0)) filter (where p.fecha between (desde at time zone 'Atlantic/Canary')::date and (hasta at time zone 'Atlantic/Canary')::date), 0),
         coalesce(sum(coalesce(p.cuota, 0) - coalesce(p.importe_pagado, 0)), 0)
    into ep, epc
    from public.pago_proveedor p
   where p.tienda_terminal_codigo = p_tienda and p.activo and p.es_efecto and coalesce(p.estado_pago, '') = 'pendiente';

  r := r || jsonb_build_object('ing_credito', (r->>'ing_credito')::numeric + cred, 'ventas_credito', cred,
                               'efp_cobros_ejercicio', ec, 'efp_pagos_ejercicio', ep,
                               'efp_cobros_cierre', ecc, 'efp_pagos_cierre', epc);
  r := r || jsonb_build_object(
    'ing_total', (r->>'ing_bancos')::numeric + (r->>'ing_efectos')::numeric + (r->>'ing_credito')::numeric + (r->>'ing_contado')::numeric,
    'gas_total', (r->>'gas_bancos')::numeric + (r->>'gas_efectos')::numeric + (r->>'gas_credito')::numeric + (r->>'gas_contado')::numeric,
    'fondo_inicial', coalesce(c.fondo_inicial, 0),
    'efectivo_teorico', coalesce(c.fondo_inicial, 0) + (r->>'ing_efectivo')::numeric - (r->>'gas_efectivo')::numeric);
  return r;
end $$;

-- Apertura de Caja: una sola abierta por tienda/terminal; el Número es el siguiente de la tienda.
create or replace function public.fn_caja_abrir(p_tienda text, p_fondo numeric)
returns bigint language plpgsql set search_path = public as $$
declare v_ej bigint; v_abierta bigint;
begin
  perform pg_advisory_xact_lock(hashtext('caja:' || p_tienda));
  select ejercicio into v_abierta from public.caja_apertura_cierre where tienda_terminal_codigo = p_tienda and not cerrado limit 1;
  if v_abierta is not null then
    raise exception 'La caja de la tienda % ya está abierta (apertura Nº %).', p_tienda, v_abierta;
  end if;
  select coalesce(max(ejercicio), 0) + 1 into v_ej from public.caja_apertura_cierre where tienda_terminal_codigo = p_tienda;
  insert into public.caja_apertura_cierre (tienda_terminal_codigo, ejercicio, fecha_apertura, cerrado, empleado_apertura_codigo, fondo_inicial)
  values (p_tienda, v_ej, now(), false, public.fn_empleado_actual(), coalesce(p_fondo, 0));
  return v_ej;
end $$;

-- Cierre de Caja: guarda los totales del ejercicio y el arqueo.
create or replace function public.fn_caja_cerrar(p_tienda text, p_ejercicio bigint, p_arqueo numeric, p_fondo_cierre numeric)
returns jsonb language plpgsql set search_path = public as $$
declare c public.caja_apertura_cierre; t jsonb; arq numeric; fondo numeric;
begin
  perform pg_advisory_xact_lock(hashtext('caja:' || p_tienda));
  select * into c from public.caja_apertura_cierre where tienda_terminal_codigo = p_tienda and ejercicio = p_ejercicio for update;
  if not found then raise exception 'No existe la apertura de caja %-%', p_tienda, p_ejercicio; end if;
  if c.cerrado then raise exception 'La caja %-% ya está cerrada.', p_tienda, p_ejercicio; end if;
  update public.caja_apertura_cierre set fecha_cierre = now() where tienda_terminal_codigo = p_tienda and ejercicio = p_ejercicio;
  t := public.fn_caja_totales(p_tienda, p_ejercicio);
  arq := coalesce(p_arqueo, (t->>'efectivo_teorico')::numeric);
  fondo := coalesce(p_fondo_cierre, 0);
  update public.caja_apertura_cierre set
    cerrado = true,
    empleado_cierre_codigo = public.fn_empleado_actual(),
    total_bancos = (t->>'ing_bancos')::numeric, total_efectos = (t->>'ing_efectos')::numeric,
    total_credito = (t->>'ing_credito')::numeric, total_contado = (t->>'ing_contado')::numeric,
    total_ingreso = (t->>'ing_total')::numeric, total_gasto = (t->>'gas_total')::numeric,
    total_ejercicio = (t->>'ing_total')::numeric - (t->>'gas_total')::numeric,
    gasto_bancos = (t->>'gas_bancos')::numeric, gasto_efectos = (t->>'gas_efectos')::numeric,
    gasto_credito = (t->>'gas_credito')::numeric, gasto_contado = (t->>'gas_contado')::numeric,
    total_efectivo = (t->>'ing_efectivo')::numeric, total_tarjeta = (t->>'ing_tarjeta')::numeric, total_cheque = (t->>'ing_cheque')::numeric,
    gasto_efectivo = (t->>'gas_efectivo')::numeric, gasto_tarjeta = (t->>'gas_tarjeta')::numeric, gasto_cheque = (t->>'gas_cheque')::numeric,
    efectos_pend_cobros_ejercicio = (t->>'efp_cobros_ejercicio')::numeric, efectos_pend_pagos_ejercicio = (t->>'efp_pagos_ejercicio')::numeric,
    efectos_pend_cobros_cierre = (t->>'efp_cobros_cierre')::numeric, efectos_pend_pagos_cierre = (t->>'efp_pagos_cierre')::numeric,
    total_arqueo = arq,
    sobrante = arq - (t->>'efectivo_teorico')::numeric,
    fondo_final = fondo,
    total_a_retirar = arq - fondo,
    actualizado_en = now()
  where tienda_terminal_codigo = p_tienda and ejercicio = p_ejercicio;
  return t;
end $$;

-- Entrada en caja / Salida de caja: movimiento «USU» (Usuario) de contado en efectivo en la
-- caja abierta de la tienda/terminal. Devuelve el número de movimiento.
create or replace function public.fn_caja_entrada_salida(p_tienda text, p_importe numeric, p_concepto text, p_entrada boolean)
returns bigint language plpgsql set search_path = public as $$
declare v_ej bigint; v_num bigint; v_fp text;
begin
  if coalesce(p_importe, 0) <= 0 then raise exception 'El importe tiene que ser mayor que 0.'; end if;
  select ejercicio into v_ej from public.caja_apertura_cierre where tienda_terminal_codigo = p_tienda and not cerrado limit 1;
  if v_ej is null then
    raise exception 'No hay caja abierta en la tienda %: ábrela en Caja → Apertura de Caja.', p_tienda;
  end if;
  select codigo into v_fp from public.forma_pago where codigo in ('CON', '01') order by codigo = 'CON' desc limit 1;
  v_num := public.fn_siguiente_numero(p_tienda, 'caja', '');
  insert into public.movimiento_caja (tienda_terminal_codigo, numero, fecha, hora, es_ingreso, ingreso, gasto, concepto,
    tipo_movimiento, forma_pago_codigo, tipo_forma_pago, tipo_contado, empleado_codigo, turno_tienda_codigo, turno_numero)
  values (p_tienda, v_num, (now() at time zone 'Atlantic/Canary')::date, to_char(now() at time zone 'Atlantic/Canary', 'HH24:MI:SS'),
    p_entrada, case when p_entrada then p_importe else 0 end, case when p_entrada then 0 else p_importe end,
    coalesce(nullif(trim(p_concepto), ''), case when p_entrada then 'Entrada en caja' else 'Salida de caja' end),
    'USU', v_fp, 4, 1, public.fn_empleado_actual(), p_tienda, v_ej);
  return v_num;
end $$;

-------------------------------------------------------------- lista ordenada (Ctrl+Intro)
create or replace function public.gw_lista_ordenada_caja(p_fuente text, p_campo text, p_modo text default 'ge', p_sk text default '',
  p_k text default '', p_ancla text default null, p_limite integer default 60, p_omitir_vacios boolean default false)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v_from text; v_key text; v_cols text; v_campos text[]; v_expr text; v_k text; v_where text; v_ord text; v_sql text; v_res jsonb;
  v_lim int := least(greatest(coalesce(p_limite, 60), 1), 300);
begin
  case p_fuente
    when 'movimiento_caja' then
      v_from := 'movimiento_caja t'; v_key := '(t.tienda_terminal_codigo || ''|'' || t.numero)';
      v_campos := array['numero', 'concepto'];
      v_cols := 'jsonb_build_object(''tienda_terminal_codigo'', t.tienda_terminal_codigo, ''numero'', t.numero, '
        || '''fecha'', to_char(t.fecha, ''DD/MM/YYYY''), ''hora'', t.hora, ''tipo_movimiento'', t.tipo_movimiento, '
        || '''ingreso'', t.ingreso, ''gasto'', t.gasto, ''concepto'', t.concepto, ''activo'', t.activo)';
    when 'caja_apertura_cierre' then
      v_from := 'caja_apertura_cierre t'; v_key := '(t.tienda_terminal_codigo || ''|'' || t.ejercicio)';
      v_campos := array['ejercicio'];
      v_cols := 'jsonb_build_object(''tienda_terminal_codigo'', t.tienda_terminal_codigo, ''ejercicio'', t.ejercicio, '
        || '''fecha_apertura'', to_char(t.fecha_apertura at time zone ''Atlantic/Canary'', ''DD/MM/YYYY HH24:MI''), '
        || '''fecha_cierre'', to_char(t.fecha_cierre at time zone ''Atlantic/Canary'', ''DD/MM/YYYY HH24:MI''), '
        || '''estado'', case when t.cerrado then ''Cerrada'' else ''Abierta'' end, ''fondo_inicial'', t.fondo_inicial)';
    when 'empleado' then
      v_from := 'empleado t'; v_key := 't.codigo'; v_campos := array['codigo', 'nombre'];
      v_cols := 'jsonb_build_object(''codigo'', t.codigo, ''nombre'', t.nombre, ''activo'', t.activo)';
    else
      raise exception 'Lista ordenada: fuente no permitida (%)', p_fuente;
  end case;
  if not (p_campo = any (v_campos)) then
    raise exception 'Lista ordenada: campo no permitido (%.%)', p_fuente, p_campo;
  end if;

  if p_campo in ('numero', 'ejercicio') then
    v_expr := format('(lpad(t.%I::text, 12, ''0'') collate "C")', p_campo);
  else
    v_expr := format('(upper(coalesce(t.%I, '''')) collate "C")', p_campo);
  end if;
  v_k := format('(%s collate "C")', v_key);

  if p_ancla is not null then
    execute format('select %s from %s where %s = $1 limit 1', v_expr, v_from, v_key) into p_sk using p_ancla;
    if p_sk is null then p_sk := ''; p_k := ''; else p_k := p_ancla; end if;
  end if;
  p_sk := coalesce(p_sk, '');
  p_k := coalesce(p_k, '');
  if p_campo in ('numero', 'ejercicio') and p_sk ~ '^\d{1,12}$' then p_sk := lpad(p_sk, 12, '0'); end if;

  if p_modo = 'lt' then
    v_where := format('%1$s <= $1 and (%1$s < $1 or %2$s < $2)', v_expr, v_k);
    v_ord := format('%s desc, %s desc', v_expr, v_k);
  elsif p_modo = 'gt' then
    v_where := format('%1$s >= $1 and (%1$s > $1 or %2$s > $2)', v_expr, v_k);
    v_ord := format('%s, %s', v_expr, v_k);
  else
    v_where := format('%1$s >= $1 and (%1$s > $1 or %2$s >= $2)', v_expr, v_k);
    v_ord := format('%s, %s', v_expr, v_k);
  end if;
  if p_omitir_vacios then
    v_where := v_where || format(' and coalesce(t.%I::text, '''') <> ''''', p_campo);
  end if;

  v_sql := format(
    'select coalesce(jsonb_agg(r.j || jsonb_build_object(''_sk'', r.sk, ''_k'', r.k) order by r.sk, r.k), ''[]''::jsonb) '
    || 'from (select %s as j, %s as sk, %s as k from %s where %s order by %s limit $3) r',
    v_cols, v_expr, v_k, v_from, v_where, v_ord);
  execute v_sql into v_res using p_sk, p_k, v_lim;
  return v_res;
end $$;

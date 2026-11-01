-- Conciliación bancaria inteligente, fase 1 (Luis, 01/11/2026: «es lo que más personal y tiempo nos
-- cuesta»). Bancos: Santander, BBVA, CaixaBank y Cajasiete, todos con Norma 43 descargado de la web.
--
-- · banco_cuenta: cada cuenta bancaria de cada empresa, con su subcuenta 572 y la de comisiones. Al
--   importar un Norma 43 se reconoce por entidad + oficina + nº de cuenta del propio fichero.
-- · extracto_movimiento.huella: firma del movimiento; con ella un movimiento nunca entra dos veces
--   aunque se importen ficheros con fechas que se solapan.
-- · conciliacion_regla: «cuando el concepto diga X, va a la cuenta Y» (luz, teléfono, comisiones…).
-- · fn_concilia_proponer: para cada movimiento sin conciliar busca con qué casarlo y lo deja como
--   propuesta con semáforo (verde = seguro, amarillo = revisar; sin propuesta = rojo):
--     1. regla  2. un apunte del mismo importe  3. varias facturas del mismo cliente que suman el
--     importe  4. datáfono: ventas con tarjeta de los días anteriores menos la comisión
--     5. un cobro o pago del ERP (empresa principal).
-- · fn_concilia_confirmar / _confirmar_verdes / _crear_asiento / _casar_apuntes / _marcar / _deshacer.
-- Todo por empresa (fn_contab_empresa), como el resto de la contabilidad.

-- 1. Cuentas bancarias ------------------------------------------------------------------------------
create table if not exists public.banco_cuenta (
  id bigint generated always as identity primary key,
  empresa_id smallint not null default public.fn_contab_empresa() references public.empresa_contable (id),
  nombre text not null,
  entidad text not null,
  oficina text not null default '',
  numero_cuenta text not null default '',
  cuenta_contable text not null,
  cuenta_comisiones text not null default '62600000',
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (empresa_id, entidad, oficina, numero_cuenta)
);
comment on table public.banco_cuenta is 'Cuentas bancarias de cada empresa: cómo se reconocen en el Norma 43 y a qué subcuenta 572 van.';
alter table public.banco_cuenta enable row level security;
drop policy if exists banco_cuenta_empresa on public.banco_cuenta;
create policy banco_cuenta_empresa on public.banco_cuenta for all to authenticated
  using (empresa_id = (select public.fn_contab_empresa())) with check (empresa_id = (select public.fn_contab_empresa()));
drop trigger if exists trg_auditoria_banco_cuenta on public.banco_cuenta;
create trigger trg_auditoria_banco_cuenta after insert or delete or update on public.banco_cuenta for each row execute function public.fn_auditoria_trigger();

alter table public.extracto_bancario add column if not exists banco_cuenta_id bigint references public.banco_cuenta (id);

-- 2. Movimientos: huella, propuesta y asiento generado --------------------------------------------
alter table public.extracto_movimiento add column if not exists huella text;
alter table public.extracto_movimiento add column if not exists propuesta jsonb;
alter table public.extracto_movimiento add column if not exists asiento_generado_id bigint references public.asiento (id);
alter table public.extracto_movimiento add column if not exists regla_id bigint;
create unique index if not exists extracto_movimiento_huella_uq on public.extracto_movimiento (huella);
create index if not exists extracto_movimiento_fecha_idx on public.extracto_movimiento (extracto_id, fecha_operacion);

-- Un movimiento puede casar con varios apuntes (una transferencia que paga varias facturas, un
-- datáfono que liquida varios días de ventas con tarjeta).
create table if not exists public.extracto_movimiento_apunte (
  movimiento_id bigint not null references public.extracto_movimiento (id) on delete cascade,
  apunte_id bigint not null references public.apunte (id),
  primary key (movimiento_id, apunte_id)
);
create index if not exists extracto_movimiento_apunte_apunte_idx on public.extracto_movimiento_apunte (apunte_id);
alter table public.extracto_movimiento_apunte enable row level security;
drop policy if exists extracto_movimiento_apunte_lee on public.extracto_movimiento_apunte;
create policy extracto_movimiento_apunte_lee on public.extracto_movimiento_apunte for select to authenticated
  using (exists (select 1 from public.extracto_movimiento m where m.id = movimiento_id));
drop trigger if exists trg_auditoria_extracto_movimiento_apunte on public.extracto_movimiento_apunte;
create trigger trg_auditoria_extracto_movimiento_apunte after insert or delete or update on public.extracto_movimiento_apunte
  for each row execute function public.fn_auditoria_trigger();

-- 3. Reglas ------------------------------------------------------------------------------------------
create table if not exists public.conciliacion_regla (
  id bigint generated always as identity primary key,
  empresa_id smallint not null default public.fn_contab_empresa() references public.empresa_contable (id),
  nombre text not null,
  texto text not null,
  sentido text not null default 'ambos' check (sentido in ('cargo', 'abono', 'ambos')),
  importe_min numeric,
  importe_max numeric,
  banco_cuenta_id bigint references public.banco_cuenta (id),
  cuenta_contrapartida text not null,
  concepto text,
  activa boolean not null default true,
  veces integer not null default 0,
  ultima_vez date,
  creado_en timestamptz not null default now(),
  creado_por text default public.fn_empleado_actual()
);
comment on table public.conciliacion_regla is 'Reglas de conciliación: si el concepto del banco contiene «texto», el movimiento va contra cuenta_contrapartida.';
alter table public.conciliacion_regla enable row level security;
drop policy if exists conciliacion_regla_empresa on public.conciliacion_regla;
create policy conciliacion_regla_empresa on public.conciliacion_regla for all to authenticated
  using (empresa_id = (select public.fn_contab_empresa())) with check (empresa_id = (select public.fn_contab_empresa()));
drop trigger if exists trg_auditoria_conciliacion_regla on public.conciliacion_regla;
create trigger trg_auditoria_conciliacion_regla after insert or delete or update on public.conciliacion_regla
  for each row execute function public.fn_auditoria_trigger();

-- 4. Utilidades ----------------------------------------------------------------------------------------
create or replace function public.fn_concilia_norm(p text)
returns text language sql immutable set search_path = public as $$
  select upper(translate(coalesce(p, ''), 'áéíóúàèìòùäëïöüñçÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÑÇ', 'aeiouaeiouaeiouncAEIOUAEIOUAEIOUNC'))
$$;

create or replace function public.fn_concilia_texto(m public.extracto_movimiento)
returns text language sql immutable set search_path = public as $$
  select public.fn_concilia_norm(concat_ws(' ', m.concepto_propio, m.conceptos, m.referencia1, m.referencia2, m.documento))
$$;

-- ¿Sale el nombre del cliente / proveedor en el concepto del banco? (alguna palabra de 5+ letras
-- que no sea genérica)
create or replace function public.fn_concilia_nombre_en(p_nombre text, p_txt text)
returns boolean language sql immutable set search_path = public as $$
  select exists (
    select 1 from regexp_split_to_table(public.fn_concilia_norm(p_nombre), '[^A-Z0-9]+') w
     where length(w) >= 5
       and w not in ('SOCIEDAD', 'LIMITADA', 'ANONIMA', 'CANARIAS', 'SERVICIOS', 'OFICINA', 'SUMINISTROS', 'COMERCIAL',
                     'CLIENTE', 'PROVEEDOR', 'GRUPO', 'TRANSFERENCIA', 'RECIBO', 'FACTURA')
       and position(w in coalesce(p_txt, '')) > 0)
$$;

-- Subconjunto (2 o más) de importes que suma exactamente el objetivo; prefiere el que tiene más
-- elementos (la transferencia que paga todas las facturas). Hasta 12 candidatos.
create or replace function public.fn_concilia_subconjunto(p_ids bigint[], p_imp numeric[], p_obj numeric)
returns bigint[] language plpgsql immutable set search_path = public as $$
declare n int := coalesce(array_length(p_ids, 1), 0); mask int; s numeric; res bigint[]; mejor bigint[]; i int;
begin
  if n < 2 or n > 12 then return null; end if;
  for mask in 1 .. (1 << n) - 1 loop
    s := 0; res := '{}';
    for i in 1 .. n loop
      if (mask >> (i - 1)) & 1 = 1 then s := s + p_imp[i]; res := res || p_ids[i]; end if;
    end loop;
    if cardinality(res) >= 2 and round(s, 2) = round(p_obj, 2) and (mejor is null or cardinality(res) > cardinality(mejor)) then
      mejor := res;
    end if;
  end loop;
  return mejor;
end $$;

-- Apuntes ya casados con algún movimiento conciliado.
create or replace function public.fn_concilia_apunte_usado(p_apunte bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from extracto_movimiento_apunte x join extracto_movimiento m on m.id = x.movimiento_id
                  where x.apunte_id = p_apunte and m.conciliado)
      or exists (select 1 from extracto_movimiento m where m.apunte_id = p_apunte and m.conciliado)
$$;

-- 5. Propuestas ------------------------------------------------------------------------------------------
create or replace function public.fn_concilia_proponer(p_banco bigint, p_desde date, p_hasta date, p_dias integer default 3)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b banco_cuenta; cfg configuracion_contable := fn_contab_cfg();
  m extracto_movimiento; txt text; prop jsonb; imp numeric; abono boolean;
  reservados bigint[] := '{}';
  r record; c record; n int; nv int := 0; na int := 0; nr int := 0;
  sub bigint[]; v_t text; v_c bigint;
begin
  if auth.uid() is null and session_user not in ('postgres', 'supabase_admin') then raise exception 'Sin sesión'; end if;
  select * into b from banco_cuenta where id = p_banco and empresa_id = fn_contab_empresa();
  if not found then raise exception 'La cuenta bancaria % no existe o es de otra empresa.', p_banco; end if;

  for m in
    select em.* from extracto_movimiento em join extracto_bancario e on e.id = em.extracto_id
     where e.banco_cuenta_id = p_banco and e.activo and not em.conciliado and em.fecha_operacion between p_desde and p_hasta
     order by em.fecha_operacion, em.id
  loop
    prop := null; txt := fn_concilia_texto(m); imp := abs(m.importe); abono := m.importe > 0;

    -- 1. Regla
    select rg.* into r from conciliacion_regla rg
     where rg.empresa_id = b.empresa_id and rg.activa and (rg.banco_cuenta_id is null or rg.banco_cuenta_id = p_banco)
       and position(fn_concilia_norm(rg.texto) in txt) > 0
       and (rg.sentido = 'ambos' or (rg.sentido = 'abono') = abono)
       and (rg.importe_min is null or imp >= rg.importe_min) and (rg.importe_max is null or imp <= rg.importe_max)
     order by length(rg.texto) desc, rg.id limit 1;
    if found then
      prop := jsonb_build_object('tipo', 'regla', 'confianza', 'verde', 'regla_id', r.id, 'cuenta', r.cuenta_contrapartida,
        'motivo', format('Regla «%s»: el concepto contiene «%s» → cuenta %s', r.nombre, r.texto, r.cuenta_contrapartida));
    end if;

    -- 2. Un apunte del mismo importe
    if prop is null then
      select count(*) into n
        from apunte p join asiento a on a.id = p.asiento_id
       where p.empresa_id = b.empresa_id and a.estado = 'correcto' and p.cuenta = b.cuenta_contable
         and (case when abono then p.debe = imp and p.haber = 0 else p.haber = imp and p.debe = 0 end)
         and abs(a.fecha - m.fecha_operacion) <= p_dias and not (p.id = any (reservados)) and not fn_concilia_apunte_usado(p.id);
      if n > 0 then
        select p.id, a.numero, a.fecha, abs(a.fecha - m.fecha_operacion) dif, cc.descripcion,
               coalesce(fn_concilia_nombre_en(cc.descripcion, txt), false) nombre
          into c
          from apunte p join asiento a on a.id = p.asiento_id
          left join cuenta_contable cc on cc.empresa_id = p.empresa_id and cc.codigo = p.contrapartida
         where p.empresa_id = b.empresa_id and a.estado = 'correcto' and p.cuenta = b.cuenta_contable
           and (case when abono then p.debe = imp and p.haber = 0 else p.haber = imp and p.debe = 0 end)
           and abs(a.fecha - m.fecha_operacion) <= p_dias and not (p.id = any (reservados)) and not fn_concilia_apunte_usado(p.id)
         order by coalesce(fn_concilia_nombre_en(cc.descripcion, txt), false) desc, abs(a.fecha - m.fecha_operacion), p.id
         limit 1;
        prop := jsonb_build_object('tipo', 'apunte', 'apuntes', jsonb_build_array(c.id),
          'confianza', case when (n = 1 and (c.dif <= 2 or c.nombre)) or (c.nombre and n <= 3) then 'verde' else 'amarillo' end,
          'motivo', concat('Mismo importe, asiento ', c.numero, ' del ', to_char(c.fecha, 'DD/MM'),
                           case when c.descripcion is not null then ' (' || c.descripcion || ')' end,
                           case when c.nombre then ' · el nombre sale en el concepto' end,
                           case when n > 1 then format(' · hay %s posibles', n) end));
      end if;
    end if;

    -- 3. Varias facturas del mismo cliente / proveedor
    if prop is null then
      for r in
        select p.contrapartida, array_agg(p.id order by a.fecha, p.id) ids, array_agg(greatest(p.debe, p.haber) order by a.fecha, p.id) imps,
               max(cc.descripcion) descripcion
          from apunte p join asiento a on a.id = p.asiento_id
          left join cuenta_contable cc on cc.empresa_id = p.empresa_id and cc.codigo = p.contrapartida
         where p.empresa_id = b.empresa_id and a.estado = 'correcto' and p.cuenta = b.cuenta_contable and p.contrapartida is not null
           and (case when abono then p.debe > 0 and p.debe < imp else p.haber > 0 and p.haber < imp end)
           and a.fecha between m.fecha_operacion - (p_dias + 4) and m.fecha_operacion + p_dias
           and not (p.id = any (reservados)) and not fn_concilia_apunte_usado(p.id)
         group by p.contrapartida
        having count(*) between 2 and 12 and sum(greatest(p.debe, p.haber)) >= imp
         order by bool_or(coalesce(fn_concilia_nombre_en(cc.descripcion, txt), false)) desc, count(*)
      loop
        sub := fn_concilia_subconjunto(r.ids, r.imps, imp);
        if sub is not null then
          prop := jsonb_build_object('tipo', 'varios', 'apuntes', to_jsonb(sub),
            'confianza', case when fn_concilia_nombre_en(r.descripcion, txt) then 'verde' else 'amarillo' end,
            'motivo', format('Varias facturas de %s: %s apuntes que suman el importe', coalesce(r.descripcion, r.contrapartida), cardinality(sub)));
          exit;
        end if;
      end loop;
    end if;

    -- 4. Datáfono: ventas con tarjeta (cuenta de tarjetas) de 1 a 5 días antes, menos la comisión (hasta 3,5 %)
    if prop is null and abono and cfg.cuenta_tarjetas is not null and cfg.cuenta_tarjetas <> b.cuenta_contable then
      select x.desde, x.hasta, x.total, x.ids into c
        from (
          select d1.f::date desde, d2.f::date hasta,
                 (select sum(p.debe) from apunte p join asiento a on a.id = p.asiento_id
                   where p.empresa_id = b.empresa_id and a.estado = 'correcto' and p.cuenta = cfg.cuenta_tarjetas and p.debe > 0
                     and a.fecha between d1.f::date and d2.f::date and not (p.id = any (reservados)) and not fn_concilia_apunte_usado(p.id)) total,
                 (select array_agg(p.id) from apunte p join asiento a on a.id = p.asiento_id
                   where p.empresa_id = b.empresa_id and a.estado = 'correcto' and p.cuenta = cfg.cuenta_tarjetas and p.debe > 0
                     and a.fecha between d1.f::date and d2.f::date and not (p.id = any (reservados)) and not fn_concilia_apunte_usado(p.id)) ids
            from generate_series(m.fecha_operacion - 5, m.fecha_operacion, interval '1 day') d1(f)
            join generate_series(m.fecha_operacion - 5, m.fecha_operacion, interval '1 day') d2(f) on d2.f >= d1.f) x
       where x.total >= imp and x.total - imp <= round(x.total * 0.035, 2)
       order by x.total - imp, x.hasta desc limit 1;
      if found and c.ids is not null then
        prop := jsonb_build_object('tipo', 'datafono', 'apuntes', to_jsonb(c.ids), 'total', c.total, 'comision', round(c.total - imp, 2),
          'confianza', case when txt ~ '(TPV|VISA|TARJ|DATAF|LIQ)' and c.total - imp <= round(c.total * 0.02, 2) then 'verde' else 'amarillo' end,
          'motivo', format('Datáfono: ventas con tarjeta del %s al %s (%s €) menos %s € de comisión',
                           to_char(c.desde, 'DD/MM'), to_char(c.hasta, 'DD/MM'), c.total, round(c.total - imp, 2)));
      end if;
    end if;

    -- 5. Cobro o pago del ERP (solo empresa principal)
    if prop is null and b.empresa_id = fn_contab_empresa_principal() then
      v_t := null; v_c := null;
      if abono then
        select k.tienda_terminal_codigo, k.codigo_pago into v_t, v_c from cobro_cliente k
         where k.activo and k.estado_cobro = 'cobrado' and k.importe_cobrado = imp and coalesce(k.tipo_pago, '') not ilike 'efectivo%'
           and abs(coalesce(k.fecha_pago, k.fecha) - m.fecha_operacion) <= p_dias
           and not exists (select 1 from extracto_movimiento x where x.conciliado and x.cobro_tienda_codigo = k.tienda_terminal_codigo and x.cobro_codigo = k.codigo_pago)
         order by abs(coalesce(k.fecha_pago, k.fecha) - m.fecha_operacion) limit 1;
        if v_c is not null then
          prop := jsonb_build_object('tipo', 'cobro', 'confianza', 'amarillo', 'tienda', v_t, 'codigo', v_c,
            'motivo', format('Cobro %s-%s del ERP con el mismo importe', v_t, v_c));
        end if;
      else
        select k.tienda_terminal_codigo, k.codigo_pago into v_t, v_c from pago_proveedor k
         where k.activo and k.estado_pago = 'pagado' and k.importe_pagado = imp
           and abs(coalesce(k.fecha_pago, k.fecha) - m.fecha_operacion) <= p_dias
           and not exists (select 1 from extracto_movimiento x where x.conciliado and x.pago_tienda_codigo = k.tienda_terminal_codigo and x.pago_codigo = k.codigo_pago)
         order by abs(coalesce(k.fecha_pago, k.fecha) - m.fecha_operacion) limit 1;
        if v_c is not null then
          prop := jsonb_build_object('tipo', 'pago', 'confianza', 'amarillo', 'tienda', v_t, 'codigo', v_c,
            'motivo', format('Pago %s-%s del ERP con el mismo importe', v_t, v_c));
        end if;
      end if;
    end if;

    if prop ? 'apuntes' then
      reservados := reservados || array(select jsonb_array_elements_text(prop->'apuntes')::bigint);
    end if;
    update extracto_movimiento set propuesta = prop where id = m.id;
    if prop is null then nr := nr + 1; elsif prop->>'confianza' = 'verde' then nv := nv + 1; else na := na + 1; end if;
  end loop;
  return jsonb_build_object('verde', nv, 'amarillo', na, 'rojo', nr);
end $$;

-- 6. Confirmar y casar -------------------------------------------------------------------------------------
-- Movimiento sin conciliar de la empresa elegida, con su cuenta bancaria.
create or replace function public.fn_concilia_mov(p_mov bigint, out m extracto_movimiento, out b banco_cuenta)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null and session_user not in ('postgres', 'supabase_admin') then raise exception 'Sin sesión'; end if;
  select em.* into m from extracto_movimiento em join extracto_bancario e on e.id = em.extracto_id
   where em.id = p_mov and e.empresa_id = fn_contab_empresa();
  if not found then raise exception 'El movimiento % no existe o es de otra empresa.', p_mov; end if;
  if m.conciliado then raise exception 'El movimiento ya está conciliado.'; end if;
  select bc.* into b from banco_cuenta bc join extracto_bancario e on e.banco_cuenta_id = bc.id where e.id = m.extracto_id;
  if not found then raise exception 'El extracto no tiene cuenta bancaria asignada.'; end if;
end $$;

-- Asiento banco contra una o dos cuentas; devuelve el id. Origen manual con referencia «banco:<mov>».
create or replace function public.fn_concilia_asiento(m extracto_movimiento, b banco_cuenta, p_cuenta text, p_concepto text,
                                                     p_comision numeric default 0, p_total numeric default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare ap contab_apunte_t[] := '{}'; v_id bigint; v_est text; v_err text;
  conc text := left(coalesce(nullif(btrim(p_concepto), ''), nullif(btrim(m.concepto_propio), ''), nullif(btrim(m.conceptos), ''), 'Movimiento bancario'), 120);
begin
  ap := ap || fn_contab_ap(b.cuenta_contable, m.importe, conc, m.documento);
  if coalesce(p_comision, 0) <> 0 then
    ap := ap || fn_contab_ap(b.cuenta_comisiones, p_comision, 'Comisión ' || conc, m.documento);
  end if;
  ap := ap || fn_contab_ap(p_cuenta, -(coalesce(p_total, m.importe)), conc, m.documento);
  v_id := fn_contab_crear_asiento(m.fecha_operacion, conc, 'manual', null, null, 'banco:' || m.id, ap, '[]', null, false, null, null);
  select estado, error into v_est, v_err from asiento where id = v_id;
  if v_est <> 'correcto' then raise exception 'No se pudo hacer el asiento: %', v_err; end if;
  return v_id;
end $$;

create or replace function public.fn_concilia_enlazar(p_mov bigint, p_apuntes bigint[], p_tipo text, p_asiento bigint default null,
                                                     p_regla bigint default null, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a bigint;
begin
  foreach a in array coalesce(p_apuntes, '{}') loop
    if fn_concilia_apunte_usado(a) then raise exception 'El apunte % ya está casado con otro movimiento del banco.', a; end if;
    insert into extracto_movimiento_apunte (movimiento_id, apunte_id) values (p_mov, a) on conflict do nothing;
  end loop;
  update extracto_movimiento
     set conciliado = true, conciliado_tipo = p_tipo, apunte_id = p_apuntes[1], asiento_generado_id = p_asiento,
         regla_id = p_regla, nota = coalesce(p_nota, nota), conciliado_en = now(), conciliado_por = fn_empleado_actual()
   where id = p_mov;
end $$;

create or replace function public.fn_concilia_confirmar(p_mov bigint)
returns void language plpgsql security definer set search_path = public as $$
declare x record; prop jsonb; ids bigint[]; v_as bigint; rg conciliacion_regla; cfg configuracion_contable := fn_contab_cfg();
begin
  select * into x from fn_concilia_mov(p_mov);
  prop := (x.m).propuesta;
  if prop is null then raise exception 'Este movimiento no tiene propuesta.'; end if;
  ids := array(select jsonb_array_elements_text(coalesce(prop->'apuntes', '[]'))::bigint);
  case prop->>'tipo'
    when 'apunte', 'varios' then
      perform fn_concilia_enlazar(p_mov, ids, case when prop->>'tipo' = 'varios' then 'varios' else 'apunte' end);
    when 'regla' then
      select * into rg from conciliacion_regla where id = (prop->>'regla_id')::bigint and empresa_id = fn_contab_empresa();
      if not found then raise exception 'La regla ya no existe.'; end if;
      v_as := fn_concilia_asiento(x.m, x.b, rg.cuenta_contrapartida, rg.concepto);
      perform fn_concilia_enlazar(p_mov, array(select id from apunte where asiento_id = v_as and cuenta = (x.b).cuenta_contable), 'regla', v_as, rg.id);
      update conciliacion_regla set veces = veces + 1, ultima_vez = current_date where id = rg.id;
    when 'datafono' then
      v_as := fn_concilia_asiento(x.m, x.b, cfg.cuenta_tarjetas, 'Liquidación datáfono ' || coalesce(nullif(btrim((x.m).concepto_propio), ''), ''),
                                  (prop->>'comision')::numeric, (prop->>'total')::numeric);
      perform fn_concilia_enlazar(p_mov, array(select id from apunte where asiento_id = v_as and cuenta = (x.b).cuenta_contable) || ids, 'datafono', v_as);
    when 'cobro' then
      update extracto_movimiento set conciliado = true, conciliado_tipo = 'cobro', cobro_tienda_codigo = prop->>'tienda', cobro_codigo = (prop->>'codigo')::bigint,
             conciliado_en = now(), conciliado_por = fn_empleado_actual() where id = p_mov;
    when 'pago' then
      update extracto_movimiento set conciliado = true, conciliado_tipo = 'pago', pago_tienda_codigo = prop->>'tienda', pago_codigo = (prop->>'codigo')::bigint,
             conciliado_en = now(), conciliado_por = fn_empleado_actual() where id = p_mov;
    else raise exception 'Propuesta desconocida.';
  end case;
end $$;

create or replace function public.fn_concilia_confirmar_verdes(p_banco bigint, p_desde date, p_hasta date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; ok int := 0; mal int := 0;
begin
  for r in select em.id from extracto_movimiento em join extracto_bancario e on e.id = em.extracto_id
            where e.banco_cuenta_id = p_banco and e.empresa_id = fn_contab_empresa() and e.activo and not em.conciliado
              and em.fecha_operacion between p_desde and p_hasta and em.propuesta->>'confianza' = 'verde'
            order by em.fecha_operacion, em.id loop
    begin
      perform fn_concilia_confirmar(r.id);
      ok := ok + 1;
    exception when others then
      mal := mal + 1;
      update extracto_movimiento set propuesta = propuesta || jsonb_build_object('confianza', 'amarillo', 'motivo', propuesta->>'motivo' || ' · ' || sqlerrm)
       where id = r.id;
    end;
  end loop;
  return jsonb_build_object('confirmados', ok, 'con_problema', mal);
end $$;

create or replace function public.fn_concilia_crear_asiento(p_mov bigint, p_cuenta text, p_concepto text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare x record; v_as bigint;
begin
  select * into x from fn_concilia_mov(p_mov);
  if nullif(btrim(coalesce(p_cuenta, '')), '') is null then raise exception 'Falta la cuenta de contrapartida.'; end if;
  v_as := fn_concilia_asiento(x.m, x.b, btrim(p_cuenta), p_concepto);
  perform fn_concilia_enlazar(p_mov, array(select id from apunte where asiento_id = v_as and cuenta = (x.b).cuenta_contable), 'asiento', v_as);
  return v_as;
end $$;

create or replace function public.fn_concilia_casar_apuntes(p_mov bigint, p_apuntes bigint[])
returns void language plpgsql security definer set search_path = public as $$
declare x record; s numeric;
begin
  select * into x from fn_concilia_mov(p_mov);
  select sum(case when (x.m).importe > 0 then p.debe - p.haber else p.haber - p.debe end) into s
    from apunte p where p.id = any (p_apuntes) and p.empresa_id = fn_contab_empresa() and p.cuenta = (x.b).cuenta_contable;
  if coalesce(s, 0) <> abs((x.m).importe) then
    raise exception 'Los apuntes elegidos suman % y el movimiento es de %.', coalesce(s, 0), abs((x.m).importe);
  end if;
  perform fn_concilia_enlazar(p_mov, p_apuntes, case when cardinality(p_apuntes) > 1 then 'varios' else 'apunte' end);
end $$;

create or replace function public.fn_concilia_marcar(p_mov bigint, p_nota text)
returns void language plpgsql security definer set search_path = public as $$
declare x record;
begin
  select * into x from fn_concilia_mov(p_mov);
  perform fn_concilia_enlazar(p_mov, '{}', 'manual', null, null, nullif(btrim(coalesce(p_nota, '')), ''));
end $$;

create or replace function public.fn_concilia_descartar(p_mov bigint)
returns void language plpgsql security definer set search_path = public as $$
declare x record;
begin
  select * into x from fn_concilia_mov(p_mov);
  update extracto_movimiento set propuesta = null where id = p_mov;
end $$;

create or replace function public.fn_concilia_deshacer(p_mov bigint)
returns void language plpgsql security definer set search_path = public as $$
declare m extracto_movimiento;
begin
  if auth.uid() is null and session_user not in ('postgres', 'supabase_admin') then raise exception 'Sin sesión'; end if;
  select em.* into m from extracto_movimiento em join extracto_bancario e on e.id = em.extracto_id
   where em.id = p_mov and e.empresa_id = fn_contab_empresa();
  if not found then raise exception 'El movimiento % no existe o es de otra empresa.', p_mov; end if;
  delete from extracto_movimiento_apunte where movimiento_id = p_mov;
  if m.asiento_generado_id is not null then
    perform fn_contab_anular_interno(m.asiento_generado_id, 'Deshecha la conciliación del movimiento bancario ' || p_mov);
  end if;
  update extracto_movimiento
     set conciliado = false, conciliado_tipo = null, apunte_id = null, asiento_generado_id = null, regla_id = null,
         cobro_tienda_codigo = null, cobro_codigo = null, pago_tienda_codigo = null, pago_codigo = null, nota = null,
         conciliado_en = null, conciliado_por = null, propuesta = null
   where id = p_mov;
end $$;

-- 7. Cuadre: saldo del banco contra saldo contable ---------------------------------------------------------
create or replace function public.fn_concilia_resumen(p_banco bigint, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare b banco_cuenta; v_banco numeric; v_contable numeric; v_pend_banco numeric; v_n_pend int; v_pend_libro numeric; v_n_libro int;
begin
  select * into b from banco_cuenta where id = p_banco and empresa_id = fn_contab_empresa();
  if not found then return null; end if;
  -- Saldo del banco al final del periodo: saldo inicial del primer extracto + movimientos hasta la fecha
  select (select e.saldo_inicial from extracto_bancario e where e.banco_cuenta_id = p_banco and e.activo order by e.fecha_desde, e.id limit 1)
         + coalesce((select sum(em.importe) from extracto_movimiento em join extracto_bancario e on e.id = em.extracto_id
                      where e.banco_cuenta_id = p_banco and e.activo and em.fecha_operacion <= p_hasta
                        and em.fecha_operacion >= (select min(e2.fecha_desde) from extracto_bancario e2 where e2.banco_cuenta_id = p_banco and e2.activo)), 0)
    into v_banco;
  select coalesce(sum(p.debe - p.haber), 0) into v_contable
    from apunte p join asiento a on a.id = p.asiento_id
   where p.empresa_id = b.empresa_id and a.estado = 'correcto' and p.cuenta = b.cuenta_contable and a.fecha <= p_hasta;
  select coalesce(sum(em.importe), 0), count(*) into v_pend_banco, v_n_pend
    from extracto_movimiento em join extracto_bancario e on e.id = em.extracto_id
   where e.banco_cuenta_id = p_banco and e.activo and not em.conciliado and em.fecha_operacion between p_desde and p_hasta;
  select coalesce(sum(p.debe - p.haber), 0), count(*) into v_pend_libro, v_n_libro
    from apunte p join asiento a on a.id = p.asiento_id
   where p.empresa_id = b.empresa_id and a.estado = 'correcto' and p.cuenta = b.cuenta_contable and a.fecha between p_desde and p_hasta
     and not fn_concilia_apunte_usado(p.id);
  return jsonb_build_object('saldo_banco', v_banco, 'saldo_contable', v_contable,
    'pendiente_banco', v_pend_banco, 'n_pendiente_banco', v_n_pend, 'pendiente_contable', v_pend_libro, 'n_pendiente_contable', v_n_libro);
end $$;

-- Apuntes de la cuenta del banco sin casar, para casar a mano (uno o varios).
create or replace function public.fn_concilia_candidatos(p_mov bigint, p_dias integer default 15)
returns table(id bigint, fecha date, numero integer, concepto text, contrapartida text, nombre text, importe numeric)
language sql stable security definer set search_path = public as $$
  select p.id, a.fecha, a.numero, coalesce(p.concepto, a.concepto), p.contrapartida, cc.descripcion,
         case when em.importe > 0 then p.debe - p.haber else p.haber - p.debe end
    from extracto_movimiento em
    join extracto_bancario e on e.id = em.extracto_id and e.empresa_id = fn_contab_empresa()
    join banco_cuenta b on b.id = e.banco_cuenta_id
    join apunte p on p.empresa_id = b.empresa_id and p.cuenta = b.cuenta_contable
    join asiento a on a.id = p.asiento_id and a.estado = 'correcto'
    left join cuenta_contable cc on cc.empresa_id = p.empresa_id and cc.codigo = p.contrapartida
   where em.id = p_mov and abs(a.fecha - em.fecha_operacion) <= p_dias
     and (case when em.importe > 0 then p.debe > 0 else p.haber > 0 end)
     and not fn_concilia_apunte_usado(p.id)
   order by abs(abs(em.importe) - greatest(p.debe, p.haber)), abs(a.fecha - em.fecha_operacion), p.id
   limit 300
$$;

grant execute on function public.fn_concilia_proponer(bigint, date, date, integer), public.fn_concilia_confirmar(bigint),
  public.fn_concilia_confirmar_verdes(bigint, date, date), public.fn_concilia_crear_asiento(bigint, text, text),
  public.fn_concilia_casar_apuntes(bigint, bigint[]), public.fn_concilia_marcar(bigint, text), public.fn_concilia_descartar(bigint),
  public.fn_concilia_deshacer(bigint), public.fn_concilia_resumen(bigint, date, date), public.fn_concilia_candidatos(bigint, integer) to authenticated;
revoke execute on function public.fn_concilia_asiento(extracto_movimiento, banco_cuenta, text, text, numeric, numeric),
  public.fn_concilia_enlazar(bigint, bigint[], text, bigint, bigint, text), public.fn_concilia_mov(bigint) from public, anon, authenticated;

-- Tipos de conciliación nuevos (varios apuntes, regla, asiento creado, datáfono).
alter table public.extracto_movimiento drop constraint if exists extracto_movimiento_conciliado_tipo_check;
alter table public.extracto_movimiento add constraint extracto_movimiento_conciliado_tipo_check
  check (conciliado_tipo is null or conciliado_tipo in ('apunte', 'varios', 'regla', 'asiento', 'datafono', 'cobro', 'pago', 'manual'));

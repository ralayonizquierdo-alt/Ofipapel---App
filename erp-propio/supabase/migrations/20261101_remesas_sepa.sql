-- Remesas SEPA y su conciliación (Luis, 01/11/2026: «sigue con lo que puedas a la espera de tener todos
-- los datos de GeminisWin»).
--
-- · Los recibos domiciliados ya existían: son los vencimientos de cobro_cliente (estado 'pendiente',
--   es_domiciliado) que genera fn_cobro_generar_vencimientos para las facturas con forma de pago de
--   domiciliación (40, 42-46).
-- · cliente_mandato: IBAN y mandato SEPA de cada cliente (referencia, fecha de firma, CORE/B2B).
--   Cuando se descargue GeminisWin entero se cargarán desde allí; mientras, se dan de alta a mano.
-- · banco_cuenta + IBAN, BIC e Identificador de Acreedor SEPA de la empresa en esa cuenta.
-- · remesa / remesa_recibo: la remesa que se manda al banco (fichero XML pain.008.001.02, lo genera la
--   pantalla) y los recibos que lleva.
-- · Conciliación: el abono de una remesa casa con la remesa entera (menos comisión) y, al confirmarlo,
--   se cobran todos sus recibos; un cargo de devolución (concepto 14 o «DEVOL…») casa con el recibo
--   devuelto y, al confirmarlo, el recibo vuelve a quedar pendiente (sube la deuda del cliente) y el
--   gasto del banco va a la cuenta de comisiones.
-- Todo en la empresa principal (la del ERP): los cobros son de Ofipapel.

-- 1. Mandatos ------------------------------------------------------------------------------------------
create table if not exists public.cliente_mandato (
  id bigint generated always as identity primary key,
  cliente_codigo text not null references public.cliente (codigo),
  iban text not null,
  bic text,
  titular text,
  referencia text not null unique,
  fecha_firma date not null,
  tipo text not null default 'CORE' check (tipo in ('CORE', 'B2B')),
  activo boolean not null default true,
  observaciones text,
  creado_en timestamptz not null default now(),
  creado_por text default public.fn_empleado_actual()
);
create index if not exists cliente_mandato_cliente_idx on public.cliente_mandato (cliente_codigo) where activo;
comment on table public.cliente_mandato is 'Cuenta (IBAN) y mandato SEPA de cada cliente para cobrarle por domiciliación.';
alter table public.cliente_mandato enable row level security;
drop policy if exists cliente_mandato_lee on public.cliente_mandato;
create policy cliente_mandato_lee on public.cliente_mandato for select to authenticated using (true);
drop policy if exists cliente_mandato_escribe on public.cliente_mandato;
create policy cliente_mandato_escribe on public.cliente_mandato for all to authenticated
  using (public.fn_puede('/contabilidad/remesas') or public.fn_puede('/clientes'))
  with check (public.fn_puede('/contabilidad/remesas') or public.fn_puede('/clientes'));
drop trigger if exists trg_auditoria_cliente_mandato on public.cliente_mandato;
create trigger trg_auditoria_cliente_mandato after insert or delete or update on public.cliente_mandato
  for each row execute function public.fn_auditoria_trigger();

-- 2. Datos SEPA de las cuentas de la empresa -----------------------------------------------------------
alter table public.banco_cuenta add column if not exists iban text;
alter table public.banco_cuenta add column if not exists bic text;
alter table public.banco_cuenta add column if not exists acreedor_id text;

-- 3. Remesas ---------------------------------------------------------------------------------------------
create table if not exists public.remesa (
  id bigint generated always as identity primary key,
  empresa_id smallint not null default public.fn_contab_empresa_principal() references public.empresa_contable (id),
  banco_cuenta_id bigint not null references public.banco_cuenta (id),
  referencia text not null unique,
  fecha_creacion date not null default ((now() at time zone 'Atlantic/Canary')::date),
  fecha_cargo date not null,
  estado text not null default 'preparada' check (estado in ('preparada', 'generada', 'enviada', 'abonada', 'anulada')),
  num_recibos integer not null default 0,
  total numeric not null default 0,
  fichero_xml text,
  generada_en timestamptz,
  abonada_en date,
  abono_movimiento_id bigint references public.extracto_movimiento (id),
  comision numeric,
  creado_en timestamptz not null default now(),
  creado_por text default public.fn_empleado_actual()
);
create table if not exists public.remesa_recibo (
  id bigint generated always as identity primary key,
  remesa_id bigint not null references public.remesa (id),
  cobro_tienda_codigo text not null,
  cobro_codigo bigint not null,
  cliente_codigo text not null,
  mandato_id bigint not null references public.cliente_mandato (id),
  importe numeric not null,
  vencimiento date,
  concepto text,
  e2e text not null unique,
  estado text not null default 'incluido' check (estado in ('incluido', 'cobrado', 'devuelto', 'anulado')),
  devuelto_en date,
  devolucion_movimiento_id bigint references public.extracto_movimiento (id),
  gasto_devolucion numeric,
  foreign key (cobro_tienda_codigo, cobro_codigo) references public.cobro_cliente (tienda_terminal_codigo, codigo_pago)
);
create index if not exists remesa_recibo_cobro_idx on public.remesa_recibo (cobro_tienda_codigo, cobro_codigo);
alter table public.remesa enable row level security;
alter table public.remesa_recibo enable row level security;
drop policy if exists remesa_lee on public.remesa;
create policy remesa_lee on public.remesa for select to authenticated using (true);
drop policy if exists remesa_recibo_lee on public.remesa_recibo;
create policy remesa_recibo_lee on public.remesa_recibo for select to authenticated using (true);
drop trigger if exists trg_auditoria_remesa on public.remesa;
create trigger trg_auditoria_remesa after insert or delete or update on public.remesa for each row execute function public.fn_auditoria_trigger();
drop trigger if exists trg_auditoria_remesa_recibo on public.remesa_recibo;
create trigger trg_auditoria_remesa_recibo after insert or delete or update on public.remesa_recibo for each row execute function public.fn_auditoria_trigger();

-- 4. Funciones de remesas -------------------------------------------------------------------------------
-- IBAN válido (dígitos de control, módulo 97).
create or replace function public.fn_iban_valido(p text)
returns boolean language plpgsql immutable set search_path = public as $$
declare s text := upper(regexp_replace(coalesce(p, ''), '\s', '', 'g')); r text := ''; c text; resto int := 0; i int;
begin
  if s !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$' then return false; end if;
  s := substr(s, 5) || substr(s, 1, 4);
  for i in 1 .. length(s) loop
    c := substr(s, i, 1);
    r := r || case when c ~ '[A-Z]' then (ascii(c) - 55)::text else c end;
  end loop;
  for i in 1 .. length(r) loop
    resto := (resto * 10 + substr(r, i, 1)::int) % 97;
  end loop;
  return resto = 1;
end $$;

create or replace function public.fn_remesa_permiso()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null and session_user not in ('postgres', 'supabase_admin') then raise exception 'Sin sesión'; end if;
  if not public.fn_puede('/contabilidad/remesas') then
    raise exception 'No tienes permiso para las remesas.' using errcode = '42501';
  end if;
end $$;

-- Recibos domiciliados pendientes hasta una fecha de vencimiento que no están ya en una remesa viva.
create or replace function public.fn_remesa_candidatos(p_hasta date)
returns table(tienda text, codigo bigint, cliente_codigo text, cliente_nombre text, nif text, factura text, concepto text,
              vencimiento date, importe numeric, mandato_id bigint, mandato_ref text, iban_final text, tipo text, problema text)
language sql stable security definer set search_path = public as $$
  select k.tienda_terminal_codigo, k.codigo_pago, k.cliente_codigo, coalesce(nullif(c.razon_social, ''), c.nombre), c.nif,
         k.numero_factura_externo, k.concepto, k.fecha_vencimiento, round(coalesce(k.cuota, 0) - coalesce(k.importe_cobrado, 0), 2),
         m.id, m.referencia, right(m.iban, 4), m.tipo,
         case when m.id is null then 'El cliente no tiene mandato SEPA'
              when not fn_iban_valido(m.iban) then 'El IBAN del mandato no es válido'
              when coalesce(k.cuota, 0) - coalesce(k.importe_cobrado, 0) <= 0 then 'Sin importe pendiente' end
    from cobro_cliente k
    left join cliente c on c.codigo = k.cliente_codigo
    left join lateral (select * from cliente_mandato x where x.cliente_codigo = k.cliente_codigo and x.activo order by x.fecha_firma desc, x.id desc limit 1) m on true
   where k.activo and k.estado_cobro = 'pendiente' and k.es_domiciliado and k.fecha_vencimiento <= p_hasta
     and not exists (select 1 from remesa_recibo r join remesa re on re.id = r.remesa_id
                      where r.cobro_tienda_codigo = k.tienda_terminal_codigo and r.cobro_codigo = k.codigo_pago
                        and r.estado = 'incluido' and re.estado in ('preparada', 'generada', 'enviada'))
   order by k.fecha_vencimiento, k.cliente_codigo, k.codigo_pago
$$;

create or replace function public.fn_remesa_crear(p_banco bigint, p_fecha_cargo date, p_recibos jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_ref text; j jsonb; c record; n int := 0; v_total numeric := 0; b banco_cuenta;
begin
  perform fn_remesa_permiso();
  select * into b from banco_cuenta where id = p_banco and empresa_id = fn_contab_empresa_principal();
  if not found then raise exception 'Elige la cuenta bancaria de la remesa.'; end if;
  if not fn_iban_valido(b.iban) or nullif(btrim(coalesce(b.acreedor_id, '')), '') is null then
    raise exception 'A la cuenta % le falta el IBAN o el Identificador de Acreedor SEPA (pestaña «Datos SEPA»).', b.nombre;
  end if;
  if p_fecha_cargo is null or p_fecha_cargo < (now() at time zone 'Atlantic/Canary')::date then
    raise exception 'La fecha de cargo no puede ser anterior a hoy.';
  end if;
  if jsonb_array_length(coalesce(p_recibos, '[]')) = 0 then raise exception 'Marca al menos un recibo.'; end if;
  v_ref := 'REM' || to_char(p_fecha_cargo, 'YYYYMMDD') || '-' ||
           lpad(((select count(*) from remesa where fecha_cargo = p_fecha_cargo) + 1)::text, 2, '0');
  insert into remesa (banco_cuenta_id, referencia, fecha_cargo) values (p_banco, v_ref, p_fecha_cargo) returning id into v_id;
  for j in select * from jsonb_array_elements(p_recibos) loop
    select * into c from fn_remesa_candidatos('9999-12-31') x where x.tienda = j->>'tienda' and x.codigo = (j->>'codigo')::bigint;
    if not found then raise exception 'El recibo %-% ya no está pendiente o ya está en otra remesa.', j->>'tienda', j->>'codigo'; end if;
    if c.problema is not null then raise exception 'Recibo %-% (%): %.', c.tienda, c.codigo, c.cliente_nombre, c.problema; end if;
    n := n + 1;
    insert into remesa_recibo (remesa_id, cobro_tienda_codigo, cobro_codigo, cliente_codigo, mandato_id, importe, vencimiento, concepto, e2e)
    values (v_id, c.tienda, c.codigo, c.cliente_codigo, c.mandato_id, c.importe, c.vencimiento,
            left(coalesce(c.concepto, 'Recibo ' || c.tienda || '-' || c.codigo), 140), v_ref || '-' || lpad(n::text, 4, '0'));
    v_total := v_total + c.importe;
  end loop;
  update remesa set num_recibos = n, total = round(v_total, 2) where id = v_id;
  return v_id;
end $$;

-- Datos para el fichero XML (lo monta la pantalla): remesa, acreedor y recibos con IBAN completo.
create or replace function public.fn_remesa_datos_xml(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r remesa; b banco_cuenta; e empresa;
begin
  perform fn_remesa_permiso();
  select * into r from remesa where id = p_id;
  if not found then raise exception 'No existe la remesa %.', p_id; end if;
  if r.estado in ('abonada', 'anulada') then raise exception 'La remesa % está %.', r.referencia, r.estado; end if;
  select * into b from banco_cuenta where id = r.banco_cuenta_id;
  select * into e from empresa order by codigo limit 1;
  return jsonb_build_object(
    'referencia', r.referencia, 'fecha_cargo', r.fecha_cargo, 'num', r.num_recibos, 'total', r.total,
    'acreedor', jsonb_build_object('nombre', e.nombre, 'cif', e.cif, 'id', b.acreedor_id, 'iban', b.iban, 'bic', b.bic),
    'recibos', (select jsonb_agg(jsonb_build_object(
                  'e2e', x.e2e, 'importe', x.importe, 'concepto', x.concepto, 'mandato', m.referencia, 'firma', m.fecha_firma,
                  'tipo', m.tipo, 'iban', m.iban, 'bic', m.bic,
                  'deudor', coalesce(nullif(m.titular, ''), nullif(c.razon_social, ''), c.nombre)) order by x.id)
                  from remesa_recibo x join cliente_mandato m on m.id = x.mandato_id left join cliente c on c.codigo = x.cliente_codigo
                 where x.remesa_id = p_id and x.estado = 'incluido'));
end $$;

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
  elsif p_estado = 'anulada' then
    update remesa set estado = 'anulada' where id = p_id;
    update remesa_recibo set estado = 'anulado' where remesa_id = p_id and estado = 'incluido';
  else
    raise exception 'Estado no válido.';
  end if;
end $$;

-- 5. Conciliación: remesas y devoluciones ---------------------------------------------------------------
alter table public.extracto_movimiento drop constraint if exists extracto_movimiento_conciliado_tipo_check;
alter table public.extracto_movimiento add constraint extracto_movimiento_conciliado_tipo_check
  check (conciliado_tipo is null or conciliado_tipo in ('apunte', 'varios', 'regla', 'asiento', 'datafono', 'cobro', 'pago', 'manual', 'remesa', 'devolucion'));

-- Las funciones de la fase 1 pasan a «_base» y las nuevas añaden remesas y devoluciones por delante.
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'fn_concilia_proponer_base') then
    alter function public.fn_concilia_proponer(bigint, date, date, integer) rename to fn_concilia_proponer_base;
  end if;
  if not exists (select 1 from pg_proc where proname = 'fn_concilia_confirmar_base') then
    alter function public.fn_concilia_confirmar(bigint) rename to fn_concilia_confirmar_base;
  end if;
  if not exists (select 1 from pg_proc where proname = 'fn_concilia_deshacer_base') then
    alter function public.fn_concilia_deshacer(bigint) rename to fn_concilia_deshacer_base;
  end if;
end $$;
revoke execute on function public.fn_concilia_proponer_base(bigint, date, date, integer), public.fn_concilia_confirmar_base(bigint),
  public.fn_concilia_deshacer_base(bigint) from public, anon, authenticated;

create or replace function public.fn_concilia_proponer(p_banco bigint, p_desde date, p_hasta date, p_dias integer default 3)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m extracto_movimiento; txt text; imp numeric; prop jsonb; r record; usados bigint[] := '{}';
  nv int; na int; nr int;
begin
  perform fn_concilia_proponer_base(p_banco, p_desde, p_hasta, p_dias);
  for m in
    select em.* from extracto_movimiento em join extracto_bancario e on e.id = em.extracto_id
     where e.banco_cuenta_id = p_banco and e.activo and not em.conciliado and em.fecha_operacion between p_desde and p_hasta
       and coalesce(em.propuesta->>'confianza', 'rojo') <> 'verde'
     order by em.fecha_operacion, em.id
  loop
    txt := fn_concilia_texto(m); imp := abs(m.importe); prop := null;
    if m.importe > 0 then
      -- Abono de una remesa: el total (o el total menos una comisión de hasta el 2 %).
      select re.* into r from remesa re
       where re.banco_cuenta_id = p_banco and re.estado in ('generada', 'enviada') and not (re.id = any (usados))
         and re.total >= imp and re.total - imp <= round(re.total * 0.02, 2)
         and (position(re.referencia in txt) > 0 or abs(re.fecha_cargo - m.fecha_operacion) <= p_dias + 2)
       order by position(re.referencia in txt) > 0 desc, re.total - imp, abs(re.fecha_cargo - m.fecha_operacion) limit 1;
      if found then
        usados := usados || r.id;
        prop := jsonb_build_object('tipo', 'remesa', 'remesa_id', r.id, 'comision', round(r.total - imp, 2),
          'confianza', case when position(r.referencia in txt) > 0 or r.total = imp then 'verde' else 'amarillo' end,
          'motivo', format('Remesa %s: %s recibos, %s €%s', r.referencia, r.num_recibos, r.total,
                           case when r.total <> imp then format(' menos %s € de comisión', round(r.total - imp, 2)) else '' end));
      end if;
    elsif m.concepto_comun = '14' or txt ~ '(DEVOL|IMPAGAD|RETROCES|RECHAZ)' then
      -- Devolución de un recibo cobrado por remesa: su importe (más un gasto de hasta 15 €).
      select x.id, x.importe, x.e2e, coalesce(nullif(c.razon_social, ''), c.nombre) nombre,
             coalesce(fn_concilia_nombre_en(coalesce(nullif(c.razon_social, ''), c.nombre), txt), false) or position(x.e2e in txt) > 0 seguro
        into r
        from remesa_recibo x join remesa re on re.id = x.remesa_id left join cliente c on c.codigo = x.cliente_codigo
       where re.banco_cuenta_id = p_banco and x.estado = 'cobrado' and x.importe <= imp and imp - x.importe <= 15
         and m.fecha_operacion >= re.fecha_cargo and not (x.id = any (usados))
       order by (coalesce(fn_concilia_nombre_en(coalesce(nullif(c.razon_social, ''), c.nombre), txt), false) or position(x.e2e in txt) > 0) desc,
                imp - x.importe, re.fecha_cargo desc limit 1;
      if found then
        usados := usados || r.id;
        prop := jsonb_build_object('tipo', 'devolucion', 'recibo_id', r.id, 'gasto', round(imp - r.importe, 2),
          'confianza', case when r.seguro then 'verde' else 'amarillo' end,
          'motivo', format('Devolución del recibo %s de %s (%s €)%s', r.e2e, coalesce(r.nombre, '?'), r.importe,
                           case when imp > r.importe then format(' + %s € de gastos', round(imp - r.importe, 2)) else '' end));
      end if;
    end if;
    if prop is not null then update extracto_movimiento set propuesta = prop where id = m.id; end if;
  end loop;
  select count(*) filter (where em.propuesta->>'confianza' = 'verde'), count(*) filter (where em.propuesta->>'confianza' = 'amarillo'),
         count(*) filter (where em.propuesta is null)
    into nv, na, nr
    from extracto_movimiento em join extracto_bancario e on e.id = em.extracto_id
   where e.banco_cuenta_id = p_banco and e.activo and not em.conciliado and em.fecha_operacion between p_desde and p_hasta;
  return jsonb_build_object('verde', nv, 'amarillo', na, 'rojo', nr);
end $$;

create or replace function public.fn_concilia_confirmar(p_mov bigint)
returns void language plpgsql security definer set search_path = public as $$
declare x record; prop jsonb; re remesa; rc record; v_as bigint; v_orig bigint; ap contab_apunte_t[];
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
    -- Se cobran todos sus recibos con la fecha del abono, contra la cuenta del banco.
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
    -- La comisión que se queda el banco, a su cuenta.
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
    -- El recibo vuelve a quedar pendiente (sube la deuda del cliente).
    -- Si el cobro ya estaba contabilizado: un asiento de devolución (cliente al Debe por el recibo,
    -- comisiones por los gastos, banco al Haber por el total) y el cobro queda libre para volver a
    -- contabilizarse cuando se cobre de nuevo. Si no lo estaba, solo los gastos.
    select a.id into v_orig from asiento_documento ad join asiento a on a.id = ad.asiento_id
     where ad.activo and ad.doc_tipo = 'cobro' and ad.tienda_codigo = rc.cobro_tienda_codigo and ad.numero = rc.cobro_codigo
       and a.estado = 'correcto' limit 1;
    perform fn_cobro_cliente_anular(rc.cobro_tienda_codigo, rc.cobro_codigo, 'Devuelto por el banco (' || rc.e2e || ')');
    ap := '{}';
    if v_orig is not null then
      ap := ap || fn_contab_ap(fn_contab_cuenta_cliente(rc.cliente_codigo), rc.importe, 'Devolución recibo ' || rc.e2e, rc.e2e);
    end if;
    if coalesce((prop->>'gasto')::numeric, 0) > 0 then
      ap := ap || fn_contab_ap((x.b).cuenta_comisiones, (prop->>'gasto')::numeric, 'Gastos devolución ' || rc.e2e, rc.e2e);
    end if;
    if cardinality(ap) > 0 then
      ap := ap || fn_contab_ap((x.b).cuenta_contable, -(case when v_orig is not null then rc.importe else 0 end + coalesce((prop->>'gasto')::numeric, 0)),
                               'Devolución recibo ' || rc.e2e, rc.e2e);
      v_as := fn_contab_crear_asiento((x.m).fecha_operacion, 'Devolución recibo ' || rc.e2e, 'manual', null, null, 'banco:' || p_mov, ap, '[]', null, false, null, null);
    end if;
    if v_orig is not null then
      update asiento_documento set activo = false
       where asiento_id = v_orig and doc_tipo = 'cobro' and tienda_codigo = rc.cobro_tienda_codigo and numero = rc.cobro_codigo;
    end if;
    update remesa_recibo set estado = 'devuelto', devuelto_en = (x.m).fecha_operacion, devolucion_movimiento_id = p_mov,
                             gasto_devolucion = (prop->>'gasto')::numeric where id = rc.id;
    update extracto_movimiento set conciliado = true, conciliado_tipo = 'devolucion', asiento_generado_id = v_as,
           nota = 'Devolución ' || rc.e2e, conciliado_en = now(), conciliado_por = fn_empleado_actual() where id = p_mov;
  end if;
end $$;

create or replace function public.fn_concilia_deshacer(p_mov bigint)
returns void language plpgsql security definer set search_path = public as $$
declare t text;
begin
  select conciliado_tipo into t from extracto_movimiento where id = p_mov;
  if t in ('remesa', 'devolucion') then
    raise exception 'Una remesa abonada o una devolución no se deshacen desde aquí: los cobros ya están hechos. Avisa a un administrador.';
  end if;
  perform fn_concilia_deshacer_base(p_mov);
end $$;

-- Devoluciones pendientes de gestionar (para el aviso de la pantalla de Remesas).
create or replace function public.fn_remesa_devoluciones()
returns table(id bigint, e2e text, cliente_codigo text, cliente_nombre text, telefono text, importe numeric, devuelto_en date, gasto numeric, referencia text)
language sql stable security definer set search_path = public as $$
  select x.id, x.e2e, x.cliente_codigo, coalesce(nullif(c.razon_social, ''), c.nombre), coalesce(c.telefono_movil, c.telefono_fijo),
         x.importe, x.devuelto_en, x.gasto_devolucion, re.referencia
    from remesa_recibo x join remesa re on re.id = x.remesa_id left join cliente c on c.codigo = x.cliente_codigo
   where x.estado = 'devuelto' order by x.devuelto_en desc
$$;

grant execute on function public.fn_iban_valido(text), public.fn_remesa_candidatos(date), public.fn_remesa_crear(bigint, date, jsonb),
  public.fn_remesa_datos_xml(bigint), public.fn_remesa_marcar(bigint, text, text), public.fn_remesa_devoluciones(),
  public.fn_concilia_proponer(bigint, date, date, integer), public.fn_concilia_confirmar(bigint), public.fn_concilia_deshacer(bigint) to authenticated;

-- 6. Pantalla Contabilidad → Remesas SEPA: la ven quienes ven la Conciliación Bancaria.
insert into public.permiso (codigo, descripcion, modulo, tipo, orden)
select '/contabilidad/remesas', 'Remesas SEPA', 'Contabilidad', 'menu', coalesce((select orden from public.permiso where codigo = '/contabilidad/conciliacion'), 0)
on conflict (codigo) do nothing;
insert into public.rol_permiso (rol_id, permiso_codigo)
select rp.rol_id, '/contabilidad/remesas' from public.rol_permiso rp where rp.permiso_codigo = '/contabilidad/conciliacion'
on conflict do nothing;

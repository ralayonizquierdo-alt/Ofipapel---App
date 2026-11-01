-- Contabilidad multiempresa (Luis, 31/10/2026): «en CONTANET tenemos varias contabilidades de otras
-- empresas del grupo Ofipapel; la contabilidad tiene que poder dar de alta otras empresas».
--
-- · empresa_contable: las empresas que llevan contabilidad. La 1 (principal) es Ofipapel, la del ERP:
--   solo ella recibe los asientos automáticos de ventas, facturas, cobros, pagos y caja. Las demás
--   llevan asientos manuales (y lo que se traiga de CONTANET).
-- · Cada empleado trabaja con una empresa elegida (usuario_empresa_contable); fn_contab_empresa() la
--   devuelve (la principal si no ha elegido ninguna o si no hay sesión).
-- · asiento, apunte, cuenta_contable, ejercicio_contable y extracto_bancario llevan empresa_id. Las
--   políticas RLS solo dejan ver y tocar la empresa elegida, así que todas las pantallas (Diario,
--   Mayor, balances, IGIC, conciliación…) muestran solo esa empresa sin cambiarlas una a una. Las
--   funciones SECURITY DEFINER (que saltan la RLS) filtran por empresa explícitamente.
-- · Numeración de asientos, plan de cuentas y ejercicios (cerrado / abierto) van por empresa.

-- 1. Empresas -------------------------------------------------------------------------------------
create table if not exists public.empresa_contable (
  id smallint primary key,
  nombre text not null,
  nombre_corto text,
  cif text,
  observaciones text,
  principal boolean not null default false,
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por text default public.fn_empleado_actual()
);
create unique index if not exists empresa_contable_principal_uq on public.empresa_contable (principal) where principal;
comment on table public.empresa_contable is 'Empresas con contabilidad (grupo Ofipapel). La principal (id 1) es la del ERP: recibe los asientos automáticos.';

insert into public.empresa_contable (id, nombre, nombre_corto, cif, principal)
select 1, coalesce((select nullif(nombre, '') from public.empresa order by codigo limit 1), 'OFIPAPEL'), 'OFIPAPEL',
       (select cif from public.empresa order by codigo limit 1), true
on conflict (id) do nothing;

alter table public.empresa_contable enable row level security;
drop policy if exists empresa_contable_lee on public.empresa_contable;
create policy empresa_contable_lee on public.empresa_contable for select to authenticated using (true);

create table if not exists public.usuario_empresa_contable (
  uid uuid primary key,
  empresa_id smallint not null references public.empresa_contable (id),
  actualizado_en timestamptz not null default now()
);
alter table public.usuario_empresa_contable enable row level security;
drop policy if exists usuario_empresa_contable_lee on public.usuario_empresa_contable;
create policy usuario_empresa_contable_lee on public.usuario_empresa_contable for select to authenticated using (uid = auth.uid());

create or replace function public.fn_contab_empresa_principal()
returns smallint language sql stable security definer set search_path = public as $$
  select coalesce((select id from empresa_contable where principal limit 1), 1::smallint)
$$;

-- Empresa con la que trabaja el empleado conectado. 'erp.contab_empresa' permite fijarla dentro de una
-- transacción (procesos internos).
create or replace function public.fn_contab_empresa()
returns smallint language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(current_setting('erp.contab_empresa', true), '')::smallint,
    (select u.empresa_id from usuario_empresa_contable u join empresa_contable e on e.id = u.empresa_id and e.activa
      where u.uid = auth.uid()),
    fn_contab_empresa_principal())
$$;

create or replace function public.fn_contab_elegir_empresa(p_id smallint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  if not exists (select 1 from empresa_contable where id = p_id and activa) then
    raise exception 'La empresa % no existe o está dada de baja.', p_id;
  end if;
  insert into usuario_empresa_contable (uid, empresa_id) values (auth.uid(), p_id)
  on conflict (uid) do update set empresa_id = excluded.empresa_id, actualizado_en = now();
end $$;

-- Alta / modificación de empresas (super administradores). En el alta se puede copiar el plan de
-- cuentas de otra empresa (sin las subcuentas de clientes, proveedores y acreedores).
create or replace function public.fn_contab_guardar_empresa(p jsonb, p_copiar_plan_de smallint default null)
returns smallint language plpgsql security definer set search_path = public as $$
declare v_id smallint := nullif(p->>'id', '')::smallint; v_nombre text := nullif(btrim(coalesce(p->>'nombre', '')), '');
begin
  if not fn_es_super_administrador() then
    raise exception 'Solo un super administrador puede dar de alta o modificar empresas.' using errcode = '42501';
  end if;
  if v_nombre is null then raise exception 'Falta el nombre de la empresa.'; end if;
  if v_id is not null and exists (select 1 from empresa_contable where id = v_id) then
    if (p ? 'activa') and not (p->>'activa')::boolean and (select principal from empresa_contable where id = v_id) then
      raise exception 'La empresa principal no se puede dar de baja.';
    end if;
    update empresa_contable set nombre = v_nombre, nombre_corto = nullif(btrim(coalesce(p->>'nombre_corto', '')), ''),
           cif = nullif(btrim(coalesce(p->>'cif', '')), ''), observaciones = nullif(btrim(coalesce(p->>'observaciones', '')), ''),
           activa = coalesce((p->>'activa')::boolean, activa)
     where id = v_id;
    return v_id;
  end if;
  v_id := coalesce(v_id, (select coalesce(max(id), 0) + 1 from empresa_contable));
  insert into empresa_contable (id, nombre, nombre_corto, cif, observaciones)
  values (v_id, v_nombre, nullif(btrim(coalesce(p->>'nombre_corto', '')), ''), nullif(btrim(coalesce(p->>'cif', '')), ''),
          nullif(btrim(coalesce(p->>'observaciones', '')), ''));
  if p_copiar_plan_de is not null then
    insert into cuenta_contable (empresa_id, codigo, descripcion, tipo, activa, observaciones)
    select v_id, c.codigo, c.descripcion, c.tipo, c.activa, c.observaciones
      from cuenta_contable c where c.empresa_id = p_copiar_plan_de and c.tercero_tipo is null
    on conflict do nothing;
  end if;
  return v_id;
end $$;

-- 2. empresa_id en las tablas contables ------------------------------------------------------------
alter table public.asiento add column if not exists empresa_id smallint not null default 1 references public.empresa_contable (id);
alter table public.apunte add column if not exists empresa_id smallint not null default 1 references public.empresa_contable (id);
alter table public.cuenta_contable add column if not exists empresa_id smallint not null default 1 references public.empresa_contable (id);
alter table public.ejercicio_contable add column if not exists empresa_id smallint not null default 1 references public.empresa_contable (id);
alter table public.extracto_bancario add column if not exists empresa_id smallint not null default 1 references public.empresa_contable (id);
alter table public.asiento alter column empresa_id set default public.fn_contab_empresa();
alter table public.apunte alter column empresa_id set default public.fn_contab_empresa();
alter table public.cuenta_contable alter column empresa_id set default public.fn_contab_empresa();
alter table public.ejercicio_contable alter column empresa_id set default public.fn_contab_empresa();
alter table public.extracto_bancario alter column empresa_id set default public.fn_contab_empresa();

alter table public.cuenta_contable drop constraint if exists cuenta_contable_pkey;
alter table public.cuenta_contable add constraint cuenta_contable_pkey primary key (empresa_id, codigo);
alter table public.ejercicio_contable drop constraint if exists ejercicio_contable_pkey;
alter table public.ejercicio_contable add constraint ejercicio_contable_pkey primary key (empresa_id, anio);
drop index if exists public.asiento_ejercicio_numero_uq;
create unique index asiento_ejercicio_numero_uq on public.asiento (empresa_id, ejercicio, numero) where estado <> 'anulado' and numero is not null;
create index if not exists asiento_empresa_fecha_idx on public.asiento (empresa_id, fecha);
create index if not exists apunte_empresa_cuenta_idx on public.apunte (empresa_id, cuenta);

-- 3. RLS: solo la empresa elegida -----------------------------------------------------------------
drop policy if exists autenticados_lectura_asiento on public.asiento;
create policy autenticados_lectura_asiento on public.asiento for select to authenticated using (empresa_id = (select public.fn_contab_empresa()));
drop policy if exists autenticados_lectura_apunte on public.apunte;
create policy autenticados_lectura_apunte on public.apunte for select to authenticated using (empresa_id = (select public.fn_contab_empresa()));
drop policy if exists autenticados_acceso_total_cuenta_contable on public.cuenta_contable;
create policy autenticados_acceso_total_cuenta_contable on public.cuenta_contable for all to authenticated
  using (empresa_id = (select public.fn_contab_empresa())) with check (empresa_id = (select public.fn_contab_empresa()));
drop policy if exists ejercicio_contable_lee on public.ejercicio_contable;
create policy ejercicio_contable_lee on public.ejercicio_contable for select to authenticated using (empresa_id = (select public.fn_contab_empresa()));
drop policy if exists autenticados_acceso_total_extracto_bancario on public.extracto_bancario;
create policy autenticados_acceso_total_extracto_bancario on public.extracto_bancario for all to authenticated
  using (empresa_id = (select public.fn_contab_empresa())) with check (empresa_id = (select public.fn_contab_empresa()));
drop policy if exists autenticados_acceso_total_extracto_movimiento on public.extracto_movimiento;
create policy autenticados_acceso_total_extracto_movimiento on public.extracto_movimiento for all to authenticated
  using (exists (select 1 from public.extracto_bancario e where e.id = extracto_id))
  with check (exists (select 1 from public.extracto_bancario e where e.id = extracto_id));

-- 4. Funciones -------------------------------------------------------------------------------------
create or replace function public.fn_contab_crear_asiento(p_fecha date, p_concepto text, p_origen_tipo text, p_tienda text, p_numero bigint,
  p_referencia text, p_ap contab_apunte_t[], p_docs jsonb, p_error text default null, p_editado boolean default false,
  p_numero_asiento integer default null, p_sustituye bigint default null)
returns bigint language plpgsql security definer set search_path = public as $function$
declare
  cfg public.configuracion_contable := public.fn_contab_cfg();
  ap public.contab_apunte_t[];
  dif numeric; td numeric; th numeric;
  errores text[] := case when p_error is null then '{}'::text[] else array[p_error] end;
  e text; v_id bigint; v_num integer; v_ej integer := extract(year from p_fecha)::int;
  cp_debe text; cp_haber text;
  -- Empresa: la del asiento al que sustituye; los manuales y los de cierre, la elegida; los
  -- automáticos del ERP, siempre la principal.
  v_emp smallint := coalesce((select s.empresa_id from public.asiento s where s.id = p_sustituye),
    case when coalesce(p_origen_tipo, 'manual') in ('manual', 'regularizacion', 'cierre', 'apertura') then public.fn_contab_empresa()
         else public.fn_contab_empresa_principal() end);
begin
  select coalesce(array_agg(s.x order by (s.x).importe < 0, (s.x).cuenta), '{}') into ap from (
    select row(a.cuenta, round(sum(a.importe), 2), min(a.concepto), a.documento, a.nif, min(a.tercero), a.igic_tipo,
               case when a.igic_tipo is null then null else round(sum(coalesce(a.igic_base, 0)), 2) end,
               string_agg(distinct a.error, '; '))::public.contab_apunte_t as x
      from unnest(p_ap) a
     group by a.cuenta, a.concepto, a.documento, a.nif, a.igic_tipo
    having round(sum(a.importe), 2) <> 0 or bool_or(a.error is not null)) s;

  select coalesce(sum(greatest(a.importe, 0)), 0), coalesce(sum(greatest(-a.importe, 0)), 0) into td, th from unnest(ap) a;
  dif := round(td - th, 2);
  if dif <> 0 and abs(dif) <= cfg.tolerancia_redondeo then
    ap := ap || public.fn_contab_ap(cfg.cuenta_redondeo, -dif, 'Redondeo ' || coalesce(p_concepto, ''), null);
    if dif > 0 then th := th + dif; else td := td - dif; end if;
    dif := 0;
  end if;
  if dif <> 0 then
    errores := errores || format('No cuadra: Debe %s y Haber %s (diferencia %s)', td, th, dif)::text;
  end if;
  if cardinality(ap) = 0 then
    errores := errores || 'El asiento no tiene apuntes (importe cero)'::text;
  end if;
  for e in select distinct coalesce(a.error, 'Apunte sin cuenta contable') from unnest(ap) a where a.cuenta is null or a.error is not null loop
    errores := errores || e;
  end loop;
  for e in select distinct a.cuenta from unnest(ap) a
            where a.cuenta is not null and not exists (select 1 from public.cuenta_contable c where c.empresa_id = v_emp and c.codigo = a.cuenta) loop
    errores := errores || format('La cuenta %s no existe en el Plan de Cuentas', e)::text;
  end loop;

  if cardinality(errores) = 0 then
    perform pg_advisory_xact_lock(hashtext('asiento_numero_' || v_emp), v_ej);
    v_num := coalesce(p_numero_asiento,
      (select coalesce(max(numero), 0) + 1 from public.asiento where empresa_id = v_emp and ejercicio = v_ej and estado <> 'anulado'));
  end if;

  insert into public.asiento (empresa_id, ejercicio, numero, fecha, concepto, origen_tipo, origen_tienda_codigo, origen_numero,
    origen_referencia, estado, error, editado_manual, total_debe, total_haber, sustituye_a, creado_por)
  values (v_emp, v_ej, v_num, p_fecha, coalesce(p_concepto, ''), p_origen_tipo, p_tienda, p_numero, p_referencia,
    case when cardinality(errores) = 0 then 'correcto' else 'error' end,
    nullif(array_to_string(errores, ' · '), ''), p_editado, td, th, p_sustituye, public.fn_empleado_actual())
  returning id into v_id;

  select a.cuenta into cp_debe from unnest(ap) a where a.importe > 0 order by a.importe desc limit 1;
  select a.cuenta into cp_haber from unnest(ap) a where a.importe < 0 order by a.importe limit 1;

  insert into public.apunte (empresa_id, asiento_id, linea, cuenta, debe, haber, concepto, documento, contrapartida, nif,
    tercero_nombre, igic_tipo, igic_base, error)
  select v_emp, v_id, row_number() over ()::smallint, a.cuenta, greatest(a.importe, 0), greatest(-a.importe, 0),
         coalesce(a.concepto, p_concepto), a.documento,
         case when a.importe >= 0 then cp_haber else cp_debe end, a.nif, a.tercero, a.igic_tipo, a.igic_base, a.error
    from unnest(ap) with ordinality as a(cuenta, importe, concepto, documento, nif, tercero, igic_tipo, igic_base, error, ord)
   order by a.ord;

  insert into public.asiento_documento (asiento_id, doc_tipo, tienda_codigo, numero, fecha, importe)
  select v_id, d->>'tipo', d->>'tienda', (d->>'numero')::bigint, (d->>'fecha')::date, (d->>'importe')::numeric
    from jsonb_array_elements(coalesce(p_docs, '[]'::jsonb)) d;

  return v_id;
end $function$;

create or replace function public.fn_contab_guardar_asiento(p_id bigint, p_fecha date, p_concepto text, p_apuntes jsonb)
returns bigint language plpgsql security definer set search_path = public as $function$
declare
  old public.asiento; ap public.contab_apunte_t[] := '{}'; j jsonb; td numeric := 0; th numeric := 0;
  d numeric; h numeric; v_new bigint; docs jsonb; cta text; v_num integer; v_emp smallint := public.fn_contab_empresa();
begin
  if auth.uid() is null and session_user not in ('postgres', 'supabase_admin') then raise exception 'Sin sesión'; end if;
  if p_fecha is null then raise exception 'Falta la fecha del asiento.'; end if;
  if jsonb_array_length(coalesce(p_apuntes, '[]')) < 2 then raise exception 'Un asiento necesita al menos dos apuntes.'; end if;
  if p_id is not null then
    select * into old from public.asiento where id = p_id and estado <> 'anulado' and empresa_id = v_emp for update;
    if not found then raise exception 'El asiento % no existe, está anulado o es de otra empresa.', p_id; end if;
  end if;
  for j in select * from jsonb_array_elements(p_apuntes) loop
    cta := trim(coalesce(j->>'cuenta', ''));
    d := round(coalesce((j->>'debe')::numeric, 0), 2);
    h := round(coalesce((j->>'haber')::numeric, 0), 2);
    if cta = '' then raise exception 'Hay un apunte sin cuenta.'; end if;
    if not exists (select 1 from public.cuenta_contable where empresa_id = v_emp and codigo = cta) then
      raise exception 'La cuenta % no existe en el Plan de Cuentas.', cta;
    end if;
    if d < 0 or h < 0 then raise exception 'Debe y Haber no pueden ser negativos (cuenta %).', cta; end if;
    if d <> 0 and h <> 0 then raise exception 'Un apunte no puede llevar Debe y Haber a la vez (cuenta %).', cta; end if;
    if d = 0 and h = 0 then continue; end if;
    td := td + d; th := th + h;
    ap := ap || public.fn_contab_ap(cta, d - h, coalesce(nullif(j->>'concepto', ''), p_concepto), nullif(j->>'documento', ''));
  end loop;
  if td <> th then raise exception 'El asiento no cuadra: Debe % y Haber % (diferencia %).', td, th, td - th; end if;
  if td = 0 then raise exception 'El asiento no tiene importes.'; end if;

  if p_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('tipo', doc_tipo, 'tienda', tienda_codigo, 'numero', numero,
             'fecha', fecha, 'importe', importe)), '[]') into docs
      from public.asiento_documento where asiento_id = p_id and activo;
    perform public.fn_contab_anular_interno(p_id, 'Modificado manualmente');
    v_num := case when old.numero is not null and old.ejercicio = extract(year from p_fecha) then old.numero end;
    v_new := public.fn_contab_crear_asiento(p_fecha, p_concepto, old.origen_tipo, old.origen_tienda_codigo, old.origen_numero,
               old.origen_referencia, ap, docs, null, true, v_num, p_id);
  else
    v_new := public.fn_contab_crear_asiento(p_fecha, p_concepto, 'manual', null, null, null, ap, '[]', null, true, null, null);
  end if;
  return v_new;
end $function$;

create or replace function public.fn_contab_anular_asiento(p_id bigint, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $function$
begin
  if auth.uid() is null and session_user not in ('postgres', 'supabase_admin') then raise exception 'Sin sesión'; end if;
  if not exists (select 1 from public.asiento where id = p_id and estado <> 'anulado' and empresa_id = public.fn_contab_empresa()) then
    raise exception 'El asiento % no existe, ya está anulado o es de otra empresa.', p_id;
  end if;
  perform public.fn_contab_anular_interno(p_id, coalesce(nullif(trim(p_motivo), ''), 'Anulado manualmente'));
end $function$;

create or replace function public.fn_contab_renumerar(p_ejercicio integer)
returns integer language plpgsql security definer set search_path = public as $function$
declare n integer; v_emp smallint := public.fn_contab_empresa();
begin
  if auth.uid() is null and session_user not in ('postgres', 'supabase_admin') then raise exception 'Sin sesión'; end if;
  perform pg_advisory_xact_lock(hashtext('asiento_numero_' || v_emp), p_ejercicio);
  update public.asiento set numero = numero + 1000000 where empresa_id = v_emp and ejercicio = p_ejercicio and estado = 'correcto';
  with o as (select id, row_number() over (order by fecha, id) rn from public.asiento
              where empresa_id = v_emp and ejercicio = p_ejercicio and estado = 'correcto')
  update public.asiento a set numero = o.rn from o where a.id = o.id;
  get diagnostics n = row_count;
  return n;
end $function$;

create or replace function public.fn_contab_mayor(p_cuenta text, p_desde date, p_hasta date)
returns table(cuenta text, descripcion text, asiento_id bigint, numero integer, fecha date, concepto text, documento text,
              contrapartida text, debe numeric, haber numeric, saldo numeric)
language sql stable security definer set search_path = public as $function$
  with mov as (
    select p.cuenta, a.id, a.numero, a.fecha, coalesce(p.concepto, a.concepto) concepto, p.documento, p.contrapartida, p.debe, p.haber, p.linea
      from public.apunte p join public.asiento a on a.id = p.asiento_id
     where a.empresa_id = public.fn_contab_empresa() and a.estado = 'correcto' and p.cuenta like p_cuenta || '%'
       and a.fecha between make_date(extract(year from p_desde)::int, 1, 1) and p_hasta
  ), ant as (
    select m.cuenta, sum(m.debe) d, sum(m.haber) h from mov m where m.fecha < p_desde group by m.cuenta
  ), filas as (
    select a.cuenta, null::bigint id, null::integer numero, null::date fecha, 'Saldo anterior'::text concepto, null::text documento,
           null::text contrapartida, a.d debe, a.h haber, 0 orden, 0 linea from ant a
    union all
    select m.cuenta, m.id, m.numero, m.fecha, m.concepto, m.documento, m.contrapartida, m.debe, m.haber, 1, m.linea from mov m where m.fecha >= p_desde
  )
  select f.cuenta, c.descripcion, f.id, f.numero, f.fecha, f.concepto, f.documento, f.contrapartida, f.debe, f.haber,
         sum(f.debe - f.haber) over (partition by f.cuenta order by f.orden, f.fecha, f.numero, f.id, f.linea rows unbounded preceding)
    from filas f left join public.cuenta_contable c on c.empresa_id = public.fn_contab_empresa() and c.codigo = f.cuenta
   order by f.cuenta, f.orden, f.fecha, f.numero, f.id, f.linea
$function$;

create or replace function public.fn_contab_sumas_saldos(p_desde date, p_hasta date, p_nivel integer)
returns table(cuenta text, descripcion text, debe numeric, haber numeric, saldo_deudor numeric, saldo_acreedor numeric)
language sql stable security definer set search_path = public as $function$
  select x.cta, c.descripcion, x.d, x.h, greatest(x.d - x.h, 0), greatest(x.h - x.d, 0)
    from (select left(p.cuenta, p_nivel) cta, sum(p.debe) d, sum(p.haber) h
            from public.apunte p join public.asiento a on a.id = p.asiento_id
           where a.empresa_id = public.fn_contab_empresa() and a.estado = 'correcto' and a.fecha between p_desde and p_hasta and p.cuenta is not null
           group by 1) x
    left join public.cuenta_contable c on c.empresa_id = public.fn_contab_empresa() and c.codigo = x.cta
   order by x.cta
$function$;

create or replace function public.fn_contab_saldos_anio(p_anio integer, p_sin_regularizacion boolean default false)
returns table(cuenta text, saldo numeric) language sql stable set search_path = public as $function$
  select p.cuenta, round(sum(p.debe - p.haber), 2)
    from apunte p join asiento a on a.id = p.asiento_id
   where a.empresa_id = fn_contab_empresa() and a.estado = 'correcto' and a.ejercicio = p_anio and p.cuenta is not null
     and coalesce(a.origen_tipo, '') <> 'cierre'
     and (not p_sin_regularizacion or coalesce(a.origen_tipo, '') <> 'regularizacion')
   group by p.cuenta
  having round(sum(p.debe - p.haber), 2) <> 0
$function$;

create or replace function public.fn_contab_ejercicio_bloqueo()
returns trigger language plpgsql set search_path = public as $function$
declare
  v_anios int[];
  v_emp smallint := coalesce(case when tg_op <> 'DELETE' then new.empresa_id end, old.empresa_id);
begin
  if current_setting('erp.contab_ejercicio', true) = 'on' then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'asiento' then
    v_anios := array_remove(array[
      case when tg_op <> 'INSERT' then extract(year from old.fecha)::int end,
      case when tg_op <> 'DELETE' then extract(year from new.fecha)::int end], null);
  else
    select array_agg(distinct extract(year from a.fecha)::int) into v_anios
      from asiento a where a.id in (case when tg_op <> 'INSERT' then old.asiento_id end, case when tg_op <> 'DELETE' then new.asiento_id end);
  end if;
  if exists (select 1 from ejercicio_contable e where e.empresa_id = v_emp and e.cerrado and e.anio = any (coalesce(v_anios, '{}'))) then
    raise exception 'El ejercicio % está cerrado: solo consulta. Para cambiarlo, un super administrador tiene que reabrirlo.',
      (select min(e.anio) from ejercicio_contable e where e.empresa_id = v_emp and e.cerrado and e.anio = any (v_anios))
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$function$;

create or replace function public.fn_contab_ejercicios()
returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_emp smallint := fn_contab_empresa();
begin
  insert into ejercicio_contable (empresa_id, anio, fecha_inicio, fecha_fin)
  select v_emp, y, make_date(y, 1, 1), make_date(y, 12, 31)
    from (select distinct ejercicio as y from asiento where empresa_id = v_emp union select extract(year from current_date)::int) s
  on conflict (empresa_id, anio) do nothing;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'anio', e.anio, 'cerrado', e.cerrado, 'cerrado_en', e.cerrado_en,
             'cerrado_por', public.fn_numero_operario(e.cerrado_por), 'reabierto_en', e.reabierto_en,
             'asientos', (select count(*) from asiento a where a.empresa_id = v_emp and a.ejercicio = e.anio and a.estado = 'correcto'),
             'errores', (select count(*) from asiento a where a.empresa_id = v_emp and a.ejercicio = e.anio and a.estado = 'error'))
           order by e.anio desc)
      from ejercicio_contable e where e.empresa_id = v_emp), '[]');
end;
$function$;

create or replace function public.fn_contab_cerrar_ejercicio(p_anio integer, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  cfg configuracion_contable := fn_contab_cfg();
  v_emp smallint := fn_contab_empresa();
  v_129 text := rpad('129', greatest(coalesce(cfg.longitud_subcuenta, 8), 3), '0');
  v_ej ejercicio_contable;
  v_errores int;
  v_resultado numeric;
  ap_reg contab_apunte_t[] := '{}';
  ap_cie contab_apunte_t[] := '{}';
  ap_ape contab_apunte_t[] := '{}';
  r record;
  v_reg bigint; v_cie bigint; v_ape bigint;
  v_cuentas int;
begin
  if not fn_es_super_administrador() then
    raise exception 'Solo un super administrador puede cerrar un ejercicio.' using errcode = '42501';
  end if;
  perform fn_contab_ejercicios();
  select * into v_ej from ejercicio_contable where empresa_id = v_emp and anio = p_anio;
  if not found then raise exception 'No existe el ejercicio %.', p_anio; end if;
  if v_ej.cerrado then raise exception 'El ejercicio % ya está cerrado.', p_anio; end if;
  select count(*) into v_errores from asiento where empresa_id = v_emp and ejercicio = p_anio and estado = 'error';
  if not exists (select 1 from cuenta_contable where empresa_id = v_emp and codigo = v_129) then
    raise exception 'Falta la cuenta % (Resultado del ejercicio) en el Plan de Cuentas.', v_129;
  end if;

  for r in select * from fn_contab_saldos_anio(p_anio, true) s where left(s.cuenta, 1) in ('6', '7') order by s.cuenta loop
    ap_reg := ap_reg || fn_contab_ap(r.cuenta, -r.saldo, 'Regularización ' || p_anio, null);
  end loop;
  select coalesce(sum(s.saldo), 0) into v_resultado from fn_contab_saldos_anio(p_anio, true) s where left(s.cuenta, 1) in ('6', '7');
  if cardinality(ap_reg) > 0 then
    ap_reg := ap_reg || fn_contab_ap(v_129, v_resultado, 'Regularización ' || p_anio, null);
  end if;

  for r in
    select x.cuenta, round(sum(x.saldo), 2) as saldo
      from (select s.cuenta, s.saldo from fn_contab_saldos_anio(p_anio, true) s where left(s.cuenta, 1) not in ('6', '7')
            union all select v_129, v_resultado where v_resultado <> 0) x
     group by x.cuenta having round(sum(x.saldo), 2) <> 0 order by x.cuenta
  loop
    ap_cie := ap_cie || fn_contab_ap(r.cuenta, -r.saldo, 'Cierre ' || p_anio, null);
    ap_ape := ap_ape || fn_contab_ap(r.cuenta, r.saldo, 'Apertura ' || (p_anio + 1), null);
  end loop;
  v_cuentas := cardinality(ap_cie);

  if p_simular then
    return jsonb_build_object(
      'anio', p_anio, 'simulacion', true, 'asientos_con_error', v_errores,
      'resultado', -v_resultado, 'cuentas_regularizadas', greatest(cardinality(ap_reg) - 1, 0), 'cuentas_cierre', v_cuentas);
  end if;
  if v_errores > 0 then
    raise exception 'El ejercicio % tiene % asiento(s) con error: corrígelos antes de cerrar (Contabilidad → Asientos Pendientes).', p_anio, v_errores;
  end if;

  perform set_config('erp.contab_ejercicio', 'on', true);
  if cardinality(ap_reg) > 0 then
    v_reg := fn_contab_crear_asiento(make_date(p_anio, 12, 31), 'Regularización del ejercicio ' || p_anio, 'regularizacion',
                                     null, p_anio, null, ap_reg, '[]', null, false, null, null);
  end if;
  if v_cuentas > 0 then
    v_cie := fn_contab_crear_asiento(make_date(p_anio, 12, 31), 'Cierre del ejercicio ' || p_anio, 'cierre',
                                     null, p_anio, null, ap_cie, '[]', null, false, null, null);
    insert into ejercicio_contable (empresa_id, anio, fecha_inicio, fecha_fin)
    values (v_emp, p_anio + 1, make_date(p_anio + 1, 1, 1), make_date(p_anio + 1, 12, 31))
    on conflict (empresa_id, anio) do nothing;
    v_ape := fn_contab_crear_asiento(make_date(p_anio + 1, 1, 1), 'Apertura del ejercicio ' || (p_anio + 1), 'apertura',
                                     null, p_anio, null, ap_ape, '[]', null, false, null, null);
  end if;
  update ejercicio_contable set cerrado = true, cerrado_en = now(), cerrado_por = fn_empleado_actual() where empresa_id = v_emp and anio = p_anio;
  perform set_config('erp.contab_ejercicio', 'off', true);
  return jsonb_build_object('anio', p_anio, 'simulacion', false, 'resultado', -v_resultado,
                            'asiento_regularizacion', v_reg, 'asiento_cierre', v_cie, 'asiento_apertura', v_ape);
end;
$function$;

create or replace function public.fn_contab_reabrir_ejercicio(p_anio integer, p_motivo text)
returns void language plpgsql security definer set search_path = public as $function$
declare
  r record;
  v_emp smallint := fn_contab_empresa();
begin
  if not fn_es_super_administrador() then
    raise exception 'Solo un super administrador puede reabrir un ejercicio.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Escribe el motivo de la reapertura.';
  end if;
  if not exists (select 1 from ejercicio_contable where empresa_id = v_emp and anio = p_anio and cerrado) then
    raise exception 'El ejercicio % no está cerrado.', p_anio;
  end if;
  if exists (select 1 from ejercicio_contable where empresa_id = v_emp and anio = p_anio + 1 and cerrado) then
    raise exception 'Primero hay que reabrir el ejercicio %.', p_anio + 1;
  end if;
  perform set_config('erp.contab_ejercicio', 'on', true);
  for r in select id from asiento
            where empresa_id = v_emp and estado = 'correcto' and origen_numero = p_anio
              and origen_tipo in ('regularizacion', 'cierre', 'apertura') loop
    perform fn_contab_anular_interno(r.id, 'Reapertura del ejercicio ' || p_anio || ': ' || p_motivo);
  end loop;
  update ejercicio_contable
     set cerrado = false, reabierto_en = now(), reabierto_por = fn_empleado_actual(),
         observaciones = concat_ws(' · ', observaciones, to_char(now() at time zone 'Atlantic/Canary', 'DD/MM/YYYY HH24:MI') || ' reabierto: ' || p_motivo)
   where empresa_id = v_emp and anio = p_anio;
  perform set_config('erp.contab_ejercicio', 'off', true);
end;
$function$;

-- Conciliación: los apuntes, de la empresa del extracto; cobros y pagos del ERP, solo en la principal.
create or replace function public.fn_contab_conciliar_auto(p_extracto bigint, p_dias integer default 3)
returns integer language plpgsql security definer set search_path = public as $function$
declare e public.extracto_bancario; m public.extracto_movimiento; n integer := 0; v_ap bigint; v_t text; v_c bigint;
begin
  if auth.uid() is null and session_user not in ('postgres', 'supabase_admin') then raise exception 'Sin sesión'; end if;
  select * into e from public.extracto_bancario where id = p_extracto and empresa_id = public.fn_contab_empresa();
  if not found then raise exception 'El extracto % no existe o es de otra empresa.', p_extracto; end if;
  for m in select * from public.extracto_movimiento where extracto_id = p_extracto and not conciliado order by fecha_operacion, linea loop
    v_ap := null; v_t := null; v_c := null;
    select p.id into v_ap from public.apunte p join public.asiento a on a.id = p.asiento_id
     where a.empresa_id = e.empresa_id and a.estado = 'correcto' and p.cuenta = e.cuenta_contable
       and (case when m.importe > 0 then p.debe = m.importe and p.haber = 0 else p.haber = -m.importe and p.debe = 0 end)
       and abs(a.fecha - m.fecha_operacion) <= p_dias
       and not exists (select 1 from public.extracto_movimiento x where x.apunte_id = p.id and x.conciliado)
     order by abs(a.fecha - m.fecha_operacion), p.id limit 1;
    if v_ap is not null then
      update public.extracto_movimiento set conciliado = true, conciliado_tipo = 'apunte', apunte_id = v_ap, conciliado_en = now(),
             conciliado_por = public.fn_empleado_actual() where id = m.id;
      n := n + 1; continue;
    end if;
    if e.empresa_id <> public.fn_contab_empresa_principal() then continue; end if;
    if m.importe > 0 then
      select c.tienda_terminal_codigo, c.codigo_pago into v_t, v_c from public.cobro_cliente c
       where c.activo and c.estado_cobro = 'cobrado' and c.importe_cobrado = m.importe and coalesce(c.tipo_pago, '') not ilike 'efectivo%'
         and abs(coalesce(c.fecha_pago, c.fecha) - m.fecha_operacion) <= p_dias
         and not exists (select 1 from public.extracto_movimiento x where x.conciliado and x.cobro_tienda_codigo = c.tienda_terminal_codigo and x.cobro_codigo = c.codigo_pago)
       order by abs(coalesce(c.fecha_pago, c.fecha) - m.fecha_operacion) limit 1;
      if v_c is not null then
        update public.extracto_movimiento set conciliado = true, conciliado_tipo = 'cobro', cobro_tienda_codigo = v_t, cobro_codigo = v_c,
               conciliado_en = now(), conciliado_por = public.fn_empleado_actual() where id = m.id;
        n := n + 1;
      end if;
    else
      select p.tienda_terminal_codigo, p.codigo_pago into v_t, v_c from public.pago_proveedor p
       where p.activo and p.estado_pago = 'pagado' and p.importe_pagado = -m.importe
         and abs(coalesce(p.fecha_pago, p.fecha) - m.fecha_operacion) <= p_dias
         and not exists (select 1 from public.extracto_movimiento x where x.conciliado and x.pago_tienda_codigo = p.tienda_terminal_codigo and x.pago_codigo = p.codigo_pago)
       order by abs(coalesce(p.fecha_pago, p.fecha) - m.fecha_operacion) limit 1;
      if v_c is not null then
        update public.extracto_movimiento set conciliado = true, conciliado_tipo = 'pago', pago_tienda_codigo = v_t, pago_codigo = v_c,
               conciliado_en = now(), conciliado_por = public.fn_empleado_actual() where id = m.id;
        n := n + 1;
      end if;
    end if;
  end loop;
  return n;
end $function$;

-- Lista de empresas para el selector y la pantalla Contabilidad → Empresas.
create or replace function public.fn_contab_empresas()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'nombre', e.nombre, 'nombre_corto', e.nombre_corto, 'cif', e.cif, 'observaciones', e.observaciones,
           'principal', e.principal, 'activa', e.activa, 'elegida', e.id = fn_contab_empresa(),
           'cuentas', (select count(*) from cuenta_contable c where c.empresa_id = e.id),
           'asientos', (select count(*) from asiento a where a.empresa_id = e.id and a.estado <> 'anulado'),
           'ultimo', (select max(a.fecha) from asiento a where a.empresa_id = e.id and a.estado <> 'anulado'))
         order by e.id), '[]')
    from empresa_contable e
$$;

-- Subcuentas de clientes, proveedores y transportistas: siempre en la empresa principal (la del ERP).
-- Y los asientos automáticos solo se generan en la principal.
do $$
declare f text; def text;
begin
  foreach f in array array['fn_contab_cuenta_cliente', 'fn_contab_cuenta_proveedor', 'fn_contab_cuenta_transportista'] loop
    def := pg_get_functiondef(('public.' || f)::regproc);
    if def !~ 'empresa_id' then
      def := replace(def, 'insert into public.cuenta_contable (codigo,', 'insert into public.cuenta_contable (empresa_id, codigo,');
      def := replace(def, 'values (cta,', 'values (public.fn_contab_empresa_principal(), cta,');
      def := replace(def, 'on conflict (codigo) do nothing', 'on conflict (empresa_id, codigo) do nothing');
      if def !~ 'fn_contab_empresa_principal\(\), cta' or def !~ 'on conflict \(empresa_id, codigo\)' then
        raise exception 'No se pudo adaptar %', f;
      end if;
      execute def;
    end if;
  end loop;

  def := pg_get_functiondef('public.fn_contab_generar(date, date, text[], text, text)'::regprocedure);
  if def !~ 'solo se generan en la empresa principal' then
    def := regexp_replace(def, E'\nbegin\n',
      E'\nbegin\n  if public.fn_contab_empresa() <> public.fn_contab_empresa_principal() then\n'
      || E'    raise exception ''Los asientos automáticos del ERP solo se generan en la empresa principal. Cambia de empresa arriba (Empresa).'';\n'
      || E'  end if;\n');
    if def !~ 'solo se generan en la empresa principal' then raise exception 'No se pudo adaptar fn_contab_generar'; end if;
    execute def;
  end if;
end $$;

grant execute on function public.fn_contab_empresa(), public.fn_contab_empresa_principal(), public.fn_contab_elegir_empresa(smallint),
  public.fn_contab_guardar_empresa(jsonb, smallint), public.fn_contab_empresas() to authenticated;

-- Pantalla Contabilidad → Empresas: la ven los grupos que ya ven el Plan de Cuentas (dar de alta y
-- modificar, solo super administradores).
insert into public.permiso (codigo, descripcion, modulo, tipo, orden)
select '/contabilidad/empresas', 'Empresas de la Contabilidad', 'Contabilidad', 'menu', coalesce((select orden from public.permiso where codigo = '/contabilidad/plan-cuentas'), 0)
on conflict (codigo) do nothing;
insert into public.rol_permiso (rol_id, permiso_codigo)
select rp.rol_id, '/contabilidad/empresas' from public.rol_permiso rp where rp.permiso_codigo = '/contabilidad/plan-cuentas'
on conflict do nothing;

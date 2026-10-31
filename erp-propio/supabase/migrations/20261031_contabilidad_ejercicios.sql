-- Contabilidad: ejercicios contables al estilo CONTANET (Luis, 31/10/2026).
--  1. ejercicio_contable: cada año contable, abierto o cerrado (con quién y cuándo).
--  2. Un ejercicio cerrado es SOLO CONSULTA: la base de datos no deja crear, modificar ni anular
--     asientos con fecha de ese año (trigger en asiento y apunte). Solo el cierre y la reapertura,
--     que marcan la transacción con erp.contab_ejercicio, pueden tocarlo.
--  3. fn_contab_cerrar_ejercicio: regularización (grupos 6 y 7 contra 129), asiento de cierre y
--     asiento de apertura del año siguiente; deja el año cerrado. Con p_simular = true solo dice qué
--     haría (resultado, cuentas, importes), sin escribir nada. Solo super administradores.
--  4. fn_contab_reabrir_ejercicio: anula esos tres asientos y vuelve a abrir el año. Solo super
--     administradores, con motivo; queda en la auditoría.
--  5. fn_contab_balance_situacion: Balance de situación con la estructura del PGC PYMES, del año y
--     del anterior. Cada subcuenta va al epígrafe del prefijo más largo que le corresponde.
-- La cuenta de resultado (129…) se forma con la longitud de subcuenta de configuracion_contable.

create table if not exists public.ejercicio_contable (
  anio integer primary key,
  fecha_inicio date not null,
  fecha_fin date not null,
  cerrado boolean not null default false,
  cerrado_en timestamptz,
  cerrado_por text references public.empleado (codigo),
  reabierto_en timestamptz,
  reabierto_por text references public.empleado (codigo),
  observaciones text
);
comment on table public.ejercicio_contable is 'Ejercicios contables. Cerrado = solo consulta (trigger en asiento/apunte). Se cierran y reabren con fn_contab_cerrar_ejercicio / fn_contab_reabrir_ejercicio.';
alter table public.ejercicio_contable enable row level security;
drop policy if exists ejercicio_contable_lee on public.ejercicio_contable;
create policy ejercicio_contable_lee on public.ejercicio_contable for select to authenticated using (true);
-- Sin altas ni cambios directos: solo por las funciones de abajo.

insert into public.ejercicio_contable (anio, fecha_inicio, fecha_fin)
select y, make_date(y, 1, 1), make_date(y, 12, 31)
  from (select distinct ejercicio as y from public.asiento
        union select extract(year from current_date)::int) s
on conflict (anio) do nothing;

drop trigger if exists trg_auditoria_ejercicio_contable on public.ejercicio_contable;
create trigger trg_auditoria_ejercicio_contable after insert or update or delete on public.ejercicio_contable
  for each row execute function public.fn_auditoria_trigger();

-- Ejercicio cerrado = solo consulta.
create or replace function public.fn_contab_ejercicio_bloqueo()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_anios int[];
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
  if exists (select 1 from ejercicio_contable e where e.cerrado and e.anio = any (coalesce(v_anios, '{}'))) then
    raise exception 'El ejercicio % está cerrado: solo consulta. Para cambiarlo, un super administrador tiene que reabrirlo.',
      (select min(e.anio) from ejercicio_contable e where e.cerrado and e.anio = any (v_anios))
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists trg_contab_ejercicio_bloqueo on public.asiento;
create trigger trg_contab_ejercicio_bloqueo before insert or update or delete on public.asiento
  for each row execute function public.fn_contab_ejercicio_bloqueo();
drop trigger if exists trg_contab_ejercicio_bloqueo on public.apunte;
create trigger trg_contab_ejercicio_bloqueo before insert or update or delete on public.apunte
  for each row execute function public.fn_contab_ejercicio_bloqueo();

-- Lista de ejercicios para el selector (crea el del año en curso si falta).
create or replace function public.fn_contab_ejercicios()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into ejercicio_contable (anio, fecha_inicio, fecha_fin)
  select y, make_date(y, 1, 1), make_date(y, 12, 31)
    from (select distinct ejercicio as y from asiento union select extract(year from current_date)::int) s
  on conflict (anio) do nothing;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'anio', e.anio, 'cerrado', e.cerrado, 'cerrado_en', e.cerrado_en,
             'cerrado_por', public.fn_numero_operario(e.cerrado_por), 'reabierto_en', e.reabierto_en,
             'asientos', (select count(*) from asiento a where a.ejercicio = e.anio and a.estado = 'correcto'),
             'errores', (select count(*) from asiento a where a.ejercicio = e.anio and a.estado = 'error'))
           order by e.anio desc)
      from ejercicio_contable e), '[]');
end;
$$;
grant execute on function public.fn_contab_ejercicios() to authenticated;
revoke execute on function public.fn_contab_ejercicios() from anon, public;

-- Saldos por subcuenta de un año (asientos correctos, sin el cierre).
create or replace function public.fn_contab_saldos_anio(p_anio int, p_sin_regularizacion boolean default false)
returns table (cuenta text, saldo numeric)
language sql
stable
set search_path to 'public'
as $$
  select p.cuenta, round(sum(p.debe - p.haber), 2)
    from apunte p join asiento a on a.id = p.asiento_id
   where a.estado = 'correcto' and a.ejercicio = p_anio and p.cuenta is not null
     and coalesce(a.origen_tipo, '') <> 'cierre'
     and (not p_sin_regularizacion or coalesce(a.origen_tipo, '') <> 'regularizacion')
   group by p.cuenta
  having round(sum(p.debe - p.haber), 2) <> 0
$$;

create or replace function public.fn_contab_cerrar_ejercicio(p_anio int, p_simular boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  cfg configuracion_contable := fn_contab_cfg();
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
  select * into v_ej from ejercicio_contable where anio = p_anio;
  if not found then raise exception 'No existe el ejercicio %.', p_anio; end if;
  if v_ej.cerrado then raise exception 'El ejercicio % ya está cerrado.', p_anio; end if;
  select count(*) into v_errores from asiento where ejercicio = p_anio and estado = 'error';
  if not exists (select 1 from cuenta_contable where codigo = v_129) then
    raise exception 'Falta la cuenta % (Resultado del ejercicio) en el Plan de Cuentas.', v_129;
  end if;

  -- Regularización: cada cuenta de los grupos 6 y 7 a cero contra la 129.
  for r in select * from fn_contab_saldos_anio(p_anio, true) s where left(s.cuenta, 1) in ('6', '7') order by s.cuenta loop
    ap_reg := ap_reg || fn_contab_ap(r.cuenta, -r.saldo, 'Regularización ' || p_anio, null);
  end loop;
  select coalesce(sum(s.saldo), 0) into v_resultado from fn_contab_saldos_anio(p_anio, true) s where left(s.cuenta, 1) in ('6', '7');
  -- v_resultado = Debe − Haber de 6 y 7: positivo = pérdidas, negativo = beneficio.
  if cardinality(ap_reg) > 0 then
    ap_reg := ap_reg || fn_contab_ap(v_129, v_resultado, 'Regularización ' || p_anio, null);
  end if;

  -- Cierre (todas las cuentas con saldo tras regularizar) y apertura del año siguiente.
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
    insert into ejercicio_contable (anio, fecha_inicio, fecha_fin) values (p_anio + 1, make_date(p_anio + 1, 1, 1), make_date(p_anio + 1, 12, 31))
    on conflict (anio) do nothing;
    v_ape := fn_contab_crear_asiento(make_date(p_anio + 1, 1, 1), 'Apertura del ejercicio ' || (p_anio + 1), 'apertura',
                                     null, p_anio, null, ap_ape, '[]', null, false, null, null);
  end if;
  update ejercicio_contable set cerrado = true, cerrado_en = now(), cerrado_por = fn_empleado_actual() where anio = p_anio;
  perform set_config('erp.contab_ejercicio', 'off', true);
  return jsonb_build_object('anio', p_anio, 'simulacion', false, 'resultado', -v_resultado,
                            'asiento_regularizacion', v_reg, 'asiento_cierre', v_cie, 'asiento_apertura', v_ape);
end;
$$;
grant execute on function public.fn_contab_cerrar_ejercicio(int, boolean) to authenticated;
revoke execute on function public.fn_contab_cerrar_ejercicio(int, boolean) from anon, public;

create or replace function public.fn_contab_reabrir_ejercicio(p_anio int, p_motivo text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
begin
  if not fn_es_super_administrador() then
    raise exception 'Solo un super administrador puede reabrir un ejercicio.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Escribe el motivo de la reapertura.';
  end if;
  if not exists (select 1 from ejercicio_contable where anio = p_anio and cerrado) then
    raise exception 'El ejercicio % no está cerrado.', p_anio;
  end if;
  if exists (select 1 from ejercicio_contable where anio = p_anio + 1 and cerrado) then
    raise exception 'Primero hay que reabrir el ejercicio %.', p_anio + 1;
  end if;
  perform set_config('erp.contab_ejercicio', 'on', true);
  for r in select id from asiento
            where estado = 'correcto' and origen_numero = p_anio
              and origen_tipo in ('regularizacion', 'cierre', 'apertura') loop
    perform fn_contab_anular_interno(r.id, 'Reapertura del ejercicio ' || p_anio || ': ' || p_motivo);
  end loop;
  update ejercicio_contable
     set cerrado = false, reabierto_en = now(), reabierto_por = fn_empleado_actual(),
         observaciones = concat_ws(' · ', observaciones, to_char(now() at time zone 'Atlantic/Canary', 'DD/MM/YYYY HH24:MI') || ' reabierto: ' || p_motivo)
   where anio = p_anio;
  perform set_config('erp.contab_ejercicio', 'off', true);
end;
$$;
grant execute on function public.fn_contab_reabrir_ejercicio(int, text) to authenticated;
revoke execute on function public.fn_contab_reabrir_ejercicio(int, text) from anon, public;

-- Balance de situación (PGC PYMES). Epígrafes y prefijos de cuenta: cada subcuenta va al epígrafe
-- del prefijo más largo que la cubre. Activo: saldo deudor; patrimonio neto y pasivo: saldo acreedor.
create or replace function public.fn_contab_balance_situacion(p_hasta date)
returns table (orden int, nivel int, codigo text, titulo text, lado text, importe numeric, importe_anterior numeric)
language sql
stable
set search_path to 'public'
as $$
  with epigrafe(orden, nivel, codigo, titulo, lado, prefijos) as (values
    (10, 1, 'A', 'A) ACTIVO NO CORRIENTE', 'A', null::text[]),
    (11, 2, 'A.I', 'I. Inmovilizado intangible', 'A', array['20', '280', '290']),
    (12, 2, 'A.II', 'II. Inmovilizado material', 'A', array['21', '23', '281', '291']),
    (13, 2, 'A.III', 'III. Inversiones inmobiliarias', 'A', array['22', '282', '292']),
    (14, 2, 'A.IV', 'IV. Inversiones en empresas del grupo y asociadas a largo plazo', 'A', array['2403', '2404', '2413', '2414', '2423', '2424', '2493', '2494', '293']),
    (15, 2, 'A.V', 'V. Inversiones financieras a largo plazo', 'A', array['24', '25', '26', '2495', '297', '298']),
    (16, 2, 'A.VI', 'VI. Activos por impuesto diferido', 'A', array['474']),
    (20, 1, 'B', 'B) ACTIVO CORRIENTE', 'A', null),
    (21, 2, 'B.I', 'I. Existencias', 'A', array['30', '31', '32', '33', '34', '35', '36', '39', '407']),
    (22, 2, 'B.II', 'II. Deudores comerciales y otras cuentas a cobrar', 'A', null),
    (23, 3, 'B.II.1', '1. Clientes por ventas y prestaciones de servicios', 'A', array['430', '431', '432', '433', '434', '435', '436', '437', '490', '4935']),
    (24, 3, 'B.II.2', '2. Accionistas (socios) por desembolsos exigidos', 'A', array['5580']),
    (25, 3, 'B.II.3', '3. Otros deudores', 'A', array['44', '460', '470', '471', '472', '544']),
    (26, 2, 'B.III', 'III. Inversiones en empresas del grupo y asociadas a corto plazo', 'A', array['5303', '5304', '5313', '5314', '5323', '5324', '5333', '5334', '5343', '5344', '5353', '5354', '5393', '5394', '5523', '5524', '5933', '5934', '5943', '5944', '5953', '5954']),
    (27, 2, 'B.IV', 'IV. Inversiones financieras a corto plazo', 'A', array['53', '54', '565', '566', '59']),
    (28, 2, 'B.V', 'V. Periodificaciones a corto plazo', 'A', array['480', '567']),
    (29, 2, 'B.VI', 'VI. Efectivo y otros activos líquidos equivalentes', 'A', array['57']),
    (40, 1, 'PA', 'A) PATRIMONIO NETO', 'P', null),
    (41, 2, 'PA-1', 'A-1) Fondos propios', 'P', null),
    (42, 3, 'PA-1.I', 'I. Capital', 'P', array['100', '101', '102', '1030', '1040']),
    (43, 3, 'PA-1.II', 'II. Prima de emisión', 'P', array['110']),
    (44, 3, 'PA-1.III', 'III. Reservas', 'P', array['112', '113', '114', '115', '119']),
    (45, 3, 'PA-1.IV', 'IV. (Acciones y participaciones en patrimonio propias)', 'P', array['108', '109']),
    (46, 3, 'PA-1.V', 'V. Resultados de ejercicios anteriores', 'P', array['120', '121']),
    (47, 3, 'PA-1.VI', 'VI. Otras aportaciones de socios', 'P', array['118']),
    (48, 3, 'PA-1.VII', 'VII. Resultado del ejercicio', 'P', array['129']),
    (49, 3, 'PA-1.VIII', 'VIII. (Dividendo a cuenta)', 'P', array['557']),
    (50, 2, 'PA-2', 'A-2) Subvenciones, donaciones y legados recibidos', 'P', array['130', '131', '132']),
    (60, 1, 'PB', 'B) PASIVO NO CORRIENTE', 'P', null),
    (61, 2, 'PB.I', 'I. Provisiones a largo plazo', 'P', array['14']),
    (62, 2, 'PB.II', 'II. Deudas a largo plazo', 'P', null),
    (63, 3, 'PB.II.1', '1. Deudas con entidades de crédito', 'P', array['1605', '170']),
    (64, 3, 'PB.II.2', '2. Acreedores por arrendamiento financiero', 'P', array['1625', '174']),
    (65, 3, 'PB.II.3', '3. Otras deudas a largo plazo', 'P', array['15', '16', '17', '18', '1615', '1635', '171', '172', '173', '175', '176', '177', '179', '180', '185']),
    (66, 2, 'PB.III', 'III. Deudas con empresas del grupo y asociadas a largo plazo', 'P', array['1603', '1604', '1613', '1614', '1623', '1624', '1633', '1634']),
    (67, 2, 'PB.IV', 'IV. Pasivos por impuesto diferido', 'P', array['479']),
    (68, 2, 'PB.V', 'V. Periodificaciones a largo plazo', 'P', array['181']),
    (70, 1, 'PC', 'C) PASIVO CORRIENTE', 'P', null),
    (71, 2, 'PC.I', 'I. Provisiones a corto plazo', 'P', array['499', '529']),
    (72, 2, 'PC.II', 'II. Deudas a corto plazo', 'P', null),
    (73, 3, 'PC.II.1', '1. Deudas con entidades de crédito', 'P', array['5105', '520', '527']),
    (74, 3, 'PC.II.2', '2. Acreedores por arrendamiento financiero', 'P', array['5125', '524']),
    (75, 3, 'PC.II.3', '3. Otras deudas a corto plazo', 'P', array['1034', '1044', '190', '192', '194', '50', '51', '52', '55', '56', '5115', '5135', '5145', '521', '522', '523', '525', '526', '528', '551', '5525', '555', '5565', '5566', '5595', '5598', '560', '561', '569']),
    (76, 2, 'PC.III', 'III. Deudas con empresas del grupo y asociadas a corto plazo', 'P', array['5103', '5104', '5113', '5114', '5123', '5124', '5133', '5134', '5143', '5144', '5563', '5564']),
    (77, 2, 'PC.IV', 'IV. Acreedores comerciales y otras cuentas a pagar', 'P', null),
    (78, 3, 'PC.IV.1', '1. Proveedores', 'P', array['400', '401', '403', '404', '405', '406']),
    (79, 3, 'PC.IV.2', '2. Otros acreedores', 'P', array['41', '438', '465', '466', '475', '476', '477']),
    (80, 2, 'PC.V', 'V. Periodificaciones a corto plazo', 'P', array['485', '568'])
  ),
  pref as (select e.codigo, e.lado, unnest(e.prefijos) as prefijo from epigrafe e where e.prefijos is not null),
  -- Saldo acumulado de cada subcuenta a una fecha (sin cierres ni aperturas, que se anulan entre sí).
  saldos as (
    select f.corte, p.cuenta, sum(p.debe - p.haber) as s
      from (values ('act', p_hasta), ('ant', make_date(extract(year from p_hasta)::int - 1, 12, 31))) f(corte, hasta)
      join asiento a on a.estado = 'correcto' and a.fecha <= f.hasta and coalesce(a.origen_tipo, '') not in ('cierre', 'apertura')
      join apunte p on p.asiento_id = a.id and p.cuenta is not null
     group by f.corte, p.cuenta
  ),
  -- Grupos 6 y 7 sin regularizar: los del año van a «Resultado del ejercicio»; los de años anteriores, a «Resultados de ejercicios anteriores».
  sal as (
    select s.corte, case when left(s.cuenta, 1) in ('6', '7') then '129' else s.cuenta end as cuenta, s.s from saldos s
  ),
  asignado as (
    select sal.corte, sal.s,
           (select pr.codigo from pref pr where sal.cuenta like pr.prefijo || '%' order by length(pr.prefijo) desc limit 1) as codigo
      from sal
  ),
  hoja as (
    select a.codigo, sum(case when a.corte = 'act' then a.s else 0 end) as act, sum(case when a.corte = 'ant' then a.s else 0 end) as ant
      from asignado a where a.codigo is not null group by a.codigo
  )
  select e.orden, e.nivel, e.codigo, e.titulo, e.lado,
         round(coalesce((select sum(case when e.lado = 'A' then h.act else -h.act end) from hoja h where h.codigo = e.codigo or h.codigo like e.codigo || '.%' or (e.codigo = 'PA' and h.codigo like 'PA-%')), 0), 2),
         round(coalesce((select sum(case when e.lado = 'A' then h.ant else -h.ant end) from hoja h where h.codigo = e.codigo or h.codigo like e.codigo || '.%' or (e.codigo = 'PA' and h.codigo like 'PA-%')), 0), 2)
    from epigrafe e
  union all
  select 30, 0, 'TA', 'TOTAL ACTIVO (A + B)', 'A',
         round(coalesce((select sum(h.act) from hoja h where h.codigo like 'A%' or h.codigo like 'B%'), 0), 2),
         round(coalesce((select sum(h.ant) from hoja h where h.codigo like 'A%' or h.codigo like 'B%'), 0), 2)
  union all
  select 90, 0, 'TP', 'TOTAL PATRIMONIO NETO Y PASIVO (A + B + C)', 'P',
         round(coalesce((select -sum(h.act) from hoja h where h.codigo like 'P%'), 0), 2),
         round(coalesce((select -sum(h.ant) from hoja h where h.codigo like 'P%'), 0), 2)
  union all
  -- Lo que no encaja en ningún epígrafe (para revisar el plan de cuentas).
  select 99, 0, 'SIN', 'Cuentas sin epígrafe (revisar)', 'A',
         round(coalesce((select sum(a.s) from asignado a where a.codigo is null and a.corte = 'act'), 0), 2),
         round(coalesce((select sum(a.s) from asignado a where a.codigo is null and a.corte = 'ant'), 0), 2)
   order by 1
$$;
grant execute on function public.fn_contab_balance_situacion(date) to authenticated;
revoke execute on function public.fn_contab_balance_situacion(date) from anon, public;

-- Opción de menú Contabilidad → Balance de Situación: la ven los grupos que ya ven Sumas y Saldos.
insert into public.permiso (codigo, descripcion, modulo, tipo, orden)
select '/contabilidad/balance-situacion', 'Balance de Situación', 'Contabilidad', 'menu', coalesce((select orden from public.permiso where codigo = '/contabilidad/perdidas-ganancias'), 0)
on conflict (codigo) do nothing;
insert into public.rol_permiso (rol_id, permiso_codigo)
select rp.rol_id, '/contabilidad/balance-situacion' from public.rol_permiso rp where rp.permiso_codigo = '/contabilidad/sumas-saldos'
on conflict do nothing;

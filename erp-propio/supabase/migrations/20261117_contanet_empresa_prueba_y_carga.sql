-- CONTANET, fase 5 (prueba): empresa de contabilidad aparte para cargar Ofipapel 2026 tal como está en
-- CONTANET y que Mónica pruebe el diario con sus datos (Rober, 17/11/2026: «cárgalo en la empresa de prueba»).
--
--  · Empresa 2 «OFIPAPEL 2026 - PRUEBA CONTANET»: no se mezcla con la empresa 1 ni con sus asientos.
--  · fn_contanet_carga_tmp: puerta de carga TEMPORAL. La usa un programa desde fuera, por lotes; exige
--    una clave de un solo uso de la que aquí solo está la huella (sha-256). Solo escribe en la empresa 2.
--    Carga sin disparadores (auditoría, cadena de huellas, bloqueo de periodos): son 228.000 líneas de
--    histórico, no trabajo de nadie. Por eso «Comprobar integridad» dirá, en la empresa 2, que esos
--    asientos no tienen huella: es lo esperado.
--    AL TERMINAR LA CARGA SE LE QUITA EL PERMISO (ver el final de este fichero) y se borra en la limpieza.
--  · fn_contab_diario_resumen / fn_contab_cuenta_totales: para que el diario no tenga que traerse el año
--    entero al navegador. Respetan la RLS (solo la empresa con la que se trabaja).
-- Los datos de CONTANET no están en el repositorio.

insert into public.empresa_contable (id, nombre, nombre_corto, observaciones)
values (2, 'OFIPAPEL 2026 - PRUEBA CONTANET', 'PRUEBA CONTANET', 'Copia del diario de CONTANET (Ofipapel 2026) para probar. No es la contabilidad oficial.')
on conflict (id) do nothing;

insert into public.ejercicio_contable (empresa_id, anio, fecha_inicio, fecha_fin)
values (2, 2026, '2026-01-01', '2026-12-31')
on conflict (empresa_id, anio) do nothing;

create or replace function public.fn_contanet_carga_tmp(p_clave text, p_tipo text, p_filas jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '120s'
as $$
declare v_n integer;
begin
  if encode(sha256(convert_to(coalesce(p_clave, ''), 'UTF8')), 'hex') <> '1570d5301f9a66af39d4118216a232dba793fe67fe77cc636695059772ab564d' then
    raise exception 'Clave de carga incorrecta.' using errcode = '42501';
  end if;
  -- Los disparadores se apagan solo dentro de este lote (el cambio es de la transacción: nadie más lo ve).
  alter table cuenta_contable disable trigger user; alter table asiento disable trigger user; alter table apunte disable trigger user;
  if p_tipo = 'cuentas' then
    insert into cuenta_contable (empresa_id, codigo, descripcion, nif) -- nivel y grupo los calcula la tabla
    select 2, j->>'c', coalesce(nullif(j->>'d', ''), '(sin título)'), nullif(j->>'n', '')
      from jsonb_array_elements(p_filas) j
    on conflict (empresa_id, codigo) do nothing;
  elsif p_tipo = 'asientos' then
    insert into asiento (empresa_id, ejercicio, numero, fecha, concepto, origen_tipo, origen_tienda_codigo, estado, total_debe, total_haber, creado_por)
    select 2, 2026, (j->>'n')::integer, (j->>'f')::date, coalesce(j->>'d', ''), j->>'o', nullif(j->>'c', ''), 'correcto', (j->>'td')::numeric, (j->>'th')::numeric, 'CONTANET'
      from jsonb_array_elements(p_filas) j
     where not exists (select 1 from asiento a where a.empresa_id = 2 and a.ejercicio = 2026 and a.numero = (j->>'n')::integer);
  elsif p_tipo = 'apuntes' then
    insert into apunte (empresa_id, asiento_id, linea, cuenta, debe, haber, concepto, documento)
    select 2, a.id, (j->>'l')::smallint, j->>'c', (j->>'db')::numeric, (j->>'hb')::numeric, nullif(j->>'d', ''), nullif(j->>'r', '')
      from jsonb_array_elements(p_filas) j
      join asiento a on a.empresa_id = 2 and a.ejercicio = 2026 and a.numero = (j->>'n')::integer and a.estado = 'correcto'
    on conflict (asiento_id, linea) do nothing;
  else
    raise exception 'Tipo de carga desconocido: %', p_tipo;
  end if;
  get diagnostics v_n = row_count;
  alter table cuenta_contable enable trigger user; alter table asiento enable trigger user; alter table apunte enable trigger user;
  return v_n;
end $$;
revoke all on function public.fn_contanet_carga_tmp(text, text, jsonb) from public;
grant execute on function public.fn_contanet_carga_tmp(text, text, jsonb) to anon;

-- Totales del diario de un ejercicio y siguiente número de asiento.
create or replace function public.fn_contab_diario_resumen(p_anio integer)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $$
  select jsonb_build_object('debe', coalesce(sum(total_debe), 0), 'haber', coalesce(sum(total_haber), 0),
                            'asientos', count(*), 'siguiente', coalesce(max(numero), 0) + 1)
    from asiento where ejercicio = p_anio and estado = 'correcto'
$$;
revoke all on function public.fn_contab_diario_resumen(integer) from public, anon;
grant execute on function public.fn_contab_diario_resumen(integer) to authenticated;

-- Debe y haber de una cuenta en un ejercicio (zona de estado del diario).
create or replace function public.fn_contab_cuenta_totales(p_cuenta text, p_anio integer)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $$
  select jsonb_build_object('debe', coalesce(sum(p.debe), 0), 'haber', coalesce(sum(p.haber), 0))
    from apunte p join asiento a on a.id = p.asiento_id
   where p.cuenta = p_cuenta and a.ejercicio = p_anio and a.estado = 'correcto'
$$;
revoke all on function public.fn_contab_cuenta_totales(text, integer) from public, anon;
grant execute on function public.fn_contab_cuenta_totales(text, integer) to authenticated;

-- Terminada la carga (17/11/2026): fuera el permiso. La función se borra en la limpieza.
revoke execute on function public.fn_contanet_carga_tmp(text, text, jsonb) from anon;

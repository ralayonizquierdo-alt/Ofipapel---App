-- Conciliación bancaria, fase 3 (Luis, 01/11/2026): informe de partidas pendientes por banco y
-- antigüedad. A una fecha: movimientos del banco sin conciliar (están en el banco y no en la
-- contabilidad) y apuntes de la cuenta del banco sin casar (están en la contabilidad y todavía no
-- han salido en el banco: cheques, remesas, transferencias en camino…), con los días que llevan.
create or replace function public.fn_concilia_pendientes(p_banco bigint, p_hasta date)
returns table(lado text, fecha date, concepto text, documento text, importe numeric, dias integer, referencia text)
language plpgsql stable security definer set search_path = public as $$
declare b banco_cuenta;
begin
  if auth.uid() is null and session_user not in ('postgres', 'supabase_admin') then raise exception 'Sin sesión'; end if;
  select * into b from banco_cuenta where id = p_banco and empresa_id = fn_contab_empresa();
  if not found then raise exception 'La cuenta bancaria % no existe o es de otra empresa.', p_banco; end if;
  return query
    select 'banco'::text, em.fecha_operacion,
           -- concepto_propio del Norma 43 es un código del banco (p. ej. «099»): solo si no hay texto.
           coalesce(nullif(btrim(em.conceptos), ''), nullif(btrim(em.concepto_propio), '')),
           em.documento, em.importe, (p_hasta - em.fecha_operacion)::int, em.propuesta->>'motivo'
      from extracto_movimiento em join extracto_bancario e on e.id = em.extracto_id
     where e.banco_cuenta_id = p_banco and e.activo and not em.conciliado and em.fecha_operacion <= p_hasta
    union all
    select 'contabilidad'::text, a.fecha, coalesce(p.concepto, a.concepto), p.documento, p.debe - p.haber, (p_hasta - a.fecha)::int,
           'Asiento ' || a.numero
      from apunte p join asiento a on a.id = p.asiento_id
     where p.empresa_id = b.empresa_id and a.estado = 'correcto' and p.cuenta = b.cuenta_contable and a.fecha <= p_hasta
       and a.fecha >= coalesce((select min(e2.fecha_desde) from extracto_bancario e2 where e2.banco_cuenta_id = p_banco and e2.activo), p_hasta)
       and not fn_concilia_apunte_usado(p.id)
     order by 1, 2;
end $$;
grant execute on function public.fn_concilia_pendientes(bigint, date) to authenticated;

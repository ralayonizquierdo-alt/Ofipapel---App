-- Contabilidad por tienda (Luis, 01/11/2026): resultado (ingresos y gastos) de cada tienda.
-- Los asientos automáticos ya llevan su tienda (asiento.origen_tienda_codigo: la del ticket, la
-- factura, el cobro…). Ahora también los manuales: fn_contab_guardar_asiento admite p_tienda
-- (opcional; al modificar se conserva la que tenía si no se cambia). Informe:
-- fn_contab_resultado_tiendas (grupos 6 y 7 por tienda y cuenta de 3 dígitos, sin regularización
-- ni cierre).

drop function if exists public.fn_contab_guardar_asiento(bigint, date, text, jsonb);
create or replace function public.fn_contab_guardar_asiento(p_id bigint, p_fecha date, p_concepto text, p_apuntes jsonb, p_tienda text default null)
returns bigint language plpgsql security definer set search_path = public as $function$
declare
  old public.asiento; ap public.contab_apunte_t[] := '{}'; j jsonb; td numeric := 0; th numeric := 0;
  d numeric; h numeric; v_new bigint; docs jsonb; cta text; v_num integer; v_emp smallint := public.fn_contab_empresa();
  v_tienda text := nullif(btrim(coalesce(p_tienda, '')), '');
begin
  if auth.uid() is null and session_user not in ('postgres', 'supabase_admin') then raise exception 'Sin sesión'; end if;
  if p_fecha is null then raise exception 'Falta la fecha del asiento.'; end if;
  if jsonb_array_length(coalesce(p_apuntes, '[]')) < 2 then raise exception 'Un asiento necesita al menos dos apuntes.'; end if;
  if v_tienda is not null and not exists (select 1 from public.tienda_terminal where codigo = v_tienda) then
    raise exception 'No existe la tienda %.', v_tienda;
  end if;
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
    v_new := public.fn_contab_crear_asiento(p_fecha, p_concepto, old.origen_tipo, coalesce(v_tienda, old.origen_tienda_codigo), old.origen_numero,
               old.origen_referencia, ap, docs, null, true, v_num, p_id);
  else
    v_new := public.fn_contab_crear_asiento(p_fecha, p_concepto, 'manual', v_tienda, null, null, ap, '[]', null, true, null, null);
  end if;
  return v_new;
end $function$;
grant execute on function public.fn_contab_guardar_asiento(bigint, date, text, jsonb, text) to authenticated;

create or replace function public.fn_contab_resultado_tiendas(p_desde date, p_hasta date)
returns table(tienda text, tienda_nombre text, cuenta text, descripcion text, importe numeric)
language sql stable security definer set search_path = public as $$
  select coalesce(a.origen_tienda_codigo, ''), t.descripcion, left(p.cuenta, 3), c.descripcion, round(sum(p.haber - p.debe), 2)
    from apunte p join asiento a on a.id = p.asiento_id
    left join tienda_terminal t on t.codigo = a.origen_tienda_codigo
    left join cuenta_contable c on c.empresa_id = a.empresa_id and c.codigo = left(p.cuenta, 3)
   where a.empresa_id = fn_contab_empresa() and a.estado = 'correcto' and a.fecha between p_desde and p_hasta
     and left(p.cuenta, 1) in ('6', '7') and coalesce(a.origen_tipo, '') not in ('regularizacion', 'cierre')
   group by 1, 2, 3, 4
  having round(sum(p.haber - p.debe), 2) <> 0
   order by 3, 1
$$;
grant execute on function public.fn_contab_resultado_tiendas(date, date) to authenticated;

insert into public.permiso (codigo, descripcion, modulo, tipo, orden)
select '/contabilidad/resultados-tiendas', 'Resultados por Tienda', 'Contabilidad', 'menu', coalesce((select orden from public.permiso where codigo = '/contabilidad/perdidas-ganancias'), 0)
on conflict (codigo) do nothing;
insert into public.rol_permiso (rol_id, permiso_codigo)
select rp.rol_id, '/contabilidad/resultados-tiendas' from public.rol_permiso rp where rp.permiso_codigo = '/contabilidad/perdidas-ganancias'
on conflict do nothing;

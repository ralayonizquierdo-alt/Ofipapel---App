-- Una entrega con incidencia (faltan cosas, devuelve, no corresponde…) NO está cobrada (Rober, 23/11/2026: «cuando el
-- repartidor selecciona incidencia ese pedido le sigue saliendo como cobrado en la pestaña de caja»). Se trata igual que
-- «entregada sin cobrar»: no sale en la caja para liquidar, no se puede liquidar, y la oficina la ve en «el repartidor no cobró».
do $$
declare d text := pg_get_functiondef('reparto_privado.por_cobrar(boolean,boolean)'::regprocedure);
begin
  if position('l.incidencia is null' in d) = 0 then
    d := replace(d, '(p_sup or (g.forma_pago = 1 and l.motivo_no_cobro is null))',
                    '(p_sup or (g.forma_pago = 1 and l.motivo_no_cobro is null and l.incidencia is null))');
    if position('l.incidencia is null' in d) = 0 then raise exception 'No se pudo cambiar reparto_privado.por_cobrar'; end if;
    execute d;
  end if;
end $$;

do $$
declare d text := pg_get_functiondef('public.fn_app_rep_liquidar(uuid,jsonb,numeric,text)'::regprocedure);
begin
  if position('x.incidencia' in d) = 0 then
    d := replace(d, 'l.estado, l.motivo_no_cobro, l.cobro_medio,', 'l.estado, l.motivo_no_cobro, l.incidencia, l.cobro_medio,');
    d := replace(d, '    v_imp := round(greatest(',
      '    if x.incidencia is not null then' || chr(10)
      || '      raise exception ''La factura % se entregó con incidencia: no está cobrada, la revisa administración.'', coalesce(x.factura_numero, x.vt || ''/'' || x.vn);' || chr(10)
      || '    end if;' || chr(10)
      || '    v_imp := round(greatest(');
    if position('x.incidencia' in d) = 0 or position('l.incidencia, l.cobro_medio' in d) = 0 then raise exception 'No se pudo cambiar fn_app_rep_liquidar'; end if;
    execute d;
  end if;
end $$;

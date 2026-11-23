-- Caja (Mónica): las facturas cobradas en reparto que falta apuntar en GeminisWin salen todas, sean de cuando sean
-- (Rober, 23/11/2026: «aunque sean de hace 10 años, que las vaya viendo a su ritmo»). Antes, solo las de 45 días.
do $$
declare d text := pg_get_functiondef('public.fn_app_rep_liquidaciones(uuid)'::regprocedure);
begin
  if position('l.liquidado_en > now() - interval ''45 days''' in d) > 0 then
    d := replace(d, ' and l.liquidado_en > now() - interval ''45 days''', '');
    execute d;
  end if;
  if position('45 days' in pg_get_functiondef('public.fn_app_rep_liquidaciones(uuid)'::regprocedure)) > 0 then
    raise exception 'No se pudo quitar el límite de 45 días en fn_app_rep_liquidaciones';
  end if;
end $$;

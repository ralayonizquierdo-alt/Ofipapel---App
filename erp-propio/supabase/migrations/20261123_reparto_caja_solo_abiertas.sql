-- Caja (Mónica), corrección de 20261123_reparto_caja_rutas_cerradas (Rober, 23/11/2026): «si una ruta está cerrada,
-- está cerrada; se crea otra mañana y las facturas no cobradas pasan a su estado». En «Cobrar a los repartidores» solo
-- salen las rutas ABIERTAS. Lo entregado y sin cobrar de rutas cerradas lo ve Gestión (David) en «Por cobrar»; lo
-- cobrado y liquidado que falta apuntar en GeminisWin le sale a Mónica en su cuadro (fn_app_rep_liquidaciones → apuntar).
do $$
declare d text := pg_get_functiondef('reparto_privado.por_cobrar(boolean,boolean)'::regprocedure);
  viejo constant text := ' or (p_caja and not p_sup and r.fecha > fn_app_rep_hoy() - 10 and (l.cobro_medio is not null or l.entregado_en is not null))';
begin
  if position(viejo in d) > 0 then
    d := replace(d, viejo, '');
    execute d;
  end if;
  if position('fn_app_rep_hoy() - 10' in pg_get_functiondef('reparto_privado.por_cobrar(boolean,boolean)'::regprocedure)) > 0 then
    raise exception 'La caja sigue viendo rutas cerradas en reparto_privado.por_cobrar';
  end if;
end $$;

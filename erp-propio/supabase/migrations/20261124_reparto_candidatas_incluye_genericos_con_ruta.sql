-- Las facturas de clientes «genéricos» que traen ruta entran en el reparto como las demás (Rober, 24/11/2026). Hasta ahora erp_candidatas
-- descartaba a todo cliente genérico aunque la factura llevara ruta (la ruta ya se exige aparte: k.ruta is not null), y por eso quedaron
-- fuera de la ruta de hoy las facturas 1103747, 1103760, 1103765 (ruta 5) y 1103775 (ruta 2), que GeminisWin sí tenía en sus repartos.
do $$
declare
  d text := pg_get_functiondef('reparto_privado.erp_candidatas(date)'::regprocedure);
  v_viejo text := 'and not coalesce(g.generico, c.es_generico, false)';
begin
  if position(v_viejo in d) > 0 then
    d := replace(d, v_viejo, '');
    if position('es_generico' in d) > 0 then raise exception 'No se pudo cambiar erp_candidatas.'; end if;
    execute d;
  end if;
end $$;

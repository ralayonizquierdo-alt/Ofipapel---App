-- La Caja enseña también lo que los repartidores no han liquidado de AYER, no solo lo de hoy (Rober, 24/11/2026: Julio no pagó sus facturas
-- de ayer y a Mónica solo le salían las de hoy). reparto_privado.por_cobrar solo miraba los repartos abiertos (y, en la vista de supervisor,
-- el de hoy); el reparto de ayer ya está cerrado y quedaba fuera. Ahora, además, entran los de contado del día anterior que sigan
-- sin liquidar (en cuanto se liquidan pasan a «liquidado» y salen solas). La app los enseña por ruta, con cada día aparte y el total.
do $$
declare
  d text := pg_get_functiondef('reparto_privado.por_cobrar(boolean,boolean)'::regprocedure);
  d2 text;
begin
  if position('fn_app_rep_hoy() - 1' in d) = 0 then
    d2 := regexp_replace(d, '\(r\.estado\s*=\s*2\s+or\s+\(not\s+\(p_caja\s+and\s+not\s+p_sup\)',
                         '(r.estado = 2 or (r.estado <> 2 and r.fecha >= fn_app_rep_hoy() - 1 and g.forma_pago = 1) or (not (p_caja and not p_sup)');
    if d2 = d or position('fn_app_rep_hoy() - 1' in d2) = 0 then raise exception 'No se pudo cambiar reparto_privado.por_cobrar.'; end if;
    execute d2;
  end if;
end $$;

-- Generar repartos → «Comparar con GeminisWin»: las ventas ya entregadas cuentan (Rober, 19/11/2026: «pero ayer el ERP
-- ya tenía las ventas»). Tenía razón: al comparar a media mañana, la ruta 5 salía con 16 ventas «solo en GeminisWin»,
-- y eran justo las que Juan ya había entregado. La propuesta no incluye lo ya entregado (para no repartirlo dos veces),
-- pero en una ruta que sigue en GeminisWin, lo entregado DENTRO de su reparto abierto de GeminisWin sí debe contar para
-- comparar. Las rutas que ya se generan en el ERP no cambian.
do $$
declare v text := pg_get_functiondef('reparto_privado.erp_candidatas(date)'::regprocedure);
  viejo text := $a$          and (l.estado in ('entregado', 'liquidado', 'devuelto')
               or$a$;
  nuevo text := $a$          and ((l.estado in ('entregado', 'liquidado', 'devuelto')
                and not (r.origen = 'geminiswin' and not r.generado_erp and r.estado = 2 and not (par.rutas_erp ? k.ruta)))
               or$a$;
begin
  if position('and not (r.origen = ''geminiswin'' and not r.generado_erp and r.estado = 2 and not (par.rutas_erp ? k.ruta)))
               or' in v) > 0 then return; end if;
  if position(viejo in v) = 0 then raise exception 'erp_candidatas no tiene el trozo esperado'; end if;
  v := replace(v, viejo, nuevo);
  execute v;
end $$;

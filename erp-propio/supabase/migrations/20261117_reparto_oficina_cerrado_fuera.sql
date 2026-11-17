-- App de reparto, «Todas las rutas»: el reparto cerrado desaparece al generarse el siguiente (Rober, 17/11/2026).
--
-- Antes un reparto cerrado seguía en la lista hasta que acababa el día. Pero desde que se genera el reparto
-- nuevo de esa misma ruta, el anterior ya no pinta nada ahí. Ahora un reparto cerrado de hoy solo se ve
-- mientras su ruta no tenga uno más nuevo.
-- La misma regla vale para la Caja y «Por cobrar» (fn_app_rep_por_cobrar), por decisión de Rober: al
-- generarse el reparto nuevo, lo del anterior sale de toda la app. Ojo: si un repartidor entrega el dinero
-- después de generarse el reparto siguiente, sus facturas ya no estarán en la Caja.
do $$
declare v text; a text := $a$r.estado = 2 or r.fecha = v_hoy$a$;
  b text := $b$r.estado = 2 or (r.fecha = v_hoy and not exists (select 1 from reparto n where n.ruta_codigo = r.ruta_codigo and n.numero > r.numero))$b$;
begin
  v := pg_get_functiondef('public.fn_app_rep_todas(uuid)'::regprocedure);
  if position(b in v) > 0 then return; end if;
  if position(a in v) = 0 then raise exception 'no encuentro la condición de las rutas en fn_app_rep_todas'; end if;
  execute replace(v, a, b);
end $$;

do $$
declare v text; a text := $a$where (r.estado = 2 or r.fecha = v_hoy) and not r.oculto$a$;
  b text := $b$where (r.estado = 2 or (r.fecha = v_hoy and not exists (select 1 from reparto n where n.ruta_codigo = r.ruta_codigo and n.numero > r.numero))) and not r.oculto$b$;
begin
  v := pg_get_functiondef('public.fn_app_rep_por_cobrar(uuid)'::regprocedure);
  if position(b in v) > 0 then return; end if;
  if position(a in v) = 0 then raise exception 'no encuentro la condición de los repartos en fn_app_rep_por_cobrar'; end if;
  execute replace(v, a, b);
end $$;

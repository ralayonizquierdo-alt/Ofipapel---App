-- Reparto, vista de oficina de la app: cada factura lleva su forma de pago (Rober y David, 17/11/2026).
--
-- En GeminisWin una venta puede ir como «contado» (FORMAPAGO = 1) y tener como forma de pago una remesa
-- bancaria, una transferencia o un confirming. En la lista de la oficina solo se veía «Revisar y cobrar»,
-- y no se entendía por qué el repartidor no había cobrado. fn_app_rep_todas_lineas devuelve ahora también
-- «forma_pago» (el texto de GeminisWin, tal cual), como ya hacía fn_app_rep_lineas para el repartidor.
do $$
declare v text; a text := $a$'contado', g.forma_pago = 1,$a$; b text := $b$'contado', g.forma_pago = 1, 'forma_pago', g.forma_pago_texto,$b$;
begin
  v := pg_get_functiondef('public.fn_app_rep_todas_lineas(uuid, text, bigint)'::regprocedure);
  if position(b in v) > 0 then return; end if;
  if position(a in v) = 0 then raise exception 'no encuentro el punto donde añadir la forma de pago'; end if;
  execute replace(v, a, b);
end $$;

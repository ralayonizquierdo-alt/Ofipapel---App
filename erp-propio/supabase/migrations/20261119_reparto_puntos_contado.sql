-- Barra de puntos (Rober, 19/11/2026): los pedidos de CONTADO pendientes de cobrar van en azul mientras están por
-- entregar, para distinguirlos de los albaranes. Cada punto lleva 'c' = true si la venta (de GeminisWin) es de contado
-- (forma de pago 1) y le queda importe por cobrar. Parche idempotente sobre reparto_privado.seguimiento.
do $$
declare d text := pg_get_functiondef('reparto_privado.seguimiento(date)'::regprocedure);
  a text := '''e'', x.e, ''h'', to_char(x.t at time zone ''Atlantic/Canary'', ''HH24:MI''))';
  b text := E'l.orden\n                              from reparto_linea l where l.tienda_terminal_codigo = r.tienda_terminal_codigo and l.numero = r.numero\n                               and l.estado <> ''anulado'') x';
begin
  if position('''c'', x.c' in d) > 0 then return; end if;
  if position(a in d) = 0 or position(b in d) = 0 then raise exception 'seguimiento: no encuentro dónde añadir el contado'; end if;
  d := replace(d, a, '''e'', x.e, ''c'', x.c, ''h'', to_char(x.t at time zone ''Atlantic/Canary'', ''HH24:MI''))');
  d := replace(d, b, E'l.orden,\n                                   exists (select 1 from reparto_gw_venta g where g.venta_tienda_codigo = l.venta_tienda_codigo and g.venta_numero = l.venta_numero\n                                            and g.forma_pago = 1 and coalesce(g.total, 0) > coalesce(g.total_pagado, 0)) c\n' || substr(b, length('l.orden') + 2));
  execute d;
end $$;

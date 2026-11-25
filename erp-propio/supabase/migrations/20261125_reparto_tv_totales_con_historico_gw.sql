-- Rober, 25/11/2026: la TV decía «Año 1239» porque el ERP solo tiene repartos desde el 22/10/2026 (y los de GeminisWin, completos
-- solo desde el 12/11). Cowork contó en GeminisWin los pedidos entregados de 2026 (nota 174: repartos.dbf + reparlin.dbf a las
-- 08:56 UTC del 25/11, estado 4/5, cada pedido una vez, sin rutas 08 y 11). Esos números quedan en el parámetro
-- reparto.tv_historico_gw y la TV los suma:
--   · Mes y Año = histórico de GeminisWin + lo del ERP que no está en el histórico (repartos generados en el ERP, o de GeminisWin con
--     fecha posterior a «hasta»). Los repartos de GeminisWin con fecha hasta «hasta» no se cuentan dos veces.
--   · Semana: como antes (todo lo del ERP), sin las rutas que la TV oculta (08 y 11).
-- Comprobado el 25/11: mes 2145 (1875 + 270), año 27065 (26795 + 270), semana 419.
-- Aplicada en Supabase como «reparto_tv_totales_con_historico_gw»; se sustituye el bloque 'totales' de reparto_privado.seguimiento
-- (ver la definición viva para el texto completo).
insert into parametro (clave, valor, descripcion)
values ('reparto.tv_historico_gw',
  '{"hasta":"2026-11-25","meses":{"2026-01":2712,"2026-02":2307,"2026-03":2720,"2026-04":2375,"2026-05":2171,"2026-06":2344,"2026-07":2428,"2026-08":2049,"2026-09":3238,"2026-10":2576,"2026-11":1875},"fuente":"Cowork, nota 174 (25/11/2026): repartos.dbf + reparlin.dbf de GeminisWin a las 08:56 UTC, estado 4/5, un pedido una vez, sin rutas 08 y 11"}'::jsonb,
  'Pedidos entregados en GeminisWin por mes (sin rutas 08 y 11), para los totales de Mes y Año de la TV de repartos.')
on conflict (clave) do nothing;

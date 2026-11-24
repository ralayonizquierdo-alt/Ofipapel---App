-- Rober, 24/11/2026: «a partir de ahora los repartos se hacen todos desde el ERP».
-- Problema de hoy: GeminisWin generó su reparto de la ruta 07 (52-48372, 35 ventas). El puente lo saltaba (la 07 es ruta del
-- ERP y ese reparto no existía aquí) y el generador del ERP rechazaba esas ventas porque «GeminisWin las tiene en su reparto»:
-- la ruta 07 no estaba en ningún sitio.
-- Arreglo: en las rutas del ERP, erp_candidatas ya no marca una venta como «en GeminisWin» (en_gw), así que lo que
-- GeminisWin tenga en un reparto propio no impide generar la ruta desde el ERP. Las rutas que no son del ERP siguen igual.
-- Aplicada en Supabase como migración «reparto_erp_ignora_reparto_gw_en_rutas_erp». Mismo método que el resto de arreglos:
-- se lee la definición viva, se sustituye el texto y se comprueba que ha entrado.
-- (Hoy, además, el reparto 52-48372 se dio de alta a mano —con puente_gw.ingesta='1'— para que los repartidores tuvieran
-- la ruta 07 ya; el puente le trajo las 35 líneas.)
do $$
declare
  d text := pg_get_functiondef('reparto_privado.erp_candidatas(date)'::regprocedure);
  v_viejo text := 'case when g.gw_estado in (2, 3) then coalesce(g.gw_reparto, ''sí'') end';
  v_nuevo text := 'case when g.gw_estado in (2, 3) and not (par.rutas_erp ? k.ruta) then coalesce(g.gw_reparto, ''sí'') end';
begin
  if position(v_nuevo in d) = 0 then
    if position(v_viejo in d) = 0 then raise exception 'No se encontró el sitio en erp_candidatas (ha cambiado).'; end if;
    d := replace(d, v_viejo, v_nuevo);
    if position(v_nuevo in d) = 0 then raise exception 'No se pudo cambiar erp_candidatas.'; end if;
    execute d;
  end if;
end $$;

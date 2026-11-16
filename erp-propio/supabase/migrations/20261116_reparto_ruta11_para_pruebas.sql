-- Ruta 11 (Pendientes de asignar) en la app, para probar cierres y generación de repartos con
-- GeminisWin sin tocar las rutas de verdad (Rober, 16/11/2026). A mano se añadió "11" a
-- «reparto.puente_gw_rutas».
--   · Quien solo esté en las rutas 11 o 12 (Comerciales) no sale en la lista de nombres de la app.
--   · Los repartos de la ruta 11 solo los ven y los cogen los repartidores de prueba, igual que la 99.
do $$
declare v_def text; a text;
begin
  v_def := pg_get_functiondef('public.fn_app_rep_repartidores()'::regprocedure);
  a := 'where rr.repartidor_codigo = r.codigo';
  if position('rr.ruta_codigo not in' in v_def) = 0 and position(a in v_def) > 0 then
    execute replace(v_def, a, a || $x$ and rr.ruta_codigo not in ('11', '12')$x$);
  end if;
  v_def := pg_get_functiondef('public.fn_app_rep_repartos(uuid)'::regprocedure);
  a := $x$(v_prueba = (r.ruta_codigo = '99'))$x$;
  if position(a in v_def) > 0 then execute replace(v_def, a, $x$(v_prueba = (r.ruta_codigo in ('99', '11')))$x$); end if;
  v_def := pg_get_functiondef('reparto_privado.reparto(text,text,integer)'::regprocedure);
  a := $x$and r.ruta_codigo is distinct from '99' then$x$;
  if position(a in v_def) > 0 then execute replace(v_def, a, $x$and coalesce(r.ruta_codigo, '') not in ('99', '11') then$x$); end if;
end $$;

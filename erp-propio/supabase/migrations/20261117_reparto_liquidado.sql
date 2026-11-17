-- Reparto: las facturas que el repartidor paga en administración indican «Liquidado» (Rober, 17/11/2026).
--
-- En GeminisWin, cuando administración liquida una línea del reparto, su estado pasa de 4 (Entregado) a
-- 5 (Liquidado). El puente traía los dos como «entregado», así que en el ERP y en la app nunca se veía
-- «Liquidado». Ahora:
--   · fn_reparto_gw_ingesta: el 5 de GeminisWin es «liquidado». Manda GeminisWin: una línea pasa a
--     liquidada esté como esté en la app, y si allí se deshace (vuelve a 4) vuelve a «entregado».
--   · fn_app_rep_todas_lineas (vista de oficina de la app): devuelve «liquidado» como estado propio.
-- La app del repartidor y el mapa ya recibían el estado tal cual; solo cambia cómo lo pintan.
-- Los contadores (entregados, ranking, totales) siguen contando lo liquidado como entregado.
-- Una línea liquidada ya no la puede cambiar el repartidor (fn_app_rep_marcar lo rechazaba de antes).
do $$
declare v text; f regprocedure; par text[]; cambios text[][] := array[
    array['public.fn_reparto_gw_ingesta(jsonb)',
          $a$case when v_gw in (4, 5) then 'entregado' when v_gw = 7$a$,
          $b$case when v_gw = 5 then 'liquidado' when v_gw = 4 then 'entregado' when v_gw = 7$b$],
    array['public.fn_reparto_gw_ingesta(jsonb)',
          $a$case when v_estado in ('entregado', 'no_entregado') and x.estado in ('pendiente', 'viene_anterior', 'anulado') then v_estado$a$,
          $b$case when v_estado = 'liquidado' then 'liquidado' when x.estado = 'liquidado' and v_estado = 'entregado' then 'entregado' when v_estado in ('entregado', 'no_entregado') and x.estado in ('pendiente', 'viene_anterior', 'anulado') then v_estado$b$],
    array['public.fn_app_rep_todas_lineas(uuid, text, bigint)',
          $a$'estado', case when l.estado in ('entregado', 'liquidado') and l.incidencia is not null then 'incidencia'$a$,
          $b$'estado', case when l.estado = 'liquidado' then 'liquidado' when l.estado = 'entregado' and l.incidencia is not null then 'incidencia'$b$]];
begin
  foreach par slice 1 in array cambios loop
    f := par[1]::regprocedure;
    v := pg_get_functiondef(f);
    if position(par[3] in v) > 0 then continue; end if;
    if position(par[2] in v) = 0 then raise exception 'no encuentro «%» en %', par[2], par[1]; end if;
    execute replace(v, par[2], par[3]);
  end loop;
end $$;

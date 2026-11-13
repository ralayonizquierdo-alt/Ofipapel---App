-- App de repartidores: en la pantalla de entrada solo salen los repartidores de las rutas que trae
-- el puente de GeminisWin (Rober, 13/11/2026: salían comerciales y fichas de apoyo y de prueba).
-- Si el puente no tiene ninguna ruta, sale la lista de siempre (todos los que tienen PIN).
-- Aparte, a mano y sin fichero: se inutilizó el PIN inicial de quienes no reparten.
create or replace function public.fn_app_rep_repartidores()
 returns table(codigo text, nombre text) language sql stable security definer set search_path to 'public'
as $function$
  select r.codigo, coalesce(nullif(r.nombre_corto, ''), split_part(r.nombre, ' ', 1))
    from repartidor r join repartidor_pin p on p.repartidor_codigo = r.codigo
   where not coalesce(r.deshabilitado, false)
     and (coalesce((select jsonb_array_length(valor) from parametro where clave = 'reparto.puente_gw_rutas'), 0) = 0
          or exists (select 1 from ruta_reparto_repartidor rr
                      where rr.repartidor_codigo = r.codigo
                        and (select valor from parametro where clave = 'reparto.puente_gw_rutas') ? rr.ruta_codigo))
   order by 2 $function$;

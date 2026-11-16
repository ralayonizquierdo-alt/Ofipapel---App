-- App de repartidores: marca «prueba» para que un repartidor de pruebas salga en la pantalla de
-- entrada aunque su ruta (99 PRUEBA RUTA) no venga por el puente de GeminisWin (Rober, 16/11/2026).
alter table public.repartidor_pin add column if not exists prueba boolean not null default false;

create or replace function public.fn_app_rep_repartidores()
 returns table(codigo text, nombre text) language sql stable security definer set search_path to 'public'
as $function$
  select r.codigo, coalesce(nullif(r.nombre_corto, ''), split_part(r.nombre, ' ', 1))
    from repartidor r join repartidor_pin p on p.repartidor_codigo = r.codigo
   where not coalesce(r.deshabilitado, false)
     and (p.supervisor or p.prueba
          or coalesce((select jsonb_array_length(valor) from parametro where clave = 'reparto.puente_gw_rutas'), 0) = 0
          or exists (select 1 from ruta_reparto_repartidor rr
                      where rr.repartidor_codigo = r.codigo
                        and (select valor from parametro where clave = 'reparto.puente_gw_rutas') ? rr.ruta_codigo))
   order by p.supervisor, p.prueba, 2 $function$;

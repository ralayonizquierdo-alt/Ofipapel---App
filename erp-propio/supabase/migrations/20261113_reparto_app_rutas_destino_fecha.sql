-- App de repartidores · «Cambiar de ruta» (Rober, 13/11/2026): salían dos destinos con el mismo nombre
-- (dos repartos abiertos de la misma ruta) y no se distinguían. Ahora cada destino trae su fecha, su
-- número de reparto y cuántos pedidos lleva, y salen primero los de hoy.
create or replace function public.fn_app_rep_rutas_destino(p_token uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_rep text := reparto_privado.sesion(p_token);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('tienda', r.tienda_terminal_codigo, 'numero', r.numero, 'fecha', r.fecha, 'ruta', r.ruta_codigo,
                                                      'ruta_nombre', coalesce(rr.descripcion, r.ruta_codigo),
                                                      'repartidor', (select coalesce(nullif(nombre_corto, ''), nombre) from repartidor where codigo = r.repartidor_codigo),
                                                      'pedidos', (select count(*) from reparto_linea l where l.tienda_terminal_codigo = r.tienda_terminal_codigo and l.numero = r.numero))
                                   order by r.fecha desc, r.ruta_codigo, r.numero)
                     from reparto r left join ruta_reparto rr on rr.codigo = r.ruta_codigo
                    where r.estado = 2 and r.fecha <= fn_app_rep_hoy()), '[]'::jsonb);
end $function$;

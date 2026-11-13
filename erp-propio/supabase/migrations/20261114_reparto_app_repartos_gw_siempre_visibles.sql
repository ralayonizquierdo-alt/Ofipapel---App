-- App de repartidores: un reparto traído de GeminisWin se ve desde que se genera allí, aunque sea
-- para dentro de más de un día (el que se genera el viernes es para el lunes). En GeminisWin el
-- reparto nuevo de una ruta solo se genera al cerrar el anterior, así que no hay más que uno abierto.
-- Los repartos del ERP siguen como estaban: hoy y mañana.
create or replace function public.fn_app_rep_repartos(p_token uuid)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_rep text := reparto_privado.sesion(p_token);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'tienda', r.tienda_terminal_codigo, 'numero', r.numero, 'fecha', r.fecha, 'ruta', r.ruta_codigo,
             'ruta_nombre', coalesce(rr.descripcion, r.ruta_codigo), 'mio', r.repartidor_codigo = v_rep,
             'manana', r.fecha > fn_app_rep_hoy(),
             'pedidos', (select count(*) from reparto_linea l where l.tienda_terminal_codigo = r.tienda_terminal_codigo and l.numero = r.numero),
             'pendientes', (select count(*) from reparto_linea l where l.tienda_terminal_codigo = r.tienda_terminal_codigo and l.numero = r.numero
                              and l.estado in ('pendiente', 'viene_anterior')))
           order by r.fecha, (r.repartidor_codigo = v_rep) desc, r.ruta_codigo)
      from reparto r left join ruta_reparto rr on rr.codigo = r.ruta_codigo
     where r.estado = 2 and (r.fecha <= fn_app_rep_hoy() + 1 or r.origen = 'geminiswin')
       and (r.repartidor_codigo is null or r.repartidor_codigo = v_rep)), '[]'::jsonb);
end $function$;

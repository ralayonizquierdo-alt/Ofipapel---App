-- App de reparto, vista de oficina: hora a la que el repartidor fichó la entrada (Rober, 18/11/2026: «también
-- debería aparecer ahí la hora en la que inició, a la que fichó entrada»).
-- fn_app_rep_todas devuelve «entrada» (HH:MM, hora de Canarias): el primer fichaje de entrada no anulado del día del
-- reparto del empleado enlazado con el repartidor de la ruta (Archivo → Fichaje → Personas). Sin repartidor, sin
-- enlace o sin fichar: null.
do $$
declare v text := pg_get_functiondef('public.fn_app_rep_todas(uuid)'::regprocedure);
  ancla text := $a$'ultimo', k.ultimo)$a$;
begin
  if position('''entrada''' in v) > 0 then return; end if;
  if position(ancla in v) = 0 then raise exception 'fn_app_rep_todas no tiene el trozo esperado'; end if;
  v := replace(v, ancla, $a$'ultimo', k.ultimo,
             'entrada', (select to_char(min(e.en) at time zone 'Atlantic/Canary', 'HH24:MI')
                           from fichaje_empleado fe join fichaje_evento e on e.empleado_codigo = fe.empleado_codigo
                          where fe.repartidor_codigo = r.repartidor_codigo and fe.activo and e.dia = r.fecha
                            and e.tipo = 'entrada' and e.anulado_por is null))$a$);
  execute v;
end $$;

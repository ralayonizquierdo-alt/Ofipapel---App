-- App de reparto, vista de oficina: las paradas salen en el orden en que se hicieron (Rober, 18/11/2026: «el orden que
-- sale en oficina, ¿seguro que es el que eligió Juan? Las horas no son consecutivas; en el ERP sale perfecto»).
-- No era el de Juan (no había reordenado): era el orden de las fichas de GeminisWin. Ahora, como el Control de Repartos
-- del ERP: primero lo ya hecho, por hora (entrega, 2.º intento o 1.er intento), y al final lo pendiente, en el orden
-- previsto.
do $$
declare v text := pg_get_functiondef('public.fn_app_rep_todas_lineas(uuid,text,bigint)'::regprocedure);
  viejo text := $a$order by l.orden nulls last, l.poblacion, l.direccion, l.venta_numero)$a$;
begin
  if position('coalesce(l.entregado_en, l.intento2_en, l.intento1_en) nulls last' in v) > 0 then return; end if;
  if position(viejo in v) = 0 then raise exception 'fn_app_rep_todas_lineas no tiene el trozo esperado'; end if;
  execute replace(v, viejo, $a$order by coalesce(l.entregado_en, l.intento2_en, l.intento1_en) nulls last, l.orden nulls last, l.poblacion, l.direccion, l.venta_numero)$a$);
end $$;

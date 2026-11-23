-- «Control de Repartos» del ERP y pantalla de la TV: cuando una ruta ya tiene un reparto ABIERTO más nuevo (el de mañana, ya
-- generado), el reparto cerrado de hoy de esa ruta deja de salir (Rober, 23/11/2026: «¿para qué queremos los de hoy si ya está
-- generado uno nuevo y los de hoy ya tienen su estado asignado?»). Las rutas sin reparto abierto siguen enseñando el de hoy.
-- Solo cuando no se pide una fecha concreta (la pantalla de hoy); mirar un día pasado no cambia.
do $$
declare
  d text := pg_get_functiondef('reparto_privado.seguimiento(date)'::regprocedure);
  v_viejo text := 'where (r.fecha = v_dia or (r.estado = 2 and r.fecha < v_dia)) and not r.oculto';
  v_nuevo text := 'where (r.fecha = v_dia or (r.estado = 2 and r.fecha < v_dia) or (p_fecha is null and r.estado = 2 and r.fecha > v_dia))' || chr(10)
    || '        and not (p_fecha is null and r.estado = 4 and exists (select 1 from reparto o where o.ruta_codigo = r.ruta_codigo and o.estado = 2 and not o.oculto' || chr(10)
    || '                                                              and o.fecha >= r.fecha and (o.fecha, o.numero) <> (r.fecha, r.numero)))' || chr(10)
    || '        and not r.oculto';
begin
  if position('o.ruta_codigo = r.ruta_codigo and o.estado = 2' in d) = 0 then
    if position(v_viejo in d) = 0 then raise exception 'No se encontró el sitio donde cambiar reparto_privado.seguimiento.'; end if;
    d := replace(d, v_viejo, v_nuevo);
    if position('o.ruta_codigo = r.ruta_codigo and o.estado = 2' in d) = 0 then raise exception 'No se pudo cambiar reparto_privado.seguimiento.'; end if;
    execute d;
  end if;
end $$;

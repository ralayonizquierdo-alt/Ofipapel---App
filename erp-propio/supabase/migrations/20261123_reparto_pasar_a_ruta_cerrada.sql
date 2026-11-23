-- «Cambiar de ruta» un pedido a una ruta cuyo reparto ya está cerrado (Rober, 23/11/2026): hasta ahora solo se podía
-- a repartos abiertos y, al cerrar la jornada, las rutas de hoy desaparecían como destino. Ahora, si el reparto de
-- destino está cerrado, el pedido va al reparto ABIERTO más nuevo de esa misma ruta (el de mañana, si ya está
-- generado). Si esa ruta no tiene ninguno abierto, error claro: hay que generarlo primero.
do $$
declare d text := pg_get_functiondef('reparto_privado.mover_linea(text,integer,text,integer,text,integer,text,text)'::regprocedure);
  v_viejo text := '  if o.estado is distinct from 2 or d.estado is distinct from 2 then raise exception ''Los dos repartos tienen que estar abiertos.''; end if;';
begin
  if position('genera primero el reparto' in d) = 0 then
    if position(v_viejo in d) = 0 then raise exception 'No se encontró el sitio donde cambiar mover_linea.'; end if;
    d := replace(d, v_viejo,
      '  if d.estado = 4 then' || chr(10)
      || '    select * into d from reparto where ruta_codigo = d.ruta_codigo and estado = 2 order by fecha desc, numero desc limit 1;' || chr(10)
      || '    if not found then raise exception ''Esa ruta no tiene ningún reparto abierto: genera primero el reparto de esa ruta y vuelve a pasar el pedido.''; end if;' || chr(10)
      || '    p_dest_tienda := d.tienda_terminal_codigo; p_dest_numero := d.numero;' || chr(10)
      || '  end if;' || chr(10) || v_viejo);
    d := replace(d, 'return jsonb_build_object(''ok'', true);', 'return jsonb_build_object(''ok'', true, ''tienda'', d.tienda_terminal_codigo, ''numero'', d.numero);');
    if position('genera primero el reparto' in d) = 0 then raise exception 'No se pudo cambiar mover_linea.'; end if;
    execute d;
  end if;
end $$;

-- Espejo de GeminisWin: ARTDPROV se paraba con «numeric field overflow» (18/11/2026).
--
-- Seis fichas de proveedor por artículo traen en UNI_PEDIDA (unidades pedidas al proveedor) entre 2 y 56 millones
-- de unidades: datos imposibles que no caben en articulo_proveedor.unidades_pedidas (8,2). Igual que con el IGIC de
-- ARTICULO (20261117_espejo_avisos.sql): el valor que no cabe no se copia (queda vacío) y se apunta en
-- espejo_gw_aviso, que sale en Archivo → Espejo de GeminisWin. Se corrige en GeminisWin y en la pasada siguiente
-- entra solo. Se ponen topes también a las otras columnas pequeñas de unidades y porcentajes, para que un dato
-- raro en cualquiera de ellas no vuelva a parar la tabla entera.
do $$
declare v text := pg_get_functiondef('public.fn_carga_gw_articulo_proveedor()'::regprocedure); c text[];
begin
  foreach c slice 1 in array array[
    array['ULTDTOCOMP', '10000'], array['T_IMP1', '1000000'], array['T_IMP2', '1000000'], array['T_IMP3', '1000000'],
    array['ULTBONCOMP', '1000000'], array['ULTUNICOMP', '1000000'], array['UNI_PEDIDA', '1000000'], array['UNI_COMPRA', '1000000']] loop
    if position(format('gw_n(d,%L)', c[1]) in v) > 0 then
      v := replace(v, format('gw_n(d,%L)', c[1]), format('public.gw_n_tope(d, %L, %s, ''ARTDPROV'', clave)', c[1], c[2]));
    elsif position(format('gw_n_tope(d, %L', c[1]) in v) = 0 then
      raise exception 'No encuentro % en fn_carga_gw_articulo_proveedor', c[1];
    end if;
  end loop;
  execute v;
end $$;

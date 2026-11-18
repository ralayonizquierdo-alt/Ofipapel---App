-- Espejo de GeminisWin: ARTPROV se cortaba siempre en el primer lote (18/11/2026).
--
-- ARTDPROV y ARTPROV se cargan con la misma función (fn_carga_gw_articulo_proveedor), que elige los artículos a
-- recalcular mirando lo recibido «en la ventana» de la tanda en las DOS tablas. Pero la ventana va desde lo último
-- cargado de la tabla que se procesa: ARTPROV no se cargaba desde la muestra del 27/10, así que su primera tanda
-- abarcaba también los 197.000 registros de ARTDPROV recibidos después (ya cargados). Recalculaba todo de golpe,
-- pasaba del minuto y se cortaba; con la base de datos atascada, la comprobación de la clave del puente tampoco
-- contestaba («Clave del puente incorrecta» en el intento siguiente).
--
-- Arreglo: fn_espejo_gw_procesar dice qué tabla está procesando (espejo.tabla) y la función de proveedores solo
-- toma los artículos de esa tabla en la ventana; los datos de la otra tabla para esos artículos se siguen leyendo
-- enteros, así que el resultado es el mismo. Además, el filtro por fecha usa el índice (tabla, cargado_en).
do $$
declare v text;
begin
  v := pg_get_functiondef('public.fn_espejo_gw_procesar(text,text)'::regprocedure);
  if position('espejo.tabla' in v) = 0 then
    v := replace(v, $a$  perform set_config('erp.sin_auditoria', 'on', true);$a$,
                    $a$  perform set_config('erp.sin_auditoria', 'on', true);
  perform set_config('espejo.tabla', p_tabla, true);$a$);
    v := replace(v, $a$  perform set_config('espejo.hasta', '', true);$a$,
                    $a$  perform set_config('espejo.hasta', '', true);
  perform set_config('espejo.tabla', '', true);$a$);
    if (length(v) - length(replace(v, 'espejo.tabla', ''))) / length('espejo.tabla') < 3 then
      raise exception 'fn_espejo_gw_procesar no tiene los trozos esperados';
    end if;
    execute v;
  end if;

  v := pg_get_functiondef('public.fn_carga_gw_articulo_proveedor()'::regprocedure);
  if position('espejo.tabla' in v) = 0 then
    if position($a$where tabla in ('ARTDPROV', 'ARTPROV') and public.gw_reciente(cargado_en)$a$ in v) = 0 then
      raise exception 'fn_carga_gw_articulo_proveedor no tiene el trozo esperado';
    end if;
    v := replace(v, $a$where tabla in ('ARTDPROV', 'ARTPROV') and public.gw_reciente(cargado_en)$a$,
      $a$where tabla in ('ARTDPROV', 'ARTPROV') and tabla = coalesce(nullif(current_setting('espejo.tabla', true), ''), tabla) and cargado_en >= coalesce(nullif(current_setting('espejo.desde', true), '')::timestamptz, '-infinity'::timestamptz) and public.gw_reciente(cargado_en)$a$);
    execute v;
  end if;
end $$;

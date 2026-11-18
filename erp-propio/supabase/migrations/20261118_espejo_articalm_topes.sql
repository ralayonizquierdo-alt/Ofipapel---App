-- Espejo de GeminisWin: ARTICALM se paraba con «numeric field overflow» (18/11/2026).
--
-- Un registro de stock por almacén trae en CANTINIC (stock inicial) 11.220.070,3, que no cabe en
-- articulo_almacen_stock.cantidad_inicial (10,3); parece el código del artículo tecleado en ese campo. Igual que con
-- ARTICULO y ARTDPROV: el valor que no cabe no se copia y queda en espejo_gw_aviso (Archivo → Espejo de GeminisWin)
-- para corregirlo en GeminisWin. Y si una existencia (CANTIDAD) llegara con un número imposible, esa fila se salta
-- («cantidad imposible» en el resultado) en vez de crear un ajuste de inventario descomunal.
do $$
declare v text := pg_get_functiondef('public.fn_carga_gw_articulo_almacen_stock()'::regprocedure);
begin
  if position('gw_n_tope' in v) > 0 then return; end if;
  if position($a$gw_n(datos,'CANTINIC')$a$ in v) = 0 or position($a$when gw_t(datos,'CODALMAC') is null then 'sin almacén'$a$ in v) = 0 then
    raise exception 'fn_carga_gw_articulo_almacen_stock no tiene los trozos esperados';
  end if;
  v := replace(v, $a$gw_n(datos,'CANTINIC')$a$, $a$public.gw_n_tope(datos, 'CANTINIC', 1000000, 'ARTICALM', clave)$a$);
  v := replace(v, $a$when gw_t(datos,'CODALMAC') is null then 'sin almacén'$a$,
                  $a$when abs(coalesce(gw_n(datos,'CANTIDAD'), 0)) >= 1000000 then 'cantidad imposible' when gw_t(datos,'CODALMAC') is null then 'sin almacén'$a$);
  execute v;
end $$;

-- Gestor de Pedidos 2.0: fuera de la propuesta lo que no se compra desde hace más de un año (Rober, 18/11/2026:
-- «¿es posible que te estés yendo a artículos que no se compran desde hace mucho?»). Eran 196 de 1.257 líneas
-- (unos 4.300 €): lo normal es que estén descatalogados o se compren por otro lado. Siguen saliendo si los pide un
-- cliente. «Última compra» = la más reciente entre la ficha del artículo y la de cualquiera de sus proveedores.
do $$
declare v text := pg_get_functiondef('public.fn_compras_semanal_propuesta(text)'::regprocedure);
  viejo text := $a$and (coalesce(st.uds, 0) >= 0 or coalesce(pt.uds, 0) > 0
            or greatest(ar.ultima_compra_fecha, (select max(z.ultima_compra_fecha) from articulo_proveedor z where z.articulo_codigo = ar.codigo_interno)) >= current_date - 365)$a$;
  nuevo text := $a$and (coalesce(pt.uds, 0) > 0
            or greatest(ar.ultima_compra_fecha, (select max(z.ultima_compra_fecha) from articulo_proveedor z where z.articulo_codigo = ar.codigo_interno)) >= current_date - 365)$a$;
begin
  if position(nuevo in v) > 0 then return; end if;
  if position(viejo in v) = 0 then raise exception 'fn_compras_semanal_propuesta no tiene el trozo esperado'; end if;
  execute replace(v, viejo, nuevo);
end $$;

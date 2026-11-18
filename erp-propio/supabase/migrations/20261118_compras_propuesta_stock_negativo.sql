-- Gestor de Pedidos 2.0: el stock negativo ya no se «rellena» (18/11/2026).
--
-- Con el stock por almacén ya cargado entero, la propuesta pedía 33.406 «fotocopias color» (stock -31.414) o la
-- recogida de residuos: servicios que se venden sin control de stock en GeminisWin y nunca se compran. Y en artículos
-- normales, un stock negativo (vendido sin haber dado entrada a la compra) hacía pedir de más.
--   · El stock que cuenta para pedir es como mínimo 0.
--   · Si el stock es negativo y no se ha comprado en el último año, no se propone (es un servicio), salvo que lo haya
--     pedido un cliente.
-- Lo demás que no deba pedirse solo se marca «Bajo pedido» desde la propia línea de la propuesta.
do $$
declare v text := pg_get_functiondef('public.fn_compras_semanal_propuesta(text)'::regprocedure);
begin
  if position('stock_usado' in v) > 0 then return; end if;
  if position($a$coalesce(st.uds, 0) as stock,$a$ in v) = 0
     or position($a$and (p_proveedor is null or x.prov = p_proveedor)$a$ in v) = 0
     or (length(v) - length(replace(v, 'b.stock + b.camino', ''))) / length('b.stock + b.camino') <> 3 then
    raise exception 'fn_compras_semanal_propuesta no tiene los trozos esperados';
  end if;
  v := replace(v, $a$coalesce(st.uds, 0) as stock,$a$, $a$coalesce(st.uds, 0) as stock, greatest(coalesce(st.uds, 0), 0) as stock_usado,$a$);
  v := replace(v, $a$and (p_proveedor is null or x.prov = p_proveedor)$a$,
    $a$and (p_proveedor is null or x.prov = p_proveedor)
       and (coalesce(st.uds, 0) >= 0 or coalesce(pt.uds, 0) > 0
            or greatest(ar.ultima_compra_fecha, (select max(z.ultima_compra_fecha) from articulo_proveedor z where z.articulo_codigo = ar.codigo_interno)) >= current_date - 365)$a$);
  v := replace(v, 'b.stock + b.camino', 'b.stock_usado + b.camino');
  execute v;
end $$;

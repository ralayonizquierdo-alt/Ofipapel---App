-- Proveedor habitual recalculado (Rober, 27/11/2026). Aplicado en la base como compras_proveedor_habitual_regla.
-- Regla: si al habitual de la ficha no se le ha hecho ningún pedido recibido en 3 años (o no hay habitual), pasa a
-- habitual el proveedor activo con más pedidos recibidos en esos 3 años (empate: la compra más reciente).
-- Base: compra_articulo_proveedor_hist. Resultado en compra_articulo_habitual (articulo, proveedor, anterior, motivo):
-- 3.520 artículos (694 sin habitual). fn_carga_gw_articulo da prioridad a compra_articulo_habitual sobre el habitual
-- de GeminisWin, para que la carga diaria no lo pise. Los 1.976 dudosos (al habitual sí se le compra, pero menos)
-- no se tocan: ahí mandará la tarifa más barata.
create table if not exists public.compra_articulo_habitual (
  articulo_codigo text primary key,
  proveedor_codigo text not null,
  anterior text,
  motivo text,
  calculado_en timestamptz not null default now()
);

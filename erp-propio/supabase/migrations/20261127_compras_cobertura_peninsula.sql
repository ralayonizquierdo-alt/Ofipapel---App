-- Rober, 27/11/2026 (pedidos Archivo 2000, SAM, Etirol, Galaco: «por lo general tiro por lo alto»). Aplicado como
-- compras_cobertura_peninsula: proveedores con plazo >= 15 días usan compras.cobertura_dias_peninsula (60) en vez
-- de compras.cobertura_dias (14). La cobertura propia del proveedor (compra_proveedor_condicion) manda sobre ambas.
insert into parametro (clave, valor, descripcion) values ('compras.cobertura_dias_peninsula', '60'::jsonb,
  'Gestor de compras: días de venta que cubre el máximo, además del plazo, en proveedores con plazo de 15 días o más (península). Los locales usan compras.cobertura_dias.')
on conflict (clave) do nothing;

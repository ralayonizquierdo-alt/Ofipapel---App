-- Regularización de stock: observaciones (Rober, 03/11/2026) — notas de cada regularización para consultarlas
-- cuando se vuelve a regularizar el mismo artículo (la ficha enseña debajo las anteriores de ese artículo).
alter table public.regularizacion_stock add column if not exists observaciones text;

-- Ruta compartida: qué pedidos lleva cada repartidor (Rober, 27/11/2026). Aplicada en la base con este nombre.
--  · reparto_linea.asignado_a: quien lleva el albarán. Se pone al COMPROBARLO en la app (tiene el papel) y, si
--    nadie lo comprobó, al marcarlo (fn_app_rep_marcar). Al desmarcar la comprobación se libera.
--  · fn_app_rep_lineas devuelve asignado_a / asignado_nombre; fn_reparto_control_lineas devuelve «lleva»
--    (quien lo entregó o, si no, quien lo lleva) para el Control de repartos del ERP.
alter table public.reparto_linea add column if not exists asignado_a text;

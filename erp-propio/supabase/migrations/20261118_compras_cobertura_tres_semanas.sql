-- Rober, 18/11/2026: que cada pedido cubra unas tres semanas, para no tener que pedir cada semana a los mismos
-- proveedores. El máximo cubre 21 días de venta por encima del mínimo (antes 14).
update public.parametro set valor = '21'::jsonb, actualizado_en = now() where clave = 'compras.cobertura_dias';
select public.fn_compras_politica_aplicar(null, null);

-- Gestor de Pedidos 2.0: importes demasiado altos en algunos artículos (Rober, 18/11/2026: «hay algún importe muy
-- alto de algún artículo, tengo la sensación»). Dos causas, medidas sobre la propuesta (134.500 €):
--
--  1. El colchón de seguridad salía de la variación de las ventas mes a mes, y en los artículos de temporada
--     (libretas, plastilina, pegamento: septiembre) esa variación es enorme. Ejemplo: libreta grapada Pacsa, vende
--     862 al mes y el mínimo salía en 3.610 (más de 4 meses de venta con 20 días de plazo). Esa subida de temporada
--     no es incertidumbre, es previsible, y se cubre con las campañas (lo del año pasado + %). Ahora el colchón no
--     pasa de lo que se vende durante el plazo de entrega: el mínimo es como mucho el doble de la venta del plazo.
--  2. El máximo cubría un mes entero de venta por encima del mínimo, aunque los pedidos se hacen cada semana. Ahora
--     cubre los días del parámetro compras.cobertura_dias (14: dos semanas).
--
-- Simulado antes de aplicar: 135.583 € → 57.363 € (863 líneas); valor de los mínimos 262.902 € → 175.261 €.
insert into public.parametro (clave, valor, descripcion)
values ('compras.cobertura_dias', '14'::jsonb,
        'Gestor de Pedidos 2.0: días de venta que cubre el máximo por encima del mínimo (cada cuánto se repone de verdad).')
on conflict (clave) do nothing;

do $$
declare v text := pg_get_functiondef('public.fn_compras_politica_aplicar(text,text)'::regprocedure);
  colchon text := $a$1.65 * p.desviacion * sqrt(x.plazo / 30.44)$a$;
  mes text := $a$+ p.venta_mes / 30.44 * 30)$a$;
begin
  if position('compras.cobertura_dias' in v) > 0 then return; end if;
  if (length(v) - length(replace(v, colchon, ''))) / length(colchon) <> 2 or position(mes in v) = 0 then
    raise exception 'fn_compras_politica_aplicar no tiene los trozos esperados';
  end if;
  v := replace(v, colchon, $a$least(1.65 * p.desviacion * sqrt(x.plazo / 30.44), p.venta_mes / 30.44 * x.plazo)$a$);
  v := replace(v, mes, $a$+ p.venta_mes / 30.44 * coalesce((select (q.valor #>> '{}')::numeric from parametro q where q.clave = 'compras.cobertura_dias'), 14))$a$);
  execute v;
end $$;

select public.fn_compras_politica_aplicar(null, null);

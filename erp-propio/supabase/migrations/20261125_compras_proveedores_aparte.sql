-- Rober, 25/11/2026: en «Pedidos de la semana» (Gestor de Pedidos 2.0) salían proveedores que no se reponen por stock: Azeta,
-- Penguin Random House, Cabero, Dismalibro, Arnoia, Exadi, Inforpor, UFP, Rocada, Discana, Actiu y Henkel.
-- Nuevo parámetro compras.proveedores_aparte: esos proveedores no salen en la propuesta semanal por reposición de stock. Si un
-- artículo suyo tiene una petición de cliente pendiente, sí sale (para no olvidar un encargo). Abriendo un proveedor concreto
-- (p_proveedor) se sigue viendo todo. Para quitar o añadir proveedores, se cambia el parámetro.
-- Aplicada en Supabase como «compras_proveedores_aparte». Comprobado: ninguno de esos proveedores sale en la lista; la propuesta
-- queda en 61 proveedores y 29.896,56 €.
insert into parametro (clave, valor, descripcion)
values ('compras.proveedores_aparte',
  '["50587","50586","05610","05612","50581","50585","04062","04030","04075","05020","50305","05001","04620"]'::jsonb,
  'Gestor de Pedidos 2.0: proveedores que no salen en «Pedidos de la semana» por reposición de stock. Si un artículo suyo tiene una petición de cliente pendiente, sí sale.')
on conflict (clave) do nothing;

do $$
declare
  d text := pg_get_functiondef('public.fn_compras_semanal_propuesta(text)'::regprocedure);
  ancla text := 'and (p_proveedor is null or x.prov = p_proveedor)';
begin
  if strpos(d, 'compras.proveedores_aparte') > 0 then return; end if;
  if strpos(d, ancla) = 0 then raise exception 'No se encontró el sitio en fn_compras_semanal_propuesta (ha cambiado).'; end if;
  d := replace(d, ancla, ancla || chr(10) ||
    '       and (p_proveedor is not null or coalesce(pt.uds, 0) > 0' || chr(10) ||
    '            or not (coalesce((select q.valor from parametro q where q.clave = ''compras.proveedores_aparte''), ''[]''::jsonb) ? x.prov))');
  if strpos(d, 'compras.proveedores_aparte') = 0 then raise exception 'No se pudo cambiar fn_compras_semanal_propuesta.'; end if;
  execute d;
end $$;

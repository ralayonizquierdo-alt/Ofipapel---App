-- Gestor de Pedidos 2.0: pedidos pequeños que pueden esperar (Rober, 18/11/2026: le descolocaban los 86
-- proveedores de la propuesta; 42 pedían menos de 150 € y sumaban 2.300 €. «Yo subiría un poco más, a 300»).
-- La pantalla aparta en «Pueden esperar» a los proveedores cuyo pedido no llega a este importe (o a su pedido mínimo,
-- si es mayor) y no traen peticiones de clientes, para juntarlo con el de otra semana.
insert into public.parametro (clave, valor, descripcion)
values ('compras.pedido_pequeno', '300'::jsonb,
        'Gestor de Pedidos 2.0: por debajo de este importe (o del pedido mínimo del proveedor, si es mayor) y sin peticiones de clientes, el pedido sale en «Pueden esperar».')
on conflict (clave) do nothing;

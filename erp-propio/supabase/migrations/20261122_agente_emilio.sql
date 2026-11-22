-- El agente de correo de proveedores se llama E-MILIO (Rober, 22/11/2026: «el encargado de revisar los e-mails de los
-- diferentes puestos de trabajo; hoy solo el mío, mañana más funciones y más buzones»). Cruza con IA, solo, las
-- propuestas, facturas y albaranes con su pedido.
insert into public.agente (codigo, nombre, que_hace, funcion, cada, permiso, ordenes)
values ('correo_proveedores', 'E-milio',
        'E-milio vigila los e-mails de los puestos de trabajo (hoy, el buzón de compras; solo lee) y deja en el Gestor 2.0 → '
        || '«Correo de proveedores» los PDF de los proveedores: propuestas, facturas y albaranes, con su proveedor y su pedido. '
        || 'Cruza cada uno con su pedido con IA, solo, y avisa de lo que falta, viene de menos o cambia de precio. Las facturas '
        || 'llevan su nombre ordenado para la carpeta de facturas. No contesta a nadie ni cambia pedidos.',
        'correo-proveedores', 'cada 10 minutos', '/gestor-pedidos-proveedor',
        array['pasar_ahora', 'releer', 'pausar', 'reanudar'])
on conflict (codigo) do update set nombre = excluded.nombre, que_hace = excluded.que_hace;

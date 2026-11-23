-- Virgilio, el vigilante de la empresa (Rober, 23/11/2026). Alta en el registro de agentes, APAGADO hasta montar la
-- fase 1. Funciones y fases: docs/AGENTE_VIRGILIO.md.
insert into public.agente (codigo, nombre, que_hace, funcion, cada, permiso, ordenes, activo)
values ('vigilante', 'Virgilio',
 'El vigilante de la empresa: vigila y avisa a quien toca (globo rojo, Mis tareas pendientes, NEXA y su ficha del hub). Solo lee: no cambia nada. Funciones: '
 || '1) Peticiones resueltas sin imprimir para el almacén (compras/almacén). '
 || '2) Presupuestos enviados o en seguimiento sin movimiento en 7 días o con el próximo contacto pasado (el comercial del presupuesto). '
 || '3) Estado del sistema: espejo de GeminisWin, puente, Wasimara, E-milio y cartero (Rober). '
 || '4) Pedidos a proveedor retrasados (compras). '
 || '5) Correo de proveedores: facturas con diferencias y documentos sin revisar de E-milio (compras). '
 || '6) Clientes que pasan su límite de riesgo (administración y comercial). '
 || '7) Recibos vencidos sin cobrar (administración). '
 || '8) Cuadre ERP-GeminisWin de ventas y cobros (Rober). '
 || '9) Vigilancias personales que cualquier empleado pide a NEXA («avísame cuando llegue el pedido de…»), cada uno dentro de lo que su permiso le deja ver. '
 || 'Fase 1: 1, 2 y 3. El resto después.',
 null, 'cada 10 minutos (pendiente de montar)', null, array['pasar_ahora', 'pausar', 'reanudar'], false)
on conflict (codigo) do update set nombre = excluded.nombre, que_hace = excluded.que_hace, cada = excluded.cada;

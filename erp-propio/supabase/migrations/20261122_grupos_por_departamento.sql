-- Grupos de permisos para la plantilla (Rober, 22/11/2026). Hasta hoy solo Gerencia y un empleado de prueba tenían
-- grupo: el resto no podía abrir ninguna pantalla. Se asignan según el departamento del Fichaje (fichaje_empleado):
--   comerciales → Comercial (nuevo) · oficina → Administración (nuevo); quien lleva además la contabilidad →
--   Administración y Contabilidad (nuevo; se marca a mano: se elige por persona, no por departamento) ·
--   pedidos → Compras · almacen → Almacén · tiendas (ofipapel_detalle, ofipapel_info, aliz1, aliz2) → Dependiente.
--   Repartidores y limpieza: sin grupo (los repartidores usan la app de Reparto). Gerencia: no se toca.
-- Solo se asigna a quien no tiene grupo: nunca se cambia uno ya puesto a mano. Retocables en Archivo → Grupos.

insert into public.rol (codigo, nombre, nivel_acceso, es_administrador) values
  ('COMERCIAL', 'Comercial', 'operativo', false),
  ('ADMINISTRACION', 'Administración', 'operativo', false),
  ('ADMIN_CONTABILIDAD', 'Administración y Contabilidad', 'operativo', false)
on conflict (codigo) do nothing;

-- Comercial: clientes, ventas, pedidos y presupuestos (con su seguimiento), consulta de artículos y stock, sus listados.
insert into public.rol_permiso (rol_id, permiso_codigo)
select r.id, p.codigo from public.rol r cross join public.permiso p
 where r.codigo = 'COMERCIAL' and p.codigo in (
   '/clientes', '/listados-clientes/clientes', '/listados-clientes/ventas-facturas', '/listados-clientes/zonas', '/listados-clientes/no-pagado',
   '/pedidos', '/presupuestos', '/gestor-pedidos', '/gestor-presupuestos', '/ventas',
   '/listados-ventas/ventas', '/listados-ventas/articulos', '/listados-ventas/presupuestos', '/listados-ventas/pedidos',
   '/articulos', '/almacen/listados-articulos', '/peticiones', 'accion:generar-peticion', '/archivo/incidencias', '/listados')
on conflict do nothing;

-- Administración: clientes y cobros, facturación, caja, ventas y repartos, remesas y conciliación, facturas y pagos de
-- proveedor, consulta de artículos.
insert into public.rol_permiso (rol_id, permiso_codigo)
select r.id, p.codigo from public.rol r cross join public.permiso p
 where r.codigo in ('ADMINISTRACION', 'ADMIN_CONTABILIDAD') and (
   p.modulo in ('Clientes', 'Facturación', 'Caja')
   or p.codigo in (
     'facturar', 'ver_informes_financieros', '/ventas', '/pedidos', '/presupuestos', '/gestor-pedidos', '/gestor-presupuestos', '/repartos',
     '/listados-ventas/ventas', '/listados-ventas/articulos', '/listados-ventas/tarjetas', '/listados-ventas/cajon', '/listados-ventas/divisas',
     '/listados-ventas/pedidos', '/listados-ventas/presupuestos', '/articulos', '/almacen/listados-articulos',
     '/contabilidad/remesas', '/contabilidad/conciliacion', '/contabilidad/tesoreria',
     '/facturas-proveedor', '/pagos-proveedor', '/gestor-pagos-proveedor', '/proveedores', '/acreedores', '/listados-compras/facturas',
     '/archivo/incidencias', '/listados'))
on conflict do nothing;

-- Administración y Contabilidad: lo anterior más toda la Contabilidad.
insert into public.rol_permiso (rol_id, permiso_codigo)
select r.id, p.codigo from public.rol r cross join public.permiso p
 where r.codigo = 'ADMIN_CONTABILIDAD' and p.modulo = 'Contabilidad'
on conflict do nothing;

-- Permiso de la pantalla nueva «Pedidos de GeminisWin (consulta)» (22/11/2026) y, en Compras, dárselo.
insert into public.permiso (codigo, descripcion, modulo, tipo, orden)
values ('/pedidos-geminiswin', 'Pedidos de GeminisWin (consulta)', 'Compras', 'menu', 55)
on conflict (codigo) do nothing;
-- Compras: también la consulta de pedidos de GeminisWin.
insert into public.rol_permiso (rol_id, permiso_codigo)
select r.id, p.codigo from public.rol r join public.permiso p on p.codigo = '/pedidos-geminiswin' where r.codigo = 'COMPRAS'
on conflict do nothing;

-- Asignación por departamento del Fichaje, solo a quien no tiene grupo.
update public.empleado e
   set rol_id = r.id
  from public.fichaje_empleado fe, public.rol r
 where fe.empleado_codigo = e.codigo and fe.activo and e.activo and e.rol_id is null
   and r.codigo = case fe.departamento_codigo
                    when 'comerciales' then 'COMERCIAL'
                    when 'oficina' then 'ADMINISTRACION'
                    when 'pedidos' then 'COMPRAS'
                    when 'almacen' then 'ALMACEN'
                    when 'ofipapel_detalle' then 'DEPENDIENTE'
                    when 'ofipapel_info' then 'DEPENDIENTE'
                    when 'aliz1' then 'DEPENDIENTE'
                    when 'aliz2' then 'DEPENDIENTE'
                  end;

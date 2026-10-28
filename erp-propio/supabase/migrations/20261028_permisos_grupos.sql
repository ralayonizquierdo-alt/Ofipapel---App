-- Permisos por grupo de acceso (como GeminisWin): un permiso por opción de menú construida.
--
-- - permiso.tipo = 'menu' para las opciones de menú; 'general' para los 5 permisos genéricos
--   anteriores (gestionar_usuarios, operar_tpv…), que se conservan aunque hoy no los usa nada
--   salvo fn_tiene_permiso (preparada para las acciones futuras de NEXA).
-- - Código de una opción: su ruta sin «/nuevo» ni «?…» (p. ej. '/caja/movimientos') o
--   'accion:<acción>' (p. ej. 'accion:generar-peticion'). Una ruta da acceso a lo que cuelga de
--   ella. El catálogo sale de src/components/shell/menus.ts (src/lib/permisos.ts) y la pantalla
--   Archivo → Grupos de Acceso da de alta sola las opciones nuevas cuando la abre un
--   administrador.
-- - Los grupos administradores (rol.es_administrador) lo pueden todo siempre.
-- - Escribir en rol / rol_permiso / permiso: solo administradores (políticas RESTRICTIVE
--   admin_* de 20261027_archivo_maestros.sql, ya activas). Aquí se añade que no se pueda dejar
--   el ERP sin ningún administrador.
-- Sin DELETE / DROP: todo idempotente (se puede volver a lanzar).

alter table public.permiso add column if not exists tipo text not null default 'general';
alter table public.permiso add column if not exists orden integer;
comment on column public.permiso.tipo is 'menu = opción de menú (código = ruta o accion:<acción>); general = permiso genérico.';
comment on column public.permiso.orden is 'Orden de la opción dentro de los menús (para la pantalla Grupos de Acceso).';

insert into public.permiso (codigo, descripcion, modulo, orden) values
  ('/empresa', 'Datos de Empresa', 'Archivo', 1),
  ('/tiendas', 'Tiendas', 'Archivo', 2),
  ('/formas-pago', 'Formas de Pago', 'Archivo', 3),
  ('/empleados', 'Empleados', 'Archivo', 4),
  ('/grupos-acceso', 'Grupos de Acceso', 'Archivo', 5),
  ('/clientes', 'Clientes', 'Clientes', 6),
  ('/vendedores', 'Vendedores', 'Ventas', 7),
  ('/repartidores', 'Repartidores', 'Ventas', 8),
  ('/zonas-territoriales', 'Zonas Territoriales', 'Ventas', 9),
  ('/rutas-reparto', 'Rutas de Reparto', 'Ventas', 10),
  ('/repartos', 'Repartos', 'Ventas', 11),
  ('/tecnicos', 'Técnicos', 'Ventas', 12),
  ('/numeros-serie', 'Nº Serie', 'Ventas', 13),
  ('/pedidos', 'Pedidos', 'Ventas', 14),
  ('/tpv', 'TPV / Ventas', 'Ventas', 15),
  ('/ventas', 'Ventas / Facturas', 'Ventas', 16),
  ('/reparaciones', 'Reparaciones', 'Ventas', 17),
  ('/presupuestos', 'Presupuestos', 'Ventas', 18),
  ('/gestor-pedidos', 'Gestor de Pedidos', 'Ventas', 19),
  ('/gestor-presupuestos', 'Gestor de Presupuestos', 'Ventas', 20),
  ('/listados-ventas/ventas', 'Listados › List. Ventas › List. de Ventas', 'Ventas', 21),
  ('/listados-ventas/articulos', 'Listados › List. Ventas › Ventas por Artículo', 'Ventas', 22),
  ('/listados-ventas/reparaciones', 'Listados › L. Reparaciones', 'Ventas', 23),
  ('/listados-ventas/presupuestos', 'Listados › List. Presupuestos', 'Ventas', 24),
  ('/listados-ventas/tarjetas', 'Listados › List. Tarjetas', 'Ventas', 25),
  ('/listados-ventas/divisas', 'Listados › List. Divisas', 'Ventas', 26),
  ('/listados-ventas/cajon', 'Listados › List. Apert. Cajón', 'Ventas', 27),
  ('/caja/movimientos', 'Mov. de Caja', 'Caja', 28),
  ('/caja/listado', 'Listado de Caja', 'Caja', 29),
  ('/caja/entrada', 'Entrada en caja', 'Caja', 30),
  ('/caja/salida', 'Salida de caja', 'Caja', 31),
  ('/caja/apertura', 'Apertura de Caja', 'Caja', 32),
  ('/caja/cierre', 'Cierre de Caja', 'Caja', 33),
  ('/caja/aperturas', 'Aperturas y Cierres', 'Caja', 34),
  ('/generar-facturas', 'Generar Facturas', 'Facturación', 35),
  ('/facturacion', 'Facturas', 'Facturación', 36),
  ('/listado-facturas', 'Listados › List. Facturas', 'Facturación', 37),
  ('/contabilidad/generar', 'Generar Asientos Automáticos', 'Contabilidad', 38),
  ('/contabilidad/pendientes', 'Asientos Pendientes / con Errores', 'Contabilidad', 39),
  ('/contabilidad/diario', 'Diario de Asientos', 'Contabilidad', 40),
  ('/contabilidad/plan-cuentas', 'Plan de Cuentas', 'Contabilidad', 41),
  ('/contabilidad/mayor', 'Mayor / Extracto de Cuenta', 'Contabilidad', 42),
  ('/contabilidad/sumas-saldos', 'Sumas y Saldos', 'Contabilidad', 43),
  ('/contabilidad/perdidas-ganancias', 'Pérdidas y Ganancias', 'Contabilidad', 44),
  ('/contabilidad/libros-igic', 'Libros Registro de IGIC', 'Contabilidad', 45),
  ('/contabilidad/modelo-420', 'Modelo 420 (IGIC Trimestral)', 'Contabilidad', 46),
  ('/contabilidad/modelo-425', 'Modelo 425 (IGIC Anual)', 'Contabilidad', 47),
  ('/contabilidad/modelo-347', 'Modelo 347', 'Contabilidad', 48),
  ('/registros-verifactu', 'Verifactu (Registro y Envío)', 'Contabilidad', 49),
  ('/contabilidad/conciliacion', 'Conciliación Bancaria', 'Contabilidad', 50),
  ('/contabilidad/tesoreria', 'Previsión de Tesorería', 'Contabilidad', 51),
  ('/contabilidad/exportar', 'Exportar a Gestoría', 'Contabilidad', 52),
  ('/contabilidad/configuracion', 'Configuración Contable', 'Contabilidad', 53),
  ('/pedidos-proveedor', 'Pedidos a Proveedores', 'Compras', 54),
  ('/creacion-rapida-pedidos', 'Creación Ráp. de Pedidos', 'Compras', 55),
  ('/listados-compras/pedidos', 'Listados de Pedidos', 'Compras', 56),
  ('/facturas-proveedor', 'Facturas Proveedor', 'Compras', 57),
  ('/listados-compras/facturas', 'Listados de Facturas', 'Compras', 58),
  ('/pagos-proveedor', 'Pagos', 'Compras', 59),
  ('/gestor-pagos-proveedor', 'Gestor de Pagos', 'Compras', 60),
  ('/proveedores', 'Proveedores', 'Compras', 61),
  ('/transportistas', 'Transportistas', 'Compras', 62),
  ('/gestor-pedidos-proveedor', 'Gestor Pedidos a Proveedores', 'Compras', 63),
  ('/peticiones', 'Peticiones de Artículos', 'Compras', 64),
  ('accion:generar-peticion', 'Generar Petición', 'Compras', 65),
  ('/articulos', 'Artículos', 'Almacén', 66),
  ('/almacen/creacion-rapida', 'Creación Ráp. de Artic.', 'Almacén', 67),
  ('/almacen/listados-articulos', 'Listados Artículos', 'Almacén', 68),
  ('/almacen/movimientos', 'List. de Movimientos de Artículos', 'Almacén', 69),
  ('/almacen/etiquetas', 'Etiquetas de Cód. de Barras', 'Almacén', 70),
  ('/traspasos', 'Traspasos', 'Almacén', 71),
  ('/almacenes', 'Almacenes', 'Almacén', 72),
  ('/regularizacion-stock', 'Regularización de Stock', 'Almacén', 73),
  ('/inventario', 'Inventarios', 'Almacén', 74),
  ('/almacen/inventariar', 'Inventariar Almacén', 'Almacén', 75),
  ('/familias', 'Familias', 'Almacén', 76),
  ('/marcas', 'Marcas', 'Almacén', 77),
  ('/plantillas-tarifas', 'Plantillas Tarifas', 'Almacén', 78),
  ('/tarifas-oferta', 'Tarifas de Oferta', 'Almacén', 79),
  ('/modificacion-precios', 'Modificación de Precios', 'Almacén', 80),
  ('/almacen/modificacion-bloque', 'Modif. de Artículos en bloque', 'Almacén', 81),
  ('/almacen/puntos-restauracion', 'Puntos de Restauración Stock', 'Almacén', 82),
  ('/almacen/recalcular-stock', 'Recalcular Stock › Recalcular Stock desde Movimientos', 'Almacén', 83),
  ('/almacen/eliminacion-articulos', 'Eliminación de Artículos', 'Almacén', 84),
  ('/almacen/plus', 'Plu''s', 'Almacén', 85),
  ('/web/publicar', 'Publicar Artículos en la Web', 'Web', 86),
  ('/web/catalogo', 'Sincronizar Catálogo', 'Web', 87),
  ('/web/errores', 'Artículos con Errores Web', 'Web', 88),
  ('/web/precios', 'Precios Web', 'Web', 89),
  ('/web/categorias', 'Categorías Web', 'Web', 90),
  ('/web/importar-pedidos', 'Importar Pedidos Web', 'Web', 91),
  ('/web/pendientes', 'Pedidos Web Pendientes de Servir', 'Web', 92),
  ('/web/estado-pedidos', 'Estado de Pedidos Web', 'Web', 93),
  ('/web/devoluciones', 'Devoluciones y Reembolsos Web', 'Web', 94),
  ('/web/clientes', 'Clientes Web', 'Web', 95),
  ('/web/clientes-empresa', 'Clientes de Empresa', 'Web', 96),
  ('/web/cupones', 'Ofertas y Cupones Web', 'Web', 97),
  ('/web/whatsapp', 'Pedidos y Consultas por WhatsApp', 'Web', 98),
  ('/web/stock-reservado', 'Stock Reservado por Pedidos Web', 'Web', 99),
  ('/web/registro', 'Registro de Sincronización', 'Web', 100),
  ('/web/estadisticas', 'Estadísticas Web', 'Web', 101),
  ('/web/configuracion', 'Configuración de la Conexión', 'Web', 102)
on conflict (codigo) do update
  set descripcion = excluded.descripcion, modulo = excluded.modulo, orden = excluded.orden;
update public.permiso set tipo = 'menu' where codigo like '/%' or codigo like 'accion:%';

-- Permisos iniciales de los grupos (solo se añaden; lo que se cambie en la pantalla se respeta).
-- ADMINISTRADOR: todo (aunque por ser administrador ya lo puede todo).
insert into public.rol_permiso (rol_id, permiso_codigo)
select r.id, p.codigo from public.rol r cross join public.permiso p
where r.codigo = 'ADMINISTRADOR' and p.tipo = 'menu'
on conflict do nothing;
-- GERENCIA: todo menos la pantalla de grupos de acceso.
insert into public.rol_permiso (rol_id, permiso_codigo)
select r.id, p.codigo from public.rol r cross join public.permiso p
where r.codigo = 'GERENCIA' and p.tipo = 'menu' and p.codigo <> '/grupos-acceso'
on conflict do nothing;
-- DEPENDIENTE: mostrador, pedidos, reparaciones, caja, consulta de artículos y clientes.
insert into public.rol_permiso (rol_id, permiso_codigo)
select r.id, p.codigo from public.rol r cross join public.permiso p
where r.codigo = 'DEPENDIENTE' and p.codigo in (
  '/clientes', '/repartos', '/numeros-serie', '/pedidos', '/tpv', '/ventas', '/reparaciones', '/presupuestos',
  '/gestor-pedidos', '/gestor-presupuestos', '/listados-ventas/reparaciones', '/listados-ventas/presupuestos',
  '/caja/movimientos', '/caja/entrada', '/caja/salida', '/caja/apertura', '/caja/cierre', '/caja/aperturas',
  '/articulos', '/almacen/listados-articulos', '/peticiones', 'accion:generar-peticion',
  '/web/pendientes', '/web/estado-pedidos')
on conflict do nothing;

-- Códigos de permiso del empleado conectado (por empleado.auth_user_id = auth.uid()).
-- Administrador: todos los de la tabla. Sin empleado activo o sin grupo: ninguno.
create or replace function public.fn_mis_permisos()
returns setof text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.codigo from public.permiso p where public.fn_es_administrador()
  union
  select rp.permiso_codigo
  from public.empleado e
  join public.rol_permiso rp on rp.rol_id = e.rol_id
  where e.auth_user_id = auth.uid() and e.activo
$$;
revoke all on function public.fn_mis_permisos() from public, anon;
grant execute on function public.fn_mis_permisos() to authenticated;
comment on function public.fn_mis_permisos() is 'Códigos de permiso (opciones de menú) del empleado conectado. Los usan la interfaz (opciones en gris, bloqueo de rutas) y NEXA.';

-- No dejar el ERP sin administrador: un grupo no puede dejar de ser administrador si es el
-- único con empleados activos con usuario de acceso.
create or replace function public.fn_rol_proteger_admin()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.es_administrador and not new.es_administrador and not exists (
    select 1 from public.rol r join public.empleado e on e.rol_id = r.id
    where r.es_administrador and r.id <> old.id and e.activo and e.auth_user_id is not null
  ) then
    raise exception 'No se puede quitar «Administrador» a este grupo: es el único con administradores. Marca antes otro grupo como administrador.' using errcode = '42501';
  end if;
  new.actualizado_en := now();
  return new;
end;
$$;
create or replace trigger trg_rol_proteger_admin before update on public.rol
  for each row execute function public.fn_rol_proteger_admin();

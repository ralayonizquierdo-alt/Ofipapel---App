-- Listado «Peticiones resueltas por proveedor» (01/11/2026, pedido de Rober): los artículos que ya han llegado, agrupados por
-- proveedor, con el cliente para el que son, el número del pedido a proveedor en el que vinieron y la cantidad pedida,
-- para imprimirlo (Generador de listados → Imprimir / PDF / Excel) y avisar a los clientes.
-- La fuente v_lst_peticiones gana columnas al final (proveedor del pedido, cliente, pedido, recepción); las que ya tenía no cambian.

create or replace view public.v_lst_peticiones with (security_invoker = true) as
select pe.tienda_terminal_codigo, pe.numero, pe.tipo, pe.estado, pe.fecha_hora, pe.articulo_codigo, pe.descripcion, pe.cantidad,
    pe.cantidad_tramitada, pe.empleado_peticion_codigo, pe.vendedor_codigo, pe.empleado_atencion_codigo, pe.concepto, pe.origen_tipo,
    pe.origen_tienda_terminal_codigo, pe.origen_movimiento_numero, pe.origen_almacen_codigo, pe.origen_cliente_codigo, pe.origen_nombre,
    pe.proveedor_codigo, pe.fecha_prevista_entrega, pe.observaciones, pe.actualizado_en,
    pe.tienda_terminal_codigo as tienda,
    (pe.fecha_hora at time zone 'Atlantic/Canary')::date as fecha,
    fn_numero_operario(pe.empleado_peticion_codigo) as empleado_numero,
    coalesce(a.codigo_venta, pe.articulo_codigo) as referencia,
    a.descripcion as articulo_desc,
    a.familia_codigo as familia,
    a.proveedor_habitual_codigo as proveedor,
    coalesce(t.proveedor_codigo, pe.proveedor_codigo, a.proveedor_habitual_codigo) as proveedor_pedido,
    pr.nombre as proveedor_nombre,
    coalesce(c.nombre, pe.origen_nombre) as cliente_nombre,
    t.pedido_proveedor_tienda_codigo as pedido_tienda,
    t.pedido_proveedor_numero as pedido,
    t.pedido_proveedor_linea as pedido_linea,
    case when t.pedido_proveedor_numero is not null then t.pedido_proveedor_tienda_codigo || '/' || t.pedido_proveedor_numero end as pedido_ref,
    pp.estado as pedido_estado,
    pp.fecha_recepcion::date as fecha_recepcion
  from peticion pe
  left join articulo a on a.codigo_interno = pe.articulo_codigo
  left join peticion_tramitacion t on t.tienda_terminal_codigo = pe.tienda_terminal_codigo and t.numero = pe.numero
  left join pedido_proveedor pp on pp.tienda_terminal_codigo = t.pedido_proveedor_tienda_codigo and pp.numero = t.pedido_proveedor_numero
  left join proveedor pr on pr.codigo = coalesce(t.proveedor_codigo, pe.proveedor_codigo, a.proveedor_habitual_codigo)
  left join cliente c on c.codigo = pe.origen_cliente_codigo;

insert into public.listado_guardado (nombre, fuente, descripcion, definicion)
select 'Peticiones resueltas por proveedor', 'peticiones',
       'Artículos que ya han llegado (petición resuelta), ordenados por proveedor, con el cliente, el pedido a proveedor en el que vinieron y la cantidad pedida. Para imprimir y avisar a los clientes.',
       '{"orden":[{"col":"proveedor_nombre","desc":false},{"col":"pedido","desc":false},{"col":"cliente_nombre","desc":false}],"sumar":[],"agrupar":[],"filtros":[{"op":"=","col":"estado","valor":"resuelta"}],"columnas":["proveedor_nombre","pedido_ref","cliente_nombre","referencia","articulo_desc","cantidad","fecha_recepcion"]}'::jsonb
 where not exists (select 1 from public.listado_guardado where nombre = 'Peticiones resueltas por proveedor');

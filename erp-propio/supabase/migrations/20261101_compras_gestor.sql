-- Compras con NEXA, fase 2: la forma de comprar de Rober (Gestor de Pedidos a Proveedores) hecha función.
-- Para un proveedor: lo vendido desde su última compra, el stock, lo que ya viene en pedidos sin recibir y lo
-- comprometido en pedidos de clientes; y por línea la decisión «pedir / no pedir / dudosa» con el motivo.
-- Regla (la de Rober): si con el stock + lo pendiente de recibir − lo comprometido a clientes aguanto lo vendido
-- en el periodo, no pido; si no, pido la diferencia. Los artículos 00003… (pedidos expresos de cliente) se excluyen.
-- Solo lee (SECURITY INVOKER): no crea pedidos.

create or replace function public.fn_compras_gestor_proveedor(p_proveedor text, p_desde date default null)
returns table (
  articulo_codigo text,
  descripcion text,
  periodo_desde date,
  periodo_dias int,
  vendido numeric,
  stock_actual numeric,
  pendiente_recibir numeric,
  comprometido_clientes numeric,
  disponible numeric,
  decision text,
  cantidad_sugerida numeric,
  motivo text
)
language sql
stable
set search_path = public
as $$
  with param as (
    select coalesce(
             p_desde,
             (select max(pp.fecha_hora)::date from pedido_proveedor pp
               where pp.proveedor_codigo = p_proveedor and not coalesce(pp.es_abono, false)),
             (select pr.fecha_ultimo_pedido::date from proveedor pr where pr.codigo = p_proveedor),
             current_date - 90
           ) as desde
  ),
  art as (
    select ar.codigo_interno, ar.descripcion
      from articulo ar
     where ar.proveedor_habitual_codigo = p_proveedor
       and ar.codigo_interno not like '00003%'
       and ar.fecha_baja is null and coalesce(ar.activo, true) and not coalesce(ar.sin_control_stock, false)
  ),
  ven as (
    select m.articulo_codigo,
           sum(case when m.sentido < 0 then m.cantidad else -m.cantidad end) as uds
      from movimiento_stock m, param p
     where m.tipo_movimiento = 'venta' and m.ocurrido_en::date >= p.desde
       and m.articulo_codigo in (select codigo_interno from art)
     group by 1
  ),
  stk as (
    select s.articulo_codigo, sum(s.cantidad_actual) as uds
      from articulo_almacen_stock s
     where s.articulo_codigo in (select codigo_interno from art)
     group by 1
  ),
  pend as (
    select l.articulo_codigo,
           sum(greatest(0, coalesce(l.total_unidades, l.cantidad, 0) - coalesce(l.unidades_recibidas, 0))) as uds
      from pedido_proveedor_linea l
      join pedido_proveedor pp on pp.tienda_terminal_codigo = l.tienda_terminal_codigo and pp.numero = l.numero
     where pp.estado in ('pendiente', 'confirmado') and not coalesce(pp.recibido, false) and not coalesce(pp.es_abono, false)
       and l.articulo_codigo in (select codigo_interno from art)
     group by 1
  ),
  comp as (
    select l.articulo_codigo,
           sum(greatest(0, coalesce(l.total_unidades, l.cantidad, 0) - coalesce(l.unidades_liquidadas, 0))) as uds
      from pedido_cliente_linea l
      join pedido_cliente pc on pc.tienda_terminal_codigo = l.tienda_terminal_codigo and pc.numero = l.numero
     where not coalesce(pc.anulado, false) and not coalesce(pc.entregado, false) and pc.cerrado_en is null
       and l.articulo_codigo in (select codigo_interno from art)
     group by 1
  ),
  base as (
    select a.codigo_interno, a.descripcion,
           greatest(0, coalesce(v.uds, 0)) as vendido,
           coalesce(s.uds, 0) as stock,
           coalesce(p.uds, 0) as pendiente,
           coalesce(c.uds, 0) as comprometido
      from art a
      left join ven v on v.articulo_codigo = a.codigo_interno
      left join stk s on s.articulo_codigo = a.codigo_interno
      left join pend p on p.articulo_codigo = a.codigo_interno
      left join comp c on c.articulo_codigo = a.codigo_interno
     where coalesce(v.uds, 0) > 0 or coalesce(c.uds, 0) > 0 or coalesce(s.uds, 0) < 0
  ),
  calc as (
    select b.*, (b.stock + b.pendiente - b.comprometido) as disp,
           pa.desde, greatest(0, current_date - pa.desde) as dias
      from base b, param pa
  )
  select c.codigo_interno::text, c.descripcion::text, c.desde, c.dias::int,
         c.vendido, c.stock, c.pendiente, c.comprometido, c.disp,
         case
           when c.vendido = 0 and c.comprometido = 0 then 'dudosa'
           when c.disp >= c.vendido and not (c.vendido > 0 and c.disp < c.vendido * 1.25) then 'no_pedir'
           when c.disp >= c.vendido then 'dudosa'
           when c.vendido <= 1 and c.comprometido = 0 then 'dudosa'
           when c.dias < 7 then 'dudosa'
           when c.stock < 0 then 'dudosa'
           else 'pedir' end,
         case when c.vendido = 0 and c.comprometido = 0 then 0 else greatest(0, ceil(c.vendido - c.disp)) end,
         case
           when c.vendido = 0 and c.comprometido = 0 then 'Stock negativo y sin ventas en el periodo: es un fallo de stock, no una necesidad de compra. Revisar el stock'
           when c.disp >= c.vendido and not (c.vendido > 0 and c.disp < c.vendido * 1.25) then 'Hay stock de sobra para lo vendido en el periodo'
           when c.disp >= c.vendido then 'Llega justo (menos de un 25 % de margen sobre lo vendido)'
           when c.vendido <= 1 and c.comprometido = 0 then 'Venta aislada (1 unidad o menos): ¿merece reponerse?'
           when c.dias < 7 then 'Periodo muy corto (menos de 7 días desde la última compra)'
           when c.stock < 0 then 'Stock negativo: revisar el stock antes de pedir'
           when c.comprometido > 0 and c.disp < 0 then 'Hay pedidos de clientes sin servir que el stock no cubre'
           else 'No alcanza para lo vendido en el periodo' end
    from calc c
   order by case when c.disp >= c.vendido then 2 else 1 end, c.codigo_interno
$$;

revoke execute on function public.fn_compras_gestor_proveedor(text, date) from public, anon;
grant execute on function public.fn_compras_gestor_proveedor(text, date) to authenticated;

insert into public.nexa_operacion (codigo, descripcion, tipo, objeto, accion, nivel, permiso, bloqueada, notas, receta) values
  ('funcion:fn_compras_gestor_proveedor', 'Gestor de Pedidos a Proveedores: ventas desde la última compra y decisión pedir/no pedir por línea (solo lee)', 'funcion',
   'fn_compras_gestor_proveedor', '*', 1, null, false, null,
   'Para preparar el pedido a un proveedor (es como compra Rober): select * from fn_compras_gestor_proveedor(''CODIGO_PROVEEDOR''). Es su Gestor de Pedidos hecho función: ventas desde la última compra, stock, lo pendiente de recibir y lo comprometido a clientes; decisión pedir / no pedir / dudosa con motivo. Enséñale primero un resumen (cuántas líneas en cada decisión y el total de unidades a pedir), después las líneas «pedir» y «dudosa» con su motivo; las «no pedir» solo si las pide. Los artículos 00003… (pedidos expresos de cliente) ya van excluidos. Avisa si el total no llega a la compra mínima del proveedor. Es una propuesta: no crees ningún pedido sin que Rober lo confirme.')
on conflict (codigo) do update set descripcion = excluded.descripcion, nivel = excluded.nivel, permiso = excluded.permiso,
                                    notas = excluded.notas, receta = excluded.receta, actualizado_en = now();

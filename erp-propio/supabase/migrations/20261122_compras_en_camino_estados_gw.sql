-- Estados de los pedidos a proveedor de GeminisWin (ESTADOPED), confirmados por Rober el 22/11/2026 con la lista del
-- ERP, que es la misma: 1 Pendiente, 2 Pend. confirmar, 3 Confirmado, 4 Conformado, 5 Pend. entrega, 6 Recepcionado,
-- 7 Liquidado. En Ofipapel se usan Pendiente, Confirmado y Liquidado. En camino: sin actualizar y ni recepcionado ni
-- liquidado (un liquidado sin actualizar no se espera que llegue).

comment on column public.gw_pedido_proveedor.estado_pedido is
  'ESTADOPED de GeminisWin: 1 Pendiente, 2 Pend. confirmar, 3 Confirmado, 4 Conformado, 5 Pend. entrega, 6 Recepcionado, 7 Liquidado.';

create or replace function public.fn_compras_en_camino()
returns table(articulo_codigo text, uds numeric)
language sql stable set search_path to 'public' as $$
  with erp as (
    select l.articulo_codigo, sum(greatest(0, coalesce(l.total_unidades, l.cantidad, 0) - coalesce(l.unidades_recibidas, 0))) uds
      from pedido_proveedor_linea l
      join pedido_proveedor p on p.tienda_terminal_codigo = l.tienda_terminal_codigo and p.numero = l.numero
     where p.estado in ('pendiente', 'confirmado') and not coalesce(p.recibido, false) and not coalesce(p.es_abono, false)
     group by 1
  ), gw as (
    select l.articulo_codigo, sum(greatest(0, coalesce(l.total_unidades, l.cantidad, 0) - coalesce(l.unidades_recibidas, 0))) uds
      from gw_pedido_proveedor_linea l
      join gw_pedido_proveedor p on p.oficina = l.oficina and p.numero = l.numero
     where not p.actualizado and not p.abono and coalesce(p.estado_pedido, 0) not in (6, 7)
       and not l.recibida and l.articulo_codigo <> ''
     group by 1
  )
  select coalesce(e.articulo_codigo, g.articulo_codigo), greatest(coalesce(e.uds, 0), coalesce(g.uds, 0))
    from erp e full join gw g on g.articulo_codigo = e.articulo_codigo
$$;

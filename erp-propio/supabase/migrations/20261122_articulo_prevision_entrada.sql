-- Previsión de entrada de lo pedido (Rober, 22/11/2026): «Prev. Entrada Pedido» venía de GeminisWin (FECPREVENT), que
-- no se rellena. Se estima: fecha del pedido en camino + plazo de entrega de su proveedor (Condiciones del Gestor 2.0;
-- si no, días de entrega de la ficha; si no, 7). De cada artículo, la más próxima. En camino = lo mismo que el Gestor:
-- pedidos del ERP pendientes/confirmados sin recibir y de GeminisWin sin actualizar ni recepcionados/liquidados, con
-- unidades por recibir. Si la fecha ya pasó, se marca «retrasado».
-- SECURITY DEFINER: lo usan las pantallas de venta, cuyos usuarios no ven los pedidos a proveedor; solo devuelve fecha
-- y unidades por artículo.

create or replace function public.fn_articulos_prevision_entrada(p_articulos text[])
returns table(articulo_codigo text, fecha_prevista date, unidades numeric, retrasado boolean)
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  with lin as (
    select l.articulo_codigo, p.proveedor_codigo, (p.fecha_hora at time zone 'Atlantic/Canary')::date f,
           greatest(0, coalesce(l.total_unidades, l.cantidad, 0) - coalesce(l.unidades_recibidas, 0)) uds
      from pedido_proveedor_linea l
      join pedido_proveedor p on p.tienda_terminal_codigo = l.tienda_terminal_codigo and p.numero = l.numero
     where l.articulo_codigo = any (p_articulos)
       and p.estado in ('pendiente', 'confirmado') and not coalesce(p.recibido, false) and not coalesce(p.es_abono, false)
    union all
    select l.articulo_codigo, p.proveedor_codigo, (p.fecha_hora at time zone 'Atlantic/Canary')::date,
           greatest(0, coalesce(l.total_unidades, l.cantidad, 0) - coalesce(l.unidades_recibidas, 0))
      from gw_pedido_proveedor_linea l
      join gw_pedido_proveedor p on p.oficina = l.oficina and p.numero = l.numero
     where l.articulo_codigo = any (p_articulos)
       and not p.actualizado and not p.abono and coalesce(p.estado_pedido, 0) not in (6, 7) and not l.recibida
  ), est as (
    select lin.articulo_codigo, lin.uds,
           lin.f + coalesce(c.plazo_dias, nullif(greatest(coalesce(pr.dias_entrega, 0), 0), 0), 7) fecha
      from lin
      left join compra_proveedor_condicion c on c.proveedor_codigo = lin.proveedor_codigo
      left join proveedor pr on pr.codigo = lin.proveedor_codigo
     where lin.uds > 0 and lin.f is not null
  )
  select e.articulo_codigo, min(e.fecha), sum(e.uds), min(e.fecha) < current_date
    from est e
   where public.fn_empleado_actual() is not null or auth.role() = 'service_role'
   group by e.articulo_codigo
$$;
comment on function public.fn_articulos_prevision_entrada(text[]) is
  'Previsión de entrada por artículo: fecha del pedido en camino (ERP o GeminisWin) + plazo del proveedor; la más próxima.';
revoke all on function public.fn_articulos_prevision_entrada(text[]) from public, anon;
grant execute on function public.fn_articulos_prevision_entrada(text[]) to authenticated;

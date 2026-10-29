-- Clientes → pestaña «Artículos comprados» (Luis, 29/10/2026): por cada artículo que ha comprado
-- el cliente, unidades en total y el último precio al que se le vendió (con su descuento y fecha).
-- Sale de las ventas/albaranes no anulados. SECURITY INVOKER: respeta la RLS de venta.

create or replace function public.fn_cliente_articulos_comprados(p_cliente text)
returns table (
  articulo_codigo text,
  referencia text,
  descripcion text,
  unidades numeric,
  importe numeric,
  ultimo_precio numeric,
  ultimo_descuento_pct numeric,
  ultima_fecha date,
  veces integer
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  with l as (
    select vl.articulo_codigo, vl.codigo_venta, vl.descripcion, vl.cantidad, vl.subtotal, vl.precio, vl.descuento_pct,
           v.fecha, v.hora, v.numero, v.tienda_terminal_codigo, vl.numero_linea
      from venta v
      join venta_linea vl on vl.tienda_terminal_codigo = v.tienda_terminal_codigo and vl.numero = v.numero
     where v.cliente_codigo = p_cliente and v.anulada_en is null and vl.articulo_codigo is not null
  ),
  ultima as (
    select distinct on (articulo_codigo) articulo_codigo, codigo_venta, descripcion, precio, descuento_pct, fecha
      from l
     order by articulo_codigo, fecha desc, hora desc nulls last, tienda_terminal_codigo desc, numero desc, numero_linea desc
  )
  select l.articulo_codigo,
         coalesce(u.codigo_venta, a.codigo_venta),
         coalesce(a.descripcion, u.descripcion),
         sum(l.cantidad),
         sum(l.subtotal),
         u.precio,
         u.descuento_pct,
         u.fecha,
         count(*)::int
    from l
    join ultima u on u.articulo_codigo = l.articulo_codigo
    left join articulo a on a.codigo_interno = l.articulo_codigo
   group by l.articulo_codigo, u.codigo_venta, a.codigo_venta, a.descripcion, u.descripcion, u.precio, u.descuento_pct, u.fecha
   order by u.fecha desc, 3
$$;
grant execute on function public.fn_cliente_articulos_comprados(text) to authenticated;
revoke execute on function public.fn_cliente_articulos_comprados(text) from anon;

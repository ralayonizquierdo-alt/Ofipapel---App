-- Gestor de Pedidos 2.0: la propuesta semanal cuenta también las PETICIONES de clientes (Rober, 17/11/2026).
-- Antes solo miraba mínimos y máximos: un artículo pedido por un cliente y sin mínimo no salía.
--  · Lo pedido por clientes y sin tramitar se resta de lo disponible (stock + en camino − peticiones).
--  · Artículo con mínimo: si lo disponible está en el mínimo o por debajo, se pide hasta el máximo.
--  · Artículo sin mínimo (o petición a un proveedor que no es el habitual): se pide lo que falte para
--    servir las peticiones.
-- Qué peticiones cuentan para cada proveedor: las suyas, o las que no llevan proveedor si es el habitual
-- del artículo (misma regla que el Gestor de siempre).
-- El paso a «tramitada» NO cambia: lo hacen los disparadores del pedido cuando se acepta
-- (20261101_peticiones_flujo_estados.sql), venga el pedido de donde venga.
-- Funciones con nombre nuevo porque cambian las columnas; las fn_compras2_lineas / _resumen de la primera
-- versión se quedan sin permisos y se borran en la limpieza.

create or replace function public.fn_compras_semanal_lineas(p_proveedor text default null)
returns table (
  proveedor_codigo text, proveedor_nombre text, articulo_codigo text, descripcion text, referencia_compra text,
  stock_actual numeric, pendiente_recibir numeric, stock_minimo numeric, stock_maximo numeric, peticiones numeric,
  cantidad_sugerida numeric, unidades_por_caja numeric, coste numeric, importe numeric,
  mejor_proveedor text, mejor_proveedor_nombre text, mejor_coste numeric
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  with stock as (
    select s.articulo_codigo, sum(s.cantidad_actual) as uds from articulo_almacen_stock s group by 1
  ),
  pend as (
    select l.articulo_codigo, sum(greatest(0, coalesce(l.total_unidades, l.cantidad, 0) - coalesce(l.unidades_recibidas, 0))) as uds
      from pedido_proveedor_linea l
      join pedido_proveedor p on p.tienda_terminal_codigo = l.tienda_terminal_codigo and p.numero = l.numero
     where p.estado in ('pendiente', 'confirmado') and not coalesce(p.recibido, false) and not coalesce(p.es_abono, false)
     group by 1
  ),
  pet as (
    select pt.articulo_codigo, coalesce(nullif(pt.proveedor_codigo, ''), ar.proveedor_habitual_codigo) as prov,
           sum(greatest(0, coalesce(pt.cantidad, 0) - coalesce(pt.cantidad_tramitada, 0))) as uds
      from peticion pt
      join articulo ar on ar.codigo_interno = pt.articulo_codigo
     where pt.estado in ('pendiente', 'atendida')
     group by 1, 2
  ),
  pares as (
    select ar.codigo_interno as art, ar.proveedor_habitual_codigo as prov
      from articulo ar
     where coalesce(ar.stock_minimo, 0) > 0 and ar.proveedor_habitual_codigo is not null
    union
    select pet.articulo_codigo, pet.prov from pet where pet.prov is not null and pet.uds > 0
  ),
  base as (
    select x.prov, ar.codigo_interno, ar.descripcion, ar.unidades_por_caja, ar.coste_neto,
           coalesce(st.uds, 0) as stock, coalesce(pe.uds, 0) as camino, coalesce(pt.uds, 0) as pedidas,
           case when x.prov = ar.proveedor_habitual_codigo then coalesce(ar.stock_minimo, 0) else 0 end as minimo,
           case when x.prov = ar.proveedor_habitual_codigo then coalesce(ar.stock_maximo, 0) else 0 end as maximo
      from pares x
      join articulo ar on ar.codigo_interno = x.art
      left join stock st on st.articulo_codigo = ar.codigo_interno
      left join pend pe on pe.articulo_codigo = ar.codigo_interno
      left join pet pt on pt.articulo_codigo = ar.codigo_interno and pt.prov = x.prov
     where ar.fecha_baja is null and coalesce(ar.activo, true) and not coalesce(ar.sin_control_stock, false)
       and (p_proveedor is null or x.prov = p_proveedor)
  ),
  calc as (
    select b.*,
           case when b.minimo > 0 and b.stock + b.camino - b.pedidas <= b.minimo
                  then greatest(0, ceil(greatest(b.maximo, b.minimo) - (b.stock + b.camino - b.pedidas)))
                when b.minimo > 0 then 0
                else greatest(0, ceil(b.pedidas - greatest(b.stock + b.camino, 0)))
           end as pedir
      from base b
  )
  select c.prov::text, pr.nombre::text, c.codigo_interno::text, c.descripcion::text, ap.codigo_compra::text,
         c.stock, c.camino, c.minimo, c.maximo, c.pedidas, c.pedir, nullif(c.unidades_por_caja, 0),
         k.coste, round(c.pedir * k.coste, 2), m.proveedor_codigo::text, m.nombre::text, m.coste_neto
    from calc c
    left join proveedor pr on pr.codigo = c.prov
    left join articulo_proveedor ap on ap.articulo_codigo = c.codigo_interno and ap.proveedor_codigo = c.prov
    cross join lateral (select coalesce(nullif(ap.coste_neto, 0), nullif(c.coste_neto, 0), 0) as coste) k
    left join lateral (
      select o.proveedor_codigo, p2.nombre, o.coste_neto
        from articulo_proveedor o
        join proveedor p2 on p2.codigo = o.proveedor_codigo and coalesce(p2.activo, true)
       where o.articulo_codigo = c.codigo_interno and o.proveedor_codigo <> c.prov
         and o.coste_neto > 0 and k.coste > 0 and o.coste_neto < k.coste
       order by o.coste_neto
       limit 1
    ) m on true
   where c.pedir > 0
$$;

create or replace function public.fn_compras_semanal_resumen()
returns table (
  proveedor_codigo text, proveedor_nombre text, articulos integer, agotados integer, con_peticion integer,
  unidades numeric, importe numeric, compra_minima numeric, dias_entrega integer, ultimo_pedido date,
  mas_baratos_en_otro integer, aplazado_hasta date, aplazado_motivo text
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  select l.proveedor_codigo, max(l.proveedor_nombre), count(*)::integer,
         count(*) filter (where l.stock_actual <= 0)::integer,
         count(*) filter (where l.peticiones > 0)::integer,
         sum(l.cantidad_sugerida), sum(l.importe),
         max(pr.compra_minima), max(pr.dias_entrega)::integer, max(pr.fecha_ultimo_pedido),
         count(l.mejor_proveedor)::integer,
         max(a.hasta) filter (where a.hasta >= current_date), max(a.motivo) filter (where a.hasta >= current_date)
    from public.fn_compras_semanal_lineas(null) l
    left join public.proveedor pr on pr.codigo = l.proveedor_codigo
    left join public.compra_propuesta_aplazada a on a.proveedor_codigo = l.proveedor_codigo
   group by l.proveedor_codigo
$$;

revoke all on function public.fn_compras_semanal_lineas(text), public.fn_compras_semanal_resumen() from public, anon;
grant execute on function public.fn_compras_semanal_lineas(text), public.fn_compras_semanal_resumen() to authenticated;
revoke all on function public.fn_compras2_lineas(text), public.fn_compras2_resumen() from public, anon, authenticated;

-- Peticiones abiertas que no pueden salir en ninguna propuesta porque ni la petición ni el artículo
-- tienen proveedor. La pantalla avisa de cuántas hay para que no se queden olvidadas.
create or replace function public.fn_compras_semanal_sin_proveedor()
returns integer
language sql
stable
security invoker
set search_path to 'public'
as $$
  select count(*)::integer
    from peticion pt
    join articulo ar on ar.codigo_interno = pt.articulo_codigo
   where pt.estado in ('pendiente', 'atendida')
     and coalesce(pt.cantidad, 0) - coalesce(pt.cantidad_tramitada, 0) > 0
     and coalesce(nullif(pt.proveedor_codigo, ''), ar.proveedor_habitual_codigo) is null
$$;
revoke all on function public.fn_compras_semanal_sin_proveedor() from public, anon;
grant execute on function public.fn_compras_semanal_sin_proveedor() to authenticated;

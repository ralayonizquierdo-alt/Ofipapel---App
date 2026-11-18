-- Gestor de Pedidos 2.0: campañas (vuelta al cole y similares) (18/11/2026).
--
-- Cómo las hace Rober: «comparar lo que vendí el año pasado en esa fecha y entonces pido eso y un poquito más».
-- El ERP hace eso mismo, artículo a artículo: lo vendido en los meses elegidos del año pasado, más el % que se diga,
-- menos lo que ya hay en stock y lo que está en camino (pedidos del ERP sin recibir). A cajas completas, como la
-- propuesta semanal. Las ventas son por meses (venta_historico_mensual), así que el periodo va por meses enteros.
--
-- Fuera: lo marcado «Bajo pedido» (papel de oferta, servicios…), las familias de compras.familias_aparte
-- (consumibles de informática), los artículos de baja y los que no tienen proveedor habitual. Los artículos que se
-- compran por caja y se venden por unidad (compra_articulo_venta_por_unidad) se pasan a cajas.
-- Los pedidos se crean con la misma función que la propuesta semanal (fn_compras_crear_pedido); al quedar «en
-- camino», la propuesta semanal ya no vuelve a pedir lo mismo.

create or replace function public.fn_compras_campana_propuesta(p_desde date, p_hasta date, p_pct numeric default 10,
                                                               p_proveedor text default null, p_familia text default null)
returns table(proveedor_codigo text, proveedor_nombre text, articulo_codigo text, descripcion text, referencia_compra text,
              familia_codigo text, vendido numeric, objetivo numeric, stock_actual numeric, pendiente_recibir numeric,
              cantidad_sugerida numeric, unidades_por_caja numeric, coste numeric, importe numeric, venta_mes numeric)
language sql stable set search_path to 'public' as $$
  with v as (
    select h.articulo_codigo art, sum(h.unidades) / coalesce(max(f.ventas_por_unidad), 1) u
      from venta_historico_mensual h
      left join compra_articulo_venta_por_unidad f on f.articulo_codigo = h.articulo_codigo
     where h.mes between date_trunc('month', p_desde)::date and date_trunc('month', p_hasta)::date
     group by 1
    having sum(h.unidades) > 0
  ),
  stock as (select s.articulo_codigo, sum(s.cantidad_actual) uds from articulo_almacen_stock s group by 1),
  pend as (
    select l.articulo_codigo, sum(greatest(0, coalesce(l.total_unidades, l.cantidad, 0) - coalesce(l.unidades_recibidas, 0))) uds
      from pedido_proveedor_linea l
      join pedido_proveedor p on p.tienda_terminal_codigo = l.tienda_terminal_codigo and p.numero = l.numero
     where p.estado in ('pendiente', 'confirmado') and not coalesce(p.recibido, false) and not coalesce(p.es_abono, false)
     group by 1
  ),
  base as (
    select ar.proveedor_habitual_codigo prov, ar.codigo_interno, ar.descripcion, ar.familia_codigo, ar.unidades_por_caja, ar.coste_neto,
           v.u vendido, ceil(v.u * (1 + coalesce(p_pct, 0) / 100)) objetivo,
           coalesce(st.uds, 0) stock, coalesce(pe.uds, 0) camino, po.venta_mes,
           exists (select 1 from compra_articulo_venta_por_unidad f where f.articulo_codigo = ar.codigo_interno) caja_es_unidad
      from v
      join articulo ar on ar.codigo_interno = v.art
      left join stock st on st.articulo_codigo = ar.codigo_interno
      left join pend pe on pe.articulo_codigo = ar.codigo_interno
      left join compra_articulo_politica po on po.articulo_codigo = ar.codigo_interno
      left join compra_articulo_decision d on d.articulo_codigo = ar.codigo_interno
     where ar.fecha_baja is null and coalesce(ar.activo, true) and not coalesce(ar.sin_control_stock, false)
       and ar.proveedor_habitual_codigo is not null
       and coalesce(d.decision, '') <> 'bajo_pedido'
       and not exists (select 1 from jsonb_array_elements_text(coalesce((select q.valor from parametro q where q.clave = 'compras.familias_aparte'), '[]'::jsonb)) fa
                        where coalesce(ar.familia_codigo, '') like fa || '%')
       and (p_proveedor is null or ar.proveedor_habitual_codigo = p_proveedor)
       and (nullif(btrim(p_familia), '') is null or coalesce(ar.familia_codigo, '') like btrim(p_familia) || '%')
  ),
  calc as (
    select b.*, greatest(0, ceil(b.objetivo - greatest(b.stock, 0) - b.camino)) pedir0 from base b
  ),
  calc2 as (
    select c.*, case when not c.caja_es_unidad and coalesce(c.unidades_por_caja, 0) > 1 and c.pedir0 > 0
                     then ceil(c.pedir0 / c.unidades_por_caja) * c.unidades_por_caja else c.pedir0 end pedir
      from calc c
  )
  select c.prov::text, pr.nombre::text, c.codigo_interno::text, c.descripcion::text, ap.codigo_compra::text, c.familia_codigo::text,
         round(c.vendido, 2), c.objetivo, c.stock, c.camino, c.pedir, nullif(c.unidades_por_caja, 0),
         k.coste, round(c.pedir * k.coste, 2), round(c.venta_mes, 2)
    from calc2 c
    left join proveedor pr on pr.codigo = c.prov
    left join articulo_proveedor ap on ap.articulo_codigo = c.codigo_interno and ap.proveedor_codigo = c.prov
    cross join lateral (select coalesce(nullif(ap.coste_neto, 0), nullif(c.coste_neto, 0), 0) coste) k
   where c.pedir > 0
$$;

-- Resumen por proveedor (la pantalla lo pide primero; las líneas, al abrir cada proveedor).
create or replace function public.fn_compras_campana_proveedores(p_desde date, p_hasta date, p_pct numeric default 10, p_familia text default null)
returns table(proveedor_codigo text, proveedor_nombre text, articulos integer, unidades numeric, importe numeric,
              vendido_importe numeric, compra_minima numeric, portes_gratis_desde numeric, dias_entrega integer)
language sql stable set search_path to 'public' as $$
  select l.proveedor_codigo, max(l.proveedor_nombre), count(*)::integer, sum(l.cantidad_sugerida), sum(l.importe),
         round(sum(l.vendido * l.coste), 2),
         coalesce(max(c.pedido_minimo), max(pr.compra_minima)), max(c.portes_gratis_desde),
         coalesce(max(c.plazo_dias), max(pr.dias_entrega))::integer
    from fn_compras_campana_propuesta(p_desde, p_hasta, p_pct, null, p_familia) l
    left join proveedor pr on pr.codigo = l.proveedor_codigo
    left join compra_proveedor_condicion c on c.proveedor_codigo = l.proveedor_codigo
   group by l.proveedor_codigo
$$;

revoke all on function public.fn_compras_campana_propuesta(date, date, numeric, text, text) from public, anon;
revoke all on function public.fn_compras_campana_proveedores(date, date, numeric, text) from public, anon;
grant execute on function public.fn_compras_campana_propuesta(date, date, numeric, text, text) to authenticated;
grant execute on function public.fn_compras_campana_proveedores(date, date, numeric, text) to authenticated;

-- Panel → «Las 20 familias más vendidas» (Luis, 30/10/2026): dos porcentajes por familia, sobre el
-- total del periodo: por unidades vendidas (pct_unidades) y por importe (pct_importe, base sin
-- IGIC). Siguen sin salir euros: el panel operativo no enseña importes. Orden: por importe.

create or replace function public.fn_panel_familias(p_tienda text, p_desde date, p_hasta date)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $$
  with l as (
    select a.familia_codigo as familia, coalesce(vl.total_base, vl.subtotal, 0) as base,
           coalesce(vl.total_unidades, vl.cantidad, 0) as unidades
      from venta v
      join venta_linea vl on vl.tienda_terminal_codigo = v.tienda_terminal_codigo and vl.numero = v.numero
      left join articulo a on a.codigo_interno = vl.articulo_codigo
     where v.anulada_en is null and v.fecha between p_desde and p_hasta
       and (p_tienda is null or v.tienda_terminal_codigo = p_tienda)
  ),
  tot as (select nullif(sum(base), 0) as t, nullif(sum(unidades), 0) as u from l)
  select coalesce(jsonb_agg(x order by x.pct_importe desc, x.codigo), '[]') from (
    select coalesce(l.familia, '') as codigo, coalesce(f.descripcion, case when l.familia is null then 'Sin familia' end) as descripcion,
           sum(l.unidades) as unidades,
           round(100 * sum(l.unidades) / tot.u, 2) as pct_unidades,
           round(100 * sum(l.base) / tot.t, 2) as pct_importe
      from l
      left join familia f on f.codigo = l.familia, tot
     where tot.t is not null
     group by l.familia, f.descripcion, tot.t, tot.u
    having sum(l.base) > 0
     order by sum(l.base) desc
     limit 20) x
$$;
grant execute on function public.fn_panel_familias(text, date, date) to authenticated;
revoke execute on function public.fn_panel_familias(text, date, date) from anon, public;

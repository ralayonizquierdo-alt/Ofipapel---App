-- Nº de operario de cada empleado (Luis, 29/10/2026): el número que se ve en listados y
-- consultas («Oper»), como en GeminisWin (Luis = 410). El código del empleado no se cambia
-- (lo usan sus ventas, cajas, facturas y la auditoría, que no se toca). Idempotente.

alter table public.empleado add column if not exists numero_operario text;
create unique index if not exists empleado_numero_operario_uk on public.empleado (numero_operario) where numero_operario is not null;
comment on column public.empleado.numero_operario is 'Número de operario que se ve en listados y consultas (GeminisWin: el código del empleado, p. ej. 410).';
update public.empleado set numero_operario = '410' where codigo = 'LUIS' and numero_operario is null;

-- Nº de operario de un código de empleado (o el propio código si aún no tiene número).
create or replace function public.fn_numero_operario(p_codigo text)
returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce((select nullif(e.numero_operario, '') from empleado e where e.codigo = p_codigo), p_codigo)
$$;
grant execute on function public.fn_numero_operario(text) to authenticated;

-- Art. comprados: «Oper» y «Ventas Oper.» con el nº de operario; la web va en su columna.
drop function if exists public.fn_cliente_articulos_comprados(text);
create function public.fn_cliente_articulos_comprados(p_cliente text)
returns table (
  articulo_codigo text, referencia text, descripcion text, unidades numeric, importe numeric,
  ultimo_precio numeric, ultimo_descuento_pct numeric, ultima_fecha date, veces integer, web integer,
  operario text, reparto text
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  with l as (
    select vl.articulo_codigo, vl.codigo_venta, vl.descripcion, vl.cantidad, vl.subtotal, vl.precio, vl.descuento_pct,
           v.fecha, v.hora, v.numero, v.tienda_terminal_codigo, vl.numero_linea,
           public.fn_numero_operario(coalesce(vl.empleado_codigo, v.empleado_codigo)) as operario,
           (v.tienda_terminal_codigo = '60' or exists (
              select 1 from pedido_cliente p
               where p.tienda_terminal_codigo = v.pedido_tienda_codigo and p.numero = v.pedido_numero and p.web_pedido_id is not null)) as es_web
      from venta v
      join venta_linea vl on vl.tienda_terminal_codigo = v.tienda_terminal_codigo and vl.numero = v.numero
     where v.cliente_codigo = p_cliente and v.anulada_en is null and vl.articulo_codigo is not null
  ),
  ultima as (
    select distinct on (articulo_codigo) articulo_codigo, codigo_venta, descripcion, precio, descuento_pct, fecha, operario
      from l
     order by articulo_codigo, fecha desc, hora desc nulls last, tienda_terminal_codigo desc, numero desc, numero_linea desc
  )
  select l.articulo_codigo, coalesce(u.codigo_venta, a.codigo_venta), coalesce(a.descripcion, u.descripcion),
         sum(l.cantidad), sum(l.subtotal), u.precio, u.descuento_pct, u.fecha,
         count(*)::int,
         count(*) filter (where l.es_web)::int,
         u.operario,
         -- Ventas de cada operario (sin las de la web, que van en su columna): «410: 15 · 411: 7».
         (select string_agg(x.t, ' · ' order by x.n desc, x.t)
            from (select count(*) as n, coalesce(l2.operario, '?') || ': ' || count(*) as t from l l2
                   where l2.articulo_codigo = l.articulo_codigo and not l2.es_web group by l2.operario) x)
    from l
    join ultima u on u.articulo_codigo = l.articulo_codigo
    left join articulo a on a.codigo_interno = l.articulo_codigo
   group by l.articulo_codigo, u.codigo_venta, a.codigo_venta, a.descripcion, u.descripcion, u.precio, u.descuento_pct, u.fecha, u.operario
   order by u.fecha desc, 3
$$;
grant execute on function public.fn_cliente_articulos_comprados(text) to authenticated;
revoke execute on function public.fn_cliente_articulos_comprados(text) from anon, public;

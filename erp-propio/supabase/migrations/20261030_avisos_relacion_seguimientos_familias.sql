-- Luis, 30/10/2026:
--  · fn_mis_avisos_presupuestos: cuántos presupuestos abiertos de los que soy responsable toca llamar
--    hoy o ya vencidos. Lo usa el globo rojo de la pestaña Presupuestos y el aviso del móvil/tablet.
--  · fn_relacion_seguimientos: todos los presupuestos abiertos con su próximo contacto, por fecha y
--    vendedor (botón «Relación de seguimientos»), con el último contacto apuntado.
--  · fn_panel_familias: las 20 familias más vendidas del periodo (nº, descripción, unidades y % sobre
--    las ventas totales). Solo devuelve el %: el panel operativo no enseña importes.

create or replace function public.fn_mis_avisos_presupuestos()
returns integer
language sql
stable
security invoker
set search_path to 'public'
as $$
  select count(*)::int
    from pedido_cliente p
   where p.es_presupuesto and not coalesce(p.anulado, false)
     and p.presupuesto_estado in ('borrador', 'enviado', 'seguimiento')
     and p.responsable_codigo = public.fn_empleado_actual()
     and p.proximo_contacto <= (now() at time zone 'Atlantic/Canary')::date
$$;
grant execute on function public.fn_mis_avisos_presupuestos() to authenticated;
revoke execute on function public.fn_mis_avisos_presupuestos() from anon, public;

create or replace function public.fn_relacion_seguimientos(p_tienda text default null)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $$
  with hoy as (select (now() at time zone 'Atlantic/Canary')::date as d),
  a as (
    select p.tienda_terminal_codigo as tienda, p.numero, p.fecha, coalesce(c.nombre, p.nombre_cliente) as cliente, p.total,
           p.presupuesto_estado as estado, p.proximo_contacto, p.fecha_fin as valido_hasta,
           public.fn_numero_operario(p.responsable_codigo) as responsable,
           coalesce(e.nombre, p.responsable_codigo) as responsable_nombre,
           p.responsable_codigo = public.fn_empleado_actual() as mio,
           (p.fecha_fin is not null and p.fecha_fin < hoy.d) as caducado,
           case when p.proximo_contacto is not null then hoy.d - p.proximo_contacto end as dias_retraso,
           (select count(*) from presupuesto_contacto pc
             where pc.tienda_terminal_codigo = p.tienda_terminal_codigo and pc.numero = p.numero) as contactos,
           (select concat_ws(' · ', to_char(pc.fecha, 'DD/MM'), nullif(pc.contacto_con, ''), nullif(pc.respuesta, ''))
              from presupuesto_contacto pc
             where pc.tienda_terminal_codigo = p.tienda_terminal_codigo and pc.numero = p.numero
             order by pc.orden desc limit 1) as ultimo
      from pedido_cliente p
      left join cliente c on c.codigo = p.cliente_codigo
      left join empleado e on e.codigo = p.responsable_codigo, hoy
     where p.es_presupuesto and not coalesce(p.anulado, false)
       and p.presupuesto_estado in ('borrador', 'enviado', 'seguimiento')
       and (p_tienda is null or p.tienda_terminal_codigo = p_tienda)
  )
  select coalesce(jsonb_agg(to_jsonb(a) order by proximo_contacto nulls last, responsable nulls last, numero), '[]') from a
$$;
grant execute on function public.fn_relacion_seguimientos(text) to authenticated;
revoke execute on function public.fn_relacion_seguimientos(text) from anon, public;

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
  tot as (select nullif(sum(base), 0) as t from l)
  select coalesce(jsonb_agg(x order by x.pct desc, x.codigo), '[]') from (
    select coalesce(l.familia, '') as codigo, coalesce(f.descripcion, case when l.familia is null then 'Sin familia' end) as descripcion,
           sum(l.unidades) as unidades, round(100 * sum(l.base) / tot.t, 2) as pct
      from l
      left join familia f on f.codigo = l.familia, tot
     where tot.t is not null
     group by l.familia, f.descripcion, tot.t
    having sum(l.base) > 0
     order by sum(l.base) desc
     limit 20) x
$$;
grant execute on function public.fn_panel_familias(text, date, date) to authenticated;
revoke execute on function public.fn_panel_familias(text, date, date) from anon, public;

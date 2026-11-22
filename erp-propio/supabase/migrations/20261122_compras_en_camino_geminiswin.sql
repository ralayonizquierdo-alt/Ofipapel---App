-- Gestor de Pedidos: lo que está en camino también en GeminisWin (22/11/2026).
--
-- Hasta hoy «en camino» eran solo los pedidos hechos en el ERP; lo pedido en GeminisWin se volvía a proponer. Ya llegan
-- por el espejo (gw_pedido_proveedor / _linea). Qué es «en camino» en GeminisWin, visto con los datos (22/11/2026):
-- los pedidos SIN actualizar (ACTUAL = F; al dar entrada a la mercancía GeminisWin lo marca) y que no son abono a
-- proveedor. ESTADOPED: 1 pendiente, 2 y 3 aceptado (Rober), 7 casi siempre ya actualizado (recibido). RECIBIDO no
-- sirve (vacío en todos). De cada línea cuenta lo que falta por recibir.
--
-- Un pedido hecho en el ERP se importa en GeminisWin con su Excel: estaría en los dos sitios. Para no contarlo dos veces,
-- de cada artículo se toma lo MAYOR de los dos (ERP o GeminisWin), no la suma.

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
     where not p.actualizado and not p.abono and not l.recibida and l.articulo_codigo <> ''
     group by 1
  )
  select coalesce(e.articulo_codigo, g.articulo_codigo), greatest(coalesce(e.uds, 0), coalesce(g.uds, 0))
    from erp e full join gw g on g.articulo_codigo = e.articulo_codigo
$$;
comment on function public.fn_compras_en_camino() is
  'Unidades en camino por artículo: lo mayor entre los pedidos del ERP pendientes/confirmados y los de GeminisWin sin actualizar (espejo).';
revoke all on function public.fn_compras_en_camino() from public, anon;
grant execute on function public.fn_compras_en_camino() to authenticated;

-- Las propuestas (semanal, sus líneas, campañas y la de siempre) usan esta función en lugar de mirar solo el ERP.
do $$
declare f text; v_def text; v_nuevo text;
begin
  foreach f in array array['public.fn_compras_semanal_propuesta(text)', 'public.fn_compras_semanal_lineas(text)',
                           'public.fn_compras_campana_propuesta(date, date, numeric, text, text)', 'public.fn_compras_propuesta_pedidos(text)'] loop
    v_def := pg_get_functiondef(f::regprocedure);
    if position('fn_compras_en_camino' in v_def) > 0 then continue; end if;
    v_nuevo := regexp_replace(v_def,
      'select l\.articulo_codigo, sum\(greatest\(0, coalesce\(l\.total_unidades, l\.cantidad, 0\) - coalesce\(l\.unidades_recibidas, 0\)\)\)( as)? uds\s+from pedido_proveedor_linea l\s+join pedido_proveedor p on p\.tienda_terminal_codigo = l\.tienda_terminal_codigo and p\.numero = l\.numero\s+where p\.estado in \(''pendiente'', ''confirmado''\) and not coalesce\(p\.recibido, false\) and not coalesce\(p\.es_abono, false\)\s+group by 1',
      'select e.articulo_codigo, e.uds from public.fn_compras_en_camino() e');
    if v_nuevo = v_def then raise exception 'No encuentro lo que está en camino en %', f; end if;
    execute v_nuevo;
  end loop;
end $$;

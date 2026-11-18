-- Gestor de Pedidos 2.0: Excel para importar un pedido del ERP en GeminisWin (18/11/2026).
--
-- Devuelve la cabecera y las líneas de un pedido a proveedor con los datos que pide la plantilla de importación
-- de GeminisWin (la misma que genera la app de Importación de Pedidos): código de barras, marca, referencia del
-- proveedor, descripción, cajas, unidades por caja, unidades, precio, un único descuento, IGIC, importe y código de
-- familia. El fichero .xls lo monta el navegador. Solo lectura y con los permisos de quien llama (RLS).
create or replace function public.fn_compras_pedido_excel_gw(p_tienda text, p_numero bigint)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'tienda', p.tienda_terminal_codigo,
    'numero', p.numero,
    'fecha', to_char(p.fecha_hora at time zone 'Atlantic/Canary', 'YYYY-MM-DD'),
    'proveedor', p.proveedor_codigo,
    'proveedor_nombre', pr.nombre,
    'almacen', p.almacen_codigo,
    'estado', p.estado,
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ean', coalesce(nullif(a.codigo_barras_principal, ''),
                               (select b.codigo_barras from articulo_codigo_barras b
                                 where b.articulo_codigo = l.articulo_codigo and coalesce(b.unidades_por_codigo, 1) <= 1
                                 order by (b.proveedor_codigo = p.proveedor_codigo) desc nulls last, b.id limit 1), ''),
               'marca', coalesce(a.marca_codigo, ''),
               'ref', coalesce(nullif(l.codigo_compra, ''), ''),
               'descripcion', coalesce(l.descripcion, a.descripcion, ''),
               'cajas', case when coalesce(l.unidades_por_caja, 0) > 1 and mod(l.cantidad, l.unidades_por_caja) = 0
                             then l.cantidad / l.unidades_por_caja end,
               'uds_caja', case when coalesce(l.unidades_por_caja, 0) > 1 then l.unidades_por_caja end,
               'unidades', l.cantidad,
               'precio', l.precio_compra,
               'descuento', coalesce(l.descuento_pct, 0),
               'igic', coalesce(l.igic_pct, 0),
               'importe', round(l.cantidad * l.precio_compra * (1 - coalesce(l.descuento_pct, 0) / 100), 2),
               'familia', coalesce(a.familia_codigo, ''),
               'articulo', l.articulo_codigo
             ) order by l.linea)
        from pedido_proveedor_linea l
        left join articulo a on a.codigo_interno = l.articulo_codigo
       where l.tienda_terminal_codigo = p.tienda_terminal_codigo and l.numero = p.numero), '[]'::jsonb)
  )
  from pedido_proveedor p
  left join proveedor pr on pr.codigo = p.proveedor_codigo
  where p.tienda_terminal_codigo = p_tienda and p.numero = p_numero
$$;

revoke all on function public.fn_compras_pedido_excel_gw(text, bigint) from public, anon;
grant execute on function public.fn_compras_pedido_excel_gw(text, bigint) to authenticated;

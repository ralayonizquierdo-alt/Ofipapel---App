-- Índices para el volumen real de la migración (decenas de miles de artículos, miles de
-- clientes, años de ventas). Revisados con EXPLAIN: sin ellos, la navegación de las fichas
-- por nombre/descripción y las consultas por cliente/artículo/proveedor hacían Seq Scan + Sort.

-- 1) Navegación de fichas (useNavRegistro): orden alternativo por nombre + clave, para que
--    «siguiente/anterior» (gt/lt + limit 1) y el «Registro X de N» (count) vayan por índice.
create index if not exists articulo_nav_descripcion_idx on public.articulo (descripcion, codigo_interno);
create index if not exists cliente_nav_nombre_idx on public.cliente (nombre, codigo);
create index if not exists proveedor_nav_nombre_idx on public.proveedor (nombre, codigo);
create index if not exists pedido_cliente_nav_cliente_idx on public.pedido_cliente (nombre_cliente, numero, tienda_terminal_codigo);
create index if not exists pedido_proveedor_nav_proveedor_idx on public.pedido_proveedor (proveedor_codigo, numero, tienda_terminal_codigo);
create index if not exists factura_proveedor_nav_fecha_idx on public.factura_proveedor (fecha_hora, id, tienda_terminal_codigo);
create index if not exists articulo_numero_serie_nav_idx on public.articulo_numero_serie (numero_serie, id);

-- 2) Claves ajenas que se consultan desde las fichas, pestañas y gestores (artículos de una
--    familia/proveedor/marca, clientes de una zona/ruta/vendedor, consultas de un cliente o
--    de un artículo…) y que no tenían índice.
create index if not exists articulo_familia_idx on public.articulo (familia_codigo);
create index if not exists articulo_proveedor_habitual_idx on public.articulo (proveedor_habitual_codigo);
create index if not exists articulo_marca_idx on public.articulo (marca_codigo);
create index if not exists articulo_proveedor_prov_idx on public.articulo_proveedor (proveedor_codigo, articulo_codigo);
create index if not exists articulo_almacen_stock_almacen_idx on public.articulo_almacen_stock (almacen_codigo);
create index if not exists cliente_zona_idx on public.cliente (zona_territorial_codigo);
create index if not exists cliente_ruta_idx on public.cliente (ruta_codigo);
create index if not exists cliente_vendedor_idx on public.cliente (vendedor_codigo);
create index if not exists cliente_articulo_precio_articulo_idx on public.cliente_articulo_precio (articulo_codigo);
create index if not exists pedido_cliente_cliente_idx on public.pedido_cliente (cliente_codigo, fecha);
create index if not exists pedido_cliente_linea_articulo_idx on public.pedido_cliente_linea (articulo_codigo);
create index if not exists pedido_proveedor_linea_articulo_idx on public.pedido_proveedor_linea (articulo_codigo);
create index if not exists factura_proveedor_proveedor_idx on public.factura_proveedor (proveedor_codigo);
create index if not exists venta_cliente_idx on public.venta (cliente_codigo, fecha);
create index if not exists venta_linea_articulo_idx on public.venta_linea (articulo_codigo);
create index if not exists factura_cliente_idx on public.factura (cliente_codigo);
create index if not exists articulo_numero_serie_articulo_idx on public.articulo_numero_serie (articulo_codigo);
create index if not exists articulo_numero_serie_cliente_idx on public.articulo_numero_serie (cliente_codigo);
create index if not exists traspaso_almacen_linea_articulo_idx on public.traspaso_almacen_linea (articulo_codigo);
create index if not exists regularizacion_stock_articulo_idx on public.regularizacion_stock (articulo_codigo);

-- 3) Panel de Control: los pedidos de cliente se filtraban solo por «no es presupuesto», así
--    que cada carga recorría TODOS los pedidos de todos los años. Ahora el CTE «ped» toma los
--    del periodo pedido (y su anterior, y hoy) más los que siguen sin servir (pendientes,
--    reparaciones abiertas, web por preparar), que es todo lo que usa el panel; la fecha del
--    último pedido web, que puede ser más antiguo, se pide aparte con order by + limit 1.
--    Se parchea la definición VIGENTE (por si otra pantalla la ha cambiado).
do $do$
declare
  d text;
  viejo_where text := E'    from pedido_cliente p\n    where not coalesce(p.es_presupuesto, false)\n';
  nuevo_where text := E'    from pedido_cliente p\n    where not coalesce(p.es_presupuesto, false)\n'
    || E'      and (p.fecha >= least(v_desde, v_desde_ant, v_hoy)\n'
    || E'           or (not coalesce(p.entregado, false) and not coalesce(p.anulado, false)))\n';
  viejo_ult text := $v$'ultimo_fecha', (array_agg(fecha order by fecha desc, hora desc nulls last, creado_en desc nulls last))[1],
        'ultimo_hora', (array_agg(hora order by fecha desc, hora desc nulls last, creado_en desc nulls last))[1])$v$;
  nuevo_ult text := $v$'ultimo_fecha', (select u.fecha from pedido_cliente u
                         where (u.web_pedido_id is not null or u.tienda_terminal_codigo = '60')
                           and not coalesce(u.es_presupuesto, false) and not coalesce(u.anulado, false)
                           and not coalesce(u.es_reparacion, false) and (v_tienda is null or u.tienda_terminal_codigo = v_tienda)
                         order by u.fecha desc, u.hora desc nulls last, u.creado_en desc nulls last limit 1),
        'ultimo_hora', (select u.hora from pedido_cliente u
                         where (u.web_pedido_id is not null or u.tienda_terminal_codigo = '60')
                           and not coalesce(u.es_presupuesto, false) and not coalesce(u.anulado, false)
                           and not coalesce(u.es_reparacion, false) and (v_tienda is null or u.tienda_terminal_codigo = v_tienda)
                         order by u.fecha desc, u.hora desc nulls last, u.creado_en desc nulls last limit 1))$v$;
begin
  d := pg_get_functiondef('public.fn_panel_control(text,date,date,date,date)'::regprocedure);
  if position('p.fecha >= least(v_desde, v_desde_ant, v_hoy)' in d) > 0 then
    return;
  end if;
  if position(viejo_where in d) = 0 or position(viejo_ult in d) = 0 then
    raise exception 'fn_panel_control: la definición vigente no es la esperada; revisar a mano';
  end if;
  d := replace(replace(d, viejo_where, nuevo_where), viejo_ult, nuevo_ult);
  execute d;
end
$do$;

-- Ventanas «Informes de …» calcadas de GeminisWin (capturas ZIP 7, 04/11/2026):
--   · fn_lst_clientes_gw  → Clientes → «Listados de Clientes» (13 informes; «Fichas de los clientes» queda pendiente)
--   · fn_lst_pedidos_gw   → Ventas → Listados → List. Pedidos («Informes», 8 informes)
--   · fn_lst_reparaciones → añade «Orden de salida» y «Aparatos con X días de demora de recogida»
-- Solo funciones de lectura (SECURITY INVOKER: respetan la RLS de cada tabla). Sin tablas nuevas.
-- Definiciones de los informes impresos sacadas de gw_informe (liscli, liscli2, liscli4, liscliar,
-- lisCli3, Lispedid, LISPEDDE, lisPedCl, Lispedet, Lispedfa).

-- Comparación de un campo con el filtro «Filtrar Según Campos» / «Filtrar según campos de la Agenda»:
-- f = {modo:'no'|'igual'|'contiene'|'desdeHasta', desde, hasta, num:bool}
create or replace function public.lst_cmp(v text, f jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case coalesce(f->>'modo', 'no')
    when 'igual' then lower(coalesce(v, '')) = lower(coalesce(f->>'desde', ''))
    when 'contiene' then coalesce(v, '') ilike '%' || coalesce(f->>'desde', '') || '%'
    when 'desdeHasta' then
      case when coalesce((f->>'num')::boolean, false) then
        coalesce((coalesce(f->>'desde', '') = '' or v::numeric >= (f->>'desde')::numeric)
             and (coalesce(f->>'hasta', '') = '' or v::numeric <= (f->>'hasta')::numeric), false)
      else
        coalesce((coalesce(f->>'desde', '') = '' or lower(v) >= lower(f->>'desde'))
             and (coalesce(f->>'hasta', '') = '' or lower(v) <= lower(f->>'hasta')), false)
      end
    else true end
$$;

-- Valor de un campo de la ficha del cliente (lista cerrada: nada de SQL dinámico).
create or replace function public.lst_campo_cli(c cliente, campo text)
returns text
language sql
stable
set search_path = public
as $$
  select case when campo in ('fecha_alta', 'fecha_baja', 'fecha_ultima_venta', 'fecha_nacimiento', 'nombre', 'razon_social',
                             'nif', 'poblacion', 'provincia_codigo', 'codigo_postal', 'actividad', 'vendedor_codigo',
                             'limite_deuda', 'deuda_actual', 'email', 'gerente', 'contacto')
              then to_jsonb(c)->>campo end
$$;

create or replace function public.fn_lst_clientes_gw(p jsonb)
returns table(nivel integer, grupo text, grupo_desc text, clave text,
              c1 text, c2 text, c3 text, c4 text, c5 text, c6 text, c7 text, c8 text,
              importe numeric, n bigint)
language plpgsql
stable
set search_path = public
as $$
#variable_conflict use_column
declare
  inf text := coalesce(p->>'informe', 'simplificado');
  ord text := coalesce(p->>'orden', 'codigo');
  ag jsonb := coalesce(p->'agenda', '{}'::jsonb);
begin
  return query
  with cf as (
    select c.*,
           nullif(concat_ws(' / ', nullif(trim(c.telefono_fijo), ''), nullif(trim(c.telefono_movil), '')), '') as tel,
           case ord when 'nombre' then coalesce(c.nombre, '') when 'razon_social' then coalesce(c.razon_social, '')
                    when 'nif' then coalesce(c.nif, '') when 'fecha_nacimiento' then coalesce(c.fecha_nacimiento::text, '')
                    when 'gerente' then coalesce(c.gerente, '') when 'codigo_barras' then coalesce(c.codigo_barras, '')
                    else c.codigo end as s
    from cliente c
    where lst_en(c.codigo, p->'clientes')
      and lst_en(c.tipo_cliente_codigo, p->'tiposCliente')
      and lst_en(c.zona_territorial_codigo, p->'zonas')
      and lst_en(c.ruta_codigo, p->'rutas')
      and lst_en(c.forma_pago_codigo, p->'formasPago')
      and lst_en(c.tarifa_nivel_defecto::text, p->'tarifas')
      and (coalesce(p->>'tipoVenta', '') = '' or lower(coalesce(c.tipo_credito, '')) like lower(p->>'tipoVenta') || '%')
      and (coalesce(p->>'dc', '') = '' or c.digito_control::text = p->>'dc')
      and (coalesce(p->>'tipoFactura', '') = '' or c.tipo_factura_global::text = p->>'tipoFactura')
      and lst_par(coalesce(c.activo, true) and c.fecha_baja is null, p->'activos')
      and lst_par(coalesce(c.bloqueado, false), p->'bloqueados')
      and lst_par(coalesce(c.es_generico, false), p->'genericos')
      and lst_par(coalesce(c.web_publicado, false), p->'web')
      and lst_cmp(lst_campo_cli(c, p->'campo1'->>'campo'), p->'campo1')
      and lst_cmp(lst_campo_cli(c, p->'campo2'->>'campo'), p->'campo2')
      and (coalesce(ag->>'modo', 'no') = 'no' or exists (
            select 1 from cliente_contacto cc
             where cc.cliente_codigo = c.codigo
               and lst_cmp(case ag->>'campo' when 'tipo_contacto_codigo' then cc.tipo_contacto_codigo
                                when 'descripcion' then cc.descripcion when 'telefono_fijo' then cc.telefono_fijo
                                when 'telefono_movil' then cc.telefono_movil when 'email' then cc.email
                                else cc.nombre end, ag)))
  ),
  base as (
    -- Una ficha por cliente (Simplificado, Desglosado, Resumido, Cuentas, por forma de pago, por tipo)
    select ''::text as g, ''::text as gd, cf.codigo as k, cf.s, cf.codigo as cl,
           case inf when 'desglosado' then cf.nif when 'cuentas' then cf.nombre else cf.nombre end as x1,
           case inf when 'simplificado' then cf.tel when 'resumido' then cf.nif when 'desglosado' then cf.nombre
                    when 'cuentas' then cf.cuenta_contable_430 else cf.tel end as x2,
           case inf when 'simplificado' then cf.actividad when 'resumido' then cf.poblacion when 'desglosado' then cf.razon_social
                    when 'cuentas' then cf.cuenta_contable_700 else cf.poblacion end as x3,
           case inf when 'simplificado' then cf.tarifa_nivel_defecto::text when 'resumido' then cf.tel
                    when 'desglosado' then cf.tel when 'cuentas' then cf.cuenta_contable_431 else cf.tarifa_nivel_defecto::text end as x4,
           case inf when 'desglosado' then cf.fax when 'cuentas' then cf.cuenta_contable_43150 end as x5,
           case inf when 'desglosado' then cf.contacto when 'cuentas' then cf.cuenta_contable_572 end as x6,
           case inf when 'desglosado' then cf.gerente end as x7,
           case inf when 'desglosado' then cf.tarifa_nivel_defecto::text end as x8,
           null::numeric as imp
    from cf where inf in ('simplificado', 'desglosado', 'resumido', 'cuentas')
    union all
    select coalesce(cf.forma_pago_codigo, '—'), 'Forma de pago ' || coalesce(cf.forma_pago_codigo, '(sin forma de pago)') || ' ' || coalesce(fp.descripcion, ''),
           cf.codigo, cf.s, cf.codigo, cf.nombre, cf.tel, cf.poblacion, cf.tarifa_nivel_defecto::text, null, null, null, null, null
    from cf left join forma_pago fp on fp.codigo = cf.forma_pago_codigo where inf = 'forma_pago'
    union all
    select coalesce(cf.tipo_cliente_codigo, '—'), 'Tipo de cliente ' || coalesce(cf.tipo_cliente_codigo, '(sin tipo)') || ' ' || coalesce(tc.descripcion, ''),
           cf.codigo, cf.s, cf.codigo, cf.nombre, cf.tel, cf.poblacion, cf.tarifa_nivel_defecto::text, null, null, null, null, null
    from cf left join tipo_cliente tc on tc.codigo = cf.tipo_cliente_codigo where inf = 'tipo'
    -- Artículos asignados (cliente_articulo_precio)
    union all
    select cf.codigo, 'Cliente ' || cf.codigo || ' ' || coalesce(cf.nombre, ''), cf.codigo || '|' || cap.articulo_codigo, cap.articulo_codigo,
           cap.articulo_codigo, coalesce(a.descripcion, ''), nullif(cap.cantidad_minima, 0)::text, null, null, null, null, null, null, cap.pvp
    from cf join cliente_articulo_precio cap on cap.cliente_codigo = cf.codigo
    left join articulo a on a.codigo_interno = cap.articulo_codigo where inf = 'articulos_cliente'
    union all
    select cap.articulo_codigo, 'Artículo ' || cap.articulo_codigo || ' ' || coalesce(a.descripcion, ''), cap.articulo_codigo || '|' || cf.codigo, cf.s,
           cf.codigo, cf.nombre, nullif(cap.cantidad_minima, 0)::text, null, null, null, null, null, null, cap.pvp
    from cf join cliente_articulo_precio cap on cap.cliente_codigo = cf.codigo
    left join articulo a on a.codigo_interno = cap.articulo_codigo where inf = 'clientes_articulo'
    union all
    select '', '', cf.codigo, cf.s, cf.codigo, cf.nombre, cf.tel, cf.actividad, cf.tarifa_nivel_defecto::text,
           (select count(*) from cliente_articulo_precio x where x.cliente_codigo = cf.codigo)::text, null, null, null, null
    from cf where inf = 'con_articulos' and exists (select 1 from cliente_articulo_precio x where x.cliente_codigo = cf.codigo)
    -- Agenda (cliente_contacto)
    union all
    select cf.codigo, 'Cliente ' || cf.codigo || ' ' || coalesce(cf.nombre, ''), cf.codigo || '|' || lpad(cc.id::text, 12, '0'), coalesce(cc.nombre, ''),
           coalesce(cc.nombre, ''), coalesce(cc.tipo_contacto_codigo || ' ' || coalesce(tco.descripcion, ''), ''), cc.telefono_fijo, cc.telefono_movil, cc.email,
           null, null, null, null
    from cf join cliente_contacto cc on cc.cliente_codigo = cf.codigo
    left join tipo_contacto tco on tco.codigo = cc.tipo_contacto_codigo
    where inf = 'contactos_cliente' and cc.fecha_baja is null
    union all
    select upper(coalesce(nullif(trim(cc.nombre), ''), '—')), 'Contacto ' || coalesce(nullif(trim(cc.nombre), ''), '(sin nombre)'),
           lpad(cc.id::text, 12, '0'), cf.s,
           cf.codigo, cf.nombre, coalesce(cc.tipo_contacto_codigo || ' ' || coalesce(tco.descripcion, ''), ''), coalesce(cc.telefono_movil, cc.telefono_fijo), cc.email,
           null, null, null, null
    from cf join cliente_contacto cc on cc.cliente_codigo = cf.codigo
    left join tipo_contacto tco on tco.codigo = cc.tipo_contacto_codigo
    where inf = 'clientes_contacto' and cc.fecha_baja is null
    union all
    select coalesce(cc.tipo_contacto_codigo, '—'), 'Tipo de contacto ' || coalesce(cc.tipo_contacto_codigo, '(sin tipo)') || ' ' || coalesce(tco.descripcion, ''),
           lpad(cc.id::text, 12, '0'), cf.s,
           cf.codigo, cf.nombre, coalesce(cc.nombre, ''), coalesce(cc.telefono_movil, cc.telefono_fijo), cc.email,
           null, null, null, null
    from cf join cliente_contacto cc on cc.cliente_codigo = cf.codigo
    left join tipo_contacto tco on tco.codigo = cc.tipo_contacto_codigo
    where inf = 'clientes_tipo_contacto' and cc.fecha_baja is null
  )
  select (case when grouping(b.g) = 1 then 2 when grouping(b.k) = 1 then 1 else 0 end)::int,
         b.g, b.gd,
         case when grouping(b.k) = 0 then min(b.cl) end,
         min(b.x1), min(b.x2), min(b.x3), min(b.x4), min(b.x5), min(b.x6), min(b.x7), min(b.x8),
         sum(b.imp), count(*)
  from base b
  group by grouping sets ((b.g, b.gd, b.k), (b.g, b.gd), ())
  order by grouping(b.g), b.g, grouping(b.k), min(b.s), b.k;
end
$$;

create or replace function public.fn_lst_pedidos_gw(p jsonb)
returns table(nivel integer, grupo text, grupo_desc text, clave text,
              fecha date, tienda text, vendedor text, documento text, cliente text,
              codigo text, descripcion text, hora text,
              cantidad numeric, pvp numeric, dto numeric, subtotal numeric,
              descuento numeric, base numeric, impuestos numeric, total numeric, entregado numeric, n bigint)
language plpgsql
stable
set search_path = public
as $$
#variable_conflict use_column
declare
  inf text := coalesce(p->>'informe', 'pedidos');
  ord text := coalesce(p->>'orden', 'fecha');
  por text := coalesce(p->>'filtroPor', 'vendedor');
  lineas boolean := inf in ('pedidos', 'desglosado', 'detallado', 'familias');
begin
  return query
  with pf as (
    select pc.*, coalesce(c.nombre, pc.nombre_cliente, '') as cli_nombre, coalesce(td.descripcion, '') as tie_desc,
           coalesce(ve.nombre, '') as ven_nombre,
           case ord when 'fecha_entrega' then coalesce(pc.fecha_entrega::text, '')
                    when 'hora' then lpad(coalesce(pc.hora, ''), 8, '0')
                    when 'cliente' then coalesce(pc.cliente_codigo, '')
                    when 'nombre' then coalesce(c.nombre, pc.nombre_cliente, '')
                    when 'nif' then coalesce(pc.nif_cliente, '')
                    when 'sucursal' then coalesce(pc.cliente_sucursal_codigo, '')
                    else pc.fecha::text || ' ' || lpad(coalesce(pc.hora, ''), 8, '0') end as s
    from pedido_cliente pc
    left join cliente c on c.codigo = pc.cliente_codigo
    left join tienda_terminal td on td.codigo = pc.tienda_terminal_codigo
    left join vendedor ve on ve.codigo = pc.vendedor_codigo
    left join venta v on v.tienda_terminal_codigo = pc.venta_tienda_codigo and v.numero = pc.venta_numero
    left join factura fa on fa.tienda_terminal_codigo = v.factura_tienda_codigo and fa.numero = v.factura_numero
    left join serie_facturacion sf on sf.tienda_terminal_codigo = fa.tienda_terminal_codigo and sf.serie = fa.serie
    where lst_fecha(lst_ts(case when p->>'campoFecha' = 'entrega' then pc.fecha_entrega else pc.fecha end, null), p->'fecha')
      and lst_en(case por when 'tecnico' then pc.tecnico_codigo when 'empleado' then pc.empleado_codigo else pc.vendedor_codigo end, p->'personas')
      and lst_en(pc.cliente_codigo, p->'clientes')
      and lst_en(c.tipo_cliente_codigo, p->'tiposCliente')
      and lst_en(pc.tienda_terminal_codigo, p->'tiendas')
      and lst_tienda_num(pc.tienda_terminal_codigo, pc.numero, p->'tiendaNumero')
      and lst_en(pc.forma_pago_codigo, p->'formasPago')
      and lst_par(pc.venta_numero is not null, p->'albaraneado')
      and lst_par(v.factura_numero is not null, p->'facturadas')
      and lst_par(v.numero is not null and coalesce(v.total_pendiente, 0) <= 0, p->'pagadas')
      and (not coalesce((p->>'aplazadas')::boolean, false) or coalesce(v.aplazada, false))
      and (coalesce(p->>'dc', '') = '' or sf.digito_control = p->>'dc')
      and lst_par(coalesce(pc.aceptado, false), p->'aceptado')
      and lst_par(coalesce(pc.preparado, false), p->'preparado')
      and lst_par(coalesce(pc.entregado, false), p->'entregado')
      and lst_par(coalesce(pc.es_presupuesto, false), p->'presupuesto')
      and lst_par(coalesce(pc.es_reparacion, false), p->'reparaciones')
      and lst_par(coalesce(pc.anulado, false), p->'anulado')
  ),
  base as (
    -- Informes por línea de pedido
    select case inf when 'pedidos' then pf.tienda_terminal_codigo || '-' || lpad(pf.numero::text, 12, '0')
                    when 'detallado' then pf.fecha::text || '|' || pf.tienda_terminal_codigo
                    when 'familias' then coalesce(a.familia_codigo, '—')
                    else '' end as g,
           case inf when 'pedidos' then to_char(pf.fecha, 'DD/MM/YYYY') || '   Tienda ' || pf.tienda_terminal_codigo || '   Pedido ' || pf.numero
                                         || '   ' || coalesce(pf.cliente_codigo, '') || '-' || pf.cli_nombre
                    when 'detallado' then 'Detalle de los Pedidos del ' || to_char(pf.fecha, 'DD/MM/YYYY') || ' En la oficina: '
                                         || pf.tienda_terminal_codigo || ' ' || pf.tie_desc
                    when 'familias' then 'Familia: ' || coalesce(a.familia_codigo, '(sin familia)') || ' ' || coalesce(fm.descripcion, '')
                    else '' end as gd,
           pf.tienda_terminal_codigo || '-' || lpad(pf.numero::text, 12, '0') || '-' || lpad(l.numero_linea::text, 8, '0') as k,
           case when inf = 'detallado' then pf.fecha::text || pf.tienda_terminal_codigo || pf.s else pf.s end as s,
           pf.fecha as f, pf.tienda_terminal_codigo as t, pf.vendedor_codigo as vc, pf.numero::text as doc,
           coalesce(pf.cliente_codigo, '') || '-' || pf.cli_nombre as cli,
           coalesce(l.codigo_venta, l.articulo_codigo) as cod, l.descripcion as des, l.hora as h,
           l.cantidad as cant, l.precio as pv, l.descuento_pct as dt, l.subtotal as sub,
           null::numeric as dsc, null::numeric as bas, null::numeric as imp, null::numeric as tot, null::numeric as ent
    from pf join pedido_cliente_linea l on l.tienda_terminal_codigo = pf.tienda_terminal_codigo and l.numero = pf.numero
    left join articulo a on a.codigo_interno = l.articulo_codigo
    left join familia fm on fm.codigo = a.familia_codigo
    where lineas
    union all
    -- Informes por pedido (cabecera)
    select case inf when 'cliente' then coalesce(pf.cliente_codigo, '—') when 'tiendas' then pf.tienda_terminal_codigo
                    when 'vendedor' then coalesce(pf.vendedor_codigo, '—') else '' end,
           case inf when 'cliente' then 'Cliente ' || coalesce(pf.cliente_codigo, '—') || ' ' || pf.cli_nombre
                    when 'tiendas' then 'Tienda ' || pf.tienda_terminal_codigo || ' ' || pf.tie_desc
                    when 'vendedor' then 'Vendedor ' || coalesce(pf.vendedor_codigo, '(sin vendedor)') || ' ' || pf.ven_nombre
                    else '' end,
           case inf when 'cliente_resumido' then coalesce(pf.cliente_codigo, '—')
                    else pf.tienda_terminal_codigo || '-' || lpad(pf.numero::text, 12, '0') end,
           case inf when 'cliente_resumido' then pf.cli_nombre else pf.s end,
           pf.fecha, pf.tienda_terminal_codigo, pf.vendedor_codigo, pf.numero::text,
           coalesce(pf.cliente_codigo, '') || '-' || pf.cli_nombre,
           null, null, pf.hora, null, null, null, pf.subtotal,
           pf.total_descuento_pie, pf.subtotal_2, pf.total_igic_pie, pf.total, pf.total_pagado
    from pf where not lineas
  )
  select (case when grouping(b.g) = 1 then 2 when grouping(b.k) = 1 then 1 else 0 end)::int,
         b.g, b.gd, b.k,
         case when grouping(b.k) = 0 and inf <> 'cliente_resumido' then min(b.f) end,
         case when grouping(b.k) = 0 and inf <> 'cliente_resumido' then min(b.t) end,
         case when grouping(b.k) = 0 and inf <> 'cliente_resumido' then min(b.vc) end,
         case when grouping(b.k) = 0 and inf <> 'cliente_resumido' then min(b.doc) end,
         case when grouping(b.k) = 0 then min(b.cli) end,
         case when grouping(b.k) = 0 then min(b.cod) end,
         case when grouping(b.k) = 0 then min(b.des) end,
         case when grouping(b.k) = 0 and inf <> 'cliente_resumido' then min(b.h) end,
         sum(b.cant),
         case when grouping(b.k) = 0 then min(b.pv) end,
         case when grouping(b.k) = 0 then min(b.dt) end,
         sum(b.sub), sum(b.dsc), sum(b.bas), sum(b.imp), sum(b.tot), sum(b.ent), count(*)
  from base b
  group by grouping sets ((b.g, b.gd, b.k), (b.g, b.gd), ())
  order by grouping(b.g), b.g, grouping(b.k), min(b.s), b.k;
end
$$;

-- L. Reparaciones: «Orden de salida» (Idpedido, Idoficina, Idalmacen, Fecha, Fecha_entr, Hora, Idcliente)
-- y «Aparatos con X días de demora de recogida» (realizadas, sin entregar, con la fecha de
-- realización hace X días o más: p.diasDemora).
create or replace function public.fn_lst_reparaciones(p jsonb)
returns table(nivel integer, grupo text, grupo_desc text, clave text, documento text, fecha date, fecha_realizacion date,
              cliente text, tecnico text, numero_serie text, averia text, estado text, n bigint, total numeric)
language plpgsql
stable
set search_path = public
as $$
#variable_conflict use_column
declare
  inf text := coalesce(p->>'informe', 'desglosado');
  ord text := coalesce(p->>'orden', '');
  cf text := coalesce(p->>'campoFecha', 'entrada');
  ped jsonb := coalesce(p->'pedidos', '{}'::jsonb);
  anu jsonb := coalesce(p->'anuladas', '{}'::jsonb);
  incl_ped boolean := coalesce((ped->>'si')::boolean, false);
  solo_ped boolean := coalesce((ped->>'no')::boolean, false);
  incl_anu boolean := coalesce((anu->>'si')::boolean, false);
  solo_anu boolean := coalesce((anu->>'no')::boolean, false);
  dias integer := nullif(p->>'diasDemora', '')::integer;
begin
  return query
  with rf as (
    select pc.tienda_terminal_codigo as t, pc.numero, pc.fecha as f_ent, pc.fecha_fin as f_real,
           pc.cliente_codigo, coalesce(c.nombre, pc.nombre_cliente, '') as cli_nombre,
           pc.tecnico_codigo, coalesce(te.nombre, '') as tec_nombre, pc.numero_serie, pc.averia,
           coalesce(pc.total, 0) as total,
           case when pc.anulado then 'Anulada'
                when v.factura_numero is not null then 'Facturada'
                when pc.venta_numero is not null then 'Entregada (venta ' || pc.venta_tienda_codigo || '-' || pc.venta_numero || ')'
                when pc.entregado then 'Entregada'
                when pc.preparado then 'Realizada'
                when not pc.es_reparacion then 'Pedido'
                else 'Pendiente' end as estado,
           case ord when 'numero' then lpad(pc.numero::text, 12, '0')
                    when 'tienda' then pc.tienda_terminal_codigo
                    when 'almacen' then coalesce(pc.almacen_codigo, '')
                    when 'fecha' then pc.fecha::text || ' ' || lpad(coalesce(pc.hora, ''), 8, '0')
                    when 'fecha_entrega' then coalesce(pc.fecha_entrega::text, '')
                    when 'hora' then lpad(coalesce(pc.hora, ''), 8, '0')
                    when 'cliente' then coalesce(pc.cliente_codigo, '')
                    else '' end as s
    from pedido_cliente pc
    left join cliente c on c.codigo = pc.cliente_codigo
    left join tecnico te on te.codigo = pc.tecnico_codigo
    left join venta v on v.tienda_terminal_codigo = pc.venta_tienda_codigo and v.numero = pc.venta_numero
    where (case when solo_ped and not incl_ped then not pc.es_reparacion and not pc.es_presupuesto
                when incl_ped and not solo_ped then pc.es_reparacion or not pc.es_presupuesto
                else pc.es_reparacion end)
      and (case when solo_anu and not incl_anu then pc.anulado
                when incl_anu and not solo_anu then true
                else not pc.anulado end)
      and lst_fecha(case cf when 'realizacion' then lst_ts(pc.fecha_fin, null) else lst_ts(pc.fecha, pc.hora) end, p->'fecha')
      and lst_en(pc.tecnico_codigo, p->'tecnicos')
      and lst_en(pc.cliente_codigo, p->'clientes')
      and lst_par(pc.preparado, p->'realizadas')
      and lst_par(pc.es_presupuesto, p->'presupuesto')
      and lst_par(v.factura_numero is not null, p->'facturadas')
      and lst_par(pc.entregado or pc.venta_numero is not null, p->'entregadas')
      and lst_en(pc.numero_serie, p->'serie')
      and lst_en(pc.tienda_terminal_codigo, p->'tiendas')
      and (dias is null or (coalesce(pc.preparado, false) and not coalesce(pc.entregado, false) and pc.venta_numero is null
                            and coalesce(pc.fecha_fin, pc.fecha) <= current_date - dias))
  ),
  b as (
    select rf.*,
      case inf when 'tecnico' then coalesce(rf.tecnico_codigo, '—')
               when 'cliente' then coalesce(rf.cliente_codigo, '—')
               else '' end as g,
      case inf when 'tecnico' then 'Técnico ' || coalesce(rf.tecnico_codigo, '—') || ' ' || rf.tec_nombre
               when 'cliente' then 'Cliente ' || coalesce(rf.cliente_codigo, '—') || ' ' || rf.cli_nombre
               else '' end as gd,
      case inf when 'resumen_tecnico' then coalesce(rf.tecnico_codigo, '—')
               else rf.t || '-' || lpad(rf.numero::text, 10, '0') end as k
    from rf
  )
  select (case when grouping(b.g) = 1 then 2 when grouping(b.k) = 1 then 1 else 0 end)::int,
         b.g, b.gd, b.k,
         case when grouping(b.k) = 0 then
           case when inf = 'resumen_tecnico' then coalesce(min(b.tecnico_codigo), '—') || ' ' || min(b.tec_nombre)
                else min(b.t) || '-' || min(b.numero) end end,
         case when grouping(b.k) = 0 and inf <> 'resumen_tecnico' then min(b.f_ent) end,
         case when grouping(b.k) = 0 and inf <> 'resumen_tecnico' then min(b.f_real) end,
         case when grouping(b.k) = 0 and inf <> 'resumen_tecnico' then min(coalesce(b.cliente_codigo, '') || ' ' || b.cli_nombre) end,
         case when grouping(b.k) = 0 and inf <> 'resumen_tecnico' then min(coalesce(b.tecnico_codigo, '')) end,
         case when grouping(b.k) = 0 and inf <> 'resumen_tecnico' then min(b.numero_serie) end,
         case when grouping(b.k) = 0 and inf <> 'resumen_tecnico' then min(b.averia) end,
         case when grouping(b.k) = 0 and inf <> 'resumen_tecnico' then min(b.estado) end,
         count(*), sum(b.total)
  from b
  group by grouping sets ((b.g, b.gd, b.k), (b.g, b.gd), ())
  order by grouping(b.g), b.g, grouping(b.k), min(b.s), b.k;
end
$$;

grant execute on function public.lst_cmp(text, jsonb) to authenticated;
grant execute on function public.lst_campo_cli(cliente, text) to authenticated;
grant execute on function public.fn_lst_clientes_gw(jsonb) to authenticated;
grant execute on function public.fn_lst_pedidos_gw(jsonb) to authenticated;
revoke execute on function public.fn_lst_clientes_gw(jsonb) from public, anon;
revoke execute on function public.fn_lst_pedidos_gw(jsonb) from public, anon;

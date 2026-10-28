-- Listados de Clientes y de Facturación, List. Pedidos de Ventas y Recalcular deuda
-- (réplica de GeminisWin, SIN CAPTURA: filtros y columnas a confirmar con Luis).
--
--   Clientes → Listados → List. de Clientes                         fn_lst_clientes
--   Clientes → Listados → List. de Ventas y Facturas por Cliente    fn_lst_ventas_facturas_cliente
--   Clientes → Listados → Por Zonas Terr., Vendedores, Facturas
--                         y Artículos Pend.                         fn_lst_clientes_zonas
--   Clientes → Listados → Cli. que no han pagado                    fn_lst_clientes_impagados
--   Facturación → Listados → L. Pend. de Cobro                      fn_lst_pendiente_cobro
--   Facturación → Listados → Extracto clientes                      fn_lst_extracto_clientes
--   Ventas → Listados → List Pedidos                                fn_lst_pedidos_clientes
--   Clientes → Recalcular deuda                                     fn_cliente_recalcular_deuda (+ deshacer)
--
-- Misma forma que 20261027_listados_ventas_compras.sql: nivel 0 detalle · 1 subtotal del grupo ·
-- 2 total general; grupo/grupo_desc ('' = sin agrupar); clave/descripcion. Funciones de listado
-- SECURITY INVOKER (respetan el RLS de las tablas que leen).
--
-- Reglas comunes de «lo pendiente de cobro» (fn_cli_pendientes):
--   · Facturas: las no anuladas (registro VeriFactu de anulación o estado «anulada»); lo pendiente
--     es factura.total_pendiente. Las rectificativas (importe negativo) restan.
--   · Ventas (tickets y albaranes): solo las SIN facturar (factura_numero nulo), no anuladas
--     (anulada_en) ni aplazadas. Un albarán facturado ya está dentro de su factura: no se cuenta
--     dos veces.
--   · Si el documento tiene vencimientos pendientes en cobro_cliente, sale una fila por
--     vencimiento (cuota − cobrado) con su fecha; lo que no cubran los vencimientos sale en una
--     fila más con la fecha del documento. La suma por documento es siempre su total_pendiente.

-- ---------- Ayudantes ----------

-- Filtros de cliente comunes: {clientes, zonas, vendedores, tiposCliente, rutas} (rangos) y
-- activos = par {si: activos, no: bajas}. Activo = activo y sin fecha de baja.
create or replace function public.lst_cliente_filtro(c public.cliente, p jsonb) returns boolean
language sql stable as $$
  select lst_en(c.codigo, p->'clientes')
     and lst_en(c.zona_territorial_codigo, p->'zonas')
     and lst_en(c.vendedor_codigo, p->'vendedores')
     and lst_en(c.tipo_cliente_codigo, p->'tiposCliente')
     and lst_en(c.ruta_codigo, p->'rutas')
     and lst_par(coalesce(c.activo, true) and c.fecha_baja is null, p->'activos')
$$;

-- Documentos de cliente con importe pendiente de cobro (a fecha p_corte: documentos con fecha
-- hasta ese día; null = todos). Una fila por vencimiento pendiente (ver cabecera).
create or replace function public.fn_cli_pendientes(p_corte date default null)
returns table(cliente_codigo text, tipo text, doc_t text, doc_n bigint, documento text, fecha date, vencimiento date,
              forma_pago_codigo text, vendedor_codigo text, importe_doc numeric, pendiente numeric, id bigint)
language sql stable security invoker set search_path = public as $$
  with docs as (
    select f.cliente_codigo as cli, 'Factura'::text as tipo, f.tienda_terminal_codigo as t, f.numero as n,
           coalesce(nullif(f.serie, ''), f.tienda_terminal_codigo) || '-' || coalesce(f.n_factura, f.numero) as doc,
           f.fecha_factura as fec, coalesce(f.fecha_primer_pago, f.fecha_factura) as venc, f.forma_pago_codigo as fp,
           f.vendedor_codigo as ven, coalesce(f.total, 0) as imp,
           round(coalesce(f.total_pendiente, coalesce(f.total, 0) - coalesce(f.total_pagado, 0)), 3) as pend, true as es_fac
    from factura f
    where coalesce(f.estado, '') not ilike 'anul%'
      and (p_corte is null or f.fecha_factura <= p_corte)
    union all
    select v.cliente_codigo, case when v.tipo_credito ilike 'cr%' then 'Albarán' else 'Ticket' end, v.tienda_terminal_codigo, v.numero,
           v.tienda_terminal_codigo || '-' || v.numero, v.fecha, v.fecha, v.forma_pago_codigo, v.vendedor_codigo, coalesce(v.total, 0),
           round(coalesce(v.total_pendiente, greatest(coalesce(v.total, 0) - coalesce(v.total_pagado, 0), 0)), 3), false
    from venta v
    where v.anulada_en is null and v.factura_numero is null and not coalesce(v.aplazada, false)
      and (p_corte is null or v.fecha <= p_corte)
  ),
  dp as (
    select * from docs
    where abs(docs.pend) > 0.005 and (not docs.es_fac or not fn_factura_anulada(docs.t, docs.n))
  ),
  ven as (
    select dp.t, dp.n, dp.es_fac, c.fecha_vencimiento as fv, c.forma_pago_codigo as fp, c.codigo_pago as cp,
           round(coalesce(c.cuota, 0) - coalesce(c.importe_cobrado, 0), 3) as x
    from dp
    join cobro_cliente c on c.activo and c.estado_cobro = 'pendiente'
      and ((dp.es_fac and c.factura_tienda_codigo = dp.t and c.factura_numero = dp.n)
        or (not dp.es_fac and c.factura_numero is null and c.venta_relacionada_tienda_codigo = dp.t and c.venta_relacionada_numero = dp.n))
    where round(coalesce(c.cuota, 0) - coalesce(c.importe_cobrado, 0), 3) > 0.005
  ),
  sv as (select ven.t, ven.n, ven.es_fac, sum(ven.x) as s from ven group by 1, 2, 3)
  select dp.cli, dp.tipo, dp.t, dp.n, dp.doc, dp.fec, coalesce(ven.fv, dp.venc), coalesce(ven.fp, dp.fp), dp.ven, dp.imp, ven.x, ven.cp
  from dp join ven on ven.t = dp.t and ven.n = dp.n and ven.es_fac = dp.es_fac
  union all
  select dp.cli, dp.tipo, dp.t, dp.n, dp.doc, dp.fec, dp.venc, dp.fp, dp.ven, dp.imp, round(dp.pend - coalesce(sv.s, 0), 3), 0::bigint
  from dp left join sv on sv.t = dp.t and sv.n = dp.n and sv.es_fac = dp.es_fac
  where abs(dp.pend - coalesce(sv.s, 0)) > 0.005
$$;

-- ---------- Clientes → Listados → List. de Clientes ----------
-- informe: general (sin agrupar) | zona | vendedor | tipo | ruta | poblacion
-- orden: codigo | nombre | poblacion | deuda
-- Filtros extra: conDeuda par, bloqueados par, excedeLimite bool.
create or replace function public.fn_lst_clientes(p jsonb)
returns table(nivel int, grupo text, grupo_desc text, clave text, descripcion text, nif text, poblacion text, telefono text,
              vendedor text, forma_pago text, limite_deuda numeric, deuda_actual numeric, n bigint)
language sql stable security invoker set search_path = public as $$
  with b0 as (
    select c.codigo, coalesce(c.nombre, '') as nom, c.nif as nf, c.poblacion as pob,
           nullif(concat_ws(' / ', nullif(trim(c.telefono_fijo), ''), nullif(trim(c.telefono_movil), '')), '') as tel,
           c.vendedor_codigo as vc, coalesce(ve.nombre, '') as vn, c.forma_pago_codigo as fpc, coalesce(fp.descripcion, '') as fpd,
           coalesce(c.limite_deuda, 0) as lim, coalesce(c.deuda_actual, 0) as deu,
           c.zona_territorial_codigo as zc, coalesce(z.descripcion, '') as zd, c.tipo_cliente_codigo as tc, coalesce(tc.descripcion, '') as tcd,
           c.ruta_codigo as rc, coalesce(r.descripcion, '') as rd
    from cliente c
    left join vendedor ve on ve.codigo = c.vendedor_codigo
    left join forma_pago fp on fp.codigo = c.forma_pago_codigo
    left join zona_territorial z on z.codigo = c.zona_territorial_codigo
    left join tipo_cliente tc on tc.codigo = c.tipo_cliente_codigo
    left join ruta_reparto r on r.codigo = c.ruta_codigo
    where lst_cliente_filtro(c, p)
      and lst_par(coalesce(c.deuda_actual, 0) <> 0, p->'conDeuda')
      and lst_par(coalesce(c.bloqueado, false), p->'bloqueados')
      and (not coalesce((p->>'excedeLimite')::boolean, false)
           or (coalesce(c.limite_deuda, 0) > 0 and coalesce(c.deuda_actual, 0) > c.limite_deuda))
  ),
  b as (
    select b0.*,
      case p->>'informe' when 'zona' then coalesce(b0.zc, '—') when 'vendedor' then coalesce(b0.vc, '—')
        when 'tipo' then coalesce(b0.tc, '—') when 'ruta' then coalesce(b0.rc, '—')
        when 'poblacion' then coalesce(upper(nullif(trim(b0.pob), '')), '—') else '' end as g,
      case p->>'informe' when 'zona' then 'Zona ' || coalesce(b0.zc, '(sin zona)') || ' ' || b0.zd
        when 'vendedor' then 'Vendedor ' || coalesce(b0.vc, '(sin vendedor)') || ' ' || b0.vn
        when 'tipo' then 'Tipo de cliente ' || coalesce(b0.tc, '(sin tipo)') || ' ' || b0.tcd
        when 'ruta' then 'Ruta ' || coalesce(b0.rc, '(sin ruta)') || ' ' || b0.rd
        when 'poblacion' then coalesce(upper(nullif(trim(b0.pob), '')), '(sin población)') else '' end as gd
    from b0
  )
  select (case when grouping(b.g) = 1 then 2 when grouping(b.codigo) = 1 then 1 else 0 end)::int,
         b.g, b.gd, b.codigo, min(b.nom), min(b.nf), min(b.pob), min(b.tel),
         case when grouping(b.codigo) = 0 then nullif(concat_ws(' ', min(b.vc), nullif(min(b.vn), '')), '') end,
         case when grouping(b.codigo) = 0 then nullif(min(b.fpd), '') end,
         sum(b.lim), sum(b.deu), count(*)
  from b
  group by grouping sets ((b.g, b.gd, b.codigo), (b.g, b.gd), ())
  order by grouping(b.g), b.g, grouping(b.codigo),
           case when p->>'orden' = 'nombre' then min(b.nom) end,
           case when p->>'orden' = 'poblacion' then min(b.pob) end,
           case when p->>'orden' = 'deuda' then sum(b.deu) end desc nulls last,
           b.codigo
$$;

-- ---------- Clientes → Listados → List. de Ventas y Facturas por Cliente ----------
-- Documentos del cliente: facturas + ventas sin facturar (un albarán facturado cuenta en su
-- factura). informe: detalle (por cliente, cada documento) | mensual (por cliente, por mes) |
-- totales (una línea por cliente). Filtros: clientes (y comunes), fecha (del documento),
-- tiendas, docs par {si: facturas, no: ventas sin facturar}, pendientes par {si, no: cobrados}.
create or replace function public.fn_lst_ventas_facturas_cliente(p jsonb)
returns table(nivel int, grupo text, grupo_desc text, clave text, descripcion text, tipo text, fecha date,
              n bigint, base numeric, igic numeric, total numeric, pagado numeric, pendiente numeric)
language sql stable security invoker set search_path = public as $$
  with d as (
    select f.cliente_codigo as cli, 'Factura'::text as tp, f.tienda_terminal_codigo as t, f.numero as num,
           'Fra. ' || coalesce(nullif(f.serie, ''), f.tienda_terminal_codigo) || '-' || coalesce(f.n_factura, f.numero) as doc,
           f.fecha_factura as fec, coalesce(f.total_base, 0) as bs, coalesce(f.total_igic, 0) as ig, coalesce(f.total, 0) as tt,
           round(coalesce(f.total, 0) - coalesce(f.total_pendiente, coalesce(f.total, 0) - coalesce(f.total_pagado, 0)), 3) as pg,
           round(coalesce(f.total_pendiente, coalesce(f.total, 0) - coalesce(f.total_pagado, 0)), 3) as pd
    from factura f
    where coalesce(f.estado, '') not ilike 'anul%'
      and lst_fecha(lst_ts(f.fecha_factura, f.hora_factura), p->'fecha')
      and lst_en(f.tienda_terminal_codigo, p->'tiendas')
      and lst_par(true, p->'docs')
      and not fn_factura_anulada(f.tienda_terminal_codigo, f.numero)
    union all
    select v.cliente_codigo, case when v.tipo_credito ilike 'cr%' then 'Albarán' else 'Ticket' end, v.tienda_terminal_codigo, v.numero,
           case when v.tipo_credito ilike 'cr%' then 'Alb. ' else 'Tick. ' end || v.tienda_terminal_codigo || '-' || v.numero,
           v.fecha, coalesce(v.subtotal_2, v.subtotal, 0), coalesce(v.total_igic_pie, 0), coalesce(v.total, 0),
           round(coalesce(v.total, 0) - coalesce(v.total_pendiente, greatest(coalesce(v.total, 0) - coalesce(v.total_pagado, 0), 0)), 3),
           round(coalesce(v.total_pendiente, greatest(coalesce(v.total, 0) - coalesce(v.total_pagado, 0), 0)), 3)
    from venta v
    where v.anulada_en is null and v.factura_numero is null and not coalesce(v.aplazada, false)
      and lst_fecha(lst_ts(v.fecha, v.hora), p->'fecha')
      and lst_en(v.tienda_terminal_codigo, p->'tiendas')
      and lst_par(false, p->'docs')
  ),
  b0 as (
    select d.*, coalesce(c.nombre, '') as nom
    from d join cliente c on c.codigo = d.cli
    where lst_cliente_filtro(c, p) and lst_par(abs(d.pd) > 0.005, p->'pendientes')
  ),
  b as (
    select b0.*,
      case p->>'informe' when 'totales' then '' else b0.cli end as g,
      case p->>'informe' when 'totales' then '' else 'Cliente ' || b0.cli || ' ' || b0.nom end as gd,
      case p->>'informe' when 'totales' then b0.cli when 'mensual' then to_char(b0.fec, 'YYYY-MM')
        else to_char(b0.fec, 'YYYYMMDD') || b0.tp || b0.t || lpad(b0.num::text, 12, '0') end as k,
      case p->>'informe' when 'totales' then b0.nom when 'mensual' then lst_mes(b0.fec) else b0.doc end as kd
    from b0
  )
  select (case when grouping(b.g) = 1 then 2 when grouping(b.k) = 1 then 1 else 0 end)::int,
         b.g, b.gd, case when grouping(b.k) = 0 and p->>'informe' = 'totales' then b.k end, min(b.kd),
         case when grouping(b.k) = 0 and coalesce(p->>'informe', 'detalle') = 'detalle' then min(b.tp) end,
         case when grouping(b.k) = 0 and coalesce(p->>'informe', 'detalle') = 'detalle' then min(b.fec) end,
         count(*), sum(b.bs), sum(b.ig), sum(b.tt), sum(b.pg), sum(b.pd)
  from b
  group by grouping sets ((b.g, b.gd, b.k), (b.g, b.gd), ())
  order by grouping(b.g),
           case when p->>'orden' = 'nombre' then min(b.nom) end,
           b.g, grouping(b.k),
           case when p->>'orden' = 'total' and p->>'informe' = 'totales' then sum(b.tt) end desc nulls last,
           b.k
$$;

-- ---------- Clientes → Listados → Por Zonas Terr., Vendedores, Facturas y Artículos Pend. ----------
-- informe:
--   zona      clientes agrupados por zona territorial: pendiente de cobro y pendiente de servir
--   vendedor  lo mismo agrupado por vendedor
--   facturas  documentos pendientes de cobro, agrupados por cliente
--   articulos líneas de pedidos de clientes pendientes de servir, agrupadas por cliente
-- Pendiente de servir: líneas de pedidos no anulados, no presupuestos, no entregados ni
-- liquidados (liquidado = 5), con cantidad − unidades_liquidadas > 0; importe en proporción.
-- soloPendientes (bool, por defecto true): en zona/vendedor, solo clientes con algo pendiente.
create or replace function public.fn_lst_clientes_zonas(p jsonb)
returns table(nivel int, grupo text, grupo_desc text, clave text, descripcion text, documento text, fecha date, vencimiento date,
              poblacion text, n_docs bigint, importe numeric, pend_cobro numeric, cantidad numeric, servida numeric, pend_cantidad numeric, pend_servir numeric)
language sql stable security invoker set search_path = public as $$
  with cl as (
    select c.codigo, coalesce(c.nombre, '') as nom, c.poblacion as pob,
           c.zona_territorial_codigo as zc, coalesce(z.descripcion, '') as zd, c.vendedor_codigo as vc, coalesce(ve.nombre, '') as vn
    from cliente c
    left join zona_territorial z on z.codigo = c.zona_territorial_codigo
    left join vendedor ve on ve.codigo = c.vendedor_codigo
    where lst_cliente_filtro(c, p)
  ),
  pc as (
    select x.* from fn_cli_pendientes(null) x join cl on cl.codigo = x.cliente_codigo
    where p->>'informe' in ('zona', 'vendedor', 'facturas')
  ),
  ps as (
    select pe.cliente_codigo as cli, pe.tienda_terminal_codigo || '-' || pe.numero as ped, pe.fecha as fec,
           pe.tienda_terminal_codigo as t, pe.numero as num, l.numero_linea as nl,
           coalesce(l.articulo_codigo, '') as art, coalesce(l.descripcion, '') as des,
           coalesce(l.cantidad, 0) as cant, coalesce(l.unidades_liquidadas, 0) as serv,
           coalesce(l.cantidad, 0) - coalesce(l.unidades_liquidadas, 0) as pcant,
           round(case when coalesce(l.cantidad, 0) = 0 then 0
                      else (coalesce(l.total_base, l.subtotal, 0) + coalesce(l.total_igic, 0))
                           * (coalesce(l.cantidad, 0) - coalesce(l.unidades_liquidadas, 0)) / l.cantidad end, 3) as pimp
    from pedido_cliente pe
    join cl on cl.codigo = pe.cliente_codigo
    join pedido_cliente_linea l on l.tienda_terminal_codigo = pe.tienda_terminal_codigo and l.numero = pe.numero
    where p->>'informe' in ('zona', 'vendedor', 'articulos')
      and not coalesce(pe.anulado, false) and not coalesce(pe.es_presupuesto, false)
      and not coalesce(pe.entregado, false) and coalesce(pe.liquidado, 0) <> 5
      and coalesce(l.cantidad, 0) - coalesce(l.unidades_liquidadas, 0) > 0
  ),
  resumen as (
    select cl.*, coalesce(a.nd, 0) as nd, coalesce(a.pc, 0) as pco, coalesce(s.pcant, 0) as pcant, coalesce(s.pimp, 0) as pimp
    from cl
    left join (select pc.cliente_codigo, count(distinct pc.tipo || pc.doc_t || pc.doc_n) as nd, sum(pc.pendiente) as pc
               from pc group by 1) a on a.cliente_codigo = cl.codigo
    left join (select ps.cli, sum(ps.pcant) as pcant, sum(ps.pimp) as pimp from ps group by 1) s on s.cli = cl.codigo
    where p->>'informe' in ('zona', 'vendedor')
      and (not coalesce((p->>'soloPendientes')::boolean, true) or a.nd is not null or s.cli is not null)
  ),
  b as (
    select case when p->>'informe' = 'zona' then coalesce(r.zc, '—') else coalesce(r.vc, '—') end as g,
           case when p->>'informe' = 'zona' then 'Zona ' || coalesce(r.zc, '(sin zona)') || ' ' || r.zd
                else 'Vendedor ' || coalesce(r.vc, '(sin vendedor)') || ' ' || r.vn end as gd,
           r.codigo as k, r.nom as kd, null::text as doc, null::date as fec, null::date as venc, r.pob,
           r.nd, null::numeric as imp, r.pco, null::numeric as cant, null::numeric as serv, r.pcant, r.pimp
    from resumen r
    union all
    select pc.cliente_codigo, 'Cliente ' || pc.cliente_codigo || ' ' || cl.nom || coalesce(' · Zona ' || cl.zc, '') || coalesce(' · Vendedor ' || cl.vc, ''),
           to_char(pc.vencimiento, 'YYYYMMDD') || pc.tipo || pc.doc_t || lpad(pc.doc_n::text, 12, '0') || lpad(pc.id::text, 12, '0'),
           pc.tipo, pc.documento, pc.fecha, pc.vencimiento, null, 1::bigint, pc.importe_doc, pc.pendiente, null, null, null, null
    from pc join cl on cl.codigo = pc.cliente_codigo
    where p->>'informe' = 'facturas'
    union all
    select ps.cli, 'Cliente ' || ps.cli || ' ' || cl.nom || coalesce(' · Zona ' || cl.zc, '') || coalesce(' · Vendedor ' || cl.vc, ''),
           ps.t || lpad(ps.num::text, 12, '0') || lpad(ps.nl::text, 8, '0'),
           ps.art || ' ' || ps.des, 'Ped. ' || ps.ped, ps.fec, null, null, 1::bigint, null, null, ps.cant, ps.serv, ps.pcant, ps.pimp
    from ps join cl on cl.codigo = ps.cli
    where p->>'informe' = 'articulos'
  )
  select (case when grouping(b.g) = 1 then 2 when grouping(b.k) = 1 then 1 else 0 end)::int,
         b.g, b.gd, case when grouping(b.k) = 0 and p->>'informe' in ('zona', 'vendedor') then b.k end,
         min(b.kd), min(b.doc), min(b.fec), min(b.venc), min(b.pob),
         sum(b.nd), sum(b.imp), sum(b.pco), sum(b.cant), sum(b.serv), sum(b.pcant), sum(b.pimp)
  from b
  group by grouping sets ((b.g, b.gd, b.k), (b.g, b.gd), ())
  order by grouping(b.g), b.g, grouping(b.k),
           case when p->>'orden' = 'nombre' then min(b.kd) end,
           case when p->>'orden' = 'importe' then coalesce(sum(b.pco), 0) + coalesce(sum(b.pimp), 0) end desc nulls last,
           b.k
$$;

-- ---------- Clientes → Listados → Cli. que no han pagado ----------
-- Clientes con importe VENCIDO sin cobrar a la fecha de corte (p.corte, por defecto hoy), con
-- la antigüedad de la deuda (días desde el vencimiento): 0-30, 31-60, 61-90 y más de 90.
-- informe: resumen (una línea por cliente) | detalle (documentos vencidos por cliente).
-- Filtros: comunes de cliente, diasMinimo (antigüedad mínima), importeMinimo (vencido del cliente).
create or replace function public.fn_lst_clientes_impagados(p jsonb)
returns table(nivel int, grupo text, grupo_desc text, clave text, descripcion text, telefono text, vendedor text,
              fecha date, vencimiento date, dias int, t0_30 numeric, t31_60 numeric, t61_90 numeric, t90 numeric,
              vencido numeric, no_vencido numeric, limite_deuda numeric)
language sql stable security invoker set search_path = public as $$
  with prm as (
    select coalesce(nullif(p->>'corte', '')::date, (now() at time zone 'Atlantic/Canary')::date) as corte,
           coalesce(nullif(p->>'diasMinimo', '')::int, 0) as dmin,
           coalesce(nullif(p->>'importeMinimo', '')::numeric, 0) as imin
  ),
  cl as (
    select c.codigo, coalesce(c.nombre, '') as nom,
           nullif(concat_ws(' / ', nullif(trim(c.telefono_fijo), ''), nullif(trim(c.telefono_movil), '')), '') as tel,
           nullif(concat_ws(' ', c.vendedor_codigo, ve.nombre), '') as ven, coalesce(c.limite_deuda, 0) as lim
    from cliente c left join vendedor ve on ve.codigo = c.vendedor_codigo
    where lst_cliente_filtro(c, p)
  ),
  x as (
    select x.*, cl.nom, cl.tel, cl.ven, cl.lim, (prm.corte - x.vencimiento) as d,
           (x.vencimiento <= prm.corte and (prm.corte - x.vencimiento) >= prm.dmin) as es_venc
    from prm cross join lateral fn_cli_pendientes(prm.corte) x join cl on cl.codigo = x.cliente_codigo
  ),
  porcli as (
    select x.cliente_codigo, sum(x.pendiente) filter (where x.es_venc) as v
    from x group by 1
  ),
  sel as (
    select x.* from x join porcli pcl on pcl.cliente_codigo = x.cliente_codigo, prm
    where pcl.v > 0.005 and pcl.v >= prm.imin
  ),
  b as (
    select case when p->>'informe' = 'detalle' then sel.cliente_codigo else '' end as g,
           case when p->>'informe' = 'detalle' then 'Cliente ' || sel.cliente_codigo || ' ' || sel.nom || coalesce(' · Tel. ' || sel.tel, '') else '' end as gd,
           case when p->>'informe' = 'detalle' then to_char(sel.vencimiento, 'YYYYMMDD') || sel.tipo || sel.doc_t || lpad(sel.doc_n::text, 12, '0') || lpad(sel.id::text, 12, '0')
                else sel.cliente_codigo end as k,
           case when p->>'informe' = 'detalle' then sel.tipo || ' ' || sel.documento else sel.nom end as kd,
           sel.*
    from sel
    where p->>'informe' <> 'detalle' or sel.es_venc
  )
  select (case when grouping(b.g) = 1 then 2 when grouping(b.k) = 1 then 1 else 0 end)::int,
         b.g, b.gd, case when grouping(b.k) = 0 and p->>'informe' <> 'detalle' then b.k end, min(b.kd),
         case when grouping(b.k) = 0 and p->>'informe' <> 'detalle' then min(b.tel) end,
         case when grouping(b.k) = 0 and p->>'informe' <> 'detalle' then min(b.ven) end,
         case when grouping(b.k) = 0 and p->>'informe' = 'detalle' then min(b.fecha) end,
         case when grouping(b.k) = 0 then min(b.vencimiento) filter (where b.es_venc) end,
         case when grouping(b.k) = 0 then max(b.d) filter (where b.es_venc) end,
         coalesce(sum(b.pendiente) filter (where b.es_venc and b.d <= 30), 0),
         coalesce(sum(b.pendiente) filter (where b.es_venc and b.d between 31 and 60), 0),
         coalesce(sum(b.pendiente) filter (where b.es_venc and b.d between 61 and 90), 0),
         coalesce(sum(b.pendiente) filter (where b.es_venc and b.d > 90), 0),
         coalesce(sum(b.pendiente) filter (where b.es_venc), 0),
         coalesce(sum(b.pendiente) filter (where not b.es_venc), 0),
         case when grouping(b.k) = 0 and p->>'informe' <> 'detalle' then min(b.lim) end
  from b
  group by grouping sets ((b.g, b.gd, b.k), (b.g, b.gd), ())
  order by grouping(b.g), b.g, grouping(b.k),
           case when p->>'orden' = 'nombre' then min(b.kd) end,
           case when p->>'orden' = 'importe' then sum(b.pendiente) filter (where b.es_venc) end desc nulls last,
           case when p->>'orden' = 'antiguedad' then max(b.d) filter (where b.es_venc) end desc nulls last,
           b.k
$$;

-- ---------- Facturación → Listados → L. Pend. de Cobro ----------
-- Vencimientos / documentos pendientes de cobro. informe: cliente (por cliente) |
-- vencimiento (por mes de vencimiento) | totales (una línea por cliente).
-- Filtros: comunes de cliente, fechaVenc, fechaDoc (rangos de fecha), formasPago,
-- docs par {si: facturas, no: ventas sin facturar}, vencidos par {si: vencidos, no: sin vencer} (a hoy).
create or replace function public.fn_lst_pendiente_cobro(p jsonb)
returns table(nivel int, grupo text, grupo_desc text, clave text, descripcion text, tipo text, fecha date, vencimiento date,
              dias int, forma_pago text, importe numeric, pendiente numeric, n bigint)
language sql stable security invoker set search_path = public as $$
  with hoy as (select (now() at time zone 'Atlantic/Canary')::date as d),
  x as (
    select x.*, coalesce(c.nombre, '') as nom, coalesce(fp.descripcion, x.forma_pago_codigo) as fpd, (hoy.d - x.vencimiento) as dd
    from hoy, fn_cli_pendientes(null) x
    join cliente c on c.codigo = x.cliente_codigo
    left join forma_pago fp on fp.codigo = x.forma_pago_codigo
    where lst_cliente_filtro(c, p)
      and lst_fecha(x.vencimiento::timestamp, p->'fechaVenc')
      and lst_fecha(x.fecha::timestamp, p->'fechaDoc')
      and lst_en(x.forma_pago_codigo, p->'formasPago')
      and lst_par(x.tipo = 'Factura', p->'docs')
      and lst_par(x.vencimiento <= hoy.d, p->'vencidos')
  ),
  b as (
    select x.*,
      case p->>'informe' when 'totales' then '' when 'vencimiento' then to_char(x.vencimiento, 'YYYY-MM') else x.cliente_codigo end as g,
      case p->>'informe' when 'totales' then '' when 'vencimiento' then 'Vencimientos de ' || lst_mes(x.vencimiento)
        else 'Cliente ' || x.cliente_codigo || ' ' || x.nom end as gd,
      case p->>'informe' when 'totales' then x.cliente_codigo
        else to_char(x.vencimiento, 'YYYYMMDD') || x.cliente_codigo || x.tipo || x.doc_t || lpad(x.doc_n::text, 12, '0') || lpad(x.id::text, 12, '0') end as k,
      case p->>'informe' when 'totales' then x.nom when 'vencimiento' then x.documento || '  ' || x.cliente_codigo || ' ' || x.nom
        else x.documento end as kd
    from x
  )
  select (case when grouping(b.g) = 1 then 2 when grouping(b.k) = 1 then 1 else 0 end)::int,
         b.g, b.gd, case when grouping(b.k) = 0 and p->>'informe' = 'totales' then b.k end, min(b.kd),
         case when grouping(b.k) = 0 and p->>'informe' <> 'totales' then min(b.tipo) end,
         case when grouping(b.k) = 0 and p->>'informe' <> 'totales' then min(b.fecha) end,
         case when grouping(b.k) = 0 then min(b.vencimiento) end,
         case when grouping(b.k) = 0 and p->>'informe' <> 'totales' then greatest(min(b.dd), 0) end,
         case when grouping(b.k) = 0 and p->>'informe' <> 'totales' then min(b.fpd) end,
         case when grouping(b.k) = 0 and p->>'informe' <> 'totales' then min(b.importe_doc) end,
         sum(b.pendiente), count(*)
  from b
  group by grouping sets ((b.g, b.gd, b.k), (b.g, b.gd), ())
  order by grouping(b.g), b.g, grouping(b.k),
           case when p->>'orden' = 'nombre' then min(b.nom) end,
           case when p->>'orden' = 'importe' then sum(b.pendiente) end desc nulls last,
           b.k
$$;

-- ---------- Facturación → Listados → Extracto clientes ----------
-- Por cliente, entre p.desde y p.hasta (fechas): «Saldo anterior», luego facturas y ventas sin
-- facturar (CARGO, su total), cobros (ABONO, cobro_cliente cobrado y activo, a su fecha de pago)
-- y saldo acumulado. Si lo pagado de un documento no cuadra con sus cobros registrados (cobrado
-- en el TPV, devoluciones de abonos), sale un abono «Pagado/devuelto en el documento» por la
-- diferencia: así el saldo final de cada cliente es siempre su pendiente de cobro real.
-- soloConMovimientos (bool, por defecto true): solo clientes con movimientos en el periodo.
create or replace function public.fn_lst_extracto_clientes(p jsonb)
returns table(nivel int, grupo text, grupo_desc text, clave text, descripcion text, fecha date, documento text,
              cargo numeric, abono numeric, saldo numeric)
language sql stable security invoker set search_path = public as $$
  with prm as (
    select coalesce(nullif(p->>'desde', '')::date, '1900-01-01'::date) as d1,
           coalesce(nullif(p->>'hasta', '')::date, '2999-12-31'::date) as d2,
           coalesce((p->>'soloConMovimientos')::boolean, true) as solo
  ),
  cl as (select c.codigo, coalesce(c.nombre, '') as nom from cliente c where lst_cliente_filtro(c, p)),
  docs as (
    select f.cliente_codigo as cli, true as es_fac, f.tienda_terminal_codigo as t, f.numero as num, f.fecha_factura as fec,
           'Fra. ' || coalesce(nullif(f.serie, ''), f.tienda_terminal_codigo) || '-' || coalesce(f.n_factura, f.numero) as doc,
           case when coalesce(f.total, 0) < 0 then 'Factura rectificativa' else 'Factura' end as con,
           coalesce(f.total, 0) as tt,
           round(coalesce(f.total, 0) - coalesce(f.total_pendiente, coalesce(f.total, 0) - coalesce(f.total_pagado, 0)), 3) as pg,
           coalesce(f.fecha_pago, f.fecha_factura) as fpago
    from factura f join cl on cl.codigo = f.cliente_codigo, prm
    where coalesce(f.estado, '') not ilike 'anul%' and f.fecha_factura <= prm.d2
      and not fn_factura_anulada(f.tienda_terminal_codigo, f.numero)
    union all
    select v.cliente_codigo, false, v.tienda_terminal_codigo, v.numero, v.fecha,
           case when v.tipo_credito ilike 'cr%' then 'Alb. ' else 'Tick. ' end || v.tienda_terminal_codigo || '-' || v.numero,
           case when coalesce(v.total, 0) < 0 then 'Devolución' when v.tipo_credito ilike 'cr%' then 'Albarán sin facturar' else 'Venta' end,
           coalesce(v.total, 0),
           round(coalesce(v.total, 0) - coalesce(v.total_pendiente, greatest(coalesce(v.total, 0) - coalesce(v.total_pagado, 0), 0)), 3),
           coalesce(v.fecha_pago, v.fecha)
    from venta v join cl on cl.codigo = v.cliente_codigo, prm
    where v.anulada_en is null and v.factura_numero is null and not coalesce(v.aplazada, false) and v.fecha <= prm.d2
  ),
  cob as (
    select d.cli, d.es_fac, d.t, d.num, k.fecha_pago as fec, k.importe_cobrado as imp,
           'Cobro ' || k.tienda_terminal_codigo || '-' || k.codigo_pago as doc,
           'Cobro ' || d.doc || coalesce(' (' || nullif(fp.descripcion, '') || ')', '') as con
    from docs d
    join cobro_cliente k on k.activo and k.estado_cobro = 'cobrado'
      and ((d.es_fac and k.factura_tienda_codigo = d.t and k.factura_numero = d.num)
        or (not d.es_fac and k.factura_numero is null and k.venta_relacionada_tienda_codigo = d.t and k.venta_relacionada_numero = d.num))
    left join forma_pago fp on fp.codigo = k.forma_pago_codigo
  ),
  ajuste as (
    select d.cli, d.fpago as fec, round(d.pg - coalesce(s.s, 0), 3) as imp, d.doc
    from docs d
    left join (select cob.t, cob.num, cob.es_fac, sum(cob.imp) as s from cob group by 1, 2, 3) s
      on s.t = d.t and s.num = d.num and s.es_fac = d.es_fac
    where abs(d.pg - coalesce(s.s, 0)) > 0.005
  ),
  mov as (
    select d.cli, d.fec, 1 as o, d.doc, d.con, d.tt as cargo, 0::numeric as abono from docs d
    union all
    select c.cli, c.fec, 2, c.doc, c.con, 0, c.imp from cob c
    union all
    select a.cli, a.fec, 3, a.doc, 'Pagado/devuelto en el documento ' || a.doc, 0, a.imp from ajuste a
  ),
  mov2 as (select mov.* from mov, prm where mov.fec <= prm.d2),
  ant as (
    select m.cli, sum(m.cargo - m.abono) as s from mov2 m, prm where m.fec < prm.d1 group by 1
  ),
  per as (select m.* from mov2 m, prm where m.fec >= prm.d1),
  clis as (
    select cl.codigo, cl.nom, coalesce(ant.s, 0) as sa
    from cl left join ant on ant.cli = cl.codigo, prm
    where exists (select 1 from per where per.cli = cl.codigo)
       or (not prm.solo and abs(coalesce(ant.s, 0)) > 0.005)
  ),
  det as (
    select clis.codigo as g, 'Cliente ' || clis.codigo || ' ' || clis.nom as gd, 0 as ord, null::date as fec, null::text as doc,
           'Saldo anterior' as con, null::numeric as cargo, null::numeric as abono, clis.sa as saldo
    from clis
    union all
    select clis.codigo, 'Cliente ' || clis.codigo || ' ' || clis.nom,
           row_number() over (partition by per.cli order by per.fec, per.o, per.doc)::int,
           per.fec, per.doc, per.con, nullif(per.cargo, 0), nullif(per.abono, 0),
           clis.sa + sum(per.cargo - per.abono) over (partition by per.cli order by per.fec, per.o, per.doc rows unbounded preceding)
    from per join clis on clis.codigo = per.cli
  ),
  sub as (
    select det.g, det.gd, coalesce(sum(det.cargo), 0) as cargo, coalesce(sum(det.abono), 0) as abono,
           (array_agg(det.saldo order by det.ord desc))[1] as saldo
    from det group by 1, 2
  )
  select u.* from (
    select 0 as nv, det.g as gg, det.gd as ggd, det.g || '-' || lpad(det.ord::text, 8, '0') as kk, det.con, det.fec, det.doc,
           det.cargo, det.abono, det.saldo
    from det
    union all
    select 1, sub.g, sub.gd, null, null, null, null, sub.cargo, sub.abono, sub.saldo from sub
    union all
    select 2, null, null, null, null, null, null, sum(sub.cargo), sum(sub.abono), sum(sub.saldo) from sub having count(*) > 0
  ) u
  order by u.nv = 2, u.gg, u.nv, u.kk
$$;

-- ---------- Ventas → Listados → List Pedidos ----------
-- Pedidos de clientes (sin presupuestos). informe: resumido (sin agrupar) | cliente | vendedor |
-- tienda | desglosado (por pedido, cada línea) | totales_cliente.
-- Estado: Anulado · Servido (entregado o liquidado = 5) · Parcial (alguna unidad liquidada) · Pendiente.
-- Pendiente de servir = Σ líneas (cantidad − unidades_liquidadas) en proporción a su importe.
-- Filtros: fecha (fecha+hora del pedido), fechaEntrega, tiendaNumero, tiendas, clientes,
-- vendedores, estados {pendiente, parcial, servido, anulado} (ninguno = todos menos anulados),
-- reparaciones par, web par.
create or replace function public.fn_lst_pedidos_clientes(p jsonb)
returns table(nivel int, grupo text, grupo_desc text, clave text, descripcion text, fecha date, fecha_entrega date, estado text,
              n bigint, base numeric, igic numeric, total numeric, pagado numeric, pend_servir numeric)
language sql stable security invoker set search_path = public as $$
  with es as (
    select coalesce((p->'estados'->>'pendiente')::boolean, false) as pe, coalesce((p->'estados'->>'parcial')::boolean, false) as pa,
           coalesce((p->'estados'->>'servido')::boolean, false) as se, coalesce((p->'estados'->>'anulado')::boolean, false) as an
  ),
  pd as (
    select pe.*, coalesce(c.nombre, pe.nombre_cliente, '') as nom, coalesce(ve.nombre, '') as vn, coalesce(tt.descripcion, '') as td,
           ln.liq_alguna, coalesce(ln.pimp, 0) as pimp,
           case when coalesce(pe.anulado, false) then 'Anulado'
                when coalesce(pe.entregado, false) or coalesce(pe.liquidado, 0) = 5 then 'Servido'
                when coalesce(pe.liquidado, 0) > 0 or ln.liq_alguna then 'Parcial'
                else 'Pendiente' end as est
    from pedido_cliente pe
    left join cliente c on c.codigo = pe.cliente_codigo
    left join vendedor ve on ve.codigo = pe.vendedor_codigo
    left join tienda_terminal tt on tt.codigo = pe.tienda_terminal_codigo
    left join lateral (
      select bool_or(coalesce(l.unidades_liquidadas, 0) > 0) as liq_alguna,
             sum(case when coalesce(l.cantidad, 0) = 0 or coalesce(l.cantidad, 0) - coalesce(l.unidades_liquidadas, 0) <= 0 then 0
                      else (coalesce(l.total_base, l.subtotal, 0) + coalesce(l.total_igic, 0))
                           * (coalesce(l.cantidad, 0) - coalesce(l.unidades_liquidadas, 0)) / l.cantidad end) as pimp
      from pedido_cliente_linea l where l.tienda_terminal_codigo = pe.tienda_terminal_codigo and l.numero = pe.numero
    ) ln on true
    where not coalesce(pe.es_presupuesto, false)
      and lst_fecha(lst_ts(pe.fecha, pe.hora), p->'fecha')
      and lst_fecha(lst_ts(pe.fecha_entrega, null), p->'fechaEntrega')
      and lst_tienda_num(pe.tienda_terminal_codigo, pe.numero, p->'tiendaNumero')
      and lst_en(pe.tienda_terminal_codigo, p->'tiendas')
      and lst_en(pe.cliente_codigo, p->'clientes')
      and lst_en(pe.vendedor_codigo, p->'vendedores')
      and lst_par(coalesce(pe.es_reparacion, false), p->'reparaciones')
      and lst_par(pe.web_pedido_id is not null or pe.tienda_terminal_codigo = '60', p->'web')
  ),
  f as (
    select pd.* from pd, es
    where case when not (es.pe or es.pa or es.se or es.an) then pd.est <> 'Anulado'
               else (es.pe and pd.est = 'Pendiente') or (es.pa and pd.est = 'Parcial') or (es.se and pd.est = 'Servido') or (es.an and pd.est = 'Anulado') end
  ),
  filas as (
    select f.tienda_terminal_codigo as t, f.numero as num, f.cliente_codigo as cli, f.nom, f.vendedor_codigo as vc, f.vn, f.td,
           f.fecha as fec, f.fecha_entrega as fent, f.est, f.hora,
           f.tienda_terminal_codigo || '-' || f.numero || '  ' || coalesce(f.cliente_codigo, '') || ' ' || f.nom as des,
           coalesce(f.subtotal_2, f.subtotal, 0) as bs, coalesce(f.total_igic_pie, 0) as ig, coalesce(f.total, 0) as tt,
           coalesce(f.total_pagado, 0) as pg, case when f.est in ('Servido', 'Anulado') then 0 else round(f.pimp, 3) end as ps,
           null::bigint as nl, null::text as lin_des
    from f
    where p->>'informe' is distinct from 'desglosado'
    union all
    select f.tienda_terminal_codigo, f.numero, f.cliente_codigo, f.nom, f.vendedor_codigo, f.vn, f.td, f.fecha, f.fecha_entrega,
           case when coalesce(l.cantidad, 0) - coalesce(l.unidades_liquidadas, 0) > 0 and f.est not in ('Servido', 'Anulado')
                then 'Pend. ' || trim_scale(coalesce(l.cantidad, 0) - coalesce(l.unidades_liquidadas, 0))::text
                else 'Servida' end,
           f.hora, f.tienda_terminal_codigo || '-' || f.numero,
           coalesce(l.total_base, l.subtotal, 0), coalesce(l.total_igic, 0), coalesce(l.total_base, l.subtotal, 0) + coalesce(l.total_igic, 0),
           0,
           case when f.est in ('Servido', 'Anulado') or coalesce(l.cantidad, 0) = 0 or coalesce(l.cantidad, 0) - coalesce(l.unidades_liquidadas, 0) <= 0 then 0
                else round((coalesce(l.total_base, l.subtotal, 0) + coalesce(l.total_igic, 0))
                           * (coalesce(l.cantidad, 0) - coalesce(l.unidades_liquidadas, 0)) / l.cantidad, 3) end,
           l.numero_linea,
           trim_scale(coalesce(l.cantidad, 0))::text || ' x ' || coalesce(l.articulo_codigo, '') || ' ' || coalesce(l.descripcion, '')
    from f join pedido_cliente_linea l on l.tienda_terminal_codigo = f.tienda_terminal_codigo and l.numero = f.numero
    where p->>'informe' = 'desglosado'
  ),
  b as (
    select filas.*,
      case p->>'informe' when 'cliente' then coalesce(filas.cli, '—') when 'vendedor' then coalesce(filas.vc, '—')
        when 'tienda' then filas.t when 'desglosado' then filas.t || '-' || lpad(filas.num::text, 12, '0') else '' end as g,
      case p->>'informe' when 'cliente' then 'Cliente ' || coalesce(filas.cli, '—') || ' ' || filas.nom
        when 'vendedor' then 'Vendedor ' || coalesce(filas.vc, '(sin vendedor)') || ' ' || filas.vn
        when 'tienda' then 'Tienda ' || filas.t || ' ' || filas.td
        when 'desglosado' then 'Pedido ' || filas.des || ' · ' || to_char(filas.fec, 'DD/MM/YYYY') else '' end as gd,
      case p->>'informe' when 'totales_cliente' then coalesce(filas.cli, '—')
        when 'desglosado' then lpad(filas.nl::text, 10, '0')
        else filas.t || '-' || lpad(filas.num::text, 12, '0') end as k,
      case p->>'informe' when 'totales_cliente' then filas.nom when 'desglosado' then filas.lin_des else filas.des end as kd
    from filas
  )
  select (case when grouping(b.g) = 1 then 2 when grouping(b.k) = 1 then 1 else 0 end)::int,
         b.g, b.gd, case when grouping(b.k) = 0 and p->>'informe' = 'totales_cliente' then b.k end, min(b.kd),
         case when grouping(b.k) = 0 and p->>'informe' not in ('totales_cliente', 'desglosado') then min(b.fec) end,
         case when grouping(b.k) = 0 and p->>'informe' not in ('totales_cliente', 'desglosado') then min(b.fent) end,
         case when grouping(b.k) = 0 and p->>'informe' <> 'totales_cliente' then min(b.est) end,
         count(*), sum(b.bs), sum(b.ig), sum(b.tt), sum(b.pg), sum(b.ps)
  from b
  group by grouping sets ((b.g, b.gd, b.k), (b.g, b.gd), ())
  order by grouping(b.g), b.g, grouping(b.k),
           case when p->>'orden' = 'fecha' and p->>'informe' not in ('totales_cliente', 'desglosado') then min(b.fec::text || coalesce(b.hora, '')) end,
           case when p->>'orden' = 'cliente' then min(b.nom) end,
           case when p->>'orden' = 'total' then sum(b.tt) end desc nulls last,
           b.k
$$;

-- ---------- Clientes → Recalcular deuda ----------
-- deuda_actual = Σ pendiente de sus facturas no anuladas + Σ pendiente de sus ventas sin facturar
-- (no anuladas ni aplazadas). Un albarán facturado no cuenta: está en su factura. Los cobros ya
-- están descontados en el pendiente de cada documento (fn_cobro_cliente_cobrar/anular).
-- fecha_ultima_venta = la mayor entre la que tiene (cargada de GeminisWin) y su última venta.
-- Cada cambio se apunta en cliente_deuda_recalculo (lote) para poder deshacerlo.

create table if not exists public.cliente_deuda_recalculo (
  id bigserial primary key,
  lote uuid not null,
  creado_en timestamptz not null default now(),
  usuario uuid default auth.uid(),
  cliente_codigo text not null,
  deuda_anterior numeric,
  deuda_nueva numeric,
  fecha_ultima_venta_anterior date,
  fecha_ultima_venta_nueva date,
  deshecho_en timestamptz
);
create index if not exists cliente_deuda_recalculo_lote_idx on public.cliente_deuda_recalculo (lote);
alter table public.cliente_deuda_recalculo enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cliente_deuda_recalculo') then
    create policy autenticados_acceso_total_cliente_deuda_recalculo on public.cliente_deuda_recalculo
      for all to authenticated using (true) with check (true);
  end if;
end $$;
comment on table public.cliente_deuda_recalculo is 'Clientes → Recalcular deuda: valores anteriores y nuevos de cada recálculo (para deshacer).';

-- p: {desde, hasta (códigos de cliente; vacío = sin límite), despues (procesar los posteriores a
--     este código, para ir por tramos), limite (clientes por llamada, por defecto 500),
--     aplicar (bool: false = solo calcular), lote (uuid del recálculo, obligatorio si aplicar),
--     incluirBajas (bool)}
-- Devuelve una fila por cliente procesado (cambia = si la deuda o la fecha cambian).
create or replace function public.fn_cliente_recalcular_deuda(p jsonb)
returns table(cliente_codigo text, nombre text, deuda_anterior numeric, deuda_nueva numeric, diferencia numeric,
              ultima_venta_anterior date, ultima_venta_nueva date, cambia boolean)
language plpgsql security invoker set search_path = public as $$
#variable_conflict use_column
declare
  v_aplicar boolean := coalesce((p->>'aplicar')::boolean, false);
  v_lote uuid := nullif(p->>'lote', '')::uuid;
  v_lim int := least(greatest(coalesce(nullif(p->>'limite', '')::int, 500), 1), 5000);
begin
  if auth.uid() is null and session_user not in ('postgres', 'supabase_admin') then raise exception 'Sin sesión'; end if;
  if v_aplicar and v_lote is null then raise exception 'Falta el identificador del recálculo (lote).'; end if;

  -- Un solo comando: calcula, apunta el lote y actualiza (CTE que modifican datos).
  return query
  with cl as (
    select c.codigo, coalesce(c.nombre, '') as nom, coalesce(c.deuda_actual, 0) as da, c.fecha_ultima_venta as fa
    from cliente c
    where (coalesce(p->>'desde', '') = '' or c.codigo >= p->>'desde')
      and (coalesce(p->>'hasta', '') = '' or c.codigo <= p->>'hasta')
      and (coalesce(p->>'despues', '') = '' or c.codigo > p->>'despues')
      and (coalesce((p->>'incluirBajas')::boolean, false) or (coalesce(c.activo, true) and c.fecha_baja is null))
    order by c.codigo
    limit v_lim
  ),
  fac as (
    select f.cliente_codigo as cli, sum(round(coalesce(f.total_pendiente, coalesce(f.total, 0) - coalesce(f.total_pagado, 0)), 3)) as s
    from factura f join cl on cl.codigo = f.cliente_codigo
    where coalesce(f.estado, '') not ilike 'anul%'
      and abs(coalesce(f.total_pendiente, coalesce(f.total, 0) - coalesce(f.total_pagado, 0))) > 0.005
      and not fn_factura_anulada(f.tienda_terminal_codigo, f.numero)
    group by 1
  ),
  vta as (
    select v.cliente_codigo as cli,
           sum(round(coalesce(v.total_pendiente, greatest(coalesce(v.total, 0) - coalesce(v.total_pagado, 0), 0)), 3))
             filter (where v.factura_numero is null and not coalesce(v.aplazada, false)) as s,
           max(v.fecha) as ult
    from venta v join cl on cl.codigo = v.cliente_codigo
    where v.anulada_en is null
    group by 1
  ),
  calc as (
    select cl.codigo as cod, cl.nom, cl.da, round(coalesce(fac.s, 0) + coalesce(vta.s, 0), 3) as dn, cl.fa,
           case when cl.fa is null then vta.ult when vta.ult is null then cl.fa else greatest(cl.fa, vta.ult) end as fnv
    from cl left join fac on fac.cli = cl.codigo left join vta on vta.cli = cl.codigo
  ),
  cambios as (
    select calc.* from calc where v_aplicar and (abs(calc.da - calc.dn) > 0.0005 or calc.fa is distinct from calc.fnv)
  ),
  apunte as (
    insert into cliente_deuda_recalculo (lote, cliente_codigo, deuda_anterior, deuda_nueva, fecha_ultima_venta_anterior, fecha_ultima_venta_nueva)
    select v_lote, x.cod, x.da, x.dn, x.fa, x.fnv from cambios x
    returning 1
  ),
  upd as (
    update cliente c
       set deuda_actual = x.dn, fecha_ultima_venta = x.fnv, actualizado_en = now()
      from cambios x
     where c.codigo = x.cod
    returning 1
  )
  select t.cod, t.nom, t.da, t.dn, round(t.dn - t.da, 3), t.fa, t.fnv, (abs(t.da - t.dn) > 0.0005 or t.fa is distinct from t.fnv)
  from calc t
  where (select count(*) from apunte) >= 0 and (select count(*) from upd) >= 0
  order by t.cod;
end $$;

-- Deshace un recálculo: devuelve la deuda y la fecha de última venta anteriores a los clientes
-- de ese lote que no se hayan vuelto a tocar después.
create or replace function public.fn_cliente_recalcular_deuda_deshacer(p_lote uuid)
returns int
language plpgsql security invoker set search_path = public as $$
declare v_n int;
begin
  if auth.uid() is null and session_user not in ('postgres', 'supabase_admin') then raise exception 'Sin sesión'; end if;
  update cliente c
     set deuda_actual = r.deuda_anterior, fecha_ultima_venta = r.fecha_ultima_venta_anterior, actualizado_en = now()
    from cliente_deuda_recalculo r
   where r.lote = p_lote and r.deshecho_en is null and c.codigo = r.cliente_codigo
     and coalesce(c.deuda_actual, 0) = coalesce(r.deuda_nueva, 0);
  get diagnostics v_n = row_count;
  update cliente_deuda_recalculo set deshecho_en = now() where lote = p_lote and deshecho_en is null;
  return v_n;
end $$;

grant execute on function public.lst_cliente_filtro(public.cliente, jsonb), public.fn_cli_pendientes(date),
  public.fn_lst_clientes(jsonb), public.fn_lst_ventas_facturas_cliente(jsonb), public.fn_lst_clientes_zonas(jsonb),
  public.fn_lst_clientes_impagados(jsonb), public.fn_lst_pendiente_cobro(jsonb), public.fn_lst_extracto_clientes(jsonb),
  public.fn_lst_pedidos_clientes(jsonb), public.fn_cliente_recalcular_deuda(jsonb), public.fn_cliente_recalcular_deuda_deshacer(uuid)
  to authenticated;
grant select, insert, update on public.cliente_deuda_recalculo to authenticated;
grant usage on sequence public.cliente_deuda_recalculo_id_seq to authenticated;

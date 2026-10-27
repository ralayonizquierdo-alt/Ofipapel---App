-- Listados de Ventas (Ventas → Listados) y Listados de Pedidos (Compras), réplica de GeminisWin.
--
-- Todos los informes se calculan aquí: el navegador recibe ya las filas de detalle, los
-- subtotales por grupo y el total general (GROUPING SETS), nunca suma miles de filas.
-- Funciones SECURITY INVOKER: respetan el RLS de las tablas que leen.
--
-- Forma común de la respuesta: nivel 0 = detalle, 1 = subtotal del grupo, 2 = total general;
-- grupo/grupo_desc = grupo del informe ('' = sin agrupar); clave/descripcion = fila.
--
-- Filtros (jsonb `p`) con la forma de la ventana de GeminisWin:
--   rango  = {modo: 'cualquiera'|'desdeHasta'|'seleccionar', desde, hasta, lista: [..]}
--   fecha  = {modo, desde: 'AAAA-MM-DDTHH:MI:SS', hasta}
--   par    = {si: bool, no: bool}  (botones ×/✓ «Pagadas / No Pagadas»: con uno solo marcado
--            se filtra; con los dos o ninguno, no)

-- ---------- Ayudantes ----------

create or replace function public.lst_en(v text, f jsonb) returns boolean
language sql immutable as $$
  select case coalesce(f->>'modo', 'cualquiera')
    when 'desdeHasta' then
      coalesce((coalesce(f->>'desde', '') = '' or v >= f->>'desde') and (coalesce(f->>'hasta', '') = '' or v <= f->>'hasta'), false)
    when 'seleccionar' then
      jsonb_array_length(coalesce(f->'lista', '[]'::jsonb)) = 0
      or coalesce(v = any (array(select jsonb_array_elements_text(f->'lista'))), false)
    else true end
$$;

create or replace function public.lst_ts(d date, h text) returns timestamp
language sql immutable as $$
  select case when d is null then null
    when h ~ '^\d{1,2}:\d{2}(:\d{2})?$' then d + h::time
    else d::timestamp end
$$;

create or replace function public.lst_fecha(ts timestamp, f jsonb) returns boolean
language sql immutable as $$
  select case when coalesce(f->>'modo', 'cualquiera') <> 'desdeHasta' then true
    else coalesce((coalesce(f->>'desde', '') = '' or ts >= (f->>'desde')::timestamp)
              and (coalesce(f->>'hasta', '') = '' or ts <= (f->>'hasta')::timestamp), false) end
$$;

create or replace function public.lst_hora(h text, f jsonb) returns boolean
language sql immutable as $$
  select case when coalesce(f->>'modo', 'cualquiera') <> 'desdeHasta' then true
    when h !~ '^\d{1,2}:\d{2}(:\d{2})?$' then false
    else (coalesce(f->>'desde', '') !~ '^\d{1,2}:\d{2}' or h::time >= (f->>'desde')::time)
     and (coalesce(f->>'hasta', '') !~ '^\d{1,2}:\d{2}' or h::time <= (f->>'hasta')::time) end
$$;

create or replace function public.lst_par(a boolean, f jsonb) returns boolean
language sql immutable as $$
  select case
    when coalesce((f->>'si')::boolean, false) and not coalesce((f->>'no')::boolean, false) then coalesce(a, false)
    when coalesce((f->>'no')::boolean, false) and not coalesce((f->>'si')::boolean, false) then not coalesce(a, false)
    else true end
$$;

-- «Tienda y Número»: desde (tienda, nº) hasta (tienda, nº); en la lista, «41/123».
create or replace function public.lst_tienda_num(t text, n bigint, f jsonb) returns boolean
language sql immutable as $$
  select case coalesce(f->>'modo', 'cualquiera')
    when 'desdeHasta' then
      coalesce((coalesce(f->>'desdeTienda', '') = '' or t > f->>'desdeTienda'
                or (t = f->>'desdeTienda' and (coalesce(f->>'desdeNumero', '') = '' or n >= (f->>'desdeNumero')::bigint)))
           and (coalesce(f->>'hastaTienda', '') = '' or t < f->>'hastaTienda'
                or (t = f->>'hastaTienda' and (coalesce(f->>'hastaNumero', '') = '' or n <= (f->>'hastaNumero')::bigint))), false)
    when 'seleccionar' then
      jsonb_array_length(coalesce(f->'lista', '[]'::jsonb)) = 0
      or (t || '/' || n) = any (array(select jsonb_array_elements_text(f->'lista')))
    else true end
$$;

-- «Filtrar Según Campo de Cliente»: {campo, modo: 'no'|'desdeHasta'|'igual', desde, hasta}
create or replace function public.lst_campo_cliente(c public.cliente, f jsonb) returns boolean
language sql stable as $$
  select case when coalesce(f->>'modo', 'no') = 'no' then true
    else (with v as (
      select case f->>'campo'
        when 'tipo_cliente' then c.tipo_cliente_codigo
        when 'zona' then c.zona_territorial_codigo
        when 'vendedor' then c.vendedor_codigo
        when 'forma_pago' then c.forma_pago_codigo
        when 'ruta' then c.ruta_codigo
        when 'poblacion' then upper(c.poblacion)
        when 'provincia' then c.provincia_codigo
        when 'codigo_postal' then c.codigo_postal
        else null end as x)
      select case f->>'modo'
        when 'igual' then coalesce(upper(x) = upper(f->>'desde'), false)
        else coalesce((coalesce(f->>'desde', '') = '' or upper(x) >= upper(f->>'desde'))
                  and (coalesce(f->>'hasta', '') = '' or upper(x) <= upper(f->>'hasta')), false) end
      from v) end
$$;

create or replace function public.lst_mes(d date) returns text
language sql immutable as $$
  select case when d is null then '' else
    (array['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'])[extract(month from d)::int]
    || ' ' || extract(year from d)::int end
$$;

-- ---------- Ventas → Listados → List. Ventas → List. de Ventas ----------

create or replace function public.fn_lst_ventas(p jsonb)
returns table(nivel int, grupo text, grupo_desc text, clave text, descripcion text, fecha date,
              n_ventas bigint, base numeric, igic numeric, total numeric, pagado numeric, pendiente numeric, comision numeric)
language plpgsql stable security invoker set search_path = public as $$
#variable_conflict use_column
declare
  inf text := coalesce(p->>'informe', 'mensual_vendedor');
  por text := coalesce(p->>'filtrarPor', 'vendedor');
  cf text := coalesce(p->>'campoFecha', 'venta');
  ord text := coalesce(p->>'orden', 'clave');
  rk boolean := coalesce((p->'ranking'->>'activo')::boolean, false);
  rk_por text := coalesce(p->'ranking'->>'por', 'total');
  rk_n int := greatest(coalesce((p->'ranking'->>'n')::int, 10), 1);
  rp jsonb := coalesce(p->'reparto', '{}'::jsonb);
  rp_alguno boolean;
begin
  rp_alguno := coalesce((rp->>'sinReparto')::boolean, false) or coalesce((rp->>'pendiente')::boolean, false)
            or coalesce((rp->>'entregado')::boolean, false) or coalesce((rp->>'devuelto')::boolean, false);
  return query
  with vf as (
    select v.tienda_terminal_codigo as t, v.numero, v.cliente_codigo,
           coalesce(c.nombre, v.nombre_cliente, '') as cli_nombre, v.forma_pago_codigo,
           coalesce(v.subtotal_2, v.subtotal, 0) as base, coalesce(v.total_igic_pie, 0) as igic,
           coalesce(v.total, 0) as total, coalesce(v.total_pagado, 0) as pagado, coalesce(v.total_pendiente, 0) as pendiente,
           case por when 'tecnico' then v.tecnico_codigo when 'empleado' then v.empleado_codigo else v.vendedor_codigo end as persona,
           case cf when 'factura' then f.fecha_factura when 'pagoVenta' then v.fecha_pago when 'pagoFactura' then f.fecha_pago else v.fecha end as fref
    from venta v
    left join factura f on f.tienda_terminal_codigo = v.factura_tienda_codigo and f.numero = v.factura_numero
    left join cliente c on c.codigo = v.cliente_codigo
    where v.anulada_en is null
      and lst_fecha(case cf when 'factura' then lst_ts(f.fecha_factura, f.hora_factura)
                            when 'pagoVenta' then lst_ts(v.fecha_pago, null)
                            when 'pagoFactura' then lst_ts(f.fecha_pago, null)
                            else lst_ts(v.fecha, v.hora) end, p->'fecha')
      and lst_hora(v.hora, p->'hora')
      and lst_en(v.tienda_terminal_codigo, p->'tiendas')
      and lst_en(case por when 'tecnico' then v.tecnico_codigo when 'empleado' then v.empleado_codigo else v.vendedor_codigo end, p->'personas')
      and (coalesce(p->'tarifa'->>'modo', 'no') = 'no'
           or (v.tarifa_nivel >= coalesce(nullif(p->'tarifa'->>'desde', '')::int, -1)
               and v.tarifa_nivel <= coalesce(nullif(p->'tarifa'->>'hasta', '')::int, 99)))
      and lst_en(v.cliente_codigo, p->'clientes')
      and lst_campo_cliente(c, p->'campoCliente')
      and lst_par(c.es_generico, p->'genericos')
      and lst_tienda_num(v.tienda_terminal_codigo, v.numero, p->'tiendaNumero')
      and lst_en(v.almacen_codigo, p->'almacenes')
      and lst_par(coalesce(v.total_pendiente, 0) = 0, p->'pagadas')
      and lst_par(v.tipo_credito ilike 'cr%', p->'credito')
      and lst_par(v.aplazada, p->'aplazadas')
      and lst_par(v.factura_numero is not null, p->'facturadas')
      and (not rp_alguno
           or (coalesce((rp->>'sinReparto')::boolean, false) and not coalesce(v.es_reparto, false)
               and not exists (select 1 from reparto_linea r where r.venta_tienda_codigo = v.tienda_terminal_codigo and r.venta_numero = v.numero))
           or exists (select 1 from reparto_linea r
                      where r.venta_tienda_codigo = v.tienda_terminal_codigo and r.venta_numero = v.numero
                        and ((coalesce((rp->>'pendiente')::boolean, false) and coalesce(r.estado, 'pendiente') = 'pendiente')
                          or (coalesce((rp->>'entregado')::boolean, false) and r.estado = 'entregado')
                          or (coalesce((rp->>'devuelto')::boolean, false) and r.estado = 'devuelto'))))
      and lst_par(coalesce(nullif(v.averia, '') is not null, false)
                  or exists (select 1 from pedido_cliente pc where pc.tienda_terminal_codigo = v.pedido_tienda_codigo
                                and pc.numero = v.pedido_numero and pc.es_reparacion), p->'reparaciones')
      and lst_en(v.forma_pago_codigo, p->'formasPago')
      and (not coalesce((p->>'fraccionados')::boolean, false)
           or ((coalesce(v.total_efectivo, 0) <> 0)::int + (coalesce(v.total_tarjeta, 0) <> 0)::int
               + (coalesce(v.total_cheque, 0) <> 0)::int + (coalesce(v.total_debito, 0) <> 0)::int) > 1)
  ),
  com as (
    select l.tienda_terminal_codigo as t, l.numero,
           sum(coalesce(case por when 'tecnico' then l.total_comision_tecnico else l.total_comision_vendedor end, 0)) as comis
    from venta_linea l
    join vf on vf.t = l.tienda_terminal_codigo and vf.numero = l.numero
    group by 1, 2
  ),
  b0 as (
    select vf.*, coalesce(com.comis, 0) as comis,
           coalesce(case por when 'tecnico' then te.nombre when 'empleado' then em.nombre else ve.nombre end, '') as persona_nombre,
           coalesce(tt.descripcion, '') as tienda_desc, coalesce(fp.descripcion, '') as fp_desc
    from vf
    left join com on com.t = vf.t and com.numero = vf.numero
    left join vendedor ve on por = 'vendedor' and ve.codigo = vf.persona
    left join tecnico te on por = 'tecnico' and te.codigo = vf.persona
    left join empleado em on por = 'empleado' and em.codigo = vf.persona
    left join tienda_terminal tt on tt.codigo = vf.t
    left join forma_pago fp on fp.codigo = vf.forma_pago_codigo
  ),
  b as (
    select b0.*,
      case inf
        when 'desglosado' then b0.t
        when 'diario' then to_char(b0.fref, 'YYYY-MM')
        when 'mensual' then to_char(b0.fref, 'YYYY')
        when 'mensual_vendedor' then coalesce(b0.persona, '—')
        else '' end as g,
      case inf
        when 'desglosado' then 'Tienda ' || b0.t || ' ' || b0.tienda_desc
        when 'diario' then lst_mes(b0.fref)
        when 'mensual' then 'Año ' || to_char(b0.fref, 'YYYY')
        when 'mensual_vendedor' then coalesce(b0.persona, '—') || ' ' || b0.persona_nombre
        else '' end as gd,
      case inf
        when 'desglosado' then b0.t || '-' || lpad(b0.numero::text, 10, '0')
        when 'diario' then to_char(b0.fref, 'YYYY-MM-DD')
        when 'mensual' then to_char(b0.fref, 'YYYY-MM')
        when 'mensual_vendedor' then to_char(b0.fref, 'YYYY-MM')
        when 'vendedor' then coalesce(b0.persona, '—')
        when 'cliente' then coalesce(b0.cliente_codigo, '—')
        when 'tienda' then b0.t
        when 'forma_pago' then coalesce(b0.forma_pago_codigo, '—')
        else '' end as k,
      case inf
        when 'desglosado' then b0.t || '-' || b0.numero || '  ' || coalesce(b0.cliente_codigo, '') || ' ' || b0.cli_nombre
        when 'diario' then to_char(b0.fref, 'DD/MM/YYYY')
        when 'mensual' then lst_mes(b0.fref)
        when 'mensual_vendedor' then lst_mes(b0.fref)
        when 'vendedor' then b0.persona_nombre
        when 'cliente' then b0.cli_nombre
        when 'tienda' then b0.tienda_desc
        when 'forma_pago' then b0.fp_desc
        else '' end as kd
    from b0
  ),
  topk as (
    select b.k from b group by b.k
    order by case rk_por when 'base' then sum(b.base) when 'comision' then sum(b.comis) else sum(b.total) end desc nulls last
    limit rk_n
  ),
  bf as (select * from b where not rk or b.k in (select topk.k from topk))
  select (case when grouping(bf.g) = 1 then 2 when grouping(bf.k) = 1 then 1 else 0 end)::int,
         bf.g, bf.gd, bf.k, bf.kd,
         case when grouping(bf.k) = 0 then min(bf.fref) end,
         count(*), sum(bf.base), sum(bf.igic), sum(bf.total), sum(bf.pagado), sum(bf.pendiente), sum(bf.comis)
  from bf
  group by grouping sets ((bf.g, bf.gd, bf.k, bf.kd), (bf.g, bf.gd), ())
  order by grouping(bf.g), bf.g, grouping(bf.k),
           case when ord = 'total' then sum(bf.total) end desc nulls last,
           case when ord = 'nventas' then count(*) end desc nulls last,
           case when ord = 'descripcion' then bf.kd end,
           bf.k;
end
$$;

-- ---------- Ventas → Listados → List. Ventas → Ventas por Artículo ----------

create or replace function public.fn_lst_ventas_articulo(p jsonb)
returns table(nivel int, grupo text, grupo_desc text, clave text, descripcion text,
              unidades numeric, importe numeric, coste numeric, beneficio numeric, pct_beneficio numeric)
language plpgsql stable security invoker set search_path = public as $$
#variable_conflict use_column
declare
  inf text := coalesce(p->>'informe', 'articulo');
  por text := coalesce(p->>'filtrarPor', 'vendedor');
  cf text := coalesce(p->>'campoFecha', 'venta');
  ord text := coalesce(p->>'orden', 'cod_intern');
  ag_t boolean := coalesce((p->'agrupar'->>'tienda')::boolean, false);
  ag_a boolean := coalesce((p->'agrupar'->>'almacen')::boolean, false);
  ag_d boolean := coalesce((p->'agrupar'->>'descripcion')::boolean, false);
  fa jsonb := coalesce(p->'articulos', '{}'::jsonb);
  fa_len int := case coalesce(fa->>'nivelFamilia', '3') when '1' then 2 when '2' then 4 else 100 end;
  fm jsonb := coalesce(p->'marcas', '{}'::jsonb);
  rk boolean := coalesce((p->'ranking'->>'activo')::boolean, false);
  rk_por text := coalesce(p->'ranking'->>'por', 'valor');
  rk_menos boolean := coalesce(p->'ranking'->>'modo', 'mas') = 'menos';
  rk_n int := greatest(coalesce((p->'ranking'->>'n')::int, 10), 1);
begin
  return query
  with lf as (
    select l.tienda_terminal_codigo as t, l.almacen_codigo as alm, l.articulo_codigo as art,
           coalesce(a.descripcion, l.descripcion, '') as art_desc, coalesce(l.descripcion, a.descripcion, '') as lin_desc,
           a.familia_codigo, a.marca_codigo, a.proveedor_habitual_codigo, v.cliente_codigo,
           coalesce(c.nombre, v.nombre_cliente, '') as cli_nombre,
           coalesce(l.cantidad, 0) as uds,
           coalesce(l.total_base, l.subtotal, coalesce(l.cantidad, 0) * coalesce(l.precio, 0) * (1 - coalesce(l.descuento_pct, 0) / 100)) as imp,
           coalesce(l.cantidad, 0) * coalesce(nullif(l.precio_liquidado_compra, 0), a.coste_neto, 0) as cst
    from venta_linea l
    join venta v on v.tienda_terminal_codigo = l.tienda_terminal_codigo and v.numero = l.numero
    left join articulo a on a.codigo_interno = l.articulo_codigo
    left join factura f on f.tienda_terminal_codigo = v.factura_tienda_codigo and f.numero = v.factura_numero
    left join cliente c on c.codigo = v.cliente_codigo
    where v.anulada_en is null
      and lst_fecha(case cf when 'factura' then lst_ts(f.fecha_factura, f.hora_factura)
                            when 'pagoVenta' then lst_ts(v.fecha_pago, null)
                            when 'pagoFactura' then lst_ts(f.fecha_pago, null)
                            else lst_ts(v.fecha, v.hora) end, p->'fecha')
      and lst_en(v.forma_pago_codigo, p->'formasPago')
      and (not coalesce((p->>'fraccionados')::boolean, false)
           or ((coalesce(v.total_efectivo, 0) <> 0)::int + (coalesce(v.total_tarjeta, 0) <> 0)::int
               + (coalesce(v.total_cheque, 0) <> 0)::int + (coalesce(v.total_debito, 0) <> 0)::int) > 1)
      and lst_en(v.cliente_codigo, p->'clientes')
      and lst_campo_cliente(c, p->'campoCliente')
      and (case when coalesce(fa->>'por', 'articulo') = 'familia'
                then lst_en(left(a.familia_codigo, fa_len), fa)
                else lst_en(l.articulo_codigo, fa) end)
      and (case when coalesce(fm->>'por', 'marca') = 'campo_libre'
                then lst_en(a.campo_libre, fm)
                else lst_en(a.marca_codigo, fm) end)
      and lst_en(case por when 'tecnico' then coalesce(l.tecnico_codigo, v.tecnico_codigo)
                          when 'empleado' then coalesce(l.empleado_codigo, v.empleado_codigo)
                          else v.vendedor_codigo end, p->'personas')
      and lst_en(a.proveedor_habitual_codigo, p->'proveedores')
      and lst_en(v.tienda_terminal_codigo, p->'tiendas')
      and lst_tienda_num(v.tienda_terminal_codigo, v.numero, p->'tiendaNumero')
      and lst_par(v.factura_numero is not null, p->'facturadas')
      and lst_par(coalesce(v.total_pendiente, 0) = 0, p->'pagadas')
      and (not coalesce((p->>'soloAplazadas')::boolean, false) or coalesce(v.aplazada, false))
  ),
  b as (
    select lf.*,
      concat_ws(' · ',
        case when ag_t then 'T' || lf.t end,
        case when ag_a then 'A' || coalesce(lf.alm, '') end,
        case inf when 'familia_articulo' then coalesce(lf.familia_codigo, '—')
                 when 'proveedor_articulo' then coalesce(lf.proveedor_habitual_codigo, '—')
                 when 'cliente_articulo' then coalesce(lf.cliente_codigo, '—') end) as g,
      concat_ws(' · ',
        case when ag_t then 'Tienda ' || lf.t || ' ' || coalesce(tt.descripcion, '') end,
        case when ag_a then 'Almacén ' || coalesce(lf.alm, '') || ' ' || coalesce(al.nombre, '') end,
        case inf when 'familia_articulo' then 'Familia ' || coalesce(lf.familia_codigo, '—') || ' ' || coalesce(fam.descripcion, '')
                 when 'proveedor_articulo' then 'Proveedor ' || coalesce(lf.proveedor_habitual_codigo, '—') || ' ' || coalesce(pr.nombre, '')
                 when 'cliente_articulo' then 'Cliente ' || coalesce(lf.cliente_codigo, '—') || ' ' || lf.cli_nombre end) as gd,
      case inf
        when 'familia' then coalesce(lf.familia_codigo, '—')
        when 'marca' then coalesce(lf.marca_codigo, '—')
        when 'proveedor' then coalesce(lf.proveedor_habitual_codigo, '—')
        else case when ag_d then upper(lf.lin_desc) else coalesce(lf.art, '—') end end as k,
      case inf
        when 'familia' then coalesce(fam.descripcion, '')
        when 'marca' then coalesce(lf.marca_codigo, '')
        when 'proveedor' then coalesce(pr.nombre, '')
        else case when ag_d then lf.lin_desc else lf.art_desc end end as kd
    from lf
    left join tienda_terminal tt on tt.codigo = lf.t
    left join almacen al on al.codigo = lf.alm
    left join familia fam on fam.codigo = lf.familia_codigo
    left join proveedor pr on pr.codigo = lf.proveedor_habitual_codigo
  ),
  topk as (
    select b.k from b group by b.k
    order by case when rk_menos then 1 else -1 end *
             case rk_por when 'cantidad' then sum(b.uds) when 'beneficio' then sum(b.imp - b.cst)
                         when 'pct' then case when sum(b.imp) <> 0 then sum(b.imp - b.cst) / sum(b.imp) end
                         else sum(b.imp) end nulls last
    limit rk_n
  ),
  bf as (select * from b where not rk or b.k in (select topk.k from topk))
  select (case when grouping(bf.g) = 1 then 2 when grouping(bf.k) = 1 then 1 else 0 end)::int,
         bf.g, bf.gd, bf.k, case when grouping(bf.k) = 0 then min(bf.kd) end,
         sum(bf.uds), round(sum(bf.imp), 3), round(sum(bf.cst), 3), round(sum(bf.imp - bf.cst), 3),
         case when sum(bf.imp) <> 0 then round(sum(bf.imp - bf.cst) / sum(bf.imp) * 100, 2) end
  from bf
  group by grouping sets ((bf.g, bf.gd, bf.k), (bf.g, bf.gd), ())
  order by grouping(bf.g), bf.g, grouping(bf.k),
           case when ord = 'unidades' then sum(bf.uds) end desc nulls last,
           case when ord = 'importe' then sum(bf.imp) end desc nulls last,
           case when ord = 'beneficio' then sum(bf.imp - bf.cst) end desc nulls last,
           case when ord = 'descripcion' then min(bf.kd) end,
           bf.k;
end
$$;

-- ---------- Ventas → Listados → L. Reparaciones ----------

create or replace function public.fn_lst_reparaciones(p jsonb)
returns table(nivel int, grupo text, grupo_desc text, clave text, documento text, fecha date, fecha_realizacion date,
              cliente text, tecnico text, numero_serie text, averia text, estado text, n bigint, total numeric)
language plpgsql stable security invoker set search_path = public as $$
#variable_conflict use_column
declare
  inf text := coalesce(p->>'informe', 'desglosado');
  cf text := coalesce(p->>'campoFecha', 'entrada');
  ped jsonb := coalesce(p->'pedidos', '{}'::jsonb);
  anu jsonb := coalesce(p->'anuladas', '{}'::jsonb);
  incl_ped boolean := coalesce((ped->>'si')::boolean, false);
  solo_ped boolean := coalesce((ped->>'no')::boolean, false);
  incl_anu boolean := coalesce((anu->>'si')::boolean, false);
  solo_anu boolean := coalesce((anu->>'no')::boolean, false);
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
                else 'Pendiente' end as estado
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
  order by grouping(b.g), b.g, grouping(b.k), b.k;
end
$$;

-- ---------- Ventas → Listados → List. Presupuestos ----------

create or replace function public.fn_lst_presupuestos(p jsonb)
returns table(nivel int, grupo text, grupo_desc text, clave text, documento text, fecha date, cliente text,
              vendedor text, estado text, n bigint, base numeric, igic numeric, total numeric)
language plpgsql stable security invoker set search_path = public as $$
#variable_conflict use_column
declare
  ag text := coalesce(p->>'agrupado', 'secuencial');
begin
  return query
  with pf as (
    select pc.tienda_terminal_codigo as t, pc.numero, pc.fecha as f, pc.cliente_codigo,
           coalesce(c.nombre, pc.nombre_cliente, '') as cli_nombre, pc.vendedor_codigo, coalesce(ve.nombre, '') as ven_nombre,
           coalesce(tt.descripcion, '') as tienda_desc,
           coalesce(pc.subtotal_2, pc.subtotal, 0) as base, coalesce(pc.total_igic_pie, 0) as igic, coalesce(pc.total, 0) as total,
           case when pc.venta_numero is not null then 'Pasado a venta' when pc.aceptado then 'Aceptado' else 'Pendiente' end as estado
    from pedido_cliente pc
    left join cliente c on c.codigo = pc.cliente_codigo
    left join vendedor ve on ve.codigo = pc.vendedor_codigo
    left join tienda_terminal tt on tt.codigo = pc.tienda_terminal_codigo
    where pc.es_presupuesto and not pc.anulado
      and (coalesce(p->>'fechaDesde', '') = '' or pc.fecha >= (p->>'fechaDesde')::date)
      and (coalesce(p->>'fechaHasta', '') = '' or pc.fecha <= (p->>'fechaHasta')::date)
      and (coalesce(p->>'numeroDesde', '') = '' or pc.numero >= (p->>'numeroDesde')::bigint)
      and (coalesce(p->>'numeroHasta', '') = '' or pc.numero <= (p->>'numeroHasta')::bigint)
      and lst_en(pc.tienda_terminal_codigo, jsonb_build_object('modo', 'desdeHasta', 'desde', p->>'tiendaDesde', 'hasta', p->>'tiendaHasta'))
      and (coalesce(p->>'vendedorDesde', '') = '' and coalesce(p->>'vendedorHasta', '') = ''
           or lst_en(pc.vendedor_codigo, jsonb_build_object('modo', 'desdeHasta', 'desde', p->>'vendedorDesde', 'hasta', p->>'vendedorHasta')))
      and (coalesce(p->>'clienteDesde', '') = '' and coalesce(p->>'clienteHasta', '') = ''
           or lst_en(pc.cliente_codigo, jsonb_build_object('modo', 'desdeHasta', 'desde', p->>'clienteDesde', 'hasta', p->>'clienteHasta')))
  ),
  b as (
    select pf.*,
      case ag when 'cliente' then coalesce(pf.cliente_codigo, '—') when 'vendedor' then coalesce(pf.vendedor_codigo, '—')
              when 'tienda' then pf.t when 'fecha' then to_char(pf.f, 'YYYY-MM-DD') else '' end as g,
      case ag when 'cliente' then 'Cliente ' || coalesce(pf.cliente_codigo, '—') || ' ' || pf.cli_nombre
              when 'vendedor' then 'Vendedor ' || coalesce(pf.vendedor_codigo, '—') || ' ' || pf.ven_nombre
              when 'tienda' then 'Tienda ' || pf.t || ' ' || pf.tienda_desc
              when 'fecha' then 'Fecha ' || to_char(pf.f, 'DD/MM/YYYY') else '' end as gd,
      pf.t || '-' || lpad(pf.numero::text, 10, '0') as k
    from pf
  )
  select (case when grouping(b.g) = 1 then 2 when grouping(b.k) = 1 then 1 else 0 end)::int,
         b.g, b.gd, b.k,
         case when grouping(b.k) = 0 then min(b.t) || '-' || min(b.numero) end,
         case when grouping(b.k) = 0 then min(b.f) end,
         case when grouping(b.k) = 0 then min(coalesce(b.cliente_codigo, '') || ' ' || b.cli_nombre) end,
         case when grouping(b.k) = 0 then min(coalesce(b.vendedor_codigo, '')) end,
         case when grouping(b.k) = 0 then min(b.estado) end,
         count(*), sum(b.base), sum(b.igic), sum(b.total)
  from b
  group by grouping sets ((b.g, b.gd, b.k), (b.g, b.gd), ())
  order by grouping(b.g), b.g, grouping(b.k), b.k;
end
$$;

-- ---------- Ventas → Listados → List. Tarjetas (cobros en tarjetas) ----------
-- Los cobros de las ventas quedan en movimiento_caja (ingreso con su forma de pago).

create or replace function public.fn_lst_cobros_tarjeta(p jsonb)
returns table(nivel int, grupo text, grupo_desc text, clave text, descripcion text, fecha date, hora text,
              documento text, n bigint, importe numeric)
language plpgsql stable security invoker set search_path = public as $$
#variable_conflict use_column
declare
  des boolean := coalesce(p->>'modo', 'resumido') = 'desglosado';
  ag_t boolean := coalesce((p->>'agruparTienda')::boolean, false);
  ag_v boolean := coalesce((p->>'agruparVendedor')::boolean, false);
begin
  return query
  with mf as (
    select m.tienda_terminal_codigo as t, m.numero, m.fecha as f_mov, m.hora as h, m.concepto,
           coalesce(m.ingreso, 0) - coalesce(m.gasto, 0) as imp, m.forma_pago_codigo as fpc, coalesce(fp.descripcion, '') as fp_desc,
           v.vendedor_codigo as ven, coalesce(ve.nombre, '') as ven_nombre, coalesce(tt.descripcion, '') as tienda_desc,
           coalesce(v.fecha, m.fecha) as f_vta,
           case when v.numero is not null then v.tienda_terminal_codigo || '-' || v.numero else coalesce(m.documento, '') end as doc
    from movimiento_caja m
    left join forma_pago fp on fp.codigo = m.forma_pago_codigo
    left join venta v on m.documento = 'venta' and v.tienda_terminal_codigo = m.ajeno_tienda_codigo and v.numero = m.ajeno_codigo
    left join vendedor ve on ve.codigo = v.vendedor_codigo
    left join tienda_terminal tt on tt.codigo = m.tienda_terminal_codigo
    where coalesce(m.activo, true)
      and m.forma_pago_codigo is not null
      and lst_en(m.forma_pago_codigo, jsonb_build_object('modo', 'desdeHasta', 'desde', p->>'tarjetaDesde', 'hasta', p->>'tarjetaHasta'))
      and (coalesce(p->>'fechaDesde', '') = '' or coalesce(v.fecha, m.fecha) >= (p->>'fechaDesde')::date)
      and (coalesce(p->>'fechaHasta', '') = '' or coalesce(v.fecha, m.fecha) <= (p->>'fechaHasta')::date)
      and lst_en(m.tienda_terminal_codigo, jsonb_build_object('modo', 'desdeHasta', 'desde', p->>'tiendaDesde', 'hasta', p->>'tiendaHasta'))
      and (coalesce(p->>'vendedorDesde', '') = '' and coalesce(p->>'vendedorHasta', '') = ''
           or lst_en(v.vendedor_codigo, jsonb_build_object('modo', 'desdeHasta', 'desde', p->>'vendedorDesde', 'hasta', p->>'vendedorHasta')))
      and (coalesce(m.ingreso, 0) <> 0 or coalesce(m.gasto, 0) <> 0)
  ),
  b as (
    select mf.*,
      concat_ws(' · ', case when ag_t then 'T' || mf.t end, case when ag_v then 'V' || coalesce(mf.ven, '—') end,
                case when des then mf.fpc end) as g,
      concat_ws(' · ', case when ag_t then 'Tienda ' || mf.t || ' ' || mf.tienda_desc end,
                case when ag_v then 'Vendedor ' || coalesce(mf.ven, '—') || ' ' || mf.ven_nombre end,
                case when des then 'Tarjeta ' || mf.fpc || ' ' || mf.fp_desc end) as gd,
      case when des then mf.t || '-' || lpad(mf.numero::text, 10, '0') else mf.fpc end as k,
      case when des then coalesce(mf.concepto, '') else mf.fp_desc end as kd
    from mf
  )
  select (case when grouping(b.g) = 1 then 2 when grouping(b.k) = 1 then 1 else 0 end)::int,
         b.g, b.gd, b.k, case when grouping(b.k) = 0 then min(b.kd) end,
         case when grouping(b.k) = 0 and des then min(b.f_vta) end,
         case when grouping(b.k) = 0 and des then min(b.h) end,
         case when grouping(b.k) = 0 and des then min(b.doc) end,
         count(*), sum(b.imp)
  from b
  group by grouping sets ((b.g, b.gd, b.k), (b.g, b.gd), ())
  order by grouping(b.g), b.g, grouping(b.k), b.k;
end
$$;

-- ---------- Ventas → Listados → List. Apert. Cajón ----------
-- GeminisWin anota cada apertura del cajón portamonedas (con o sin venta) y quién la hizo.
-- El ERP no lo registraba: tabla mínima para el listado. Pendiente: que el TPV/Caja inserte una
-- fila al abrir el cajón (hoy nadie la rellena y el listado sale vacío).

create table if not exists public.apertura_cajon (
  id bigint generated always as identity primary key,
  tienda_terminal_codigo text references public.tienda_terminal (codigo),
  fecha date not null default (now() at time zone 'Atlantic/Canary')::date,
  hora text not null default to_char(now() at time zone 'Atlantic/Canary', 'HH24:MI:SS'),
  empleado_codigo text references public.empleado (codigo),
  motivo text,
  venta_tienda_codigo text,
  venta_numero bigint,
  creado_en timestamptz not null default now()
);
create index if not exists apertura_cajon_fecha_idx on public.apertura_cajon (fecha, empleado_codigo);
alter table public.apertura_cajon enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'apertura_cajon' and policyname = 'autenticados_acceso_total_apertura_cajon') then
    create policy autenticados_acceso_total_apertura_cajon on public.apertura_cajon for all to authenticated using (true) with check (true);
  end if;
end $$;
grant select, insert, update on public.apertura_cajon to authenticated;

create or replace function public.fn_lst_aperturas_cajon(p jsonb)
returns table(nivel int, grupo text, grupo_desc text, clave text, fecha date, hora text, tienda text,
              motivo text, documento text, n bigint)
language plpgsql stable security invoker set search_path = public as $$
#variable_conflict use_column
begin
  return query
  with b as (
    select coalesce(a.empleado_codigo, '—') as g,
           'Empleado ' || coalesce(a.empleado_codigo, '—') || ' ' || coalesce(e.nombre, '') as gd,
           to_char(a.fecha, 'YYYY-MM-DD') || ' ' || a.hora || ' ' || lpad(a.id::text, 12, '0') as k,
           a.fecha as f, a.hora as h, coalesce(a.tienda_terminal_codigo, '') as t, coalesce(a.motivo, '') as mot,
           case when a.venta_numero is not null then a.venta_tienda_codigo || '-' || a.venta_numero else '' end as doc
    from apertura_cajon a
    left join empleado e on e.codigo = a.empleado_codigo
    where (coalesce(p->>'fechaDesde', '') = '' or a.fecha >= (p->>'fechaDesde')::date)
      and (coalesce(p->>'fechaHasta', '') = '' or a.fecha <= (p->>'fechaHasta')::date)
      and (coalesce(p->>'empleadoDesde', '') = '' and coalesce(p->>'empleadoHasta', '') = ''
           or lst_en(a.empleado_codigo, jsonb_build_object('modo', 'desdeHasta', 'desde', p->>'empleadoDesde', 'hasta', p->>'empleadoHasta')))
  )
  select (case when grouping(b.g) = 1 then 2 when grouping(b.k) = 1 then 1 else 0 end)::int,
         b.g, b.gd, b.k,
         case when grouping(b.k) = 0 then min(b.f) end, case when grouping(b.k) = 0 then min(b.h) end,
         case when grouping(b.k) = 0 then min(b.t) end, case when grouping(b.k) = 0 then min(b.mot) end,
         case when grouping(b.k) = 0 then min(b.doc) end,
         count(*)
  from b
  group by grouping sets ((b.g, b.gd, b.k), (b.g, b.gd), ())
  order by grouping(b.g), b.g, grouping(b.k), b.k;
end
$$;


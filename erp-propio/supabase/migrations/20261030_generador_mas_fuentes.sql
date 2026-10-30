-- Generador de listados: más cosas en «Qué listar» (Luis, 30/10/2026): Presupuestos, Pedidos de
-- clientes, Repartos (entregas), Cobros de clientes, Peticiones y Familias. Igual que las demás:
-- vista v_lst_<fuente> = «tabla.* + columnas de ayuda», security_invoker (cada uno ve lo que su
-- RLS le deja). Para añadir otra: crear su vista aquí y su entrada en src/lib/listados/fuentes.ts.

create or replace view public.v_lst_presupuestos with (security_invoker = true) as
select p.*, p.tienda_terminal_codigo as tienda, extract(year from p.fecha)::int as anio, to_char(p.fecha, 'YYYY-MM') as mes,
       p.cliente_codigo as cliente, coalesce(c.nombre, p.nombre_cliente) as cliente_nombre,
       p.presupuesto_estado as estado, p.responsable_codigo as responsable, public.fn_numero_operario(p.responsable_codigo) as responsable_numero,
       e.nombre as responsable_nombre, p.fecha_fin as valido_hasta, (p.fecha_fin is not null and p.fecha_fin < current_date) as caducado,
       (select count(*) from presupuesto_contacto pc where pc.tienda_terminal_codigo = p.tienda_terminal_codigo and pc.numero = p.numero) as contactos
  from pedido_cliente p
  left join cliente c on c.codigo = p.cliente_codigo
  left join empleado e on e.codigo = p.responsable_codigo
 where p.es_presupuesto;

create or replace view public.v_lst_pedidos with (security_invoker = true) as
select p.*, p.tienda_terminal_codigo as tienda, extract(year from p.fecha)::int as anio, to_char(p.fecha, 'YYYY-MM') as mes,
       p.cliente_codigo as cliente, coalesce(c.nombre, p.nombre_cliente) as cliente_nombre, p.vendedor_codigo as vendedor,
       ve.nombre as vendedor_nombre, p.empleado_codigo as empleado,
       case when p.web_pedido_id is not null or p.tienda_terminal_codigo = '60' then 'Web'
            when p.vendedor_codigo is not null then 'Comercial' else 'Tienda' end as origen,
       case when p.anulado then 'Anulado' when p.entregado then 'Servido' when p.preparado then 'Preparado'
            when p.va_a_reparto then 'En reparto' when p.aceptado then 'Aceptado' else 'Pendiente' end as estado
  from pedido_cliente p
  left join cliente c on c.codigo = p.cliente_codigo
  left join vendedor ve on ve.codigo = p.vendedor_codigo
 where not p.es_presupuesto;

create or replace view public.v_lst_repartos with (security_invoker = true) as
select l.*, r.fecha, extract(year from r.fecha)::int as anio, to_char(r.fecha, 'YYYY-MM') as mes, r.ruta_codigo as ruta,
       rr.descripcion as ruta_desc, r.repartidor_codigo as repartidor, rd.nombre as repartidor_nombre,
       case r.estado when 4 then 'Entregado' else 'Generado' end as estado_reparto,
       l.estado as estado_entrega, v.cliente_codigo as cliente, coalesce(c.nombre, v.nombre_cliente) as cliente_nombre, v.total as importe
  from reparto_linea l
  join reparto r on r.tienda_terminal_codigo = l.tienda_terminal_codigo and r.numero = l.numero
  left join ruta_reparto rr on rr.codigo = r.ruta_codigo
  left join repartidor rd on rd.codigo = r.repartidor_codigo
  left join venta v on v.tienda_terminal_codigo = l.venta_tienda_codigo and v.numero = l.venta_numero
  left join cliente c on c.codigo = v.cliente_codigo;

create or replace view public.v_lst_cobros with (security_invoker = true) as
select k.*, k.tienda_terminal_codigo as tienda, extract(year from k.fecha_pago)::int as anio, to_char(k.fecha_pago, 'YYYY-MM') as mes,
       k.cliente_codigo as cliente, c.nombre as cliente_nombre, k.importe_cobrado as importe, k.tipo_pago as forma
  from cobro_cliente k
  left join cliente c on c.codigo = k.cliente_codigo;

create or replace view public.v_lst_peticiones with (security_invoker = true) as
select pe.*, pe.tienda_terminal_codigo as tienda, (pe.fecha_hora at time zone 'Atlantic/Canary')::date as fecha,
       public.fn_numero_operario(pe.empleado_peticion_codigo) as empleado_numero,
       coalesce(a.codigo_venta, pe.articulo_codigo) as referencia, a.descripcion as articulo_desc,
       a.familia_codigo as familia, a.proveedor_habitual_codigo as proveedor
  from peticion pe
  left join articulo a on a.codigo_interno = pe.articulo_codigo;

create or replace view public.v_lst_familias with (security_invoker = true) as
select f.*, (select count(*) from articulo a where a.familia_codigo = f.codigo) as articulos
  from familia f;

grant select on public.v_lst_presupuestos, public.v_lst_pedidos, public.v_lst_repartos, public.v_lst_cobros,
  public.v_lst_peticiones, public.v_lst_familias to authenticated;
revoke all on public.v_lst_presupuestos, public.v_lst_pedidos, public.v_lst_repartos, public.v_lst_cobros,
  public.v_lst_peticiones, public.v_lst_familias from anon;

-- Panel de Control (Luis, 29/10/2026): fuera Reparaciones y Tickets de la primera fila (ya salen
-- abajo) y dentro tres tarjetas del día: Presupuestos (hechos, aceptados, pendientes, en
-- seguimiento), Compras (altas del día actualizadas, pendientes de actualizar y abonos, con su nº
-- de pedido, albarán o factura) y Peticiones (por nº de operario y código de venta del artículo).
-- Presupuestos: estado nuevo «en seguimiento» (pedido_cliente.en_seguimiento).

alter table public.pedido_cliente add column if not exists en_seguimiento boolean not null default false;
comment on column public.pedido_cliente.en_seguimiento is 'Presupuesto en seguimiento (se está hablando con el cliente). Estados: aceptado > en seguimiento > pendiente.';

create or replace function public.fn_panel_dia(p_tienda text default null)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $$
  with hoy as (select (now() at time zone 'Atlantic/Canary')::date as d),
  pre as (
    select p.tienda_terminal_codigo, p.numero, p.nombre_cliente, coalesce(p.aceptado, false) as aceptado, p.en_seguimiento,
           public.fn_numero_operario(p.empleado_codigo) as operario
      from pedido_cliente p, hoy
     where p.es_presupuesto and not coalesce(p.anulado, false) and p.fecha = hoy.d
       and (p_tienda is null or p.tienda_terminal_codigo = p_tienda)
  ),
  com as (
    select pp.tienda_terminal_codigo, pp.numero, coalesce(pp.estado, '') as estado, coalesce(pp.es_abono, false) as es_abono, pp.numero_albaran_proveedor as albaran,
           pp.numero_factura_proveedor_externo as factura, pr.nombre as proveedor
      from pedido_proveedor pp
      left join proveedor pr on pr.codigo = pp.proveedor_codigo, hoy
     where (pp.fecha_hora at time zone 'Atlantic/Canary')::date = hoy.d
       and (p_tienda is null or pp.tienda_terminal_codigo = p_tienda)
  ),
  pet as (
    select pe.tienda_terminal_codigo, pe.numero, public.fn_numero_operario(pe.empleado_peticion_codigo) as operario,
           coalesce(a.codigo_venta, pe.articulo_codigo) as codigo_venta, coalesce(nullif(pe.descripcion, ''), a.descripcion) as descripcion,
           pe.cantidad, pe.estado
      from peticion pe
      left join articulo a on a.codigo_interno = pe.articulo_codigo, hoy
     where (pe.fecha_hora at time zone 'Atlantic/Canary')::date = hoy.d
       and (p_tienda is null or pe.tienda_terminal_codigo = p_tienda)
  )
  select jsonb_build_object(
    'presupuestos', jsonb_build_object(
      'total', (select count(*) from pre),
      'aceptados', (select count(*) from pre where aceptado),
      'seguimiento', (select count(*) from pre where not aceptado and en_seguimiento),
      'pendientes', (select count(*) from pre where not aceptado and not en_seguimiento),
      'lista', coalesce((select jsonb_agg(jsonb_build_object('tienda', tienda_terminal_codigo, 'numero', numero, 'cliente', nombre_cliente,
                  'estado', case when aceptado then 'Aceptado' when en_seguimiento then 'En seguimiento' else 'Pendiente' end, 'operario', operario)
                  order by numero) from pre), '[]')),
    'compras', jsonb_build_object(
      'actualizadas', (select count(*) from com where not es_abono and estado in ('recepcionado', 'liquidado')),
      'pendientes', (select count(*) from com where not es_abono and estado not in ('recepcionado', 'liquidado')),
      'abonos', (select count(*) from com where es_abono),
      'lista', coalesce((select jsonb_agg(jsonb_build_object('tienda', tienda_terminal_codigo, 'numero', numero, 'proveedor', proveedor,
                  'albaran', albaran, 'factura', factura, 'abono', es_abono,
                  'tipo', case when es_abono then 'Abono' when estado in ('recepcionado', 'liquidado') then 'Actualizada' else 'Pendiente' end)
                  order by numero) from com), '[]')),
    'peticiones', jsonb_build_object(
      'total', (select count(*) from pet),
      'por_operario', coalesce((select jsonb_agg(jsonb_build_object('operario', operario, 'n', n) order by n desc)
                                  from (select operario, count(*) n from pet group by operario) x), '[]'),
      'lista', coalesce((select jsonb_agg(jsonb_build_object('tienda', tienda_terminal_codigo, 'numero', numero, 'operario', operario,
                  'codigo_venta', codigo_venta, 'descripcion', descripcion, 'cantidad', cantidad, 'estado', estado) order by numero) from pet), '[]'))
  )
$$;
grant execute on function public.fn_panel_dia(text) to authenticated;
revoke execute on function public.fn_panel_dia(text) from anon, public;

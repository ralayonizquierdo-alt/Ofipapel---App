-- Compras con NEXA, fase 1: calcular stocks mínimos/máximos desde el histórico de ventas y proponer qué pedir.
-- Solo lee y propone; escribir mínimos y máximos en los artículos pasa por fn_compras_aplicar_minimos (nivel 4 en NEXA).
-- Las funciones son SECURITY INVOKER: actúan con los permisos de quien las llama.
--
-- Método (por artículo): demanda semanal media y su desviación sobre la ventana de ventas disponible;
--   mínimo   = demanda diaria × plazo de entrega del proveedor + margen de seguridad (z × desviación semanal × √(plazo/7))
--   máximo   = mínimo + demanda diaria × días de cobertura del pedido
-- Con poco histórico no se propone nada (confianza «insuficiente»). Aún no corrige la estacionalidad
-- (septiembre/vuelta al cole): hace falta al menos un año completo de histórico para eso.

create or replace function public.fn_compras_calcular_minimos(
  p_meses int default 12,
  p_cobertura_dias int default 30,
  p_z numeric default 1.65,
  p_plazo_defecto int default 7
)
returns table (
  articulo_codigo text,
  descripcion text,
  proveedor_codigo text,
  stock_actual numeric,
  minimo_actual numeric,
  maximo_actual numeric,
  unidades_vendidas numeric,
  semanas_con_ventas int,
  demanda_diaria numeric,
  plazo_dias int,
  plazo_supuesto boolean,
  minimo_sugerido numeric,
  maximo_sugerido numeric,
  confianza text
)
language sql
stable
set search_path = public
as $$
  with ventana as (
    select (current_date - make_interval(months => greatest(1, least(coalesce(p_meses, 12), 60))))::date as desde
  ),
  hist as (
    select greatest(
             (select desde from ventana),
             coalesce((select min(m.ocurrido_en)::date from movimiento_stock m where m.tipo_movimiento = 'venta'), current_date)
           ) as inicio
  ),
  dias as (
    select (select inicio from hist) as inicio,
           greatest(1, current_date - (select inicio from hist)) as dias_hist
  ),
  semanal as (
    select m.articulo_codigo,
           date_trunc('week', m.ocurrido_en)::date as semana,
           sum(case when m.sentido < 0 then m.cantidad else -m.cantidad end) as uds
      from movimiento_stock m, dias d
     where m.tipo_movimiento = 'venta' and m.ocurrido_en::date >= d.inicio
     group by 1, 2
  ),
  agg as (
    select s.articulo_codigo,
           sum(s.uds) as total,
           count(*) filter (where s.uds > 0) as semanas_ventas,
           sum(s.uds * s.uds) as suma_cuad
      from semanal s
     group by 1
  ),
  calc as (
    select a.articulo_codigo, a.total, a.semanas_ventas::int as semanas_ventas,
           d.dias_hist,
           greatest(1, ceil(d.dias_hist / 7.0))::numeric as n_sem,
           a.suma_cuad
      from agg a, dias d
  ),
  est as (
    select c.*,
           c.total / c.n_sem as media_sem,
           case when c.n_sem > 1
                then sqrt(greatest(0, (c.suma_cuad / c.n_sem - power(c.total / c.n_sem, 2)) * c.n_sem / (c.n_sem - 1)))
                else 0 end as desv_sem
      from calc c
  ),
  stock as (
    select s.articulo_codigo, sum(s.cantidad_actual) as stock_actual
      from articulo_almacen_stock s group by 1
  )
  select ar.codigo_interno::text,
         ar.descripcion::text,
         ar.proveedor_habitual_codigo::text,
         coalesce(st.stock_actual, 0),
         ar.stock_minimo,
         ar.stock_maximo,
         round(e.total, 3),
         e.semanas_ventas,
         round(e.media_sem / 7.0, 4),
         coalesce(nullif(pr.dias_entrega, 0), p_plazo_defecto)::int,
         (nullif(pr.dias_entrega, 0) is null),
         case when e.total > 0 and e.dias_hist >= 90
              then ceil(e.media_sem / 7.0 * coalesce(nullif(pr.dias_entrega, 0), p_plazo_defecto)
                        + p_z * e.desv_sem * sqrt(coalesce(nullif(pr.dias_entrega, 0), p_plazo_defecto) / 7.0)) end,
         case when e.total > 0 and e.dias_hist >= 90
              then ceil(e.media_sem / 7.0 * coalesce(nullif(pr.dias_entrega, 0), p_plazo_defecto)
                        + p_z * e.desv_sem * sqrt(coalesce(nullif(pr.dias_entrega, 0), p_plazo_defecto) / 7.0)
                        + e.media_sem / 7.0 * greatest(1, coalesce(p_cobertura_dias, 30))) end,
         case when e.dias_hist < 90 or e.total <= 0 then 'insuficiente'
              when e.dias_hist >= 365 and e.semanas_ventas >= 12 then 'alta'
              when e.dias_hist >= 180 and e.semanas_ventas >= 6 then 'media'
              else 'baja' end
    from est e
    join articulo ar on ar.codigo_interno = e.articulo_codigo
    left join proveedor pr on pr.codigo = ar.proveedor_habitual_codigo
    left join stock st on st.articulo_codigo = e.articulo_codigo
   where ar.fecha_baja is null and coalesce(ar.activo, true) and not coalesce(ar.sin_control_stock, false)
   order by e.total desc
$$;

-- Qué pedir: artículos cuyo stock (más lo que ya viene en pedidos sin recibir) está en el mínimo o por debajo,
-- agrupados por proveedor habitual, con la cantidad que lo lleva al máximo. Usa los mínimos y máximos ya aprobados.
create or replace function public.fn_compras_propuesta_pedidos(p_proveedor text default null)
returns table (
  proveedor_codigo text,
  proveedor_nombre text,
  articulo_codigo text,
  descripcion text,
  stock_actual numeric,
  pendiente_recibir numeric,
  stock_minimo numeric,
  stock_maximo numeric,
  cantidad_sugerida numeric,
  compra_minima_proveedor numeric
)
language sql
stable
set search_path = public
as $$
  with stock as (
    select s.articulo_codigo, sum(s.cantidad_actual) as stock_actual from articulo_almacen_stock s group by 1
  ),
  pend as (
    select l.articulo_codigo, sum(greatest(0, coalesce(l.total_unidades, l.cantidad, 0) - coalesce(l.unidades_recibidas, 0))) as uds
      from pedido_proveedor_linea l
      join pedido_proveedor p on p.tienda_terminal_codigo = l.tienda_terminal_codigo and p.numero = l.numero
     where p.estado in ('pendiente', 'confirmado') and not coalesce(p.recibido, false) and not coalesce(p.es_abono, false)
     group by 1
  )
  select ar.proveedor_habitual_codigo::text,
         pr.nombre::text,
         ar.codigo_interno::text,
         ar.descripcion::text,
         coalesce(st.stock_actual, 0),
         coalesce(pe.uds, 0),
         ar.stock_minimo,
         ar.stock_maximo,
         greatest(0, ceil(ar.stock_maximo - (coalesce(st.stock_actual, 0) + coalesce(pe.uds, 0)))),
         pr.compra_minima
    from articulo ar
    left join stock st on st.articulo_codigo = ar.codigo_interno
    left join pend pe on pe.articulo_codigo = ar.codigo_interno
    left join proveedor pr on pr.codigo = ar.proveedor_habitual_codigo
   where ar.fecha_baja is null and coalesce(ar.activo, true) and not coalesce(ar.sin_control_stock, false)
     and coalesce(ar.stock_minimo, 0) > 0
     and coalesce(st.stock_actual, 0) + coalesce(pe.uds, 0) <= ar.stock_minimo
     and (p_proveedor is null or ar.proveedor_habitual_codigo = p_proveedor)
   order by ar.proveedor_habitual_codigo, ar.codigo_interno
$$;

-- Escribe en los artículos los mínimos y máximos calculados. Solo los de la confianza pedida (o mejor) y solo
-- los que cambian. Devuelve cuántos ha cambiado. Con los permisos de quien llama (RLS de articulo).
create or replace function public.fn_compras_aplicar_minimos(
  p_confianza_minima text default 'alta',
  p_proveedor text default null,
  p_meses int default 12,
  p_cobertura_dias int default 30
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_niveles text[];
  n int;
begin
  v_niveles := case lower(coalesce(p_confianza_minima, 'alta'))
                 when 'alta' then array['alta']
                 when 'media' then array['alta', 'media']
                 when 'baja' then array['alta', 'media', 'baja']
                 else null end;
  if v_niveles is null then
    raise exception 'La confianza mínima debe ser alta, media o baja.';
  end if;
  update articulo a
     set stock_minimo = c.minimo_sugerido, stock_maximo = c.maximo_sugerido
    from fn_compras_calcular_minimos(p_meses, p_cobertura_dias) c
   where c.articulo_codigo = a.codigo_interno
     and c.confianza = any (v_niveles)
     and c.minimo_sugerido is not null
     and (p_proveedor is null or c.proveedor_codigo = p_proveedor)
     and (a.stock_minimo is distinct from c.minimo_sugerido or a.stock_maximo is distinct from c.maximo_sugerido);
  get diagnostics n = row_count;
  return jsonb_build_object('articulos_cambiados', n, 'confianza_minima', lower(p_confianza_minima));
end;
$$;

revoke execute on function public.fn_compras_calcular_minimos(int, int, numeric, int),
                           public.fn_compras_propuesta_pedidos(text),
                           public.fn_compras_aplicar_minimos(text, text, int, int) from public, anon;
grant execute on function public.fn_compras_calcular_minimos(int, int, numeric, int),
                          public.fn_compras_propuesta_pedidos(text),
                          public.fn_compras_aplicar_minimos(text, text, int, int) to authenticated;

-- Catálogo de NEXA (regla del proyecto: toda función nueva se da de alta aquí).
insert into public.nexa_operacion (codigo, descripcion, tipo, objeto, accion, nivel, permiso, bloqueada, notas, receta) values
  ('funcion:fn_compras_calcular_minimos', 'Calcula mínimos y máximos de stock desde el histórico de ventas (solo lee)', 'funcion',
   'fn_compras_calcular_minimos', '*', 1, null, false, null,
   'Para proponer stocks mínimos: select * from fn_compras_calcular_minimos() y enseña la tabla. Avisa SIEMPRE de la confianza: con confianza «insuficiente» no hay propuesta y con «baja» conviene revisar a mano. Cuenta cuántos artículos hay por confianza. No escribas nada hasta que la persona apruebe.'),
  ('funcion:fn_compras_propuesta_pedidos', 'Qué pedir a cada proveedor según stock, pedidos pendientes y mínimos aprobados (solo lee)', 'funcion',
   'fn_compras_propuesta_pedidos', '*', 1, null, false, null,
   'Para preparar compras: select * from fn_compras_propuesta_pedidos() (o con el código de un proveedor). Agrupa por proveedor, enseña el total de unidades y avisa si no llega a su compra mínima. Es una propuesta: no crees pedidos sin que la persona lo confirme.'),
  ('funcion:fn_compras_aplicar_minimos', 'Escribe en los artículos los mínimos y máximos calculados', 'funcion',
   'fn_compras_aplicar_minimos', '*', 4, '/almacen/modificacion-bloque', false,
   'Cambia muchos artículos de una vez: nivel 4 con motivo.',
   'Antes de aplicar, enseña cuántos artículos cambiarán por confianza. Por defecto solo los de confianza alta; pide permiso expreso a la persona para incluir media o baja.')
on conflict (codigo) do update set descripcion = excluded.descripcion, nivel = excluded.nivel, permiso = excluded.permiso,
                                    notas = excluded.notas, receta = excluded.receta, actualizado_en = now();

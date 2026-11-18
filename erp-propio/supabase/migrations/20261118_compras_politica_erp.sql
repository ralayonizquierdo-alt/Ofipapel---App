-- Gestor de Pedidos 2.0: mínimos y máximos PROPIOS del ERP (18/11/2026, Rober).
--
-- Rober: «los stocks que hay marcados actualmente en Géminis en las fichas nunca se han utilizado y no valen para
-- nada». Así que el Gestor 2.0 deja de mirar articulo.stock_minimo / stock_maximo (que además los vuelve a copiar
-- el espejo de GeminisWin cada día) y usa los suyos:
--
--   · compra_articulo_politica: lo que calcula el ERP para cada artículo con ventas en los últimos 12 meses. La
--     forma ganadora del estudio (fn_compras_estudio_minimos, 20261118_compras_estudio_minimos.sql): venta media
--     de 12 meses + margen para un 95 % de servicio durante el plazo de entrega; máximo = mínimo + 30 días. Tipo:
--     regular (vende 9 o más meses de 12), intermitente (4 a 8) o raro (3 o menos). Es un cálculo: se rehace con
--     fn_compras_politica_calcular y no pasa por la auditoría (como las cargas del espejo); las decisiones sí.
--   · compra_articulo_decision: lo que decide la persona que compra, artículo a artículo, en la pantalla. Sin
--     límite de precio (Rober: «es cuestión de decidirlo en la misma pantalla»): un raro sale «por decidir» hasta
--     que se marca «en stock» o «bajo pedido». Bajo pedido = sin mínimo: solo se pide si lo pide un cliente.
--     Mientras está por decidir, un raro tampoco tiene mínimo (muchos ya se traen bajo pedido; con mínimo, la primera
--     propuesta traía 6.890 raros sin stock): la pestaña «Raros» enseña primero los que hoy tienen stock.
--   · compra_proveedor_condicion: plazo de entrega, pedido mínimo y portes gratis de cada proveedor, puestos en el
--     ERP. Mandan sobre los de la ficha de GeminisWin (más de la mitad de los artículos tienen proveedor con 20
--     días de plazo, que parece un valor por defecto) y el espejo no los pisa.
--
-- La propuesta semanal (fn_compras_semanal_propuesta / _proveedores) usa todo esto, redondea a la caja del artículo
-- y enseña la última compra y cuánto dura al ritmo de venta actual.

---------------------------------------------------------------------------------------------------- tablas
create table if not exists public.compra_proveedor_condicion (
  proveedor_codigo text primary key references public.proveedor(codigo),
  plazo_dias integer check (plazo_dias is null or plazo_dias between 0 and 120),
  pedido_minimo numeric(12, 2) check (pedido_minimo is null or pedido_minimo >= 0),
  portes_gratis_desde numeric(12, 2) check (portes_gratis_desde is null or portes_gratis_desde >= 0),
  notas text,
  actualizado_por text default public.fn_empleado_actual(),
  actualizado_en timestamptz not null default now()
);
comment on table public.compra_proveedor_condicion is
  'Condiciones de compra de cada proveedor puestas en el ERP (Gestor de Pedidos 2.0): plazo de entrega, pedido mínimo y portes gratis. Mandan sobre la ficha de GeminisWin.';

create table if not exists public.compra_articulo_decision (
  articulo_codigo text primary key references public.articulo(codigo_interno),
  decision text check (decision is null or decision in ('stock', 'bajo_pedido')),
  motivo text,
  decidido_por text default public.fn_empleado_actual(),
  decidido_en timestamptz not null default now()
);
comment on table public.compra_articulo_decision is
  'Decisión de compra por artículo (Gestor de Pedidos 2.0): «stock» (se repone con mínimo y máximo) o «bajo_pedido» (solo si lo pide un cliente). Vacía = sin decidir.';

create table if not exists public.compra_articulo_politica (
  articulo_codigo text primary key references public.articulo(codigo_interno),
  tipo text not null check (tipo in ('regular', 'intermitente', 'raro', 'sin_ventas')),
  meses_con_venta integer not null default 0,
  venta_12m numeric not null default 0,
  venta_mes numeric not null default 0,
  desviacion numeric not null default 0,
  plazo_dias integer not null default 7,
  minimo numeric not null default 0,
  maximo numeric not null default 0,
  ultima_compra_uds numeric,
  ultima_compra_fecha date,
  dias_dura_compra integer,
  calculado_en timestamptz not null default now()
);
comment on table public.compra_articulo_politica is
  'Mínimo y máximo calculados por el ERP para cada artículo (Gestor de Pedidos 2.0). Cálculo: venta media de 12 meses + margen del 95 % durante el plazo; máximo = mínimo + 30 días. Se rehace con fn_compras_politica_calcular.';
create index if not exists compra_articulo_politica_tipo_idx on public.compra_articulo_politica (tipo);

do $$
declare t text;
begin
  foreach t in array array['compra_proveedor_condicion', 'compra_articulo_decision', 'compra_articulo_politica'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policy where polname = t || '_lee' and polrelid = ('public.' || t)::regclass) then
      execute format('create policy %I on public.%I for select to authenticated using ((select public.fn_puede(''/gestor-pedidos-proveedor'')))', t || '_lee', t);
    end if;
    execute format('revoke all on public.%I from anon', t);
  end loop;
  if not exists (select 1 from pg_trigger where tgname = 'trg_auditoria_compra_proveedor_condicion') then
    create trigger trg_auditoria_compra_proveedor_condicion after insert or update on public.compra_proveedor_condicion
      for each row execute function public.fn_auditoria_trigger();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_auditoria_compra_articulo_decision') then
    create trigger trg_auditoria_compra_articulo_decision after insert or update on public.compra_articulo_decision
      for each row execute function public.fn_auditoria_trigger();
  end if;
end $$;

------------------------------------------------------------------------------------------------- cálculo
-- Aplica mínimo y máximo a partir de lo guardado (venta, desviación), el plazo actual del proveedor y la decisión.
-- Solo la llaman las funciones de abajo.
create or replace function public.fn_compras_politica_aplicar(p_articulo text default null, p_proveedor text default null)
returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_n int;
begin
  -- Sin mínimo: bajo pedido, sin ventas, o raro sin decidir (se traen bajo pedido mientras nadie diga «en stock»).
  update compra_articulo_politica p
     set plazo_dias = x.plazo,
         minimo = case when x.decision = 'bajo_pedido' or p.venta_12m <= 0 or (p.tipo = 'raro' and x.decision is null) then 0
                       else ceil(p.venta_mes / 30.44 * x.plazo + 1.65 * p.desviacion * sqrt(x.plazo / 30.44)) end,
         maximo = case when x.decision = 'bajo_pedido' or p.venta_12m <= 0 or (p.tipo = 'raro' and x.decision is null) then 0
                       else ceil(p.venta_mes / 30.44 * x.plazo + 1.65 * p.desviacion * sqrt(x.plazo / 30.44) + p.venta_mes / 30.44 * 30) end
    from (select ar.codigo_interno art, d.decision,
                 least(60, greatest(1, coalesce(c.plazo_dias, nullif(greatest(coalesce(pr.dias_entrega, 0), 0), 0), 7))) plazo
            from articulo ar
            left join proveedor pr on pr.codigo = ar.proveedor_habitual_codigo
            left join compra_proveedor_condicion c on c.proveedor_codigo = ar.proveedor_habitual_codigo
            left join compra_articulo_decision d on d.articulo_codigo = ar.codigo_interno
           where (p_articulo is null or ar.codigo_interno = p_articulo)
             and (p_proveedor is null or ar.proveedor_habitual_codigo = p_proveedor)) x
   where p.articulo_codigo = x.art;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.fn_compras_politica_aplicar(text, text) from public, anon, authenticated;

-- Recalcula todo con los últimos 12 meses de ventas. Tarda unos segundos; se lanza desde la pantalla
-- («Recalcular mínimos») o cuando llegan ventas nuevas.
create or replace function public.fn_compras_politica_calcular()
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' set statement_timeout to '300s' as $$
declare v_fin date := (select max(mes) from venta_historico_mensual); v_ini date; v_n int; v_cero int;
begin
  if not fn_puede('/gestor-pedidos-proveedor') then
    raise exception 'No tienes permiso del Gestor de Pedidos a Proveedores. Pídelo a un administrador.' using errcode = '42501';
  end if;
  if v_fin is null then raise exception 'No hay ventas históricas cargadas para calcular.'; end if;
  v_ini := (v_fin - interval '11 months')::date;

  with v as (select articulo_codigo art, mes, greatest(sum(unidades), 0) u from venta_historico_mensual
              where mes between v_ini and v_fin group by 1, 2),
  agg as (select art, sum(u) tot, sum(u * u) sq, count(*) filter (where u > 0) mv from v group by art),
  base as (
    select ar.codigo_interno art, a.tot, a.mv, a.tot / 12.0 media,
           sqrt(greatest(0, (a.sq / 12.0 - power(a.tot / 12.0, 2)) * 12 / 11.0)) sd,
           coalesce(nullif(ap.ultimas_unidades_compradas, 0), nullif(ar.ultimas_unidades_compradas, 0)) ult_uds,
           coalesce(ap.ultima_compra_fecha, ar.ultima_compra_fecha) ult_fecha
      from agg a
      join articulo ar on ar.codigo_interno = a.art
      left join articulo_proveedor ap on ap.articulo_codigo = ar.codigo_interno and ap.proveedor_codigo = ar.proveedor_habitual_codigo
     where ar.fecha_baja is null and coalesce(ar.activo, true) and not coalesce(ar.sin_control_stock, false))
  insert into compra_articulo_politica as p (articulo_codigo, tipo, meses_con_venta, venta_12m, venta_mes, desviacion, ultima_compra_uds,
                                             ultima_compra_fecha, dias_dura_compra, calculado_en)
  select art, case when mv >= 9 then 'regular' when mv >= 4 then 'intermitente' when tot > 0 then 'raro' else 'sin_ventas' end,
         mv, tot, round(media, 4), round(sd, 4), ult_uds, ult_fecha,
         case when media > 0 and ult_uds > 0 then least(9999, round(ult_uds / (media / 30.44)))::int end, now()
    from base
  on conflict (articulo_codigo) do update set
    tipo = excluded.tipo, meses_con_venta = excluded.meses_con_venta, venta_12m = excluded.venta_12m, venta_mes = excluded.venta_mes,
    desviacion = excluded.desviacion, ultima_compra_uds = excluded.ultima_compra_uds, ultima_compra_fecha = excluded.ultima_compra_fecha,
    dias_dura_compra = excluded.dias_dura_compra, calculado_en = excluded.calculado_en;
  get diagnostics v_n = row_count;

  -- Los que ya no han vendido nada en 12 meses se quedan sin mínimo.
  update compra_articulo_politica set tipo = 'sin_ventas', meses_con_venta = 0, venta_12m = 0, venta_mes = 0, desviacion = 0,
         dias_dura_compra = null, calculado_en = now()
   where calculado_en < now() - interval '1 second' and tipo <> 'sin_ventas';
  get diagnostics v_cero = row_count;

  perform fn_compras_politica_aplicar(null, null);
  return jsonb_build_object('ok', true, 'desde', v_ini, 'hasta', v_fin, 'articulos', v_n, 'dejan_de_vender', v_cero) || fn_compras_politica_estado();
end $$;
revoke all on function public.fn_compras_politica_calcular() from public, anon;
grant execute on function public.fn_compras_politica_calcular() to authenticated;

-- Cómo está el cálculo (para la cabecera de la pantalla).
create or replace function public.fn_compras_politica_estado()
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select jsonb_build_object(
    'calculado_en', max(p.calculado_en),
    'con_minimo', count(*) filter (where p.minimo > 0),
    'regulares', count(*) filter (where p.tipo = 'regular'),
    'intermitentes', count(*) filter (where p.tipo = 'intermitente'),
    'raros', count(*) filter (where p.tipo = 'raro'),
    'raros_por_decidir', count(*) filter (where p.tipo = 'raro' and d.decision is null),
    'bajo_pedido', (select count(*) from compra_articulo_decision where decision = 'bajo_pedido'))
    from compra_articulo_politica p left join compra_articulo_decision d on d.articulo_codigo = p.articulo_codigo
   where fn_puede('/gestor-pedidos-proveedor')
$$;
revoke all on function public.fn_compras_politica_estado() from public, anon;
grant execute on function public.fn_compras_politica_estado() to authenticated;

------------------------------------------------------------------------------------------ decisiones
create or replace function public.fn_compras_articulo_decidir(p_articulo text, p_decision text, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare p compra_articulo_politica;
begin
  if not fn_puede('/gestor-pedidos-proveedor') then
    raise exception 'No tienes permiso del Gestor de Pedidos a Proveedores. Pídelo a un administrador.' using errcode = '42501';
  end if;
  if p_decision is not null and p_decision not in ('stock', 'bajo_pedido') then raise exception 'Elige «en stock» o «bajo pedido».'; end if;
  if not exists (select 1 from articulo where codigo_interno = p_articulo) then raise exception 'No existe el artículo %.', p_articulo; end if;
  insert into compra_articulo_decision (articulo_codigo, decision, motivo) values (p_articulo, p_decision, nullif(btrim(p_motivo), ''))
  on conflict (articulo_codigo) do update set decision = excluded.decision, motivo = excluded.motivo,
         decidido_por = public.fn_empleado_actual(), decidido_en = now();
  perform fn_compras_politica_aplicar(p_articulo, null);
  select * into p from compra_articulo_politica where articulo_codigo = p_articulo;
  return jsonb_build_object('ok', true, 'decision', p_decision, 'minimo', p.minimo, 'maximo', p.maximo);
end $$;
revoke all on function public.fn_compras_articulo_decidir(text, text, text) from public, anon;
grant execute on function public.fn_compras_articulo_decidir(text, text, text) to authenticated;

create or replace function public.fn_compras_proveedor_condicion_poner(p_proveedor text, p_plazo_dias integer, p_pedido_minimo numeric,
                                                                       p_portes_gratis_desde numeric, p_notas text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_n int;
begin
  if not fn_puede('/gestor-pedidos-proveedor') then
    raise exception 'No tienes permiso del Gestor de Pedidos a Proveedores. Pídelo a un administrador.' using errcode = '42501';
  end if;
  if not exists (select 1 from proveedor where codigo = p_proveedor) then raise exception 'No existe el proveedor %.', p_proveedor; end if;
  if p_plazo_dias is not null and (p_plazo_dias < 0 or p_plazo_dias > 120) then raise exception 'El plazo de entrega va de 0 a 120 días.'; end if;
  if coalesce(p_pedido_minimo, 0) < 0 or coalesce(p_portes_gratis_desde, 0) < 0 then raise exception 'Los importes no pueden ser negativos.'; end if;
  insert into compra_proveedor_condicion (proveedor_codigo, plazo_dias, pedido_minimo, portes_gratis_desde, notas)
  values (p_proveedor, p_plazo_dias, p_pedido_minimo, p_portes_gratis_desde, nullif(btrim(p_notas), ''))
  on conflict (proveedor_codigo) do update set plazo_dias = excluded.plazo_dias, pedido_minimo = excluded.pedido_minimo,
         portes_gratis_desde = excluded.portes_gratis_desde, notas = excluded.notas,
         actualizado_por = public.fn_empleado_actual(), actualizado_en = now();
  v_n := fn_compras_politica_aplicar(null, p_proveedor);
  return jsonb_build_object('ok', true, 'articulos_recalculados', v_n);
end $$;
revoke all on function public.fn_compras_proveedor_condicion_poner(text, integer, numeric, numeric, text) from public, anon;
grant execute on function public.fn_compras_proveedor_condicion_poner(text, integer, numeric, numeric, text) to authenticated;

------------------------------------------------------------------------------------ propuesta semanal
-- Como fn_compras_semanal_lineas, pero con los mínimos del ERP, las decisiones, la caja y la última compra.
create or replace function public.fn_compras_semanal_propuesta(p_proveedor text default null)
returns table (
  proveedor_codigo text, proveedor_nombre text, articulo_codigo text, descripcion text, referencia_compra text,
  stock_actual numeric, pendiente_recibir numeric, stock_minimo numeric, stock_maximo numeric, peticiones numeric,
  cantidad_sugerida numeric, unidades_por_caja numeric, coste numeric, importe numeric,
  mejor_proveedor text, mejor_proveedor_nombre text, mejor_coste numeric,
  tipo text, decision text, venta_mes numeric, plazo_dias integer, ultima_compra_uds numeric, ultima_compra_fecha date, dias_dura_compra integer
)
language sql stable security invoker set search_path to 'public' as $$
  with stock as (
    select s.articulo_codigo, sum(s.cantidad_actual) as uds from articulo_almacen_stock s group by 1
  ),
  pend as (
    select l.articulo_codigo, sum(greatest(0, coalesce(l.total_unidades, l.cantidad, 0) - coalesce(l.unidades_recibidas, 0))) as uds
      from pedido_proveedor_linea l
      join pedido_proveedor p on p.tienda_terminal_codigo = l.tienda_terminal_codigo and p.numero = l.numero
     where p.estado in ('pendiente', 'confirmado') and not coalesce(p.recibido, false) and not coalesce(p.es_abono, false)
     group by 1
  ),
  pet as (
    select pt.articulo_codigo, coalesce(nullif(pt.proveedor_codigo, ''), ar.proveedor_habitual_codigo) as prov,
           sum(greatest(0, coalesce(pt.cantidad, 0) - coalesce(pt.cantidad_tramitada, 0))) as uds
      from peticion pt
      join articulo ar on ar.codigo_interno = pt.articulo_codigo
     where pt.estado in ('pendiente', 'atendida')
     group by 1, 2
  ),
  pares as (
    select ar.codigo_interno as art, ar.proveedor_habitual_codigo as prov
      from compra_articulo_politica po
      join articulo ar on ar.codigo_interno = po.articulo_codigo
     where po.minimo > 0 and ar.proveedor_habitual_codigo is not null
    union
    select pet.articulo_codigo, pet.prov from pet where pet.prov is not null and pet.uds > 0
  ),
  base as (
    select x.prov, ar.codigo_interno, ar.descripcion, ar.unidades_por_caja, ar.coste_neto,
           coalesce(st.uds, 0) as stock, coalesce(pe.uds, 0) as camino, coalesce(pt.uds, 0) as pedidas,
           case when x.prov = ar.proveedor_habitual_codigo then coalesce(po.minimo, 0) else 0 end as minimo,
           case when x.prov = ar.proveedor_habitual_codigo then coalesce(po.maximo, 0) else 0 end as maximo,
           po.tipo, d.decision, po.venta_mes, po.plazo_dias, po.ultima_compra_uds, po.ultima_compra_fecha, po.dias_dura_compra
      from pares x
      join articulo ar on ar.codigo_interno = x.art
      left join compra_articulo_politica po on po.articulo_codigo = ar.codigo_interno
      left join compra_articulo_decision d on d.articulo_codigo = ar.codigo_interno
      left join stock st on st.articulo_codigo = ar.codigo_interno
      left join pend pe on pe.articulo_codigo = ar.codigo_interno
      left join pet pt on pt.articulo_codigo = ar.codigo_interno and pt.prov = x.prov
     where ar.fecha_baja is null and coalesce(ar.activo, true) and not coalesce(ar.sin_control_stock, false)
       and (p_proveedor is null or x.prov = p_proveedor)
  ),
  calc as (
    select b.*,
           case when b.minimo > 0 and b.stock + b.camino - b.pedidas <= b.minimo
                  then greatest(0, ceil(greatest(b.maximo, b.minimo) - (b.stock + b.camino - b.pedidas)))
                when b.minimo > 0 then 0
                else greatest(0, ceil(b.pedidas - greatest(b.stock + b.camino, 0)))
           end as pedir0
      from base b
  ),
  calc2 as (
    -- Por mínimo y máximo, a cajas completas; lo pedido por clientes, justo lo que falta.
    select c.*, case when c.minimo > 0 and coalesce(c.unidades_por_caja, 0) > 1 and c.pedir0 > 0
                     then ceil(c.pedir0 / c.unidades_por_caja) * c.unidades_por_caja else c.pedir0 end as pedir
      from calc c
  )
  select c.prov::text, pr.nombre::text, c.codigo_interno::text, c.descripcion::text, ap.codigo_compra::text,
         c.stock, c.camino, c.minimo, c.maximo, c.pedidas, c.pedir, nullif(c.unidades_por_caja, 0),
         k.coste, round(c.pedir * k.coste, 2), m.proveedor_codigo::text, m.nombre::text, m.coste_neto,
         c.tipo, c.decision, round(c.venta_mes, 2), c.plazo_dias, c.ultima_compra_uds, c.ultima_compra_fecha, c.dias_dura_compra
    from calc2 c
    left join proveedor pr on pr.codigo = c.prov
    left join articulo_proveedor ap on ap.articulo_codigo = c.codigo_interno and ap.proveedor_codigo = c.prov
    cross join lateral (select coalesce(nullif(ap.coste_neto, 0), nullif(c.coste_neto, 0), 0) as coste) k
    left join lateral (
      select o.proveedor_codigo, p2.nombre, o.coste_neto
        from articulo_proveedor o
        join proveedor p2 on p2.codigo = o.proveedor_codigo and coalesce(p2.activo, true)
       where o.articulo_codigo = c.codigo_interno and o.proveedor_codigo <> c.prov
         and o.coste_neto > 0 and k.coste > 0 and o.coste_neto < k.coste
       order by o.coste_neto
       limit 1
    ) m on true
   where c.pedir > 0
$$;
revoke all on function public.fn_compras_semanal_propuesta(text) from public, anon;
grant execute on function public.fn_compras_semanal_propuesta(text) to authenticated;

create or replace function public.fn_compras_semanal_proveedores()
returns table (
  proveedor_codigo text, proveedor_nombre text, articulos integer, agotados integer, con_peticion integer,
  unidades numeric, importe numeric, compra_minima numeric, dias_entrega integer, ultimo_pedido date,
  mas_baratos_en_otro integer, aplazado_hasta date, aplazado_motivo text,
  portes_gratis_desde numeric, condiciones_erp boolean, raros_por_decidir integer
)
language sql stable security invoker set search_path to 'public' as $$
  select l.proveedor_codigo, max(l.proveedor_nombre), count(*)::integer,
         count(*) filter (where l.stock_actual <= 0)::integer,
         count(*) filter (where l.peticiones > 0)::integer,
         sum(l.cantidad_sugerida), sum(l.importe),
         coalesce(max(c.pedido_minimo), max(pr.compra_minima)),
         coalesce(max(c.plazo_dias), max(pr.dias_entrega))::integer,
         max(pr.fecha_ultimo_pedido),
         count(l.mejor_proveedor)::integer,
         max(a.hasta) filter (where a.hasta >= current_date), max(a.motivo) filter (where a.hasta >= current_date),
         max(c.portes_gratis_desde), bool_or(c.proveedor_codigo is not null),
         count(*) filter (where l.tipo = 'raro' and l.decision is null)::integer
    from public.fn_compras_semanal_propuesta(null) l
    left join public.proveedor pr on pr.codigo = l.proveedor_codigo
    left join public.compra_proveedor_condicion c on c.proveedor_codigo = l.proveedor_codigo
    left join public.compra_propuesta_aplazada a on a.proveedor_codigo = l.proveedor_codigo
   group by l.proveedor_codigo
$$;
revoke all on function public.fn_compras_semanal_proveedores() from public, anon;
grant execute on function public.fn_compras_semanal_proveedores() to authenticated;

-- Raros para decidir uno a uno (o todos, con p_todos): lo que se ha vendido, cuánto stock hay parado y la decisión.
create or replace function public.fn_compras_raros(p_proveedor text default null, p_todos boolean default false)
returns table (articulo_codigo text, descripcion text, proveedor_codigo text, proveedor_nombre text, meses_con_venta integer,
               venta_12m numeric, coste numeric, stock_actual numeric, valor_stock numeric, minimo numeric, maximo numeric,
               decision text, motivo text, peticiones_abiertas numeric)
language sql stable security invoker set search_path to 'public' as $$
  select po.articulo_codigo, ar.descripcion, ar.proveedor_habitual_codigo, pr.nombre, po.meses_con_venta, po.venta_12m,
         coalesce(nullif(ar.coste_neto, 0), 0), coalesce(st.uds, 0), round(coalesce(st.uds, 0) * coalesce(ar.coste_neto, 0), 2),
         po.minimo, po.maximo, d.decision, d.motivo,
         (select sum(greatest(0, coalesce(pt.cantidad, 0) - coalesce(pt.cantidad_tramitada, 0))) from peticion pt
           where pt.articulo_codigo = po.articulo_codigo and pt.estado in ('pendiente', 'atendida'))
    from compra_articulo_politica po
    join articulo ar on ar.codigo_interno = po.articulo_codigo
    left join proveedor pr on pr.codigo = ar.proveedor_habitual_codigo
    left join compra_articulo_decision d on d.articulo_codigo = po.articulo_codigo
    left join (select s.articulo_codigo, sum(s.cantidad_actual) uds from articulo_almacen_stock s group by 1) st on st.articulo_codigo = po.articulo_codigo
   where po.tipo = 'raro' and (p_todos or d.decision is null)
     and (p_proveedor is null or ar.proveedor_habitual_codigo = p_proveedor)
   order by coalesce(st.uds, 0) * coalesce(ar.coste_neto, 0) desc, po.venta_12m desc
   limit 500
$$;
revoke all on function public.fn_compras_raros(text, boolean) from public, anon;
grant execute on function public.fn_compras_raros(text, boolean) to authenticated;

-- Decidir varios a la vez (pestaña «Raros», «Marcar todos»).
create or replace function public.fn_compras_articulos_decidir(p_articulos text[], p_decision text, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_n int;
begin
  if not fn_puede('/gestor-pedidos-proveedor') then
    raise exception 'No tienes permiso del Gestor de Pedidos a Proveedores. Pídelo a un administrador.' using errcode = '42501';
  end if;
  if p_decision is not null and p_decision not in ('stock', 'bajo_pedido') then raise exception 'Elige «en stock» o «bajo pedido».'; end if;
  if coalesce(array_length(p_articulos, 1), 0) = 0 then raise exception 'Marca algún artículo.'; end if;
  if array_length(p_articulos, 1) > 2000 then raise exception 'Como mucho 2.000 artículos a la vez.'; end if;
  insert into compra_articulo_decision (articulo_codigo, decision, motivo)
  select a.codigo_interno, p_decision, nullif(btrim(p_motivo), '') from articulo a where a.codigo_interno = any (p_articulos)
  on conflict (articulo_codigo) do update set decision = excluded.decision, motivo = excluded.motivo,
         decidido_por = public.fn_empleado_actual(), decidido_en = now();
  get diagnostics v_n = row_count;
  update compra_articulo_politica p
     set minimo = case when p_decision = 'bajo_pedido' or p.venta_12m <= 0 or (p.tipo = 'raro' and p_decision is null) then 0
                       else ceil(p.venta_mes / 30.44 * p.plazo_dias + 1.65 * p.desviacion * sqrt(p.plazo_dias / 30.44)) end,
         maximo = case when p_decision = 'bajo_pedido' or p.venta_12m <= 0 or (p.tipo = 'raro' and p_decision is null) then 0
                       else ceil(p.venta_mes / 30.44 * p.plazo_dias + 1.65 * p.desviacion * sqrt(p.plazo_dias / 30.44) + p.venta_mes / 30.44 * 30) end
   where p.articulo_codigo = any (p_articulos);
  return jsonb_build_object('ok', true, 'articulos', v_n);
end $$;
revoke all on function public.fn_compras_articulos_decidir(text[], text, text) from public, anon;
grant execute on function public.fn_compras_articulos_decidir(text[], text, text) to authenticated;

-- Histórico de ventas de GeminisWin para NEXA (Rober, 13/11/2026).
--
-- En carga_dbf había, sin usar, el resumen HIST_VENTAS: por artículo y almacén, las unidades y la
-- base vendidas cada mes de 2023-11 a 2026-10 (36 meses). No son tickets: no hay cliente ni
-- documento, así que no va a las pantallas de Ventas. Sirve para que NEXA calcule los stocks
-- mínimos y máximos con tres años de ventas reales, en vez de con las ventas de prueba del ERP.
--
-- 1) Tabla venta_historico_mensual (solo los meses con movimiento; un mes que no está = 0).
-- 2) fn_carga_gw_hist_ventas(): la rellena desde carga_dbf. Repetible (upsert).
-- 3) fn_compras_calcular_minimos pasa a calcular por MESES: histórico de GeminisWin + ventas del
--    ERP de los meses posteriores al último mes del histórico (para no contar nada dos veces).

create table if not exists public.venta_historico_mensual (
  articulo_codigo text not null,          -- sin clave ajena: el histórico trae artículos que aún no están cargados
  almacen_codigo text not null,
  mes date not null,                      -- primer día del mes
  unidades numeric(14, 3) not null default 0,
  base numeric(14, 2) not null default 0,
  origen text not null default 'geminiswin',
  primary key (articulo_codigo, almacen_codigo, mes)
);
create index if not exists venta_historico_mensual_mes_idx on public.venta_historico_mensual (mes);
comment on table public.venta_historico_mensual is
  'Ventas por artículo, almacén y mes traídas de GeminisWin (resumen HIST_VENTAS). Solo meses con movimiento. La usa fn_compras_calcular_minimos.';

alter table public.venta_historico_mensual enable row level security;
revoke all on public.venta_historico_mensual from public, anon, authenticated;
grant select on public.venta_historico_mensual to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'venta_historico_mensual' and policyname = 'venta_historico_mensual_lee') then
    -- Lo leen quienes trabajan con compras, artículos o listados de ventas (y los administradores).
    create policy venta_historico_mensual_lee on public.venta_historico_mensual for select to authenticated
      using ((select public.fn_puede_alguno('{/pedidos-proveedor,/articulos,/listados-ventas,/almacen/modificacion-bloque}'::text[])));
  end if;
end $$;

create or replace function public.fn_carga_gw_hist_ventas() returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare v_n bigint;
begin
  insert into public.venta_historico_mensual (articulo_codigo, almacen_codigo, mes, unidades, base)
  select h.datos ->> 'COD_INTERN', coalesce(nullif(h.datos ->> 'ALMACEN', ''), '00'),
         (to_date(h.datos ->> 'DESDE', 'YYYY-MM') + make_interval(months => (u.i - 1)::int))::date,
         sum(u.v::numeric), sum(coalesce((h.datos -> 'BASE_MES' ->> (u.i - 1)::int)::numeric, 0))
    from public.carga_dbf h
    cross join lateral jsonb_array_elements_text(h.datos -> 'UNIDADES_MES') with ordinality as u(v, i)
   where h.tabla = 'HIST_VENTAS' and coalesce(h.datos ->> 'COD_INTERN', '') <> ''
     and (u.v::numeric <> 0 or coalesce((h.datos -> 'BASE_MES' ->> (u.i - 1)::int)::numeric, 0) <> 0)
   group by 1, 2, 3
  on conflict (articulo_codigo, almacen_codigo, mes) do update set unidades = excluded.unidades, base = excluded.base;
  get diagnostics v_n = row_count;
  return jsonb_build_object('filas', v_n);
end $$;
revoke execute on function public.fn_carga_gw_hist_ventas() from public, anon, authenticated;

select public.fn_carga_gw_hist_ventas();

-- Mínimos y máximos, ahora por meses. Mismas columnas de salida que antes; «semanas_con_ventas»
-- pasa a contar MESES con ventas (el nombre se conserva para no romper a quien la llama).
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
  with lim as (
    select (date_trunc('month', current_date) - interval '1 month')::date as fin,                      -- último mes completo
           (date_trunc('month', current_date) - make_interval(months => greatest(1, least(coalesce(p_meses, 12), 60))))::date as desde,
           (select max(mes) from venta_historico_mensual) as fin_hist,
           (select min(mes) from venta_historico_mensual) as ini_hist
  ),
  rango as (
    -- Meses de la ventana para los que hay datos (del histórico o del ERP).
    select greatest(l.desde, coalesce(l.ini_hist,
             (select date_trunc('month', min(m.ocurrido_en))::date from movimiento_stock m where m.tipo_movimiento = 'venta'), l.fin)) as inicio,
           l.fin, l.fin_hist
      from lim l
  ),
  n as (
    select r.*, greatest(0, (extract(year from age(r.fin, r.inicio)) * 12 + extract(month from age(r.fin, r.inicio)))::int + 1) as n_meses from rango r
  ),
  mensual as (
    select h.articulo_codigo, h.mes, sum(h.unidades) as uds
      from venta_historico_mensual h, n
     where h.mes between n.inicio and n.fin
     group by 1, 2
    union all
    select m.articulo_codigo, date_trunc('month', m.ocurrido_en)::date, sum(case when m.sentido < 0 then m.cantidad else -m.cantidad end)
      from movimiento_stock m, n
     where m.tipo_movimiento = 'venta'
       and date_trunc('month', m.ocurrido_en)::date between n.inicio and n.fin
       and (n.fin_hist is null or date_trunc('month', m.ocurrido_en)::date > n.fin_hist)
     group by 1, 2
  ),
  agg as (
    select s.articulo_codigo, sum(s.uds) as total, count(*) filter (where s.uds > 0) as meses_ventas, sum(s.uds * s.uds) as suma_cuad
      from mensual s group by 1
  ),
  est as (
    select a.articulo_codigo, a.total, a.meses_ventas::int as meses_ventas, n.n_meses,
           a.total / greatest(1, n.n_meses) as media_mes,
           case when n.n_meses > 1
                then sqrt(greatest(0, (a.suma_cuad / n.n_meses - power(a.total / n.n_meses, 2)) * n.n_meses / (n.n_meses - 1)))
                else 0 end as desv_mes
      from agg a, n
  ),
  stock as (
    select s.articulo_codigo, sum(s.cantidad_actual) as stock_actual
      from articulo_almacen_stock s group by 1
  ),
  f as (
    select e.*, ar.codigo_interno, ar.descripcion, ar.proveedor_habitual_codigo, ar.stock_minimo, ar.stock_maximo,
           coalesce(nullif(pr.dias_entrega, 0), p_plazo_defecto)::numeric as plazo, (nullif(pr.dias_entrega, 0) is null) as plazo_supuesto,
           e.media_mes / 30.4375 as dd, coalesce(st.stock_actual, 0) as stock_actual
      from est e
      join articulo ar on ar.codigo_interno = e.articulo_codigo
      left join proveedor pr on pr.codigo = ar.proveedor_habitual_codigo
      left join stock st on st.articulo_codigo = e.articulo_codigo
     where ar.fecha_baja is null and coalesce(ar.activo, true) and not coalesce(ar.sin_control_stock, false)
  )
  select f.codigo_interno::text, f.descripcion::text, f.proveedor_habitual_codigo::text, f.stock_actual, f.stock_minimo, f.stock_maximo,
         round(f.total, 3), f.meses_ventas, round(f.dd, 4), f.plazo::int, f.plazo_supuesto,
         case when f.total > 0 and f.n_meses >= 3
              then ceil(f.dd * f.plazo + p_z * f.desv_mes * sqrt(f.plazo / 30.4375)) end,
         case when f.total > 0 and f.n_meses >= 3
              then ceil(f.dd * f.plazo + p_z * f.desv_mes * sqrt(f.plazo / 30.4375) + f.dd * greatest(1, coalesce(p_cobertura_dias, 30))) end,
         case when f.n_meses < 3 or f.total <= 0 then 'insuficiente'
              when f.n_meses >= 12 and f.meses_ventas >= 6 then 'alta'
              when f.n_meses >= 6 and f.meses_ventas >= 3 then 'media'
              else 'baja' end
    from f
   order by f.total desc
$$;

update public.nexa_operacion set
  descripcion = 'Calcula mínimos y máximos de stock desde el histórico de ventas por meses (GeminisWin + ERP; solo lee)',
  receta = 'Para proponer stocks mínimos: select * from fn_compras_calcular_minimos() y enseña la tabla. Usa las ventas por MESES: el histórico de GeminisWin (2023-11 a 2026-10) más las ventas del ERP de los meses posteriores; por defecto mira los últimos 12 meses completos (primer parámetro, hasta 60). La columna semanas_con_ventas cuenta MESES con ventas. Avisa SIEMPRE de la confianza: con «insuficiente» no hay propuesta y con «baja» conviene revisar a mano. Cuenta cuántos artículos hay por confianza. No corrige la estacionalidad (vuelta al cole). No escribas nada hasta que la persona apruebe.',
  actualizado_en = now()
where codigo = 'funcion:fn_compras_calcular_minimos';

-- Archivo → Parámetros, Zonas de servicio, Carga Cotización y Facturación → Liquidación
-- (28/10/2026, SIN CAPTURA de GeminisWin).
--
-- 1) `parametro`: parámetros generales del programa que no tienen sitio en otra tabla
--    (los de tienda, empresa, VeriFactu y web siguen en sus tablas). Clave + valor jsonb.
--    Lectura: cualquier empleado con sesión. Alta y modificación: solo administradores (RLS).
-- 2) `zona_servicio`: maestro sencillo (código, descripción, observaciones, baja lógica) y su
--    lista ordenada (Ctrl+Intro) en una función propia, sin tocar gw_lista_ordenada_archivo.
-- 3) `moneda_cotizacion`: histórico de cotizaciones cargadas (a mano o del BCE).
-- 4) Liquidación de comisiones a vendedores, técnicos y repartidores: cálculo
--    (fn_liquidacion_comisiones_calculo), liquidar (…_liquidar) y anular (…_anular), con las
--    liquidaciones guardadas en `liquidacion_comision` y sus documentos (una venta solo se
--    liquida una vez por tipo de agente mientras la liquidación no se anule).
-- No se borra nada: las bajas son lógicas y las liquidaciones se anulan.

-- ---------------------------------------------------------------------------------------
-- 1) Parámetros generales
-- ---------------------------------------------------------------------------------------
create table if not exists public.parametro (
  clave text primary key,
  valor jsonb not null,
  descripcion text,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid default auth.uid()
);
comment on table public.parametro is 'Parámetros generales del ERP (Archivo → Parámetros) que no tienen sitio en otra tabla. Solo administradores modifican.';

alter table public.parametro enable row level security;
create policy parametro_select on public.parametro for select to authenticated using (true);
create policy parametro_insert on public.parametro for insert to authenticated with check (public.fn_es_administrador());
create policy parametro_update on public.parametro for update to authenticated
  using (public.fn_es_administrador()) with check (public.fn_es_administrador());

create or replace function public.fn_parametro_tocado() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  return new;
end $$;
create trigger parametro_tocado before insert or update on public.parametro
  for each row execute function public.fn_parametro_tocado();

insert into public.parametro (clave, valor, descripcion) values
  ('igic_defecto_pct', '7', 'IGIC por defecto (%) de las líneas nuevas de venta y de los artículos nuevos'),
  ('decimales_precio', '3', 'Decimales con que se muestran y teclean los precios de las líneas (pedidos, ventas, ticket)'),
  ('moneda_empresa', '"EUR"', 'Moneda de la empresa: base de las cotizaciones (Carga Cotización)'),
  ('liquidacion_base', '"base"', 'Liquidación de comisiones: «base» = sobre la base imponible de las líneas')
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------------------------
-- 2) Zonas de servicio
-- ---------------------------------------------------------------------------------------
create table if not exists public.zona_servicio (
  codigo text primary key,
  descripcion text not null,
  observaciones text,
  activo boolean not null default true,
  actualizado_en timestamptz not null default now()
);
comment on table public.zona_servicio is 'Archivo → Zonas de servicio (sin captura de GeminisWin). Baja lógica con activo.';
alter table public.zona_servicio enable row level security;
create policy autenticados_acceso_total_zona_servicio on public.zona_servicio for all to authenticated using (true) with check (true);

create or replace function public.gw_lista_ordenada_zona_servicio(
  p_fuente text, p_campo text, p_modo text default 'ge', p_sk text default '', p_k text default '',
  p_ancla text default null, p_limite integer default 60, p_omitir_vacios boolean default false)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_expr text; v_k text := '(t.codigo collate "C")'; v_where text; v_ord text; v_res jsonb;
  v_lim int := least(greatest(coalesce(p_limite, 60), 1), 300);
begin
  if p_fuente <> 'zona_servicio' then
    raise exception 'Lista ordenada: fuente no permitida (%)', p_fuente;
  end if;
  if p_campo not in ('codigo', 'descripcion') then
    raise exception 'Lista ordenada: campo no permitido (%.%)', p_fuente, p_campo;
  end if;
  v_expr := format('(upper(coalesce(t.%I, '''')) collate "C")', p_campo);
  if p_ancla is not null then
    execute format('select %s from zona_servicio t where t.codigo = $1 limit 1', v_expr) into p_sk using p_ancla;
    if p_sk is null then p_sk := ''; p_k := ''; else p_k := p_ancla; end if;
  end if;
  p_sk := coalesce(p_sk, ''); p_k := coalesce(p_k, '');
  if p_modo = 'lt' then
    v_where := format('%1$s <= $1 and (%1$s < $1 or %2$s < $2)', v_expr, v_k);
    v_ord := format('%s desc, %s desc', v_expr, v_k);
  elsif p_modo = 'gt' then
    v_where := format('%1$s >= $1 and (%1$s > $1 or %2$s > $2)', v_expr, v_k);
    v_ord := format('%s, %s', v_expr, v_k);
  else
    v_where := format('%1$s >= $1 and (%1$s > $1 or %2$s >= $2)', v_expr, v_k);
    v_ord := format('%s, %s', v_expr, v_k);
  end if;
  if p_omitir_vacios then
    v_where := v_where || format(' and coalesce(t.%I, '''') <> ''''', p_campo);
  end if;
  execute format(
    'select coalesce(jsonb_agg(r.j || jsonb_build_object(''_sk'', r.sk, ''_k'', r.k) order by r.sk, r.k), ''[]''::jsonb) '
    || 'from (select jsonb_build_object(''codigo'', t.codigo, ''descripcion'', t.descripcion, ''activo'', t.activo) as j, '
    || '%s as sk, %s as k from zona_servicio t where %s order by %s limit $3) r',
    v_expr, v_k, v_where, v_ord) into v_res using p_sk, p_k, v_lim;
  return v_res;
end;
$function$;
revoke all on function public.gw_lista_ordenada_zona_servicio(text, text, text, text, text, text, integer, boolean) from public, anon;
grant execute on function public.gw_lista_ordenada_zona_servicio(text, text, text, text, text, text, integer, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------
-- 3) Histórico de cotizaciones (Carga Cotización)
-- ---------------------------------------------------------------------------------------
create table if not exists public.moneda_cotizacion (
  id bigserial primary key,
  moneda_codigo text not null references public.moneda (codigo),
  fecha date not null,
  valor_billete numeric,
  valor_cheque numeric,
  fuente text not null default 'manual' check (fuente in ('manual', 'bce')),
  creado_en timestamptz not null default now(),
  creado_por uuid default auth.uid()
);
comment on table public.moneda_cotizacion is 'Cotizaciones cargadas en Archivo → Carga Cotización (unidades de la moneda por 1 € de la empresa).';
create index if not exists moneda_cotizacion_moneda_idx on public.moneda_cotizacion (moneda_codigo, fecha desc);
alter table public.moneda_cotizacion enable row level security;
create policy moneda_cotizacion_select on public.moneda_cotizacion for select to authenticated using (true);
create policy moneda_cotizacion_insert on public.moneda_cotizacion for insert to authenticated with check (true);

-- ---------------------------------------------------------------------------------------
-- 4) Liquidación de comisiones (Facturación → Liquidación)
-- ---------------------------------------------------------------------------------------
create table if not exists public.liquidacion_comision (
  id bigserial primary key,
  tipo text not null check (tipo in ('vendedor', 'tecnico', 'repartidor')),
  agente_codigo text not null,
  fecha date not null default current_date,
  desde date,
  hasta date,
  documentos integer not null default 0,
  base_total numeric not null default 0,
  comision_total numeric not null default 0,
  observaciones text,
  anulada boolean not null default false,
  anulada_en timestamptz,
  creado_en timestamptz not null default now(),
  creado_por uuid default auth.uid()
);
comment on table public.liquidacion_comision is 'Liquidaciones de comisiones a vendedores, técnicos y repartidores (Facturación → Liquidación, sin captura).';

create table if not exists public.liquidacion_comision_documento (
  liquidacion_id bigint not null references public.liquidacion_comision (id),
  tipo text not null,
  venta_tienda_codigo text not null,
  venta_numero bigint not null,
  fecha date,
  base numeric not null default 0,
  comision numeric not null default 0,
  anulada boolean not null default false,
  primary key (liquidacion_id, venta_tienda_codigo, venta_numero)
);
-- Una venta solo se liquida una vez por tipo de agente (salvo que se anule la liquidación).
create unique index if not exists liquidacion_comision_documento_unico
  on public.liquidacion_comision_documento (tipo, venta_tienda_codigo, venta_numero) where not anulada;

alter table public.liquidacion_comision enable row level security;
alter table public.liquidacion_comision_documento enable row level security;
create policy liquidacion_comision_todo on public.liquidacion_comision for all to authenticated using (true) with check (true);
create policy liquidacion_comision_documento_todo on public.liquidacion_comision_documento for all to authenticated using (true) with check (true);

-- Comisión por venta. Parámetros (jsonb): tipo ('vendedor'|'tecnico'|'repartidor'), desde, hasta
-- (fecha de la venta), agente_desde, agente_hasta, solo_facturadas, solo_cobradas,
-- incluir_liquidadas.
--   · Vendedor: agente = venta.vendedor_codigo. Por línea: total_comision_vendedor si viene
--     calculado; si no, base de la línea × % (el de la línea, si no el de la venta, si no el
--     general del vendedor).
--   · Técnico: agente = técnico de la línea o, si no tiene, el de la venta; igual con los campos
--     de técnico.
--   · Repartidor: agente = repartidor del reparto de la venta; base de la venta × % por defecto
--     del repartidor.
--   La base de las líneas se reduce por el descuento de pie de la venta. Se excluyen ventas
--   anuladas. Interpretación SIN CAPTURA, confirmar con Luis.
create or replace function public.fn_liquidacion_comisiones_calculo(p jsonb)
returns table (
  agente_codigo text, agente_nombre text, venta_tienda_codigo text, venta_numero bigint, fecha date,
  cliente_codigo text, nombre_cliente text, factura text, cobrada boolean, base numeric, pct numeric,
  comision numeric, liquidacion_id bigint)
language plpgsql
stable
set search_path to 'public'
as $$
#variable_conflict use_column
declare
  v_tipo text := coalesce(p->>'tipo', 'vendedor');
  v_desde date := nullif(p->>'desde', '')::date;
  v_hasta date := nullif(p->>'hasta', '')::date;
  v_ad text := nullif(p->>'agente_desde', '');
  v_ah text := nullif(p->>'agente_hasta', '');
  v_fact boolean := coalesce((p->>'solo_facturadas')::boolean, false);
  v_cob boolean := coalesce((p->>'solo_cobradas')::boolean, false);
  v_liq boolean := coalesce((p->>'incluir_liquidadas')::boolean, false);
begin
  if v_tipo not in ('vendedor', 'tecnico', 'repartidor') then
    raise exception 'Tipo de liquidación no válido: %', v_tipo;
  end if;
  return query
  with ventas as (
    select v.*, 1 - coalesce(v.descuento_pie_pct, 0) / 100 as factor_pie
    from venta v
    where v.anulada_en is null
      and (v_desde is null or v.fecha >= v_desde)
      and (v_hasta is null or v.fecha <= v_hasta)
      and (not v_fact or v.factura_numero is not null)
      and (not v_cob or coalesce(v.total_pendiente, 0) <= 0.005)
  ),
  lineas as (
    select v.tienda_terminal_codigo as vt, v.numero as vn,
           case v_tipo when 'vendedor' then v.vendedor_codigo else coalesce(nullif(l.tecnico_codigo, ''), v.tecnico_codigo) end as ag,
           coalesce(l.total_base, l.subtotal, 0) * v.factor_pie as b,
           case v_tipo when 'vendedor' then l.total_comision_vendedor else l.total_comision_tecnico end as com_linea,
           case v_tipo when 'vendedor' then coalesce(nullif(l.comision_vendedor_pct, 0), nullif(v.comision_vendedor_pct, 0))
                       else coalesce(nullif(l.comision_tecnico_pct, 0), nullif(v.comision_tecnico_pct, 0)) end as pct_doc
    from ventas v
    join venta_linea l on l.tienda_terminal_codigo = v.tienda_terminal_codigo and l.numero = v.numero
    where v_tipo in ('vendedor', 'tecnico')
  ),
  por_venta as (
    -- vendedor / técnico
    select x.vt, x.vn, x.ag,
           sum(x.b) as b,
           sum(case when coalesce(x.com_linea, 0) <> 0 then x.com_linea
                    else x.b * coalesce(x.pct_doc, ag.pct_general, 0) / 100 end) as c
    from lineas x
    left join lateral (
      select case v_tipo when 'vendedor' then (select ve.comision_general_pct from vendedor ve where ve.codigo = x.ag)
                         else (select te.comision_general_pct from tecnico te where te.codigo = x.ag) end as pct_general
    ) ag on true
    where coalesce(x.ag, '') <> ''
    group by x.vt, x.vn, x.ag
    union all
    -- repartidor
    select v.tienda_terminal_codigo, v.numero, r.repartidor_codigo,
           coalesce(v.subtotal_2, v.subtotal, 0),
           coalesce(v.subtotal_2, v.subtotal, 0) * coalesce(rp.comision_defecto_pct, 0) / 100
    from ventas v
    join reparto r on r.tienda_terminal_codigo = v.reparto_tienda_codigo and r.numero = v.reparto_numero
    left join repartidor rp on rp.codigo = r.repartidor_codigo
    where v_tipo = 'repartidor' and coalesce(r.repartidor_codigo, '') <> ''
  )
  select pv.ag,
         case v_tipo when 'vendedor' then (select ve.nombre from vendedor ve where ve.codigo = pv.ag)
                     when 'tecnico' then (select te.nombre from tecnico te where te.codigo = pv.ag)
                     else (select rp.nombre from repartidor rp where rp.codigo = pv.ag) end,
         pv.vt, pv.vn, v.fecha, v.cliente_codigo, v.nombre_cliente,
         case when v.factura_numero is null then null else v.factura_tienda_codigo || '-' || v.factura_numero end,
         coalesce(v.total_pendiente, 0) <= 0.005,
         round(pv.b, 3),
         case when pv.b = 0 then 0 else round(pv.c * 100 / pv.b, 2) end,
         round(pv.c, 3),
         d.liquidacion_id
  from por_venta pv
  join ventas v on v.tienda_terminal_codigo = pv.vt and v.numero = pv.vn
  left join liquidacion_comision_documento d
    on d.tipo = v_tipo and d.venta_tienda_codigo = pv.vt and d.venta_numero = pv.vn and not d.anulada
  where (v_ad is null or pv.ag >= v_ad)
    and (v_ah is null or pv.ag <= v_ah)
    and (v_liq or d.liquidacion_id is null)
  order by pv.ag, v.fecha, pv.vt, pv.vn;
end $$;
revoke all on function public.fn_liquidacion_comisiones_calculo(jsonb) from public, anon;
grant execute on function public.fn_liquidacion_comisiones_calculo(jsonb) to authenticated;

-- Liquida lo pendiente del cálculo (mismos parámetros, sin las ya liquidadas): una liquidación
-- por agente. Devuelve las liquidaciones creadas.
create or replace function public.fn_liquidacion_comisiones_liquidar(p jsonb, p_observaciones text default null)
returns table (id bigint, agente_codigo text, documentos integer, base_total numeric, comision_total numeric)
language plpgsql
set search_path to 'public'
as $$
#variable_conflict use_column
declare
  v_tipo text := coalesce(p->>'tipo', 'vendedor');
  v_calc jsonb;
  r record;
  v_id bigint;
begin
  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_calc
  from fn_liquidacion_comisiones_calculo(p - 'incluir_liquidadas') c;
  for r in
    select x->>'agente_codigo' as ag, count(*)::int as n, sum((x->>'base')::numeric) as b, sum((x->>'comision')::numeric) as com
    from jsonb_array_elements(v_calc) x group by 1 order by 1
  loop
    insert into liquidacion_comision (tipo, agente_codigo, desde, hasta, documentos, base_total, comision_total, observaciones)
    values (v_tipo, r.ag, nullif(p->>'desde', '')::date, nullif(p->>'hasta', '')::date, r.n, round(r.b, 3), round(r.com, 3), p_observaciones)
    returning liquidacion_comision.id into v_id;
    insert into liquidacion_comision_documento (liquidacion_id, tipo, venta_tienda_codigo, venta_numero, fecha, base, comision)
    select v_id, v_tipo, x->>'venta_tienda_codigo', (x->>'venta_numero')::bigint, (x->>'fecha')::date,
           (x->>'base')::numeric, (x->>'comision')::numeric
    from jsonb_array_elements(v_calc) x where x->>'agente_codigo' = r.ag;
    id := v_id; agente_codigo := r.ag; documentos := r.n; base_total := round(r.b, 3); comision_total := round(r.com, 3);
    return next;
  end loop;
end $$;
revoke all on function public.fn_liquidacion_comisiones_liquidar(jsonb, text) from public, anon;
grant execute on function public.fn_liquidacion_comisiones_liquidar(jsonb, text) to authenticated;

-- Anula una liquidación: sus ventas vuelven a quedar pendientes de liquidar.
create or replace function public.fn_liquidacion_comisiones_anular(p_id bigint)
returns void
language plpgsql
set search_path to 'public'
as $$
begin
  update liquidacion_comision set anulada = true, anulada_en = now() where id = p_id and not anulada;
  if not found then
    raise exception 'La liquidación % no existe o ya está anulada', p_id;
  end if;
  update liquidacion_comision_documento set anulada = true where liquidacion_id = p_id;
end $$;
revoke all on function public.fn_liquidacion_comisiones_anular(bigint) from public, anon;
grant execute on function public.fn_liquidacion_comisiones_anular(bigint) to authenticated;

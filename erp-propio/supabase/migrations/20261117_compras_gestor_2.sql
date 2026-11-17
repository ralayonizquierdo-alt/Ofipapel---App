-- Gestor de Pedidos 2.0 (Rober, 17/11/2026): el ERP propone cada semana los pedidos a proveedores a partir
-- del stock mínimo y máximo, y él decide con cada uno si lo envía o aguanta.
-- Pantalla nueva y aparte (/gestor-pedidos-proveedor/semanal); el Gestor de siempre no se toca.
-- Mismo motor que ya existía: fn_compras_propuesta_pedidos (qué está en el mínimo o por debajo y cuánto
-- lo lleva al máximo) y fn_compras_crear_pedido (el pedido nace «pendiente», como siempre).
-- Permiso: el del Gestor de Pedidos a Proveedores (fn_puede cubre las rutas que cuelgan de él).

-- «Aguantar»: el proveedor no sale en la lista de decidir hasta la fecha. Solo se escribe por la función.
create table if not exists public.compra_propuesta_aplazada (
  proveedor_codigo text primary key references public.proveedor(codigo),
  hasta date not null,
  motivo text,
  aplazado_por text default public.fn_empleado_actual(),
  aplazado_en timestamptz not null default now()
);
alter table public.compra_propuesta_aplazada enable row level security;
create policy compra_propuesta_aplazada_lee on public.compra_propuesta_aplazada
  for select to authenticated using (public.fn_puede('/gestor-pedidos-proveedor'));
revoke all on public.compra_propuesta_aplazada from public, anon, authenticated;
grant select on public.compra_propuesta_aplazada to authenticated;

-- Detalle de la propuesta de un proveedor (o de todos): cada artículo con lo que cuesta y, si otro
-- proveedor de su ficha lo tiene más barato, cuál y a cuánto (precio neto por unidad).
create or replace function public.fn_compras2_lineas(p_proveedor text default null)
returns table (
  proveedor_codigo text, proveedor_nombre text, articulo_codigo text, descripcion text, referencia_compra text,
  stock_actual numeric, pendiente_recibir numeric, stock_minimo numeric, stock_maximo numeric,
  cantidad_sugerida numeric, unidades_por_caja numeric, coste numeric, importe numeric,
  mejor_proveedor text, mejor_proveedor_nombre text, mejor_coste numeric
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  select p.proveedor_codigo, p.proveedor_nombre, p.articulo_codigo, p.descripcion, ap.codigo_compra,
         p.stock_actual, p.pendiente_recibir, p.stock_minimo, p.stock_maximo, p.cantidad_sugerida,
         nullif(ar.unidades_por_caja, 0),
         c.coste, round(p.cantidad_sugerida * c.coste, 2),
         m.proveedor_codigo, m.nombre, m.coste_neto
    from public.fn_compras_propuesta_pedidos(p_proveedor) p
    join public.articulo ar on ar.codigo_interno = p.articulo_codigo
    left join public.articulo_proveedor ap on ap.articulo_codigo = p.articulo_codigo and ap.proveedor_codigo = p.proveedor_codigo
    cross join lateral (select coalesce(nullif(ap.coste_neto, 0), nullif(ar.coste_neto, 0), 0) as coste) c
    left join lateral (
      select o.proveedor_codigo, pr.nombre, o.coste_neto
        from public.articulo_proveedor o
        join public.proveedor pr on pr.codigo = o.proveedor_codigo and coalesce(pr.activo, true)
       where o.articulo_codigo = p.articulo_codigo and o.proveedor_codigo is distinct from p.proveedor_codigo
         and o.coste_neto > 0 and c.coste > 0 and o.coste_neto < c.coste
       order by o.coste_neto
       limit 1
    ) m on true
$$;

-- Resumen por proveedor para la pantalla semanal.
create or replace function public.fn_compras2_resumen()
returns table (
  proveedor_codigo text, proveedor_nombre text, articulos integer, agotados integer, unidades numeric,
  importe numeric, compra_minima numeric, dias_entrega integer, ultimo_pedido date,
  mas_baratos_en_otro integer, aplazado_hasta date, aplazado_motivo text
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  select l.proveedor_codigo, max(l.proveedor_nombre), count(*)::integer,
         count(*) filter (where l.stock_actual <= 0)::integer,
         sum(l.cantidad_sugerida), sum(l.importe),
         max(pr.compra_minima), max(pr.dias_entrega)::integer, max(pr.fecha_ultimo_pedido),
         count(l.mejor_proveedor)::integer,
         max(a.hasta) filter (where a.hasta >= current_date), max(a.motivo) filter (where a.hasta >= current_date)
    from public.fn_compras2_lineas(null) l
    left join public.proveedor pr on pr.codigo = l.proveedor_codigo
    left join public.compra_propuesta_aplazada a on a.proveedor_codigo = l.proveedor_codigo
   where l.cantidad_sugerida > 0
   group by l.proveedor_codigo
$$;

-- Aguantar (p_dias > 0) o volver a ponerlo para decidir (p_dias = 0).
create or replace function public.fn_compras2_aplazar(p_proveedor text, p_dias integer, p_motivo text default null)
returns date
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_hasta date := current_date + greatest(coalesce(p_dias, 0), 0) - case when coalesce(p_dias, 0) <= 0 then 1 else 0 end;
begin
  if not public.fn_puede('/gestor-pedidos-proveedor') then
    raise exception 'Sin permiso para el Gestor de Pedidos a Proveedores.' using errcode = '42501';
  end if;
  if coalesce(p_dias, 0) > 60 then raise exception 'Como mucho se puede aguantar 60 días.'; end if;
  if not exists (select 1 from public.proveedor where codigo = p_proveedor) then raise exception 'No existe el proveedor %.', p_proveedor; end if;
  insert into public.compra_propuesta_aplazada (proveedor_codigo, hasta, motivo, aplazado_por, aplazado_en)
  values (p_proveedor, v_hasta, nullif(btrim(coalesce(p_motivo, '')), ''), public.fn_empleado_actual(), now())
  on conflict (proveedor_codigo) do update set hasta = excluded.hasta, motivo = excluded.motivo, aplazado_por = excluded.aplazado_por, aplazado_en = excluded.aplazado_en;
  return v_hasta;
end $$;

revoke all on function public.fn_compras2_lineas(text), public.fn_compras2_resumen(), public.fn_compras2_aplazar(text, integer, text) from public, anon;
grant execute on function public.fn_compras2_lineas(text), public.fn_compras2_resumen(), public.fn_compras2_aplazar(text, integer, text) to authenticated;

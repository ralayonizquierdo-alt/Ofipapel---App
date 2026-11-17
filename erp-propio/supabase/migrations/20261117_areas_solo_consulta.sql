-- Áreas de solo consulta mientras manda GeminisWin (Rober, 17/11/2026: «que se puedan consultar pero no
-- editar, para evitar despistes; las iremos abriendo poco a poco»). Regla 2 de docs/PLAN_ESPEJO_GEMINISWIN.md:
-- cada dato tiene un solo dueño en cada momento.
--
--  · area_dueno: quién manda en cada área, «geminiswin» o «erp». Se cambia con fn_area_abrir / fn_area_cerrar
--    (solo super administradores) y queda la fecha y quién lo hizo.
--  · fn_area_bloqueo (disparador): si el área es de GeminisWin, rechaza altas, bajas y cambios hechos por
--    un empleado. Deja pasar: al espejo y a las cargas (no llevan usuario), a lo que escribe otro
--    disparador, y los cambios que solo tocan campos PROPIOS del ERP (los que GeminisWin no tiene o en los
--    que manda el ERP): stock mínimo y máximo del artículo, pedido mínimo y días de entrega del proveedor.
--  · Las cargas dejan de pisar esos campos propios cuando el ERP ya tiene un valor.
-- Áreas de la tanda 1 del espejo: artículos, clientes, proveedores y stock. Ventas, cobros y caja se
-- añadirán con la tanda 2.
-- EMPIEZAN ABIERTAS («erp»): hoy lo que hay es una muestra y datos de prueba. Se cierran al activar el
-- envío del espejo.

create table if not exists public.area_dueno (
  area text primary key,
  nombre text not null,
  dueno text not null default 'erp' check (dueno in ('geminiswin', 'erp')),
  desde timestamptz not null default now(),
  cambiado_por text,
  nota text
);
alter table public.area_dueno enable row level security;
create policy area_dueno_lee on public.area_dueno for select to authenticated using (true);
revoke all on public.area_dueno from public, anon, authenticated;
grant select on public.area_dueno to authenticated;

insert into public.area_dueno (area, nombre, nota) values
  ('articulos', 'Artículos, familias, marcas, tarifas y precios', 'Abierta hasta que el espejo empiece a enviar'),
  ('clientes', 'Clientes y tipos de cliente', 'Abierta hasta que el espejo empiece a enviar'),
  ('proveedores', 'Proveedores', 'Abierta hasta que el espejo empiece a enviar'),
  ('stock', 'Stock', 'Abierta hasta que el espejo empiece a enviar')
on conflict (area) do nothing;

create or replace function public.fn_area_bloqueo() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_nombre text; v_libres text[] := tg_argv[1:];
begin
  -- El espejo, las cargas y el mantenimiento no llevan usuario; lo que escribe otro disparador tampoco se frena.
  if auth.uid() is null or pg_trigger_depth() > 1 then return coalesce(new, old); end if;
  select nombre into v_nombre from area_dueno where area = tg_argv[0] and dueno = 'geminiswin';
  if not found then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and array_length(v_libres, 1) > 0 and (to_jsonb(new) - v_libres) = (to_jsonb(old) - v_libres) then
    return new;                                   -- solo cambian campos propios del ERP
  end if;
  raise exception '%: estos datos vienen de GeminisWin y en el ERP solo se consultan. Cámbialo en GeminisWin y aparecerá aquí en unos minutos.', v_nombre
    using errcode = '42501';
end $$;
revoke all on function public.fn_area_bloqueo() from public, anon, authenticated;

do $$
declare r record;
begin
  for r in select * from (values
      ('articulo', 'articulos', array['stock_minimo', 'stock_maximo', 'unidades_pedidas', 'unidades_reservadas', 'actualizado_en']),
      ('articulo_precio_nivel', 'articulos', array[]::text[]),
      ('articulo_codigo_barras', 'articulos', array[]::text[]),
      ('articulo_proveedor', 'articulos', array['unidades_pedidas', 'fecha_prevista_entrega', 'actualizado_en']),
      ('familia', 'articulos', array[]::text[]),
      ('marca', 'articulos', array[]::text[]),
      ('plantilla_tarifa', 'articulos', array[]::text[]),
      ('cliente', 'clientes', array[]::text[]),
      ('tipo_cliente', 'clientes', array[]::text[]),
      ('cliente_articulo_precio', 'clientes', array[]::text[]),
      ('proveedor', 'proveedores', array['compra_minima', 'dias_entrega', 'fecha_ultimo_pedido', 'actualizado_en']),
      ('articulo_almacen_stock', 'stock', array[]::text[]),
      ('movimiento_stock', 'stock', array[]::text[])
    ) as t(tabla, area, libres) loop
    if to_regclass('public.' || r.tabla) is null then
      raise notice 'No existe la tabla %: se salta', r.tabla;
      continue;
    end if;
    execute format('create or replace trigger trg_area_bloqueo before insert or update or delete on public.%I for each row execute function public.fn_area_bloqueo(%s)',
                   r.tabla, (select string_agg(quote_literal(x), ', ') from unnest(array[r.area] || r.libres) x));
  end loop;
end $$;

-- Cerrar un área (pasa a ser de GeminisWin: solo consulta) o abrirla (el ERP pasa a ser el dueño).
create or replace function public.fn_area_poner(p_area text, p_dueno text, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is not null and not public.fn_es_super_administrador() then
    raise exception 'Solo un super administrador puede abrir o cerrar un área.' using errcode = '42501';
  end if;
  if p_dueno not in ('geminiswin', 'erp') then raise exception 'El dueño es «geminiswin» o «erp».'; end if;
  update area_dueno set dueno = p_dueno, desde = now(), cambiado_por = coalesce(public.fn_empleado_actual(), 'sistema'), nota = nullif(btrim(coalesce(p_nota, '')), '')
   where area = p_area;
  if not found then raise exception 'No existe el área %.', p_area; end if;
  return (select to_jsonb(a) from area_dueno a where a.area = p_area);
end $$;
revoke all on function public.fn_area_poner(text, text, text) from public, anon;
grant execute on function public.fn_area_poner(text, text, text) to authenticated;

-- Las cargas no pisan los campos propios del ERP cuando ya tienen valor.
do $$
declare v text; f regprocedure; par text[]; cambios text[][] := array[
    array['fn_carga_gw_articulo', 'stock_minimo = excluded.stock_minimo', 'stock_minimo = coalesce(nullif(articulo.stock_minimo, 0), excluded.stock_minimo)'],
    array['fn_carga_gw_articulo', 'stock_maximo = excluded.stock_maximo', 'stock_maximo = coalesce(nullif(articulo.stock_maximo, 0), excluded.stock_maximo)'],
    array['fn_carga_gw_proveedor', 'dias_entrega = excluded.dias_entrega', 'dias_entrega = coalesce(nullif(proveedor.dias_entrega, 0), excluded.dias_entrega)']];
begin
  foreach par slice 1 in array cambios loop
    f := ('public.' || par[1] || '()')::regprocedure;
    v := pg_get_functiondef(f);
    if position(par[3] in v) > 0 then continue; end if;
    if position(par[2] in v) = 0 then raise exception 'no encuentro «%» en %', par[2], par[1]; end if;
    execute replace(v, par[2], par[3]);
  end loop;
end $$;

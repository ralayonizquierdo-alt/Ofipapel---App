-- Gestor de Pedidos 2.0: artículos que se compran por caja y se venden por unidad (Rober, 18/11/2026: «la
-- plastilina se vende por pastilla, no por caja»).
--
-- En GeminisWin la plastilina Jovi 350 g (C/15) tiene el stock, el coste y las compras por CAJA, pero las ventas se
-- apuntan por PASTILLA. El ERP tomaba 80 «ventas» al mes como 80 cajas y pedía 135 cajas (3.819 €) cuando se venden
-- unas 5 al mes. Encontrados comparando el precio de venta de cada unidad con el de la ficha: las dos plastilinas
-- Jovi y dos sets de bolígrafos (se venden sueltos).
--
-- compra_articulo_venta_por_unidad dice cuántas unidades vendidas hacen una unidad de stock/compra. El cálculo de
-- mínimos divide las ventas por ese número, y la propuesta no redondea a «caja» (la caja ya es la unidad).
create table if not exists public.compra_articulo_venta_por_unidad (
  articulo_codigo text primary key references public.articulo(codigo_interno),
  ventas_por_unidad numeric not null check (ventas_por_unidad > 1),
  motivo text,
  actualizado_por text default public.fn_empleado_actual(),
  actualizado_en timestamptz not null default now()
);
comment on table public.compra_articulo_venta_por_unidad is
  'Gestor de Pedidos 2.0: artículos que se compran y cuentan por caja pero se venden por unidad suelta. ventas_por_unidad = unidades vendidas que hacen una de stock (plastilina Jovi 350 g C/15 → 15).';
alter table public.compra_articulo_venta_por_unidad enable row level security;
do $$
begin
  if not exists (select 1 from pg_policy where polname = 'compra_articulo_venta_por_unidad_lee') then
    create policy compra_articulo_venta_por_unidad_lee on public.compra_articulo_venta_por_unidad for select to authenticated
      using ((select public.fn_puede('/gestor-pedidos-proveedor')));
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_auditoria_compra_articulo_venta_por_unidad') then
    create trigger trg_auditoria_compra_articulo_venta_por_unidad after insert or update on public.compra_articulo_venta_por_unidad
      for each row execute function public.fn_auditoria_trigger();
  end if;
end $$;
revoke all on public.compra_articulo_venta_por_unidad from anon;

insert into public.compra_articulo_venta_por_unidad (articulo_codigo, ventas_por_unidad, motivo, actualizado_por)
select x.a, x.n, x.m, 'Rober (venta por unidad)'
  from (values ('03402', 15, 'Plastilina Jovi 350 g: caja de 15 pastillas, se vende por pastilla'),
               ('13128', 30, 'Plastilina Jovi 50 g: caja de 30 pastillas, se vende por pastilla'),
               ('142761', 35, 'Set de 35 bolígrafos: se vende por bolígrafo'),
               ('142760', 10, 'Set de 10 bolígrafos: se vende por bolígrafo')) x(a, n, m)
 where exists (select 1 from public.articulo where codigo_interno = x.a)
on conflict (articulo_codigo) do nothing;

do $$
declare v text;
begin
  -- Ventas pasadas a unidades de stock en el cálculo de mínimos.
  v := pg_get_functiondef('public.fn_compras_politica_calcular()'::regprocedure);
  if position('compra_articulo_venta_por_unidad' in v) = 0 then
    if position('greatest(sum(unidades), 0) u from venta_historico_mensual' in v) = 0 then
      raise exception 'fn_compras_politica_calcular no tiene el trozo esperado';
    end if;
    v := replace(v, 'greatest(sum(unidades), 0) u from venta_historico_mensual',
      'greatest(sum(unidades), 0) / coalesce((select f.ventas_por_unidad from compra_articulo_venta_por_unidad f where f.articulo_codigo = venta_historico_mensual.articulo_codigo), 1) u from venta_historico_mensual');
    execute v;
  end if;

  -- La propuesta no redondea a caja cuando la caja ya es la unidad.
  v := pg_get_functiondef('public.fn_compras_semanal_propuesta(text)'::regprocedure);
  if position('compra_articulo_venta_por_unidad' in v) = 0 then
    if position('when c.minimo > 0 and coalesce(c.unidades_por_caja, 0) > 1 and c.pedir0 > 0' in v) = 0 then
      raise exception 'fn_compras_semanal_propuesta no tiene el trozo esperado';
    end if;
    v := replace(v, 'when c.minimo > 0 and coalesce(c.unidades_por_caja, 0) > 1 and c.pedir0 > 0',
      'when c.minimo > 0 and coalesce(c.unidades_por_caja, 0) > 1 and c.pedir0 > 0 and not exists (select 1 from compra_articulo_venta_por_unidad f where f.articulo_codigo = c.codigo_interno)');
    execute v;
  end if;
end $$;

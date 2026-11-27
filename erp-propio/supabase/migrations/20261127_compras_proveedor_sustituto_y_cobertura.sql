-- Gestor de compras (Rober, 27/11/2026, pedido 95602 a Archivo 2000):
-- 1) 486 artículos activos tenían como proveedor habitual un código DADO DE BAJA (06515 Archivo 2000 «pasa a 6518»,
--    04060 Exadi «pasa a 04062», 50440 Megastore «pasa al 50441»): el Gestor los proponía con el código muerto y
--    a Archivo 2000 (06518) solo le salían 3 artículos de los 19 que pide Rober. En GeminisWin siguen con el código
--    viejo, así que la carga diaria de artículos (fn_carga_gw_articulo) los traduce al nuevo con esta tabla.
-- 2) Cobertura por proveedor: el máximo = lo que se vende en el plazo + seguridad + «cobertura» días. Hasta hoy la
--    cobertura era igual para todos (parámetro compras.cobertura_dias, 14). A los proveedores a los que se pide poco
--    (pedido mínimo, portes) se les puede poner más días en compra_proveedor_condicion.cobertura_dias.

create table if not exists public.compra_proveedor_sustituto (
  viejo text primary key,
  nuevo text not null,
  motivo text,
  creado_en timestamptz not null default now()
);
alter table public.compra_proveedor_sustituto enable row level security;
drop policy if exists compra_proveedor_sustituto_leer on public.compra_proveedor_sustituto;
create policy compra_proveedor_sustituto_leer on public.compra_proveedor_sustituto for select to authenticated using (true);
grant select on public.compra_proveedor_sustituto to authenticated;

insert into public.compra_proveedor_sustituto (viejo, nuevo, motivo) values
  ('06515', '06518', 'ARCHIVO 2000, S.L. (ANULADO, PASA A 6518)'),
  ('04060', '04062', 'EXADI: BAJA 15/03/25, pasa a 04062'),
  ('50440', '50441', 'MEGASTORE: BAJA, pasa al 50441')
on conflict (viejo) do update set nuevo = excluded.nuevo, motivo = excluded.motivo;

alter table public.compra_proveedor_condicion add column if not exists cobertura_dias integer;

do $$
declare v text;
begin
  -- Carga diaria de artículos de GeminisWin: proveedor habitual viejo → nuevo.
  v := pg_get_functiondef('public.fn_carga_gw_articulo'::regproc);
  if position('compra_proveedor_sustituto' in v) = 0 then
    if position($p$(select codigo from proveedor p where p.codigo = gw_t(datos,'COD_PROV')) prv$p$ in v) = 0 then raise exception 'carga articulo: patrón'; end if;
    v := replace(v, $p$(select codigo from proveedor p where p.codigo = gw_t(datos,'COD_PROV')) prv$p$,
      $p$(select coalesce((select s.nuevo from compra_proveedor_sustituto s where s.viejo = p.codigo), p.codigo) from proveedor p where p.codigo = gw_t(datos,'COD_PROV')) prv$p$);
    execute v;
  end if;

  -- Política: cobertura del proveedor si la tiene; si no, la general.
  v := pg_get_functiondef('public.fn_compras_politica_aplicar(text,text)'::regprocedure);
  if position('cobertura_dias, ' in v) = 0 then
    if position($p$p.venta_mes / 30.44 * coalesce((select (q.valor #>> '{}')::numeric from parametro q where q.clave = 'compras.cobertura_dias'), 14)) end$p$ in v) = 0
       or position('least(60, greatest(1, coalesce(c.plazo_dias,' in v) = 0 then raise exception 'politica: patrón'; end if;
    v := replace(v, $p$p.venta_mes / 30.44 * coalesce((select (q.valor #>> '{}')::numeric from parametro q where q.clave = 'compras.cobertura_dias'), 14)) end$p$,
      $p$p.venta_mes / 30.44 * coalesce(x.cobertura, (select (q.valor #>> '{}')::numeric from parametro q where q.clave = 'compras.cobertura_dias'), 14)) end$p$);
    v := replace(v, 'least(60, greatest(1, coalesce(c.plazo_dias,', 'c.cobertura_dias cobertura, least(60, greatest(1, coalesce(c.plazo_dias,');
    execute v;
  end if;
end $$;

-- Una vez: los artículos que ya están con el código viejo.
select set_config('erp.origen', 'Claude Code · proveedor habitual dado de baja → código nuevo (compra_proveedor_sustituto)', true);
update public.articulo a set proveedor_habitual_codigo = s.nuevo
  from public.compra_proveedor_sustituto s where a.proveedor_habitual_codigo = s.viejo;

-- 3) «Ya que pido, relleno» (aplicada como migración compras_relleno_al_pedir_y_cobertura_archivo2000): en
--    fn_compras_semanal_propuesta, si un proveedor tiene algún artículo por debajo del mínimo, los demás de ese
--    proveedor por debajo del máximo se rellenan hasta el máximo (ventana bool_or(...) over (partition by prov)).
--    Archivo 2000 (06518): cobertura_dias = 60.
insert into compra_proveedor_condicion (proveedor_codigo, plazo_dias, cobertura_dias, actualizado_por, actualizado_en)
values ('06518', 20, 60, 'Claude Code · Rober 27/11', now())
on conflict (proveedor_codigo) do update set cobertura_dias = 60, actualizado_en = now(), actualizado_por = 'Claude Code · Rober 27/11';

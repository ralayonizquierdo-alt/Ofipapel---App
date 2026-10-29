-- Parámetros y Control de Accesos de «Avatar» (el ERP propio), pedidos por Luis el 29/10/2026 a
-- partir de Utilidades → Parámetros de GeminisWin, pero con más variantes por empleado.
--
-- 1) `parametro` (ya existía): valor general de cada parámetro (toda la empresa).
--    `parametro_empleado`: el mismo parámetro con otro valor para un empleado concreto (lo que en
--    GeminisWin eran los «Parámetros Locales» de cada equipo). Manda el del empleado.
--    El catálogo (qué parámetros hay, sección, tipo y valor por defecto) vive en el código:
--    src/lib/catalogoParametros.ts.
-- 2) `empleado_acceso`: límites por empleado (tiendas y almacenes donde puede trabajar,
--    descuento máximo, si puede cambiar precios, horario…).
-- 3) `empleado_permiso`: permisos de menú por empleado por encima de su grupo: «permitir» una
--    opción que su grupo no tiene o «denegar» una que sí tiene. fn_mis_permisos y
--    fn_tiene_permiso los aplican.
-- 4) Límites en la base de datos (no solo en pantalla): tienda permitida al grabar documentos y
--    descuento máximo en las líneas de venta y de pedido. Los administradores no tienen límites.
-- 5) Valores cargados de GeminisWin (captura de Parámetros Locales del equipo de Luis).
-- Idempotente; sin DELETE ni DROP de datos.

-- ---------------------------------------------------------------- 1) parámetros por empleado
create table if not exists public.parametro_empleado (
  empleado_codigo text not null references public.empleado(codigo) on update cascade,
  clave text not null,
  valor jsonb not null,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid default auth.uid(),
  primary key (empleado_codigo, clave)
);
comment on table public.parametro_empleado is 'Valor de un parámetro (catálogo en src/lib/catalogoParametros.ts) solo para un empleado; manda sobre el general de `parametro`.';
alter table public.parametro_empleado enable row level security;
do $$ begin
  create policy parametro_empleado_select on public.parametro_empleado for select to authenticated
    using (public.fn_es_administrador() or empleado_codigo = public.fn_empleado_actual());
  create policy parametro_empleado_escribe on public.parametro_empleado for all to authenticated
    using (public.fn_es_administrador()) with check (public.fn_es_administrador());
exception when duplicate_object then null; end $$;
grant select, insert, update, delete on public.parametro_empleado to authenticated;
drop trigger if exists parametro_empleado_tocado on public.parametro_empleado;
create trigger parametro_empleado_tocado before insert or update on public.parametro_empleado
  for each row execute function public.fn_parametro_tocado();

-- El valor general también se puede quitar (vuelve al valor por defecto del catálogo).
do $$ begin
  create policy parametro_delete on public.parametro for delete to authenticated using (public.fn_es_administrador());
exception when duplicate_object then null; end $$;
grant delete on public.parametro to authenticated;

-- ---------------------------------------------------------------- 2) límites por empleado
create table if not exists public.empleado_acceso (
  empleado_codigo text primary key references public.empleado(codigo) on update cascade,
  tiendas text[],                 -- null = todas
  almacenes text[],               -- null = todos
  solo_datos_tienda boolean not null default false,
  dto_maximo_pct numeric(5,2),    -- null = sin límite
  puede_modificar_precio boolean not null default true,
  puede_vender_sin_caja boolean not null default true,
  puede_anular boolean not null default true,
  puede_ver_costes boolean not null default true,
  horario jsonb,                  -- {"dias":[1..7], "desde":"08:00", "hasta":"21:00"}; null = sin límite
  observaciones text,
  actualizado_en timestamptz not null default now()
);
comment on table public.empleado_acceso is 'Límites de cada empleado (Parámetros → Control de Accesos). Los administradores no tienen límites.';
alter table public.empleado_acceso enable row level security;
do $$ begin
  create policy empleado_acceso_select on public.empleado_acceso for select to authenticated
    using (public.fn_es_administrador() or empleado_codigo = public.fn_empleado_actual());
  create policy empleado_acceso_escribe on public.empleado_acceso for all to authenticated
    using (public.fn_es_administrador()) with check (public.fn_es_administrador());
exception when duplicate_object then null; end $$;
grant select, insert, update, delete on public.empleado_acceso to authenticated;

-- ---------------------------------------------------------------- 3) permisos por empleado
create table if not exists public.empleado_permiso (
  empleado_codigo text not null references public.empleado(codigo) on update cascade,
  permiso_codigo text not null references public.permiso(codigo) on update cascade,
  permitido boolean not null,
  actualizado_en timestamptz not null default now(),
  primary key (empleado_codigo, permiso_codigo)
);
comment on table public.empleado_permiso is 'Excepciones de permisos por empleado sobre su grupo: permitido = true lo da aunque el grupo no lo tenga; false lo quita aunque el grupo lo tenga.';
alter table public.empleado_permiso enable row level security;
do $$ begin
  create policy empleado_permiso_select on public.empleado_permiso for select to authenticated
    using (public.fn_es_administrador() or empleado_codigo = public.fn_empleado_actual());
  create policy empleado_permiso_escribe on public.empleado_permiso for all to authenticated
    using (public.fn_es_administrador()) with check (public.fn_es_administrador());
exception when duplicate_object then null; end $$;
grant select, insert, update, delete on public.empleado_permiso to authenticated;

create or replace function public.fn_mis_permisos()
returns setof text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select p.codigo from public.permiso p where public.fn_es_administrador()
  union
  (
    (select rp.permiso_codigo
       from public.empleado e join public.rol_permiso rp on rp.rol_id = e.rol_id
      where e.auth_user_id = auth.uid() and e.activo
     union
     select ep.permiso_codigo
       from public.empleado e join public.empleado_permiso ep on ep.empleado_codigo = e.codigo
      where e.auth_user_id = auth.uid() and e.activo and ep.permitido)
    except
    select ep.permiso_codigo
      from public.empleado e join public.empleado_permiso ep on ep.empleado_codigo = e.codigo
     where e.auth_user_id = auth.uid() and not ep.permitido
  )
$$;

create or replace function public.fn_tiene_permiso(p_permiso_codigo text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.empleado e
     where e.auth_user_id = auth.uid() and e.activo
       and not exists (select 1 from public.empleado_permiso ep
                        where ep.empleado_codigo = e.codigo and ep.permiso_codigo = p_permiso_codigo and not ep.permitido)
       and (exists (select 1 from public.rol_permiso rp where rp.rol_id = e.rol_id and rp.permiso_codigo = p_permiso_codigo)
            or exists (select 1 from public.empleado_permiso ep
                        where ep.empleado_codigo = e.codigo and ep.permiso_codigo = p_permiso_codigo and ep.permitido))
  );
$$;

-- ---------------------------------------------------------------- 4) límites en la base de datos
-- Tienda: un empleado con tiendas limitadas no graba documentos de otra tienda.
create or replace function public.fn_limite_tienda_empleado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_tiendas text[];
begin
  if auth.uid() is null or public.fn_es_administrador() then return new; end if;
  select a.tiendas into v_tiendas from empleado_acceso a where a.empleado_codigo = public.fn_empleado_actual();
  if v_tiendas is not null and not (new.tienda_terminal_codigo = any (v_tiendas)) then
    raise exception 'No tienes permiso para trabajar en la tienda %. Tiendas permitidas: %.',
      new.tienda_terminal_codigo, array_to_string(v_tiendas, ', ');
  end if;
  return new;
end;
$$;

-- Descuento máximo de línea (ventas y pedidos de clientes).
create or replace function public.fn_limite_descuento_empleado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_max numeric;
begin
  if auth.uid() is null or coalesce(new.descuento_pct, 0) = 0 or public.fn_es_administrador() then return new; end if;
  if tg_op = 'UPDATE' and new.descuento_pct is not distinct from old.descuento_pct then return new; end if;
  select a.dto_maximo_pct into v_max from empleado_acceso a where a.empleado_codigo = public.fn_empleado_actual();
  if v_max is not null and new.descuento_pct > v_max then
    raise exception 'Descuento del % %% en «%»: tu máximo es el % %%.', new.descuento_pct, coalesce(to_jsonb(new) ->> 'descripcion', ''), v_max;
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['venta', 'pedido_cliente', 'movimiento_caja', 'caja_apertura_cierre', 'factura', 'cobro_cliente',
                           'pedido_proveedor', 'pago_proveedor', 'factura_proveedor'] loop
    execute format('drop trigger if exists trg_limite_tienda on public.%I', t);
    execute format('create trigger trg_limite_tienda before insert or update of tienda_terminal_codigo on public.%I '
                   'for each row execute function public.fn_limite_tienda_empleado()', t);
  end loop;
  foreach t in array array['venta_linea', 'pedido_cliente_linea'] loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'descuento_pct') then
      execute format('drop trigger if exists trg_limite_descuento on public.%I', t);
      execute format('create trigger trg_limite_descuento before insert or update on public.%I '
                     'for each row execute function public.fn_limite_descuento_empleado()', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- 5) valores de GeminisWin
-- Parámetros Locales del equipo de Luis (captura del 29/10/2026): tienda por defecto 41
-- «Ofi T-1 (Ofic.Direccion)», sin gestión de turnos, forzar aperturas y cierres de caja (sí),
-- tareas programadas al iniciar (sí), traspasos en segundo plano (no), portapapeles de Windows (sí),
-- impresión en modo gráfico GDI+. Los generales valen para todos; la tienda, solo para Luis.
insert into public.parametro (clave, valor, descripcion) values
  ('local.turnos', '"no"', 'Gestión de turnos (GeminisWin: desactivada)'),
  ('local.forzar_apertura_caja', 'true', 'Forzar que siempre haya aperturas y cierres de caja (GeminisWin: sí)'),
  ('local.tareas_programadas', 'true', 'Tareas programadas al iniciar (GeminisWin: sí)'),
  ('local.traspasos_segundo_plano', 'false', 'Traspasos de información en segundo plano (GeminisWin: no)'),
  ('local.portapapeles', 'true', 'Portapapeles para copiar registros (GeminisWin: sí)'),
  ('local.modo_impresion', '"grafico"', 'Modo de impresión de informes (GeminisWin: gráfico GDI+)')
on conflict (clave) do nothing;
insert into public.parametro_empleado (empleado_codigo, clave, valor)
select 'LUIS', 'local.tienda_defecto', '"41"' where exists (select 1 from empleado where codigo = 'LUIS')
on conflict do nothing;

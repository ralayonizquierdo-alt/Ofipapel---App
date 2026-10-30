-- Generador de listados: que cada listado se identifique (Luis, 30/10/2026).
--  · codigo: único e inmutable, según lo que lista + número (CLI-0012, ART-0007, COM-0003…). Se
--    pone solo al guardar y no cambia aunque cambie el nombre.
--  · descripcion: «Para qué sirve» (lo escribe quien lo hace).
--  · archivado: un administrador archiva los listados que ya no se usan (no se ven, se recuperan).
--  · listado_uso: cada vez que se saca un listado guardado (último uso y nº de usos). Sin auditoría:
--    es solo estadística de uso, no un cambio de datos.
--  · fn_listados_vendedor: qué hacer con los listados de un vendedor (p. ej. cuando deja la empresa):
--    pasarlos a otro, pasarlos a «De serie», archivarlos, recuperarlos o borrarlos. Solo
--    administradores; queda en la auditoría (son cambios de listado_guardado).

alter table public.listado_guardado
  add column if not exists codigo text,
  add column if not exists descripcion text,
  add column if not exists archivado boolean not null default false;

create or replace function public.fn_listado_prefijo(p_fuente text)
returns text
language sql
immutable
as $$
  select case p_fuente
    when 'clientes' then 'CLI' when 'articulos' then 'ART' when 'stock' then 'STK' when 'ventas' then 'VEN'
    when 'ventas_lineas' then 'VAR' when 'facturas' then 'FAC' when 'compras' then 'COM' when 'compras_lineas' then 'CAR'
    when 'proveedores' then 'PRV' when 'caja' then 'CAJ' when 'presupuestos' then 'PRE' when 'pedidos' then 'PED'
    when 'repartos' then 'REP' when 'cobros' then 'COB' when 'peticiones' then 'PET' when 'familias' then 'FAM'
    else 'LST' end
$$;

create or replace function public.fn_listado_codigo_trg()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_pre text;
begin
  if tg_op = 'UPDATE' then
    new.codigo := old.codigo; -- el código no cambia nunca
    return new;
  end if;
  v_pre := fn_listado_prefijo(new.fuente);
  perform pg_advisory_xact_lock(hashtext('listado_codigo_' || v_pre));
  select v_pre || '-' || lpad((coalesce(max(substring(codigo from 5)::int), 0) + 1)::text, 4, '0')
    into new.codigo
    from listado_guardado where codigo like v_pre || '-%';
  return new;
end;
$$;
-- Código a los que ya existen, por orden de creación.
do $$
declare r record;
begin
  for r in select id, fuente from listado_guardado where codigo is null order by creado_en, id loop
    update listado_guardado l
       set codigo = (select fn_listado_prefijo(r.fuente) || '-' ||
                            lpad((coalesce(max(substring(x.codigo from 5)::int), 0) + 1)::text, 4, '0')
                       from listado_guardado x where x.codigo like fn_listado_prefijo(r.fuente) || '-%')
     where l.id = r.id;
  end loop;
end $$;

create unique index if not exists listado_guardado_codigo_uk on public.listado_guardado (codigo);

drop trigger if exists trg_listado_codigo on public.listado_guardado;
create trigger trg_listado_codigo before insert or update on public.listado_guardado
  for each row execute function public.fn_listado_codigo_trg();


-- Usos.
create table if not exists public.listado_uso (
  id bigint generated always as identity primary key,
  listado_id bigint not null references public.listado_guardado (id) on delete cascade,
  empleado_codigo text references public.empleado (codigo),
  usado_en timestamptz not null default now()
);
create index if not exists listado_uso_listado_idx on public.listado_uso (listado_id, usado_en desc);
alter table public.listado_uso enable row level security;
drop policy if exists listado_uso_lee on public.listado_uso;
create policy listado_uso_lee on public.listado_uso for select to authenticated using (true);

create or replace function public.fn_listado_usado(p_id bigint)
returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into listado_uso (listado_id, empleado_codigo)
  select p_id, fn_empleado_actual() where exists (select 1 from listado_guardado where id = p_id)
$$;
grant execute on function public.fn_listado_usado(bigint) to authenticated;
revoke execute on function public.fn_listado_usado(bigint) from anon, public;

create or replace view public.v_listado_uso_resumen with (security_invoker = true) as
select listado_id, count(*) as usos, max(usado_en) as ultimo_uso from listado_uso group by listado_id;
grant select on public.v_listado_uso_resumen to authenticated;

-- Qué hacer con los listados de un vendedor (o con algunos: p_ids).
create or replace function public.fn_listados_vendedor(p_empleado text, p_accion text, p_destino text default null, p_ids bigint[] default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  n integer;
begin
  if not (fn_es_administrador() or fn_es_super_administrador()) then
    raise exception 'Solo un administrador puede hacer esto.' using errcode = '42501';
  end if;
  if p_accion = 'reasignar' then
    if p_destino is null or not exists (select 1 from empleado where codigo = p_destino) then
      raise exception 'Elige a qué vendedor se pasan.';
    end if;
    update listado_guardado set creado_por = p_destino, archivado = false
     where creado_por is not distinct from p_empleado and (p_ids is null or id = any (p_ids));
  elsif p_accion = 'serie' then
    update listado_guardado set creado_por = null, grupos = null, archivado = false
     where creado_por is not distinct from p_empleado and (p_ids is null or id = any (p_ids));
  elsif p_accion = 'archivar' then
    update listado_guardado set archivado = true
     where creado_por is not distinct from p_empleado and (p_ids is null or id = any (p_ids));
  elsif p_accion = 'recuperar' then
    update listado_guardado set archivado = false
     where creado_por is not distinct from p_empleado and (p_ids is null or id = any (p_ids));
  elsif p_accion = 'borrar' then
    delete from listado_guardado
     where creado_por is not distinct from p_empleado and (p_ids is null or id = any (p_ids));
  else
    raise exception 'Acción no válida.';
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;
grant execute on function public.fn_listados_vendedor(text, text, text, bigint[]) to authenticated;
revoke execute on function public.fn_listados_vendedor(text, text, text, bigint[]) from anon, public;

-- Periodos como en GeminisWin (Luis, 29/10/2026).
--  · Hay UN periodo en curso (ejercicio.activo): con él se trabaja siempre.
--  · Los periodos cerrados (ejercicio.cerrado) se guardan para consulta: NADIE puede grabar,
--    modificar ni borrar documentos con fecha dentro de ellos (lo impide la base de datos, no
--    solo la pantalla). Se cierran cada ~3 años, según convenga.
--  · Entrar a consultar un periodo cerrado, crear, cerrar o reabrir periodos: solo los
--    «super administradores» (empleado.super_administrador), con su contraseña.
-- Idempotente; sin DELETE ni DROP de datos.

-- ---------------------------------------------------------------- super administradores
alter table public.empleado add column if not exists super_administrador boolean not null default false;
comment on column public.empleado.super_administrador is
  'Puede consultar periodos cerrados y crear, cerrar o reabrir periodos (Archivo → Periodos). Solo lo cambia otro super administrador.';

create or replace function public.fn_es_super_administrador()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from empleado e where e.auth_user_id = auth.uid() and e.activo and e.super_administrador);
$$;
grant execute on function public.fn_es_super_administrador() to authenticated;

-- La marca solo la pone o quita un super administrador (o el mantenimiento, sin usuario: migraciones).
create or replace function public.fn_empleado_super_admin_guarda()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is not null
     and (case when tg_op = 'INSERT' then new.super_administrador else new.super_administrador is distinct from old.super_administrador end)
     and not public.fn_es_super_administrador() then
    raise exception 'Solo un super administrador puede cambiar la marca de super administrador.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_empleado_super_admin on public.empleado;
create trigger trg_empleado_super_admin before insert or update on public.empleado
  for each row execute function public.fn_empleado_super_admin_guarda();

update public.empleado set super_administrador = true where codigo in ('LUIS', 'ROBER') and not super_administrador;

-- ---------------------------------------------------------------- periodos
-- El periodo en curso no puede estar cerrado.
do $$ begin
  alter table public.ejercicio add constraint ejercicio_en_curso_abierto_ck check (not (activo and cerrado));
exception when duplicate_object then null; end $$;

comment on table public.ejercicio is
  'Periodos (Archivo → Periodos). activo = el periodo en curso, con el que se trabaja. cerrado = periodo archivado, solo consulta: la base de datos no deja grabar documentos con fecha dentro de él (fn_bloquear_periodo_cerrado). Solo los super administradores crean, cierran o reabren.';

-- Crear, cerrar o reabrir: solo super administradores (antes, cualquier administrador).
drop policy if exists ejercicio_insert on public.ejercicio;
drop policy if exists ejercicio_update on public.ejercicio;
create policy ejercicio_insert on public.ejercicio for insert to authenticated with check (public.fn_es_super_administrador());
create policy ejercicio_update on public.ejercicio for update to authenticated
  using (public.fn_es_super_administrador()) with check (public.fn_es_super_administrador());

-- Los periodos no se pisan entre sí.
create or replace function public.fn_ejercicio_sin_solapes()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare v_otro text;
begin
  select coalesce(descripcion, anio::text) into v_otro from ejercicio
   where anio <> new.anio and fecha_inicio <= new.fecha_fin and fecha_fin >= new.fecha_inicio limit 1;
  if v_otro is not null then
    raise exception 'Las fechas se solapan con el periodo «%».', v_otro;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_ejercicio_sin_solapes on public.ejercicio;
create trigger trg_ejercicio_sin_solapes before insert or update on public.ejercicio
  for each row execute function public.fn_ejercicio_sin_solapes();

-- Periodo cerrado que contiene una fecha (descripción), o null.
create or replace function public.fn_periodo_cerrado_de(p_fecha date)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(descripcion, 'Periodo ' || anio) from ejercicio
   where cerrado and p_fecha between fecha_inicio and fecha_fin limit 1;
$$;
grant execute on function public.fn_periodo_cerrado_de(date) to authenticated;

-- Disparador común: el argumento es la columna de fecha del documento. Mira la fecha nueva
-- (alta y modificación) y la vieja (modificación y borrado): un documento de un periodo cerrado
-- no se toca, y tampoco se puede mover a él.
create or replace function public.fn_bloquear_periodo_cerrado()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_col text := tg_argv[0];
  v_fecha date;
  v_periodo text;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    v_fecha := left(to_jsonb(new) ->> v_col, 10)::date;
    v_periodo := public.fn_periodo_cerrado_de(v_fecha);
  end if;
  if v_periodo is null and tg_op in ('UPDATE', 'DELETE') then
    v_fecha := left(to_jsonb(old) ->> v_col, 10)::date;
    v_periodo := public.fn_periodo_cerrado_de(v_fecha);
  end if;
  if v_periodo is not null then
    raise exception 'El periodo «%» está cerrado: solo consulta. No se puede grabar, modificar ni borrar (fecha %).',
      v_periodo, to_char(v_fecha, 'DD/MM/YYYY');
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('venta', 'fecha'), ('venta_linea', 'fecha'),
      ('pedido_cliente', 'fecha'), ('pedido_cliente_linea', 'fecha'),
      ('factura', 'fecha_factura'), ('registro_facturacion', 'fecha_expedicion'),
      ('cobro_cliente', 'fecha'), ('reparto', 'fecha'), ('liquidacion_comision', 'fecha'),
      ('movimiento_caja', 'fecha'), ('caja_apertura_cierre', 'fecha_apertura'), ('apertura_cajon', 'fecha'),
      ('pedido_proveedor', 'fecha_hora'), ('factura_proveedor', 'fecha_factura'), ('pago_proveedor', 'fecha'),
      ('peticion', 'fecha_hora'),
      ('traspaso_almacen', 'fecha'), ('regularizacion_stock', 'fecha'), ('inventario', 'fecha'),
      ('asiento', 'fecha')
    ) as t(tabla, col)
    where exists (select 1 from information_schema.columns c
                   where c.table_schema = 'public' and c.table_name = t.tabla and c.column_name = t.col)
  loop
    execute format('drop trigger if exists trg_periodo_cerrado on public.%I', r.tabla);
    execute format('create trigger trg_periodo_cerrado before insert or update or delete on public.%I '
                   'for each row execute function public.fn_bloquear_periodo_cerrado(%L)', r.tabla, r.col);
  end loop;
end $$;

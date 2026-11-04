-- Archivo → Parámetros calcado de todas las capturas de GeminisWin (ZIP 7 «Parametros», 04/11/2026).
-- Sin datos reales: solo estructura.
--
-- 1) Definición de Impuestos: las columnas que GeminisWin tiene en la rejilla de IGIC y faltaban
--    (código de ContaWin del repercutido, cuenta y código del soportado de importación).
-- 2) Parametrización de las Tarifas: «Permitir Acceso» e «IGIC Incluido» de cada tarifa.
-- 3) Control de Accesos → Accesos Generales y Accesos en Formularios por grupo: tabla rol_acceso
--    (rol, clave, valor). De momento se guardan; los permisos que aplica el programa siguen siendo
--    los de rol_permiso / empleado_permiso (fn_mis_permisos no cambia).

alter table public.configuracion_contable_igic
  add column if not exists cod_cw_repercutido integer,
  add column if not exists cuenta_soportado_importacion text,
  add column if not exists cod_cw_importacion integer;

comment on column public.configuracion_contable_igic.cod_cw_repercutido is 'Cód. CW. de la rejilla de GeminisWin (código del tipo en la contabilidad)';
comment on column public.configuracion_contable_igic.cuenta_soportado_importacion is 'Soportado Importación (cuenta 472 de importaciones)';
comment on column public.configuracion_contable_igic.cod_cw_importacion is 'Cód. CW. del soportado de importación';

alter table public.nivel_tarifa
  add column if not exists permitir_acceso text not null default 'todos',
  add column if not exists igic_incluido boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nivel_tarifa_permitir_acceso_chk') then
    alter table public.nivel_tarifa
      add constraint nivel_tarifa_permitir_acceso_chk check (permitir_acceso in ('todos', 'avanzados'));
  end if;
end $$;

comment on column public.nivel_tarifa.permitir_acceso is 'Permitir Acceso: todos = «A Todos», avanzados = «Usuar. Avanzados»';
comment on column public.nivel_tarifa.igic_incluido is 'IGIC Incluido en los precios de esta tarifa';

create table if not exists public.rol_acceso (
  rol_id bigint not null references public.rol (id) on delete cascade,
  clave text not null,
  valor jsonb not null,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid default auth.uid(),
  primary key (rol_id, clave)
);

comment on table public.rol_acceso is 'Accesos Generales y Accesos en Formularios de cada grupo (Parámetros → Control de Accesos). Claves: general.<acceso> y form.<código de permiso>.<acción>.';

alter table public.rol_acceso enable row level security;

drop policy if exists rol_acceso_select on public.rol_acceso;
create policy rol_acceso_select on public.rol_acceso for select to authenticated using (true);
drop policy if exists rol_acceso_insert on public.rol_acceso;
create policy rol_acceso_insert on public.rol_acceso for insert to authenticated with check ((select public.fn_es_administrador()));
drop policy if exists rol_acceso_update on public.rol_acceso;
create policy rol_acceso_update on public.rol_acceso for update to authenticated using ((select public.fn_es_administrador())) with check ((select public.fn_es_administrador()));
drop policy if exists rol_acceso_delete on public.rol_acceso;
create policy rol_acceso_delete on public.rol_acceso for delete to authenticated using ((select public.fn_es_administrador()));

revoke all on public.rol_acceso from anon;
grant select, insert, update, delete on public.rol_acceso to authenticated;

drop trigger if exists trg_auditoria_rol_acceso on public.rol_acceso;
create trigger trg_auditoria_rol_acceso
  after insert or update or delete on public.rol_acceso
  for each row execute function public.fn_auditoria_trigger();

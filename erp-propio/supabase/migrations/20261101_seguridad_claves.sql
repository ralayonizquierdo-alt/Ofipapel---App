-- Seguridad de las claves (Luis, 01/11/2026: «se me olvidó la clave, recibir nueva clave por correo,
-- cambiar clave, no soy un robot…»).
--   · empleado.debe_cambiar_clave: al entrar se obliga a poner una clave propia (usuarios nuevos y
--     claves puestas por un administrador). fn_debo_cambiar_clave / fn_clave_cambiada.
--   · Bloqueo: 5 contraseñas incorrectas seguidas del mismo usuario en 15 minutos → 15 minutos sin
--     poder entrar (fn_acceso_bloqueo, la consulta la pantalla de entrada antes de intentarlo). Los
--     fallos ya quedan en la auditoría (FALLO_CLAVE) y avisan a los super administradores.
--   · «¿Has olvidado la clave?»: códigos de 6 cifras por correo (tabla clave_codigo, solo la usa la
--     función del servidor «clave-recuperar» con la service role; aquí no se guarda el código, solo su
--     huella).

alter table public.empleado add column if not exists debe_cambiar_clave boolean not null default false;
comment on column public.empleado.debe_cambiar_clave is 'Al entrar se le obliga a poner una clave propia (usuario nuevo o clave puesta por un administrador).';
update public.empleado set debe_cambiar_clave = true where codigo = 'DAVID';

create or replace function public.fn_debo_cambiar_clave()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select debe_cambiar_clave from empleado where auth_user_id = auth.uid()), false)
$$;

create or replace function public.fn_clave_cambiada()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  update empleado set debe_cambiar_clave = false where auth_user_id = auth.uid() and debe_cambiar_clave;
end $$;

-- Segundos que le quedan de bloqueo a un usuario (0 = puede entrar). Lo puede preguntar la pantalla
-- de entrada sin sesión.
create or replace function public.fn_acceso_bloqueo(p_usuario text)
returns integer language plpgsql stable security definer set search_path = public as $$
declare v text := lower(btrim(coalesce(p_usuario, ''))); v_ult timestamptz; v_n int; v_quinto timestamptz;
begin
  if v = '' then return 0; end if;
  if position('@' in v) = 0 then v := v || '@ofipapel.local'; end if;
  select max(ocurrido_en) into v_ult from auditoria where operacion = 'ENTRADA' and lower(registro_pk) = v;
  select count(*), min(ocurrido_en) into v_n, v_quinto
    from (select ocurrido_en from auditoria
           where operacion = 'FALLO_CLAVE' and lower(registro_pk) = v and ocurrido_en > now() - interval '15 minutes'
             and (v_ult is null or ocurrido_en > v_ult)
           order by ocurrido_en desc limit 5) x;
  if v_n < 5 then return 0; end if;
  return greatest(0, extract(epoch from (v_quinto + interval '15 minutes' - now()))::int);
end $$;
grant execute on function public.fn_acceso_bloqueo(text) to anon, authenticated;
grant execute on function public.fn_debo_cambiar_clave(), public.fn_clave_cambiada() to authenticated;

-- Códigos de recuperación (solo la función del servidor).
create table if not exists public.clave_codigo (
  id bigint generated always as identity primary key,
  empleado_codigo text not null references public.empleado (codigo),
  huella text not null,
  creado_en timestamptz not null default now(),
  expira_en timestamptz not null,
  intentos integer not null default 0,
  usado_en timestamptz,
  ip text
);
alter table public.clave_codigo enable row level security; -- sin políticas: nadie desde el navegador

-- Empleado activo con usuario de acceso, por su nombre de usuario (para «clave-recuperar»).
create or replace function public.fn_clave_empleado_por_usuario(p_usuario text)
returns table(codigo text, email text, auth_user_id uuid, nombre text)
language sql stable security definer set search_path = public, auth as $$
  select e.codigo, nullif(btrim(e.email), ''), e.auth_user_id, e.nombre
    from empleado e join auth.users u on u.id = e.auth_user_id
   where e.activo and lower(u.email) = case when position('@' in lower(btrim(p_usuario))) > 0 then lower(btrim(p_usuario))
                                            else lower(btrim(p_usuario)) || '@ofipapel.local' end
   limit 1
$$;
revoke execute on function public.fn_clave_empleado_por_usuario(text) from public, anon, authenticated;
grant execute on function public.fn_clave_empleado_por_usuario(text) to service_role;

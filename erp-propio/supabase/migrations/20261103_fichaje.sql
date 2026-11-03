-- Fichaje (registro horario) dentro del ERP (03/11/2026, Rober). Sustituye a fichaje.html (Firebase), que aún no se
-- había empezado a usar: nada que migrar. Los empleados salen de la tabla empleado del ERP; los repartidores se enlazan
-- con su ficha de repartidor (fichaje_empleado.repartidor_codigo).
--
-- Normativa (RDL 8/2019, art. 34.9 ET): registro diario de inicio y fin de jornada, conservado al menos 4 años y a
-- disposición de la persona, sus representantes y la Inspección. Fiable e invariable: un fichaje NUNCA se modifica ni se
-- borra; una corrección es un registro nuevo (origen «correccion») con motivo y autor, que puede anular el original
-- (anulado_por). Sin políticas de escritura: solo escriben las funciones. Todo con auditoría.
--
--  · Pantalla de fichar: /fichaje (pública: nombre + PIN de 4 cifras). La hora la pone el servidor, no el móvil.
--  · Gestión: Archivo → Fichaje (permiso «/fichaje-gestion»): Hoy, Alertas, Personas (PIN, departamento, repartidor,
--    horario), Histórico, Corrección, Exportar, Horarios y festivos, Ubicaciones, Normativa.
--  · Reparto: un repartidor no puede entregar sin haber fichado la entrada (lo comprueba fn_app_rep_marcar).

create schema if not exists fichaje_privado;  -- interno: la API no lo expone

create table if not exists public.fichaje_departamento (
  codigo text primary key,
  nombre text not null,
  grupo text not null,          -- desplegable de la pantalla de fichar (Ofipapel, Aliz-1, Aliz-2, Comerciales, Reparto)
  orden smallint not null default 0,
  lat double precision,         -- ubicación esperada (fichaje fuera de sitio); sin ella no se marca nunca
  lng double precision,
  radio_m integer,
  activo boolean not null default true,
  actualizado_en timestamptz not null default now()
);
insert into public.fichaje_departamento (codigo, nombre, grupo, orden) values
  ('repartidores', 'Repartidores', 'Reparto', 10), ('almacen', 'Almacén', 'Ofipapel', 20), ('oficina', 'Oficina', 'Ofipapel', 30),
  ('pedidos', 'Pedidos', 'Ofipapel', 40), ('comerciales', 'Comerciales', 'Comerciales', 50), ('aliz2', 'Aliz 2', 'Aliz-2', 60),
  ('aliz1', 'Aliz 1', 'Aliz-1', 70), ('ofipapel_detalle', 'Ofipapel · Detalle', 'Ofipapel', 80),
  ('ofipapel_info', 'Ofipapel · Informática', 'Ofipapel', 90), ('mobiliario', 'Mobiliario', 'Ofipapel', 100),
  ('limpieza', 'Limpieza', 'Ofipapel', 110), ('gerencia', 'Gerencia', 'Ofipapel', 120)
on conflict (codigo) do nothing;

create table if not exists public.fichaje_empleado (
  empleado_codigo text primary key references public.empleado (codigo),
  departamento_codigo text references public.fichaje_departamento (codigo),
  repartidor_codigo text unique references public.repartidor (codigo),
  activo boolean not null default true,
  actualizado_en timestamptz not null default now()
);

create table if not exists public.fichaje_pin (
  empleado_codigo text primary key references public.empleado (codigo),
  pin_hash text not null,
  fallos smallint not null default 0,
  bloqueado_hasta timestamptz,
  actualizado_en timestamptz not null default now()
);

-- Horario: general por departamento o individual por empleado (manda el individual).
create table if not exists public.fichaje_horario (
  id bigint generated always as identity primary key,
  departamento_codigo text unique references public.fichaje_departamento (codigo),
  empleado_codigo text unique references public.empleado (codigo),
  manana_desde time, manana_hasta time, tarde_desde time, tarde_hasta time,
  sabado_desde time, sabado_hasta time,
  domingos boolean not null default false,
  actualizado_en timestamptz not null default now(),
  check ((departamento_codigo is null) <> (empleado_codigo is null))
);

create table if not exists public.fichaje_festivo (
  fecha date primary key,
  etiqueta text not null,
  cerrado boolean not null default true,
  manana_desde time, manana_hasta time, tarde_desde time, tarde_hasta time,
  actualizado_en timestamptz not null default now()
);

create table if not exists public.fichaje_evento (
  id bigint generated always as identity primary key,
  empleado_codigo text not null references public.empleado (codigo),
  tipo text not null check (tipo in ('entrada', 'pausa_inicio', 'pausa_fin', 'salida')),
  en timestamptz not null default now(),
  dia date not null,
  lat double precision, lng double precision, precision_m real,
  fuera_de_sitio boolean not null default false,
  fuera_de_horario boolean not null default false,
  origen text not null default 'fichaje' check (origen in ('fichaje', 'correccion')),
  corrige_id bigint references public.fichaje_evento (id),
  motivo text,
  corregido_por text,
  anulado_por bigint references public.fichaje_evento (id),
  dispositivo text,
  creado_en timestamptz not null default now()
);
create index if not exists fichaje_evento_emp_dia_idx on public.fichaje_evento (empleado_codigo, dia, en);
create index if not exists fichaje_evento_dia_idx on public.fichaje_evento (dia);

insert into public.permiso (codigo, descripcion, modulo, tipo, orden)
values ('/fichaje-gestion', 'Fichaje (gestión del registro horario)', 'Archivo', 'menu', 95)
on conflict (codigo) do nothing;
insert into public.rol_permiso (rol_id, permiso_codigo)
select r.id, '/fichaje-gestion' from public.rol r where r.codigo = 'GERENCIA'
on conflict do nothing;

-- RLS: la gestión lee y configura; cada empleado puede leer sus propios fichajes; nadie escribe fichajes directamente.
alter table public.fichaje_departamento enable row level security;
alter table public.fichaje_empleado enable row level security;
alter table public.fichaje_pin enable row level security;
alter table public.fichaje_horario enable row level security;
alter table public.fichaje_festivo enable row level security;
alter table public.fichaje_evento enable row level security;
do $$
declare t text;
begin
  foreach t in array array['fichaje_departamento', 'fichaje_empleado', 'fichaje_horario', 'fichaje_festivo'] loop
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || '_gestion') then
      execute format('create policy %I on public.%I for all to authenticated using (public.fn_puede(''/fichaje-gestion'')) with check (public.fn_puede(''/fichaje-gestion''))', t || '_gestion', t);
    end if;
  end loop;
  if not exists (select 1 from pg_policies where tablename = 'fichaje_evento' and policyname = 'fichaje_evento_lee') then
    create policy fichaje_evento_lee on public.fichaje_evento for select to authenticated
      using (public.fn_puede('/fichaje-gestion') or empleado_codigo in (select e.codigo from public.empleado e where e.auth_user_id = auth.uid()));
  end if;
end $$;
grant select, insert, update on public.fichaje_departamento, public.fichaje_empleado to authenticated;
grant select, insert, update, delete on public.fichaje_horario, public.fichaje_festivo to authenticated;
grant select on public.fichaje_evento to authenticated;

create or replace trigger trg_auditoria_fichaje_departamento after insert or update or delete on public.fichaje_departamento for each row execute function public.fn_auditoria_trigger();
create or replace trigger trg_auditoria_fichaje_empleado after insert or update or delete on public.fichaje_empleado for each row execute function public.fn_auditoria_trigger();
create or replace trigger trg_auditoria_fichaje_horario after insert or update or delete on public.fichaje_horario for each row execute function public.fn_auditoria_trigger();
create or replace trigger trg_auditoria_fichaje_festivo after insert or update or delete on public.fichaje_festivo for each row execute function public.fn_auditoria_trigger();
create or replace trigger trg_auditoria_fichaje_evento after insert or update or delete on public.fichaje_evento for each row execute function public.fn_auditoria_trigger();

-- Un fichaje no se puede cambiar: solo se puede marcar como anulado por una corrección.
create or replace function fichaje_privado.evento_inmutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Un fichaje no se puede borrar: haz una corrección (Archivo → Fichaje → Corrección).'; end if;
  if (to_jsonb(new) - 'anulado_por') is distinct from (to_jsonb(old) - 'anulado_por') or old.anulado_por is not null then
    raise exception 'Un fichaje no se puede modificar: haz una corrección (Archivo → Fichaje → Corrección).';
  end if;
  return new;
end $$;
create or replace trigger trg_fichaje_evento_inmutable before update or delete on public.fichaje_evento
  for each row execute function fichaje_privado.evento_inmutable();

-- ------------------------------------------------------------------ Ayudantes internos
create or replace function fichaje_privado.hoy() returns date language sql stable as $$ select (now() at time zone 'Atlantic/Canary')::date $$;

-- Estado del día según el último fichaje no anulado.
create or replace function fichaje_privado.estado(p_emp text, p_dia date) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select case tipo when 'entrada' then 'trabajando' when 'pausa_fin' then 'trabajando'
                                    when 'pausa_inicio' then 'pausa' else 'salida' end
                     from fichaje_evento where empleado_codigo = p_emp and dia = p_dia and anulado_por is null
                    order by en desc, id desc limit 1), 'sin_fichar') $$;

create or replace function fichaje_privado.siguientes(p_estado text) returns text[] language sql immutable as $$
  select case p_estado when 'trabajando' then array['pausa_inicio', 'salida'] when 'pausa' then array['pausa_fin'] else array['entrada'] end $$;

-- ¿Fuera de horario? Manda el horario individual; si no, el del departamento; los festivos lo sustituyen.
create or replace function fichaje_privado.fuera_de_horario(p_emp text, p_en timestamptz) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare h fichaje_horario; f fichaje_festivo; t time := (p_en at time zone 'Atlantic/Canary')::time; d date := (p_en at time zone 'Atlantic/Canary')::date;
  dw int := extract(isodow from (p_en at time zone 'Atlantic/Canary'))::int; margen interval := interval '15 minutes';
begin
  select * into f from fichaje_festivo where fecha = d;
  if found then
    if f.cerrado then return true; end if;
    return not ((f.manana_desde is not null and t between f.manana_desde - margen and f.manana_hasta + margen)
             or (f.tarde_desde is not null and t between f.tarde_desde - margen and f.tarde_hasta + margen));
  end if;
  select * into h from fichaje_horario where empleado_codigo = p_emp;
  if not found then
    select hd.* into h from fichaje_horario hd join fichaje_empleado fe on fe.departamento_codigo = hd.departamento_codigo where fe.empleado_codigo = p_emp;
    if not found then return false; end if;  -- sin horario no se marca nunca
  end if;
  if dw = 6 then
    return h.sabado_desde is null or not (t between h.sabado_desde - margen and h.sabado_hasta + margen);
  end if;
  if dw = 7 and not h.domingos then return true; end if;
  return not ((h.manana_desde is not null and t between h.manana_desde - margen and h.manana_hasta + margen)
           or (h.tarde_desde is not null and t between h.tarde_desde - margen and h.tarde_hasta + margen));
end $$;

create or replace function fichaje_privado.fuera_de_sitio(p_emp text, p_lat double precision, p_lng double precision) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare d fichaje_departamento;
begin
  select dep.* into d from fichaje_departamento dep join fichaje_empleado fe on fe.departamento_codigo = dep.codigo where fe.empleado_codigo = p_emp;
  if not found or d.lat is null or d.radio_m is null or p_lat is null then return false; end if;
  return 6371000 * 2 * asin(sqrt(power(sin(radians(p_lat - d.lat) / 2), 2)
         + cos(radians(d.lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - d.lng) / 2), 2))) > d.radio_m;
end $$;

-- PIN con bloqueo (5 fallos = 15 min).
create or replace function fichaje_privado.pin_ok(p_emp text, p_pin text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare p fichaje_pin;
begin
  select * into p from fichaje_pin where empleado_codigo = p_emp for update;
  if not found then raise exception 'No tienes PIN de fichaje: pídelo en la oficina.'; end if;
  if p.bloqueado_hasta > now() then
    raise exception 'Demasiados intentos. Espera % min o pide ayuda en la oficina.', ceil(extract(epoch from p.bloqueado_hasta - now()) / 60)::int;
  end if;
  if p_pin is not null and extensions.crypt(p_pin, p.pin_hash) = p.pin_hash then
    update fichaje_pin set fallos = 0, bloqueado_hasta = null where empleado_codigo = p_emp and (fallos <> 0 or bloqueado_hasta is not null);
    return true;
  end if;
  update fichaje_pin set fallos = case when fallos + 1 >= 5 then 0 else fallos + 1 end,
                         bloqueado_hasta = case when fallos + 1 >= 5 then now() + interval '15 minutes' else bloqueado_hasta end
   where empleado_codigo = p_emp;
  return false;
end $$;

-- Lo que ve la persona tras poner su PIN (y un acceso directo a su reparto si es repartidor y está trabajando).
create or replace function fichaje_privado.panel(p_emp text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_dia date := fichaje_privado.hoy(); v_estado text := fichaje_privado.estado(p_emp, v_dia); v_rep text; v_token uuid;
begin
  select repartidor_codigo into v_rep from fichaje_empleado where empleado_codigo = p_emp;
  if v_rep is not null and v_estado = 'trabajando' then
    insert into reparto_app_sesion (repartidor_codigo, dispositivo) values (v_rep, 'Fichaje') returning token into v_token;
  end if;
  return jsonb_build_object(
    'ok', true, 'empleado', p_emp,
    'nombre', (select coalesce(nullif(nombre_corto, ''), nombre) from empleado where codigo = p_emp),
    'estado', v_estado, 'siguientes', to_jsonb(fichaje_privado.siguientes(v_estado)),
    'hoy', coalesce((select jsonb_agg(jsonb_build_object('tipo', tipo, 'en', en, 'origen', origen) order by en, id)
                       from fichaje_evento where empleado_codigo = p_emp and dia = v_dia and anulado_por is null), '[]'::jsonb),
    'repartidor', v_rep, 'reparto_token', v_token);
end $$;

-- ------------------------------------------------------------------ Pantalla de fichar (sin sesión: nombre + PIN)
create or replace function public.fn_fichaje_personas() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(g order by g ->> 'orden'), '[]'::jsonb) from (
    select jsonb_build_object('grupo', d.grupo, 'orden', lpad(min(d.orden)::text, 5, '0'),
             'personas', jsonb_agg(jsonb_build_object('codigo', e.codigo, 'nombre', coalesce(nullif(e.nombre_corto, ''), e.nombre))
                                   order by coalesce(nullif(e.nombre_corto, ''), e.nombre))) g
      from fichaje_empleado fe
      join empleado e on e.codigo = fe.empleado_codigo and e.activo
      join fichaje_departamento d on d.codigo = fe.departamento_codigo
      join fichaje_pin p on p.empleado_codigo = fe.empleado_codigo
     where fe.activo
     group by d.grupo) x $$;

create or replace function public.fn_fichaje_entrar(p_empleado text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not fichaje_privado.pin_ok(p_empleado, p_pin) then return jsonb_build_object('ok', false, 'error', 'PIN incorrecto.'); end if;
  return fichaje_privado.panel(p_empleado);
end $$;

create or replace function public.fn_fichaje_fichar(p_empleado text, p_pin text, p_tipo text,
  p_lat double precision default null, p_lng double precision default null, p_precision real default null, p_dispositivo text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_dia date := fichaje_privado.hoy(); v_estado text;
begin
  if not fichaje_privado.pin_ok(p_empleado, p_pin) then return jsonb_build_object('ok', false, 'error', 'PIN incorrecto.'); end if;
  perform pg_advisory_xact_lock(hashtext('fichaje:' || p_empleado));
  v_estado := fichaje_privado.estado(p_empleado, v_dia);
  if not (p_tipo = any (fichaje_privado.siguientes(v_estado))) then
    raise exception 'Ahora no toca «%»: %.', replace(p_tipo, '_', ' '),
      case v_estado when 'trabajando' then 'ya tienes la entrada fichada (puedes fichar pausa o salida)'
                    when 'pausa' then 'estás en pausa (ficha el fin de pausa)' else 'primero ficha la entrada' end;
  end if;
  perform set_config('erp.origen', 'Fichaje · ' || p_empleado, true);
  insert into fichaje_evento (empleado_codigo, tipo, dia, lat, lng, precision_m, fuera_de_sitio, fuera_de_horario, dispositivo)
  values (p_empleado, p_tipo, v_dia, p_lat, p_lng, p_precision,
          fichaje_privado.fuera_de_sitio(p_empleado, p_lat, p_lng), fichaje_privado.fuera_de_horario(p_empleado, now()), left(p_dispositivo, 200));
  return fichaje_privado.panel(p_empleado);
end $$;

grant execute on function public.fn_fichaje_personas() to anon, authenticated;
grant execute on function public.fn_fichaje_entrar(text, text) to anon, authenticated;
grant execute on function public.fn_fichaje_fichar(text, text, text, double precision, double precision, real, text) to anon, authenticated;

-- ------------------------------------------------------------------ Gestión (Archivo → Fichaje)
create or replace function public.fn_fichaje_pin_poner(p_empleado text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not fn_puede('/fichaje-gestion') then raise exception 'Sin permiso de Fichaje (gestión).' using errcode = '42501'; end if;
  if p_pin !~ '^\d{4}$' then raise exception 'El PIN tiene que ser de 4 cifras.'; end if;
  insert into fichaje_pin (empleado_codigo, pin_hash) values (p_empleado, extensions.crypt(p_pin, extensions.gen_salt('bf')))
  on conflict (empleado_codigo) do update set pin_hash = excluded.pin_hash, fallos = 0, bloqueado_hasta = null, actualizado_en = now();
  return jsonb_build_object('ok', true);
end $$;

-- Plantilla para la pestaña Personas (con o sin ficha de fichaje).
create or replace function public.fn_fichaje_plantilla() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when fn_puede('/fichaje-gestion') then coalesce(jsonb_agg(jsonb_build_object(
           'codigo', e.codigo, 'nombre', e.nombre, 'nombre_corto', e.nombre_corto, 'numero', e.numero_operario, 'activo', e.activo,
           'departamento', fe.departamento_codigo, 'repartidor', fe.repartidor_codigo, 'ficha', coalesce(fe.activo, false),
           'con_pin', p.empleado_codigo is not null, 'horario_propio', exists (select 1 from fichaje_horario h where h.empleado_codigo = e.codigo))
         order by coalesce(nullif(e.nombre_corto, ''), e.nombre)), '[]'::jsonb) end
    from empleado e
    left join fichaje_empleado fe on fe.empleado_codigo = e.codigo
    left join fichaje_pin p on p.empleado_codigo = e.codigo
   where e.activo or fe.activo $$;

-- Corrección: nunca toca el fichaje original; crea uno nuevo con motivo y autor y, si se indica, anula el original.
create or replace function public.fn_fichaje_corregir(p_empleado text, p_tipo text, p_en timestamptz, p_motivo text, p_anula bigint default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_quien text := coalesce(fn_empleado_actual(), 'ERP');
begin
  if not fn_puede('/fichaje-gestion') then raise exception 'Sin permiso de Fichaje (gestión).' using errcode = '42501'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escribe el motivo de la corrección (es obligatorio).'; end if;
  if p_tipo is not null and p_tipo not in ('entrada', 'pausa_inicio', 'pausa_fin', 'salida') then raise exception 'Tipo de fichaje no válido.'; end if;
  if p_tipo is null and p_anula is null then raise exception 'Indica el fichaje nuevo o el que se anula.'; end if;
  if p_en is not null and p_en > now() then raise exception 'No se puede fichar en el futuro.'; end if;
  if p_anula is not null and not exists (select 1 from fichaje_evento where id = p_anula and empleado_codigo = p_empleado and anulado_por is null) then
    raise exception 'Ese fichaje no existe, no es de esta persona o ya está anulado.';
  end if;
  insert into fichaje_evento (empleado_codigo, tipo, en, dia, origen, corrige_id, motivo, corregido_por, fuera_de_horario)
  values (p_empleado, coalesce(p_tipo, (select tipo from fichaje_evento where id = p_anula)),
          coalesce(p_en, (select en from fichaje_evento where id = p_anula)),
          (coalesce(p_en, (select en from fichaje_evento where id = p_anula)) at time zone 'Atlantic/Canary')::date,
          'correccion', p_anula, left(trim(p_motivo), 500), v_quien,
          fichaje_privado.fuera_de_horario(p_empleado, coalesce(p_en, now())))
  returning id into v_id;
  -- Solo anular (sin fichaje nuevo): el registro de corrección deja constancia y él mismo queda anulado.
  if p_anula is not null then
    update fichaje_evento set anulado_por = v_id where id = p_anula;
    if p_tipo is null then update fichaje_evento set anulado_por = v_id where id = v_id; end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Eventos de un periodo (Histórico, Exportar y Alertas).
create or replace function public.fn_fichaje_eventos(p_desde date, p_hasta date, p_empleado text default null, p_departamento text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when fn_puede('/fichaje-gestion') then coalesce(jsonb_agg(jsonb_build_object(
           'id', v.id, 'empleado', v.empleado_codigo, 'nombre', coalesce(nullif(e.nombre_corto, ''), e.nombre), 'nombre_completo', e.nombre,
           'numero', e.numero_operario, 'departamento', fe.departamento_codigo, 'tipo', v.tipo, 'en', v.en, 'dia', v.dia, 'origen', v.origen,
           'motivo', v.motivo, 'corregido_por', v.corregido_por, 'corrige_id', v.corrige_id, 'anulado_por', v.anulado_por,
           'fuera_de_sitio', v.fuera_de_sitio, 'fuera_de_horario', v.fuera_de_horario, 'lat', v.lat, 'lng', v.lng)
         order by v.dia, e.nombre, v.en, v.id), '[]'::jsonb) end
    from fichaje_evento v
    join empleado e on e.codigo = v.empleado_codigo
    left join fichaje_empleado fe on fe.empleado_codigo = v.empleado_codigo
   where v.dia between p_desde and p_hasta
     and (p_empleado is null or v.empleado_codigo = p_empleado)
     and (p_departamento is null or fe.departamento_codigo = p_departamento) $$;

-- Hoy: cada persona que ficha, su estado y sus fichajes del día.
create or replace function public.fn_fichaje_hoy(p_dia date default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when fn_puede('/fichaje-gestion') then coalesce(jsonb_agg(jsonb_build_object(
           'empleado', e.codigo, 'nombre', coalesce(nullif(e.nombre_corto, ''), e.nombre), 'departamento', d.nombre, 'grupo', d.grupo,
           'estado', fichaje_privado.estado(e.codigo, coalesce(p_dia, fichaje_privado.hoy())),
           'eventos', coalesce((select jsonb_agg(jsonb_build_object('tipo', v.tipo, 'en', v.en, 'origen', v.origen, 'fuera_de_sitio', v.fuera_de_sitio,
                                                                     'fuera_de_horario', v.fuera_de_horario) order by v.en, v.id)
                                  from fichaje_evento v where v.empleado_codigo = e.codigo and v.dia = coalesce(p_dia, fichaje_privado.hoy())
                                   and v.anulado_por is null), '[]'::jsonb))
         order by d.orden, coalesce(nullif(e.nombre_corto, ''), e.nombre)), '[]'::jsonb) end
    from fichaje_empleado fe
    join empleado e on e.codigo = fe.empleado_codigo
    left join fichaje_departamento d on d.codigo = fe.departamento_codigo
   where fe.activo $$;

grant execute on function public.fn_fichaje_pin_poner(text, text) to authenticated;
grant execute on function public.fn_fichaje_plantilla() to authenticated;
grant execute on function public.fn_fichaje_corregir(text, text, timestamptz, text, bigint) to authenticated;
grant execute on function public.fn_fichaje_eventos(date, date, text, text) to authenticated;
grant execute on function public.fn_fichaje_hoy(date) to authenticated;

-- ------------------------------------------------------------------ Reparto: sin fichar no se entrega
-- Estado de fichaje del repartidor (para el aviso de la app) y comprobación en el servidor al marcar.
create or replace function reparto_privado.fichaje(p_rep text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select fichaje_privado.estado(fe.empleado_codigo, fichaje_privado.hoy()) from fichaje_empleado fe
                    where fe.repartidor_codigo = p_rep and fe.activo), 'sin_vinculo') $$;

create or replace function public.fn_app_rep_fichaje(p_token uuid) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  return reparto_privado.fichaje(reparto_privado.sesion(p_token));
end $$;
grant execute on function public.fn_app_rep_fichaje(uuid) to anon, authenticated;

-- Datos de la sesión (la app la recibe ya abierta desde Fichaje con ?t=token).
create or replace function public.fn_app_rep_sesion_datos(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_rep text := reparto_privado.sesion(p_token);
begin
  return (select jsonb_build_object('ok', true, 'token', p_token, 'repartidor', r.codigo, 'nombre', coalesce(nullif(r.nombre_corto, ''), r.nombre),
                                    'puede_cambiar_ruta', coalesce(p.puede_cambiar_ruta, false))
            from repartidor r left join repartidor_pin p on p.repartidor_codigo = r.codigo where r.codigo = v_rep);
end $$;
grant execute on function public.fn_app_rep_sesion_datos(uuid) to anon, authenticated;

-- ¿Había fichado la entrada cuando marcó? (se mira la hora del marcado, que puede venir de antes si no había cobertura).
-- Un repartidor que aún no está enlazado a ningún empleado en Fichaje no se bloquea (lo avisa la app).
create or replace function reparto_privado.ha_fichado(p_rep text, p_en timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from fichaje_empleado where repartidor_codigo = p_rep and activo)
      or exists (select 1 from fichaje_evento v join fichaje_empleado fe on fe.empleado_codigo = v.empleado_codigo
                  where fe.repartidor_codigo = p_rep and fe.activo and v.tipo = 'entrada' and v.anulado_por is null
                    and v.dia = (p_en at time zone 'Atlantic/Canary')::date and v.en <= p_en + interval '5 minutes') $$;

-- fn_app_rep_marcar (de 20261103_reparto_app.sql) con la comprobación de fichaje.
create or replace function public.fn_app_rep_marcar(
  p_token uuid, p_tienda text, p_numero integer, p_vt text, p_vn integer, p_accion text,
  p_detalle text default null, p_nota text default null, p_en timestamptz default null,
  p_lat double precision default null, p_lng double precision default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_rep text := reparto_privado.sesion(p_token); l reparto_linea; t timestamptz; v_nota text := nullif(trim(left(p_nota, 500)), '');
  v_obs text;
begin
  perform reparto_privado.reparto(v_rep, p_tienda, p_numero);
  select * into l from reparto_linea where tienda_terminal_codigo = p_tienda and numero = p_numero and venta_tienda_codigo = p_vt and venta_numero = p_vn for update;
  if not found then raise exception 'Ese pedido ya no está en esta ruta.'; end if;
  if l.estado in ('liquidado', 'anulado') then raise exception 'Ese pedido ya está %.', l.estado; end if;
  t := least(now(), greatest(coalesce(p_en, now()), now() - interval '20 hours'));
  if p_accion <> 'deshacer' and not reparto_privado.ha_fichado(v_rep, t) then
    raise exception 'Primero ficha la entrada (botón «Fichar» de la app): sin fichar no se puede entregar.';
  end if;

  if p_accion = 'entregado' then
    update reparto_linea set estado = 'entregado', incidencia = null, motivo_no_entrega = null, nota_repartidor = v_nota,
           entregado_en = t, estado_observaciones = v_nota, marcado_lat = p_lat, marcado_lng = p_lng
     where tienda_terminal_codigo = p_tienda and numero = p_numero and venta_tienda_codigo = p_vt and venta_numero = p_vn;
  elsif p_accion = 'incidencia' then
    if p_detalle is null or p_detalle not in ('faltan', 'devuelve', 'no_corresponde', 'otro') then raise exception 'Elige el tipo de incidencia.'; end if;
    if p_detalle = 'otro' and v_nota is null then raise exception 'Explica la incidencia.'; end if;
    v_obs := 'Incidencia: ' || case p_detalle when 'faltan' then 'faltan artículos' when 'devuelve' then 'devuelve artículos'
                                              when 'no_corresponde' then 'no corresponde con lo pedido' else 'otra' end || coalesce(' · ' || v_nota, '');
    update reparto_linea set estado = 'entregado', incidencia = p_detalle, motivo_no_entrega = null, nota_repartidor = v_nota,
           entregado_en = t, estado_observaciones = v_obs, marcado_lat = p_lat, marcado_lng = p_lng
     where tienda_terminal_codigo = p_tienda and numero = p_numero and venta_tienda_codigo = p_vt and venta_numero = p_vn;
  elsif p_accion = 'no_entregado' then
    if p_detalle is null or p_detalle not in ('no_contesta', 'direccion', 'ausente', 'cerrado', 'otro') then raise exception 'Elige el motivo.'; end if;
    if p_detalle = 'otro' and v_nota is null then raise exception 'Explica qué ha pasado.'; end if;
    -- Repetición del mismo marcado (p. ej. reenvío sin cobertura): no cuenta como otro intento.
    if not ((l.intento2_en is not null and abs(extract(epoch from t - l.intento2_en)) < 90)
            or (l.intento2_en is null and l.intento1_en is not null and abs(extract(epoch from t - l.intento1_en)) < 90)) then
      if l.intento1_en is null then l.intento1_en := t; else l.intento2_en := t; end if;
    end if;
    v_obs := 'No entregado: ' || case p_detalle when 'no_contesta' then 'nadie contesta' when 'direccion' then 'la dirección no coincide'
                                                when 'ausente' then 'cliente ausente' when 'cerrado' then 'cerrado' else 'otro' end
             || coalesce(' · ' || v_nota, '')
             || ' · ' || to_char(l.intento1_en at time zone 'Atlantic/Canary', 'HH24:MI')
             || coalesce(' y ' || to_char(l.intento2_en at time zone 'Atlantic/Canary', 'HH24:MI'), '');
    update reparto_linea set estado = 'no_entregado', incidencia = null, motivo_no_entrega = p_detalle, nota_repartidor = v_nota,
           intento1_en = l.intento1_en, intento2_en = l.intento2_en, entregado_en = null, estado_observaciones = v_obs,
           marcado_lat = p_lat, marcado_lng = p_lng
     where tienda_terminal_codigo = p_tienda and numero = p_numero and venta_tienda_codigo = p_vt and venta_numero = p_vn;
  elsif p_accion = 'deshacer' then
    update reparto_linea set estado = case when reparto_anterior_numero is not null then 'viene_anterior' else 'pendiente' end,
           incidencia = null, motivo_no_entrega = null, nota_repartidor = null, entregado_en = null,
           intento2_en = case when l.estado = 'no_entregado' and intento2_en is not null then null else intento2_en end,
           intento1_en = case when l.estado = 'no_entregado' and intento2_en is null then null else intento1_en end,
           estado_observaciones = null, marcado_lat = null, marcado_lng = null
     where tienda_terminal_codigo = p_tienda and numero = p_numero and venta_tienda_codigo = p_vt and venta_numero = p_vn;
  else
    raise exception 'Acción no válida.';
  end if;
  return jsonb_build_object('ok', true);
end $$;


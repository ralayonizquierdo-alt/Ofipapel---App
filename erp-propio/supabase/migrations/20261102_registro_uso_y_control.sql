-- Registro de uso, accesos remotos y controles contra el falseo de las cuentas (Luis, 01/11/2026:
-- «lo que más me preocupa es que un operario o alguien pueda falsear las cuentas»; «las condiciones
-- de las auditorías tienen que cumplirlas incluidos los super administradores»; «si no le permite
-- ejecutar algo, ha de darle la forma de solucionarlo correctamente»).
--
--  1. Auditoría: solo escribe el propio sistema (se quita el alta directa desde el navegador). Nuevas
--     columnas área (contabilidad / avatar / web) y remoto.
--  2. Registro de uso: pantallas abiertas, exportaciones e impresiones (fn_uso_evento) y minutos con
--     actividad de teclado o ratón (uso_actividad, fn_uso_latido). Uso fuera de lo normal (noche,
--     domingo, más de 10 h) → aviso. Informe «Uso por operario» (fn_uso_informe / fn_uso_detalle).
--  3. Redes de las tiendas (red_tienda): lo que no sale por ellas es «remoto». Teletrabajo por
--     empleado (empleado_acceso.remoto_permitido / horario_remoto) y horario de Contabilidad.
--     Se aplica a TODOS, también a administradores y super administradores. Solo se activa con el
--     parámetro acceso.control_remoto y al menos una red dada de alta.
--  4. Contabilidad:
--     · Los asientos automáticos no se modifican a mano (se corrige el documento, se anula para que
--       se rehaga o se hace un asiento de ajuste).
--     · Cierre mensual (contab_mes_cerrado): en un mes cerrado no se graba ni se anula a mano.
--     · Asiento conciliado con el banco: primero hay que deshacer la conciliación.
--     · Huella encadenada de los asientos (asiento_huella, como VeriFactu) y fn_contab_comprobar_integridad.
--     · Doble firma: un asiento manual de importe ≥ contab.importe_doble_firma (3.000 € por defecto) queda
--       pendiente (asiento_propuesta) hasta que lo aprueba OTRO super administrador. También los suyos.
--  5. Globo de avisos de auditoría: nuevos motivos.
--  6. Texto legal para que cada empleado lo acepte al entrar.
-- Todo mensaje que impide algo dice también cómo hacerlo bien.

-- 1. Auditoría ----------------------------------------------------------------------------------------
drop policy if exists inmutable_alta_auditoria on public.auditoria;
alter table public.auditoria add column if not exists area text;
alter table public.auditoria add column if not exists remoto boolean;
create index if not exists auditoria_operacion_idx on public.auditoria (operacion, ocurrido_en desc);
comment on column public.auditoria.area is 'Área del programa en la que estaba (contabilidad, avatar, web).';
comment on column public.auditoria.remoto is 'true = desde fuera de las redes de las tiendas; null = no se sabe (sin redes dadas de alta).';

-- 3. Redes de las tiendas -----------------------------------------------------------------------------
create table if not exists public.red_tienda (
  id bigint generated always as identity primary key,
  ip text not null unique,
  nombre text not null,
  tienda_codigo text references public.tienda_terminal (codigo),
  creado_por text default public.fn_empleado_actual(),
  creado_en timestamptz not null default now()
);
comment on table public.red_tienda is 'Conexiones a internet propias (tiendas, oficina). Lo que no entra por ellas es acceso remoto.';
alter table public.red_tienda enable row level security;
drop policy if exists red_tienda_lee on public.red_tienda;
create policy red_tienda_lee on public.red_tienda for select to authenticated using (public.fn_es_super_administrador());
drop trigger if exists trg_auditoria_red_tienda on public.red_tienda;
create trigger trg_auditoria_red_tienda after insert or update or delete on public.red_tienda
  for each row execute function public.fn_auditoria_trigger();

alter table public.empleado_acceso add column if not exists remoto_permitido boolean not null default false;
alter table public.empleado_acceso add column if not exists horario_remoto jsonb;
alter table public.empleado_acceso add column if not exists horario_contabilidad jsonb;
comment on column public.empleado_acceso.remoto_permitido is 'Puede trabajar desde fuera de las tiendas (teletrabajo). Vale para todos, también administradores.';
comment on column public.empleado_acceso.horario_remoto is 'Horario de teletrabajo {"dias":[1..7],"desde","hasta"}; null = el mismo que en la tienda.';
comment on column public.empleado_acceso.horario_contabilidad is 'Horario en que puede usar Contabilidad; null = sin límite propio.';

-- ¿Remoto? null si no se puede saber (sin IP o sin redes dadas de alta).
create or replace function public.fn_red_es_remoto(p_ip text)
returns boolean language sql stable security definer set search_path = public as $$
  select case when p_ip is null or not exists (select 1 from red_tienda) then null
              else not exists (select 1 from red_tienda where ip = p_ip) end
$$;

-- Lo que la pantalla necesita para el control de horario y teletrabajo (para todos los empleados).
create or replace function public.fn_mi_control()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_ip text := fn_peticion_ip(); ea empleado_acceso; v_red text; v_hay boolean := exists (select 1 from red_tienda);
begin
  if auth.uid() is null then return null; end if;
  select * into ea from empleado_acceso where empleado_codigo = fn_empleado_actual();
  select nombre into v_red from red_tienda where ip = v_ip;
  return jsonb_build_object(
    'ip', v_ip, 'red', v_red, 'remoto', fn_red_es_remoto(v_ip),
    'control_remoto', v_hay and coalesce(fn_parametro_texto('acceso.control_remoto'), 'false') = 'true',
    'remoto_permitido', coalesce(ea.remoto_permitido, false),
    'horario', ea.horario, 'horario_remoto', ea.horario_remoto, 'horario_contabilidad', ea.horario_contabilidad);
end $$;

create or replace function public.fn_red_guardar(p_ip text, p_nombre text, p_tienda text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_ip text := nullif(btrim(coalesce(p_ip, '')), '');
begin
  if not fn_es_super_administrador() then raise exception 'Solo un super administrador puede dar de alta las redes de las tiendas.'; end if;
  if v_ip is null or v_ip !~ '^[0-9a-fA-F:.]{3,45}$' then raise exception 'IP no válida. Cómo hacerlo bien: entra desde esa tienda y pulsa «Esta es la red de aquí».'; end if;
  if nullif(btrim(coalesce(p_nombre, '')), '') is null then raise exception 'Ponle un nombre (p. ej. «Tienda Arguineguín»).'; end if;
  insert into red_tienda (ip, nombre, tienda_codigo) values (v_ip, btrim(p_nombre), nullif(btrim(coalesce(p_tienda, '')), ''))
  on conflict (ip) do update set nombre = excluded.nombre, tienda_codigo = excluded.tienda_codigo;
end $$;

create or replace function public.fn_red_borrar(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fn_es_super_administrador() then raise exception 'Solo un super administrador puede quitar redes.'; end if;
  delete from red_tienda where id = p_id;
end $$;

-- Entradas y salidas: ahora con área y remoto.
drop function if exists public.fn_registrar_acceso(text, text, text);
create or replace function public.fn_registrar_acceso(p_tipo text, p_tienda text default null, p_usuario text default null, p_area text default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_tipo text := upper(btrim(coalesce(p_tipo, '')));
  v_emp text := fn_empleado_actual();
  v_usuario text := left(lower(btrim(coalesce(p_usuario, ''))), 100);
  v_ip text := fn_peticion_ip();
  v_area text := case when p_area ~ '^[a-z]{2,20}$' then p_area end;
begin
  if v_tipo not in ('ENTRADA', 'SALIDA', 'FALLO_CLAVE', 'FUERA_HORARIO') then
    raise exception 'Tipo de acceso no válido.';
  end if;
  if v_tipo <> 'FALLO_CLAVE' and auth.uid() is null then
    raise exception 'No hay sesión.';
  end if;
  if v_tipo = 'FALLO_CLAVE' then
    if (select count(*) from auditoria where operacion = 'FALLO_CLAVE' and ip is not distinct from v_ip
          and ocurrido_en > now() - interval '10 minutes') >= 20 then
      return;
    end if;
    select e.codigo into v_emp
      from empleado e join auth.users u on u.id = e.auth_user_id
     where lower(u.email) = v_usuario or lower(split_part(u.email, '@', 1)) = split_part(v_usuario, '@', 1)
     limit 1;
  end if;
  insert into auditoria (tabla, operacion, registro_pk, empleado_codigo, datos_despues, ocurrido_en, tienda_terminal_codigo,
                         usuario_id, ip, dispositivo, registro_nombre, area, remoto)
  values ('acceso', v_tipo, coalesce(nullif(v_usuario, ''), ''), v_emp,
          jsonb_strip_nulls(jsonb_build_object('usuario', nullif(v_usuario, ''))), now(), nullif(btrim(coalesce(p_tienda, '')), ''),
          auth.uid(), v_ip, fn_peticion_dispositivo(),
          case v_tipo when 'ENTRADA' then 'Entrada al programa' when 'SALIDA' then 'Salida del programa'
                      when 'FALLO_CLAVE' then 'Contraseña incorrecta' else 'Intento fuera de horario' end,
          v_area, fn_red_es_remoto(v_ip));
end;
$function$;
grant execute on function public.fn_registrar_acceso(text, text, text, text) to anon, authenticated;

-- 2. Registro de uso ----------------------------------------------------------------------------------
create table if not exists public.uso_actividad (
  empleado_codigo text not null references public.empleado (codigo),
  dia date not null,
  area text not null,
  remoto boolean not null default false,
  minutos integer not null default 0,
  primera timestamptz not null default now(),
  ultima timestamptz not null default now(),
  primary key (empleado_codigo, dia, area, remoto)
);
comment on table public.uso_actividad is 'Minutos con actividad real (teclado o ratón) por empleado, día (hora de Canarias), área y si era remoto.';
alter table public.uso_actividad enable row level security;
drop policy if exists uso_actividad_lee on public.uso_actividad;
create policy uso_actividad_lee on public.uso_actividad for select to authenticated using (public.fn_es_super_administrador());

-- Pantallas abiertas, exportaciones, impresiones, entradas remotas sin permiso…
create or replace function public.fn_uso_evento(p_tipo text, p_area text, p_ruta text, p_titulo text default null, p_detalle text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tipo text := upper(btrim(coalesce(p_tipo, '')));
  v_emp text := fn_empleado_actual();
  v_ruta text := left(coalesce(p_ruta, ''), 200);
  v_ip text := fn_peticion_ip();
begin
  if auth.uid() is null or v_emp is null then return; end if;
  if v_tipo not in ('PANTALLA', 'EXPORTA', 'IMPRIME', 'REMOTO_DENEGADO', 'FUERA_HORARIO') then raise exception 'Tipo de uso no válido.'; end if;
  -- Sin inundar la auditoría: la misma pantalla seguida no se repite en 2 minutos; como mucho 300 por hora.
  if v_tipo = 'PANTALLA' and exists (select 1 from auditoria where empleado_codigo = v_emp and operacion = 'PANTALLA'
        and registro_pk = v_ruta and ocurrido_en > now() - interval '2 minutes') then return; end if;
  if (select count(*) from auditoria where empleado_codigo = v_emp and tabla = 'uso' and ocurrido_en > now() - interval '1 hour') >= 300 then return; end if;
  if v_tipo in ('REMOTO_DENEGADO', 'FUERA_HORARIO') and exists (select 1 from auditoria where empleado_codigo = v_emp and operacion = v_tipo
        and ocurrido_en > now() - interval '30 minutes') then return; end if;
  insert into auditoria (tabla, operacion, registro_pk, empleado_codigo, registro_nombre, datos_despues, ocurrido_en, usuario_id,
                         ip, dispositivo, area, remoto)
  values ('uso', v_tipo, v_ruta, v_emp, left(coalesce(nullif(p_titulo, ''), v_ruta), 200),
          jsonb_strip_nulls(jsonb_build_object('detalle', left(nullif(p_detalle, ''), 300))), now(), auth.uid(),
          v_ip, fn_peticion_dispositivo(), case when p_area ~ '^[a-z]{2,20}$' then p_area end, fn_red_es_remoto(v_ip));
end $$;

-- Un minuto con actividad. La pantalla lo manda cada minuto en el que se ha tocado el teclado o el ratón.
create or replace function public.fn_uso_latido(p_area text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_emp text := fn_empleado_actual();
  v_local timestamp := now() at time zone 'Atlantic/Canary';
  v_dia date := (now() at time zone 'Atlantic/Canary')::date;
  v_area text := case when p_area ~ '^[a-z]{2,20}$' then p_area else 'avatar' end;
  v_ip text := fn_peticion_ip();
  v_rem boolean := coalesce(fn_red_es_remoto(v_ip), false);
  v_raro text; v_nombre text;
begin
  if auth.uid() is null or v_emp is null then return; end if;
  -- Varias pestañas abiertas: el mismo minuto cuenta una sola vez.
  if exists (select 1 from uso_actividad where empleado_codigo = v_emp and dia = v_dia and ultima > now() - interval '50 seconds') then return; end if;
  insert into uso_actividad (empleado_codigo, dia, area, remoto, minutos) values (v_emp, v_dia, v_area, v_rem, 1)
  on conflict (empleado_codigo, dia, area, remoto) do update set minutos = uso_actividad.minutos + 1, ultima = now();
  -- Uso fuera de lo normal: una vez al día por cada motivo.
  if extract(isodow from v_local) = 7 then v_raro := 'domingo'; v_nombre := 'Trabajando en domingo';
  elsif extract(hour from v_local) < 7 or extract(hour from v_local) >= 22 then v_raro := 'noche'; v_nombre := 'Trabajando a las ' || to_char(v_local, 'HH24:MI');
  elsif (select sum(minutos) from uso_actividad where empleado_codigo = v_emp and dia = v_dia) > 600 then v_raro := 'muchas_horas'; v_nombre := 'Más de 10 horas de uso en el día';
  end if;
  if v_raro is not null and not exists (select 1 from auditoria where empleado_codigo = v_emp and operacion = 'USO_RARO' and registro_pk = v_raro
        and ocurrido_en >= (v_dia::timestamp at time zone 'Atlantic/Canary')) then
    insert into auditoria (tabla, operacion, registro_pk, empleado_codigo, registro_nombre, ocurrido_en, usuario_id, ip, dispositivo, area, remoto)
    values ('uso', 'USO_RARO', v_raro, v_emp, v_nombre, now(), auth.uid(), v_ip, fn_peticion_dispositivo(), v_area, fn_red_es_remoto(v_ip));
  end if;
end $$;

-- Informe por operario y día.
create or replace function public.fn_uso_informe(p_desde date, p_hasta date, p_empleado text default null, p_area text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not fn_es_super_administrador() then raise exception 'Solo los super administradores pueden ver el uso del programa.'; end if;
  with act as (
    select empleado_codigo emp, dia,
           sum(minutos) filter (where p_area is null or area = p_area) minutos,
           sum(minutos) filter (where remoto and (p_area is null or area = p_area)) minutos_remoto,
           min(primera) filter (where p_area is null or area = p_area) primera,
           max(ultima) filter (where p_area is null or area = p_area) ultima,
           jsonb_object_agg(area || case when remoto then ' (remoto)' else '' end, minutos) por_area
      from uso_actividad
     where dia between p_desde and p_hasta and (p_empleado is null or empleado_codigo = p_empleado)
     group by 1, 2),
  ev as (
    select empleado_codigo emp, (ocurrido_en at time zone 'Atlantic/Canary')::date dia,
           min(ocurrido_en) filter (where operacion = 'ENTRADA') entrada,
           max(ocurrido_en) filter (where operacion = 'SALIDA') salida,
           count(*) filter (where operacion = 'PANTALLA' and (p_area is null or area = p_area)) pantallas,
           count(*) filter (where operacion in ('EXPORTA', 'IMPRIME') and (p_area is null or area = p_area)) salidas_datos,
           bool_or(remoto) filter (where operacion in ('ENTRADA', 'PANTALLA')) remoto,
           count(*) filter (where operacion in ('FALLO_CLAVE', 'FUERA_HORARIO', 'REMOTO_DENEGADO', 'USO_RARO')) incidencias
      from auditoria
     where tabla in ('acceso', 'uso') and empleado_codigo is not null
       and ocurrido_en >= (p_desde::timestamp at time zone 'Atlantic/Canary')
       and ocurrido_en < ((p_hasta + 1)::timestamp at time zone 'Atlantic/Canary')
       and (p_empleado is null or empleado_codigo = p_empleado)
     group by 1, 2)
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'empleado', e.codigo, 'nombre', e.nombre, 'numero', e.numero_operario, 'dia', coalesce(act.dia, ev.dia),
           'entrada', ev.entrada, 'salida', ev.salida, 'primera', act.primera, 'ultima', act.ultima,
           'minutos', coalesce(act.minutos, 0), 'minutos_remoto', coalesce(act.minutos_remoto, 0), 'por_area', act.por_area,
           'pantallas', coalesce(ev.pantallas, 0), 'salidas_datos', coalesce(ev.salidas_datos, 0),
           'remoto', coalesce(ev.remoto, act.minutos_remoto > 0), 'incidencias', coalesce(ev.incidencias, 0)))
         order by coalesce(act.dia, ev.dia) desc, e.nombre), '[]')
    into v
    from act full join ev on ev.emp = act.emp and ev.dia = act.dia
    join empleado e on e.codigo = coalesce(act.emp, ev.emp)
   where p_area is null or coalesce(act.minutos, 0) > 0 or coalesce(ev.pantallas, 0) > 0;
  return v;
end $$;

create or replace function public.fn_uso_detalle(p_empleado text, p_dia date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not fn_es_super_administrador() then raise exception 'Solo los super administradores pueden ver el uso del programa.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('hora', a.ocurrido_en, 'operacion', a.operacion, 'area', a.area,
             'ruta', nullif(a.registro_pk, ''), 'nombre', a.registro_nombre, 'detalle', a.datos_despues ->> 'detalle',
             'ip', a.ip, 'remoto', a.remoto)) order by a.ocurrido_en, a.id)
      from auditoria a
     where a.empleado_codigo = p_empleado and a.tabla in ('acceso', 'uso')
       and a.ocurrido_en >= (p_dia::timestamp at time zone 'Atlantic/Canary')
       and a.ocurrido_en < ((p_dia + 1)::timestamp at time zone 'Atlantic/Canary')), '[]');
end $$;

-- 4. Contabilidad --------------------------------------------------------------------------------------
-- 4a. Cierre mensual.
create table if not exists public.contab_mes_cerrado (
  empresa_id smallint not null references public.empresa_contable (id),
  anio integer not null,
  mes integer not null check (mes between 1 and 12),
  cerrado boolean not null default true,
  cerrado_por text,
  cerrado_en timestamptz,
  reabierto_por text,
  reabierto_en timestamptz,
  motivo text,
  primary key (empresa_id, anio, mes)
);
comment on table public.contab_mes_cerrado is 'Meses cerrados de la contabilidad: no se graba ni se anula a mano con fecha de ese mes.';
alter table public.contab_mes_cerrado enable row level security;
drop policy if exists contab_mes_cerrado_lee on public.contab_mes_cerrado;
create policy contab_mes_cerrado_lee on public.contab_mes_cerrado for select to authenticated using (empresa_id = public.fn_contab_empresa());
drop trigger if exists trg_auditoria_contab_mes_cerrado on public.contab_mes_cerrado;
create trigger trg_auditoria_contab_mes_cerrado after insert or update or delete on public.contab_mes_cerrado
  for each row execute function public.fn_auditoria_trigger();

create or replace function public.fn_contab_control_mes(p_emp smallint, p_fecha date)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if p_fecha is null then return; end if;
  if exists (select 1 from contab_mes_cerrado where empresa_id = p_emp and cerrado
               and anio = extract(year from p_fecha) and mes = extract(month from p_fecha)) then
    raise exception 'El mes % está cerrado en Contabilidad. Cómo hacerlo bien: graba el asiento con fecha de un mes abierto (por ejemplo, hoy) y pon en el concepto a qué mes corresponde; si de verdad tiene que ir en ese mes, un super administrador lo reabre en Contabilidad → Control → Meses, indicando el motivo.',
      to_char(p_fecha, 'MM/YYYY') using errcode = '42501';
  end if;
end $$;

create or replace function public.fn_contab_cerrar_mes(p_anio integer, p_mes integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_emp smallint := fn_contab_empresa();
begin
  if not fn_es_super_administrador() then raise exception 'Solo un super administrador puede cerrar meses.'; end if;
  if p_mes not between 1 and 12 then raise exception 'Mes no válido.'; end if;
  insert into contab_mes_cerrado (empresa_id, anio, mes, cerrado, cerrado_por, cerrado_en)
  values (v_emp, p_anio, p_mes, true, fn_empleado_actual(), now())
  on conflict (empresa_id, anio, mes) do update set cerrado = true, cerrado_por = excluded.cerrado_por, cerrado_en = now();
end $$;

create or replace function public.fn_contab_reabrir_mes(p_anio integer, p_mes integer, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_emp smallint := fn_contab_empresa();
begin
  if not fn_es_super_administrador() then raise exception 'Solo un super administrador puede reabrir meses.'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Escribe el motivo de la reapertura (queda en la auditoría).'; end if;
  update contab_mes_cerrado set cerrado = false, reabierto_por = fn_empleado_actual(), reabierto_en = now(), motivo = btrim(p_motivo)
   where empresa_id = v_emp and anio = p_anio and mes = p_mes and cerrado;
  if not found then raise exception 'Ese mes no está cerrado.'; end if;
end $$;

-- 4b. Asiento conciliado con el banco.
create or replace function public.fn_contab_control_conciliado(p_asiento bigint)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from apunte p join extracto_movimiento_apunte x on x.apunte_id = p.id where p.asiento_id = p_asiento)
     or exists (select 1 from extracto_movimiento m where m.asiento_generado_id = p_asiento) then
    raise exception 'Este asiento está conciliado con el banco. Cómo hacerlo bien: en Contabilidad → Conciliación bancaria, deshaz primero la conciliación de ese movimiento; después ya podrás cambiarlo o anularlo.'
      using errcode = '42501';
  end if;
end $$;

-- 4c. Huella encadenada de los asientos (como VeriFactu).
create table if not exists public.asiento_huella (
  asiento_id bigint primary key references public.asiento (id),
  empresa_id smallint not null,
  orden bigint generated always as identity,
  huella text not null,
  anterior text,
  creado_en timestamptz not null default now()
);
comment on table public.asiento_huella is 'Huella (sha-256) de cada asiento encadenada con la del anterior de la misma empresa. Inmutable.';
create index if not exists asiento_huella_orden_idx on public.asiento_huella (empresa_id, orden);
alter table public.asiento_huella enable row level security;
drop policy if exists asiento_huella_lee on public.asiento_huella;
create policy asiento_huella_lee on public.asiento_huella for select to authenticated using (public.fn_es_super_administrador());

create or replace function public.fn_asiento_huella_inmutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Las huellas de los asientos no se pueden modificar ni borrar.';
end $$;
drop trigger if exists trg_asiento_huella_inmutable on public.asiento_huella;
create trigger trg_asiento_huella_inmutable before update or delete on public.asiento_huella
  for each row execute function public.fn_asiento_huella_inmutable();

-- Contenido que se firma: lo que no cambia nunca (el número se puede renumerar; el estado cambia al anular).
create or replace function public.fn_asiento_contenido(p_id bigint)
returns text language sql stable security definer set search_path = public as $$
  select concat_ws('|', a.id, a.empresa_id, a.fecha, a.concepto, a.origen_tipo, a.origen_tienda_codigo, a.origen_numero,
                   a.origen_referencia, a.sustituye_a, a.creado_por, to_char(a.creado_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
                   (select string_agg(concat_ws(';', p.cuenta, p.debe, p.haber, p.concepto, p.documento), '#' order by p.linea, p.id)
                      from apunte p where p.asiento_id = a.id))
    from asiento a where a.id = p_id
$$;

create or replace function public.fn_asiento_encadenar()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ant text;
begin
  if exists (select 1 from asiento_huella where asiento_id = new.id) then return null; end if;
  perform pg_advisory_xact_lock(hashtext('asiento_huella'), new.empresa_id);
  select huella into v_ant from asiento_huella where empresa_id = new.empresa_id order by orden desc limit 1;
  insert into asiento_huella (asiento_id, empresa_id, huella, anterior)
  values (new.id, new.empresa_id, encode(sha256(convert_to(coalesce(v_ant, '') || '|' || fn_asiento_contenido(new.id), 'UTF8')), 'hex'), v_ant);
  return null;
end $$;
-- Al confirmar la operación (los apuntes ya están grabados).
drop trigger if exists trg_asiento_encadenar on public.asiento;
create constraint trigger trg_asiento_encadenar after insert on public.asiento
  deferrable initially deferred for each row execute function public.fn_asiento_encadenar();

-- Los asientos que ya había, en su orden.
do $$
declare r record; v_ant text;
begin
  for r in select id, empresa_id from asiento a where not exists (select 1 from asiento_huella h where h.asiento_id = a.id) order by empresa_id, id loop
    select huella into v_ant from asiento_huella where empresa_id = r.empresa_id order by orden desc limit 1;
    insert into asiento_huella (asiento_id, empresa_id, huella, anterior)
    values (r.id, r.empresa_id, encode(sha256(convert_to(coalesce(v_ant, '') || '|' || fn_asiento_contenido(r.id), 'UTF8')), 'hex'), v_ant);
  end loop;
end $$;

create or replace function public.fn_contab_comprobar_integridad()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_emp smallint := fn_contab_empresa(); r record; v_prev text; v_calc text; v_n int := 0; v_fallos jsonb := '[]'; v_sin int;
begin
  if not fn_es_super_administrador() then raise exception 'Solo los super administradores pueden comprobar la integridad.'; end if;
  for r in select h.*, a.numero, a.fecha, a.id as existe from asiento_huella h left join asiento a on a.id = h.asiento_id
            where h.empresa_id = v_emp order by h.orden loop
    v_n := v_n + 1;
    if r.anterior is distinct from v_prev then
      v_fallos := v_fallos || jsonb_build_object('asiento', r.asiento_id, 'numero', r.numero, 'fecha', r.fecha, 'motivo', 'Cadena rota: falta o sobra un asiento antes de este');
    end if;
    v_calc := encode(sha256(convert_to(coalesce(r.anterior, '') || '|' || coalesce(fn_asiento_contenido(r.asiento_id), ''), 'UTF8')), 'hex');
    if r.existe is null then
      v_fallos := v_fallos || jsonb_build_object('asiento', r.asiento_id, 'motivo', 'El asiento ha desaparecido');
    elsif v_calc <> r.huella then
      v_fallos := v_fallos || jsonb_build_object('asiento', r.asiento_id, 'numero', r.numero, 'fecha', r.fecha, 'motivo', 'Su contenido ha cambiado desde que se grabó');
    end if;
    v_prev := r.huella;
  end loop;
  select count(*) into v_sin from asiento a where a.empresa_id = v_emp and not exists (select 1 from asiento_huella h where h.asiento_id = a.id);
  return jsonb_build_object('revisados', v_n, 'sin_huella', v_sin, 'fallos', v_fallos, 'correcto', jsonb_array_length(v_fallos) = 0 and v_sin = 0);
end $$;

-- 4d. Doble firma.
create table if not exists public.asiento_propuesta (
  id bigint generated always as identity primary key,
  empresa_id smallint not null references public.empresa_contable (id),
  sustituye bigint references public.asiento (id),
  fecha date not null,
  concepto text,
  tienda text,
  apuntes jsonb not null,
  total numeric(14, 2) not null,
  creado_por text not null,
  creado_en timestamptz not null default now(),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada', 'retirada')),
  resuelto_por text,
  resuelto_en timestamptz,
  motivo text,
  asiento_id bigint references public.asiento (id)
);
comment on table public.asiento_propuesta is 'Asientos manuales grandes esperando la segunda firma (otro super administrador).';
alter table public.asiento_propuesta enable row level security;
drop policy if exists asiento_propuesta_lee on public.asiento_propuesta;
create policy asiento_propuesta_lee on public.asiento_propuesta for select to authenticated
  using (public.fn_es_super_administrador() or creado_por = public.fn_empleado_actual());
drop trigger if exists trg_auditoria_asiento_propuesta on public.asiento_propuesta;
create trigger trg_auditoria_asiento_propuesta after insert or update or delete on public.asiento_propuesta
  for each row execute function public.fn_auditoria_trigger();

do $$
begin
  if to_regprocedure('public.fn_contab_guardar_asiento_base(bigint, date, text, jsonb, text)') is null then
    alter function public.fn_contab_guardar_asiento(bigint, date, text, jsonb, text) rename to fn_contab_guardar_asiento_base;
  end if;
end $$;
revoke execute on function public.fn_contab_guardar_asiento_base(bigint, date, text, jsonb, text) from public, anon, authenticated;

create or replace function public.fn_contab_guardar_asiento(p_id bigint, p_fecha date, p_concepto text, p_apuntes jsonb, p_tienda text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  old asiento; v_emp smallint := fn_contab_empresa(); v_total numeric; v_lim numeric; v_pid bigint;
begin
  if auth.uid() is null and session_user not in ('postgres', 'supabase_admin') then raise exception 'Sin sesión'; end if;
  if p_id is not null then
    select * into old from asiento where id = p_id and empresa_id = v_emp;
    if found then
      if old.origen_tipo <> 'manual' and old.estado <> 'error' then
        raise exception 'El asiento % es automático (%): no se cambia a mano. Cómo hacerlo bien: corrige el documento de origen (la factura, el cobro…) y el asiento se rehace solo; o anula este asiento para que se vuelva a generar; o haz un asiento manual nuevo de ajuste con la diferencia.',
          coalesce(old.numero::text, '(sin número)'), old.origen_tipo using errcode = '42501';
      end if;
      perform fn_contab_control_conciliado(p_id);
      perform fn_contab_control_mes(v_emp, old.fecha);
    end if;
  end if;
  perform fn_contab_control_mes(v_emp, p_fecha);

  select round(sum(coalesce(nullif(j ->> 'debe', '')::numeric, 0)), 2) into v_total from jsonb_array_elements(coalesce(p_apuntes, '[]')) j;
  v_lim := coalesce(nullif(fn_parametro_texto('contab.importe_doble_firma'), '')::numeric, 3000);
  if v_lim > 0 and coalesce(v_total, 0) >= v_lim and coalesce(current_setting('erp.contab_firmado', true), '') <> 'on' then
    -- Se comprueba ya que el asiento es correcto (cuadra, cuentas…) sin grabarlo.
    begin
      perform fn_contab_guardar_asiento_base(p_id, p_fecha, p_concepto, p_apuntes, p_tienda);
      raise exception 'erp_prueba_ok';
    exception when others then
      if sqlerrm <> 'erp_prueba_ok' then raise; end if;
    end;
    insert into asiento_propuesta (empresa_id, sustituye, fecha, concepto, tienda, apuntes, total, creado_por)
    values (v_emp, p_id, p_fecha, p_concepto, nullif(btrim(coalesce(p_tienda, '')), ''), p_apuntes, v_total, coalesce(fn_empleado_actual(), '?'))
    returning id into v_pid;
    return -v_pid; -- negativo = pendiente de la segunda firma
  end if;
  return fn_contab_guardar_asiento_base(p_id, p_fecha, p_concepto, p_apuntes, p_tienda);
end $$;
grant execute on function public.fn_contab_guardar_asiento(bigint, date, text, jsonb, text) to authenticated;

create or replace function public.fn_contab_propuesta_resolver(p_id bigint, p_aprobar boolean, p_motivo text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare pr asiento_propuesta; v_asiento bigint;
begin
  if not fn_es_super_administrador() then raise exception 'Solo un super administrador puede aprobar o rechazar asientos.'; end if;
  select * into pr from asiento_propuesta where id = p_id for update;
  if not found or pr.estado <> 'pendiente' then raise exception 'Ese asiento ya no está pendiente.'; end if;
  if pr.creado_por = fn_empleado_actual() then
    raise exception 'No puedes dar la segunda firma a un asiento tuyo. Cómo hacerlo bien: pide a otro super administrador que lo apruebe (le sale en el globo 🛡️).';
  end if;
  if not p_aprobar then
    if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'Escribe por qué lo rechazas.'; end if;
    update asiento_propuesta set estado = 'rechazada', resuelto_por = fn_empleado_actual(), resuelto_en = now(), motivo = btrim(p_motivo) where id = p_id;
    return null;
  end if;
  perform set_config('erp.contab_empresa', pr.empresa_id::text, true);
  perform set_config('erp.contab_firmado', 'on', true);
  v_asiento := fn_contab_guardar_asiento(pr.sustituye, pr.fecha, pr.concepto, pr.apuntes, pr.tienda);
  perform set_config('erp.contab_firmado', '', true);
  perform set_config('erp.contab_empresa', '', true);
  update asiento_propuesta set estado = 'aprobada', resuelto_por = fn_empleado_actual(), resuelto_en = now(),
         motivo = nullif(btrim(coalesce(p_motivo, '')), ''), asiento_id = v_asiento where id = p_id;
  return v_asiento;
end $$;

create or replace function public.fn_contab_propuesta_retirar(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  update asiento_propuesta set estado = 'retirada', resuelto_por = fn_empleado_actual(), resuelto_en = now()
   where id = p_id and estado = 'pendiente' and creado_por = fn_empleado_actual();
  if not found then raise exception 'Solo quien lo hizo puede retirarlo, y mientras esté pendiente.'; end if;
end $$;

create or replace function public.fn_contab_propuestas(p_todas boolean default false)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'id', p.id, 'empresa', ec.nombre, 'sustituye', p.sustituye, 'sustituye_numero', s.numero, 'fecha', p.fecha, 'concepto', p.concepto,
           'tienda', p.tienda, 'apuntes', p.apuntes, 'total', p.total, 'creado_por', p.creado_por, 'creado_nombre', e.nombre,
           'creado_en', p.creado_en, 'estado', p.estado, 'resuelto_por', p.resuelto_por, 'resuelto_en', p.resuelto_en,
           'motivo', p.motivo, 'asiento_id', p.asiento_id, 'asiento_numero', a.numero,
           'mio', p.creado_por = fn_empleado_actual()))
         order by p.estado <> 'pendiente', p.creado_en desc), '[]')
    from asiento_propuesta p
    left join empresa_contable ec on ec.id = p.empresa_id
    left join empleado e on e.codigo = p.creado_por
    left join asiento s on s.id = p.sustituye
    left join asiento a on a.id = p.asiento_id
   where (fn_es_super_administrador() or p.creado_por = fn_empleado_actual())
     and (p_todas or p.estado = 'pendiente' or p.creado_en > now() - interval '30 days')
$$;

-- Anular: mismos controles (mes cerrado, conciliado).
create or replace function public.fn_contab_anular_asiento(p_id bigint, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $function$
declare old asiento;
begin
  if auth.uid() is null and session_user not in ('postgres', 'supabase_admin') then raise exception 'Sin sesión'; end if;
  select * into old from public.asiento where id = p_id and estado <> 'anulado' and empresa_id = public.fn_contab_empresa();
  if not found then
    raise exception 'El asiento % no existe, ya está anulado o es de otra empresa.', p_id;
  end if;
  perform fn_contab_control_conciliado(p_id);
  perform fn_contab_control_mes(old.empresa_id, old.fecha);
  perform public.fn_contab_anular_interno(p_id, coalesce(nullif(trim(p_motivo), ''), 'Anulado manualmente'));
end $function$;

-- 5. Avisos de auditoría (globo 🛡️) --------------------------------------------------------------------
create or replace function public.fn_auditoria_fila(a public.auditoria, p_motivo text default null)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', a.id, 'ocurrido_en', a.ocurrido_en, 'tabla', a.tabla, 'operacion', a.operacion, 'registro', a.registro_pk,
    'nombre', a.registro_nombre, 'tienda', a.tienda_terminal_codigo, 'empleado', a.empleado_codigo,
    'empleado_nombre', e.nombre, 'empleado_numero', e.numero_operario,
    'grupo', case when e.super_administrador then 'Super admin' else r.nombre end,
    'campos', a.campos, 'antes', a.datos_antes, 'despues', a.datos_despues,
    'ip', a.ip, 'dispositivo', a.dispositivo, 'origen', a.origen, 'motivo', p_motivo, 'area', a.area, 'remoto', a.remoto))
    from (select 1) x
    left join empleado e on e.codigo = a.empleado_codigo
    left join rol r on r.id = e.rol_id
$$;

create or replace function public.fn_auditoria_motivo(a public.auditoria)
returns text language sql stable security definer set search_path = public as $$
  select case
    when a.operacion = 'FALLO_CLAVE' then 'Contraseña incorrecta'
    when a.operacion = 'FUERA_HORARIO' then 'Intento fuera de horario'
    when a.operacion = 'REMOTO_DENEGADO' then 'Entrada remota sin permiso'
    when a.operacion = 'USO_RARO' then 'Uso fuera de lo normal'
    when a.operacion in ('EXPORTA', 'IMPRIME') and (a.area = 'contabilidad' or a.registro_pk like '/contabilidad%') then 'Datos de Contabilidad sacados fuera'
    when a.tabla = 'ejercicio_contable' and a.operacion = 'UPDATE' and 'cerrado' = any (a.campos) then 'Cierre / reapertura de ejercicio'
    when a.tabla = 'contab_mes_cerrado' then 'Cierre / reapertura de mes'
    when a.tabla = 'asiento' and a.operacion = 'UPDATE' and a.datos_despues ->> 'estado' = 'anulado' and 'estado' = any (a.campos) then 'Asiento anulado o modificado'
    when a.tabla = 'asiento' and a.operacion = 'INSERT' and a.datos_despues ->> 'origen_tipo' = 'manual'
         and (a.datos_despues ->> 'fecha')::date < date_trunc('month', a.ocurrido_en at time zone 'Atlantic/Canary')::date then 'Asiento con fecha atrasada'
    when a.tabla = 'apunte' and a.operacion = 'INSERT' and (a.datos_despues ->> 'cuenta') ~ '^(570|572|430)'
         and exists (select 1 from asiento s where s.id = (a.datos_despues ->> 'asiento_id')::bigint and s.origen_tipo = 'manual') then 'Asiento manual en caja, bancos o clientes'
    when a.tabla = 'cuenta_contable' then 'Cambio en el plan de cuentas'
    when a.tabla = 'asiento_propuesta' and a.operacion = 'INSERT' then 'Asiento pendiente de segunda firma'
    when a.tabla = 'parametro' and (a.registro_pk like 'contab.%' or a.registro_pk like 'acceso.%') then 'Cambio de parámetros de control'
    when a.tabla = 'red_tienda' then 'Cambio en las redes de las tiendas'
    when a.operacion = 'DELETE' and a.tabla not like '%\_linea' and a.tabla not in ('articulo_favorito', 'listado_guardado', 'auditoria_aviso_visto')
      then 'Borrado'
    when a.tabla in ('rol', 'rol_permiso', 'permiso', 'empleado_acceso', 'empleado_permiso', 'ejercicio') then 'Cambio de permisos / periodos'
    when a.tabla = 'empleado' and (a.operacion <> 'UPDATE'
           or a.campos && array['super_administrador', 'rol_id', 'auth_user_id', 'activo', 'conformidad_obligatoria'])
      then 'Cambio de empleado / acceso'
    when a.tabla = 'articulo' and a.operacion = 'UPDATE' and 'pvp' = any (a.campos)
         and exists (select 1 from articulo x where x.codigo_interno = a.registro_pk
                       and coalesce(nullif(x.coste_neto, 0), nullif(x.precio_medio_compra, 0)) > 0
                       and (a.datos_despues ->> 'pvp')::numeric / (1 + coalesce(x.igic_pct, 0) / 100)
                           < coalesce(nullif(x.coste_neto, 0), x.precio_medio_compra))
      then 'Precio por debajo del coste'
  end
$$;

create or replace function public.fn_auditoria_avisos(p_dias integer default 30)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_visto timestamptz;
begin
  if not fn_es_super_administrador() then
    return jsonb_build_object('pendientes', 0, 'lista', '[]'::jsonb, 'resumen', '[]'::jsonb, 'por_firmar', 0);
  end if;
  select visto_hasta into v_visto from auditoria_aviso_visto where empleado_codigo = fn_empleado_actual();
  return (
    with av as (
      select a, fn_auditoria_motivo(a) as motivo
        from auditoria a
       where a.ocurrido_en > now() - make_interval(days => greatest(1, coalesce(p_dias, 30)))
         and a.operacion not in ('PANTALLA', 'ENTRADA', 'SALIDA', 'CONSULTA')
    ), m as (select * from av where motivo is not null)
    select jsonb_build_object(
      'pendientes', (select count(*) from m where (m.a).ocurrido_en > coalesce(v_visto, '-infinity')),
      'visto_hasta', v_visto,
      'por_firmar', (select count(*) from asiento_propuesta p where p.estado = 'pendiente' and p.creado_por is distinct from fn_empleado_actual()),
      'resumen', coalesce((select jsonb_agg(jsonb_build_object('motivo', motivo, 'total', n, 'nuevos', nn) order by nn desc, n desc)
                             from (select motivo, count(*) n, count(*) filter (where (m.a).ocurrido_en > coalesce(v_visto, '-infinity')) nn
                                     from m group by motivo) r), '[]'::jsonb),
      'lista', coalesce((select jsonb_agg(fn_auditoria_fila(x.a, x.motivo) order by (x.a).ocurrido_en desc)
                           from (select * from m order by (m.a).ocurrido_en desc limit 300) x), '[]'::jsonb)));
end;
$function$;

-- Permisos de las funciones nuevas.
revoke execute on function public.fn_red_es_remoto(text), public.fn_mi_control(), public.fn_red_guardar(text, text, text), public.fn_red_borrar(bigint),
  public.fn_uso_evento(text, text, text, text, text), public.fn_uso_latido(text), public.fn_uso_informe(date, date, text, text),
  public.fn_uso_detalle(text, date), public.fn_contab_control_mes(smallint, date), public.fn_contab_cerrar_mes(integer, integer),
  public.fn_contab_reabrir_mes(integer, integer, text), public.fn_contab_control_conciliado(bigint), public.fn_asiento_contenido(bigint),
  public.fn_contab_comprobar_integridad(), public.fn_contab_propuesta_resolver(bigint, boolean, text), public.fn_contab_propuesta_retirar(bigint),
  public.fn_contab_propuestas(boolean), public.fn_auditoria_motivo(public.auditoria), public.fn_asiento_encadenar() from public, anon;
grant execute on function public.fn_mi_control(), public.fn_red_guardar(text, text, text), public.fn_red_borrar(bigint),
  public.fn_uso_evento(text, text, text, text, text), public.fn_uso_latido(text), public.fn_uso_informe(date, date, text, text),
  public.fn_uso_detalle(text, date), public.fn_contab_cerrar_mes(integer, integer), public.fn_contab_reabrir_mes(integer, integer, text),
  public.fn_contab_comprobar_integridad(), public.fn_contab_propuesta_resolver(bigint, boolean, text), public.fn_contab_propuesta_retirar(bigint),
  public.fn_contab_propuestas(boolean) to authenticated;
revoke execute on function public.fn_red_es_remoto(text), public.fn_contab_control_mes(smallint, date), public.fn_contab_control_conciliado(bigint),
  public.fn_asiento_contenido(bigint), public.fn_auditoria_motivo(public.auditoria), public.fn_asiento_encadenar() from authenticated;

-- 6. Texto legal para que lo acepte cada empleado al entrar -------------------------------------------
insert into public.auditoria_documento (titulo, contenido, activo, requiere_conformidad, creado_por)
select 'Información a los empleados sobre el registro de uso del programa y el teletrabajo',
$t$OFIPAPEL informa a cada empleado de que, para la seguridad de los datos y de la contabilidad de la empresa, el programa de gestión (Avatar) registra:

1. Las entradas y salidas del programa, con la fecha, la hora, la dirección de internet (IP) y el dispositivo.
2. Las pantallas que se abren y en qué área (Gestión, Contabilidad o Web).
3. Los minutos de uso real del programa (minutos en los que se usa el teclado o el ratón). No se graba lo que se escribe ni la pantalla.
4. Las exportaciones (Excel, PDF, ficheros para la gestoría o el banco) y las impresiones de listados.
5. Si la conexión se hace desde las tiendas u oficinas de la empresa o desde fuera (teletrabajo), y los intentos de entrar desde fuera sin autorización o fuera del horario asignado.

Finalidad: proteger la información de la empresa y de sus clientes, evitar errores y manipulaciones en las cuentas y comprobar el cumplimiento del horario y de las autorizaciones de teletrabajo (art. 20.3 y 20 bis del Estatuto de los Trabajadores y art. 87 a 91 de la Ley Orgánica 3/2018).

Solo pueden consultar este registro los super administradores de la empresa. No se usa para ninguna otra finalidad, se conserva el tiempo necesario para esos fines y las obligaciones legales, y el empleado puede ejercer sus derechos de acceso, rectificación, supresión, limitación y oposición dirigiéndose a la empresa. Este registro se aplica a todos los usuarios del programa, incluidos los administradores.$t$,
  true, true, 'LUIS'
where not exists (select 1 from public.auditoria_documento where titulo like 'Información a los empleados sobre el registro de uso%');

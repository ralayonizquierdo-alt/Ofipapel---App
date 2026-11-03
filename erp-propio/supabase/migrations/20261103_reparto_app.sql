-- App de repartidores + seguimiento de repartos en TV (03/11/2026, pedido por Rober).
--
-- El repartidor abre /repartidor en el móvil (sin cuenta del ERP): elige su nombre, pone su PIN de 4 cifras
-- y elige la ruta del día. Todo lo que hace pasa por funciones SECURITY DEFINER que comprueban su sesión
-- (token de 16 h): nunca toca las tablas directamente.
--  · repartidor_pin           PIN (hash) y bloqueo tras 5 fallos. Sin políticas: nadie lo lee, solo las funciones.
--  · reparto_app_sesion       sesiones de la app.
--  · reparto_linea (+campos)  incidencia, motivo de no entrega, nota, 1.er y 2.º intento (horas automáticas),
--                             hora de entrega, comprobado antes de salir, bultos (pendiente de decidir de dónde
--                             salen) y posición del marcado.
--  · reparto_posicion         posición del repartidor MIENTRAS tiene una ruta abierta en la app (mapa de la TV).
--                             Pendiente: borrar lo de más de 30 días con una tarea programada. Hay que informar a los repartidores (protección de datos).
--  · reparto_cambio_ruta      quién cambió un pedido de ruta, cuándo y por qué.
-- En el ERP: fn_reparto_cerrar (cierra y pasa lo no entregado / con incidencia / sin marcar al reparto
-- siguiente de la misma ruta, arriba y en rojo), fn_reparto_seguimiento (pantalla de TV) y
-- fn_repartidor_pin_poner. Las auditorías de la app quedan con origen «App reparto · <repartidor>».

-- ------------------------------------------------------------------ Tablas
create table if not exists public.repartidor_pin (
  repartidor_codigo text primary key references public.repartidor (codigo) on delete cascade,
  pin_hash text not null,
  fallos smallint not null default 0,
  bloqueado_hasta timestamptz,
  puede_cambiar_ruta boolean not null default false,
  actualizado_en timestamptz not null default now()
);
alter table public.repartidor_pin enable row level security;

create table if not exists public.reparto_app_sesion (
  token uuid primary key default gen_random_uuid(),
  repartidor_codigo text not null references public.repartidor (codigo) on delete cascade,
  creada_en timestamptz not null default now(),
  caduca_en timestamptz not null default now() + interval '16 hours',
  dispositivo text
);
alter table public.reparto_app_sesion enable row level security;

alter table public.reparto_linea
  add column if not exists incidencia text,
  add column if not exists motivo_no_entrega text,
  add column if not exists nota_repartidor text,
  add column if not exists intento1_en timestamptz,
  add column if not exists intento2_en timestamptz,
  add column if not exists entregado_en timestamptz,
  add column if not exists comprobado_en timestamptz,
  add column if not exists bultos smallint,
  add column if not exists marcado_lat double precision,
  add column if not exists marcado_lng double precision;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reparto_linea_incidencia_check') then
    alter table public.reparto_linea add constraint reparto_linea_incidencia_check
      check (incidencia is null or incidencia in ('faltan', 'devuelve', 'no_corresponde', 'otro'));
    alter table public.reparto_linea add constraint reparto_linea_motivo_check
      check (motivo_no_entrega is null or motivo_no_entrega in ('no_contesta', 'direccion', 'ausente', 'cerrado', 'otro'));
  end if;
end $$;

create table if not exists public.reparto_posicion (
  id bigint generated always as identity primary key,
  repartidor_codigo text not null references public.repartidor (codigo) on delete cascade,
  tienda_terminal_codigo text not null,
  numero integer not null,
  lat double precision not null,
  lng double precision not null,
  precision_m real,
  en timestamptz not null default now()
);
create index if not exists reparto_posicion_rep_idx on public.reparto_posicion (repartidor_codigo, en desc);
alter table public.reparto_posicion enable row level security;

create table if not exists public.reparto_cambio_ruta (
  id bigint generated always as identity primary key,
  venta_tienda_codigo text not null,
  venta_numero integer not null,
  de_tienda text not null,
  de_numero integer not null,
  de_ruta text,
  a_tienda text not null,
  a_numero integer not null,
  a_ruta text,
  quien text not null,
  motivo text not null,
  en timestamptz not null default now()
);
alter table public.reparto_cambio_ruta enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'reparto_cambio_ruta' and policyname = 'reparto_cambio_ruta_lee') then
    create policy reparto_cambio_ruta_lee on public.reparto_cambio_ruta for select to authenticated using (public.fn_puede('/repartos'));
  end if;
end $$;
grant select on public.reparto_cambio_ruta to authenticated;
create or replace trigger trg_auditoria_reparto_cambio_ruta after insert or update or delete on public.reparto_cambio_ruta
  for each row execute function public.fn_auditoria_trigger();

-- ------------------------------------------------------------------ Ayudantes
create or replace function public.fn_app_rep_hoy() returns date language sql stable
as $$ select (now() at time zone 'Atlantic/Canary')::date $$;

create schema if not exists reparto_privado;  -- no expuesto por la API: solo lo usan las funciones

-- Comprueba la sesión y deja el origen para la auditoría. Devuelve el código del repartidor.
create or replace function reparto_privado.sesion(p_token uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  select repartidor_codigo into v from reparto_app_sesion where token = p_token and caduca_en > now();
  if v is null then raise exception 'sesion_caducada' using errcode = '28000', hint = 'Vuelve a entrar con tu PIN.'; end if;
  perform set_config('erp.origen', 'App reparto · ' || v, true);
  return v;
end $$;

-- El reparto tiene que estar abierto y ser de este repartidor (si no tiene, se le asigna).
create or replace function reparto_privado.reparto(p_rep text, p_tienda text, p_numero integer) returns public.reparto
language plpgsql security definer set search_path = public as $$
declare r reparto;
begin
  select * into r from reparto where tienda_terminal_codigo = p_tienda and numero = p_numero for update;
  if not found then raise exception 'Ese reparto no existe.'; end if;
  if r.estado <> 2 then raise exception 'Ese reparto ya está cerrado.'; end if;
  if r.repartidor_codigo is null then
    update reparto set repartidor_codigo = p_rep where tienda_terminal_codigo = p_tienda and numero = p_numero;
    r.repartidor_codigo := p_rep;
  elsif r.repartidor_codigo <> p_rep then
    raise exception 'Esta ruta la lleva otro repartidor (%).', coalesce((select nombre_corto from repartidor where codigo = r.repartidor_codigo), r.repartidor_codigo);
  end if;
  return r;
end $$;

-- ------------------------------------------------------------------ App: entrada
create or replace function public.fn_app_rep_repartidores() returns table (codigo text, nombre text)
language sql stable security definer set search_path = public as $$
  select r.codigo, coalesce(nullif(r.nombre_corto, ''), split_part(r.nombre, ' ', 1))
    from repartidor r join repartidor_pin p on p.repartidor_codigo = r.codigo
   where not coalesce(r.deshabilitado, false)
   order by 2 $$;

create or replace function public.fn_app_rep_login(p_repartidor text, p_pin text, p_dispositivo text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p repartidor_pin; v_token uuid; v_nombre text;
begin
  select * into p from repartidor_pin where repartidor_codigo = p_repartidor for update;
  if not found then raise exception 'Este repartidor no tiene PIN: pídelo en la oficina.'; end if;
  if p.bloqueado_hasta > now() then
    raise exception 'Demasiados intentos. Espera % min o pide ayuda en la oficina.', ceil(extract(epoch from p.bloqueado_hasta - now()) / 60)::int;
  end if;
  if p_pin is null or extensions.crypt(p_pin, p.pin_hash) <> p.pin_hash then
    update repartidor_pin set fallos = case when fallos + 1 >= 5 then 0 else fallos + 1 end,
                              bloqueado_hasta = case when fallos + 1 >= 5 then now() + interval '15 minutes' else bloqueado_hasta end
     where repartidor_codigo = p_repartidor;
    return jsonb_build_object('ok', false, 'error', case when p.fallos + 1 >= 5 then 'PIN incorrecto. Bloqueado 15 minutos.' else 'PIN incorrecto.' end);
  end if;
  update repartidor_pin set fallos = 0, bloqueado_hasta = null where repartidor_codigo = p_repartidor;
  insert into reparto_app_sesion (repartidor_codigo, dispositivo) values (p_repartidor, left(p_dispositivo, 200)) returning token into v_token;
  select coalesce(nullif(nombre_corto, ''), nombre) into v_nombre from repartidor where codigo = p_repartidor;
  return jsonb_build_object('ok', true, 'token', v_token, 'repartidor', p_repartidor, 'nombre', v_nombre, 'puede_cambiar_ruta', p.puede_cambiar_ruta, 'fichaje_persona', p.fichaje_persona);
end $$;

-- Repartos abiertos que puede coger: los suyos y los que aún no tienen repartidor.
create or replace function public.fn_app_rep_repartos(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_rep text := reparto_privado.sesion(p_token);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'tienda', r.tienda_terminal_codigo, 'numero', r.numero, 'fecha', r.fecha, 'ruta', r.ruta_codigo,
             'ruta_nombre', coalesce(rr.descripcion, r.ruta_codigo), 'mio', r.repartidor_codigo = v_rep,
             'pedidos', (select count(*) from reparto_linea l where l.tienda_terminal_codigo = r.tienda_terminal_codigo and l.numero = r.numero),
             'pendientes', (select count(*) from reparto_linea l where l.tienda_terminal_codigo = r.tienda_terminal_codigo and l.numero = r.numero
                              and l.estado in ('pendiente', 'viene_anterior')))
           order by (r.repartidor_codigo = v_rep) desc, r.ruta_codigo)
      from reparto r left join ruta_reparto rr on rr.codigo = r.ruta_codigo
     where r.estado = 2 and r.fecha <= fn_app_rep_hoy() + 1 and (r.repartidor_codigo is null or r.repartidor_codigo = v_rep)), '[]'::jsonb);
end $$;

-- Pedidos de la ruta. Orden: los que vienen de un reparto anterior arriba; luego el orden del repartidor; si
-- no hay, el puesto que solía ocupar ese cliente en esta ruta (memoria de los últimos 120 días); luego población.
create or replace function public.fn_app_rep_lineas(p_token uuid, p_tienda text, p_numero integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_rep text := reparto_privado.sesion(p_token); r reparto;
begin
  r := reparto_privado.reparto(v_rep, p_tienda, p_numero);
  return jsonb_build_object(
    'reparto', jsonb_build_object('tienda', r.tienda_terminal_codigo, 'numero', r.numero, 'fecha', r.fecha, 'ruta', r.ruta_codigo,
                                  'ruta_nombre', coalesce((select descripcion from ruta_reparto where codigo = r.ruta_codigo), r.ruta_codigo)),
    'lineas', coalesce((
      select jsonb_agg(x.j order by x.prio desc, x.orden nulls last, x.memoria nulls last, x.poblacion, x.direccion)
        from (
          select l.reparto_anterior_numero is not null as prio, l.orden, l.poblacion, l.direccion,
                 (select avg(h.orden) from reparto_linea h join reparto hr on hr.tienda_terminal_codigo = h.tienda_terminal_codigo and hr.numero = h.numero
                   join venta hv on hv.tienda_terminal_codigo = h.venta_tienda_codigo and hv.numero = h.venta_numero
                   where hr.ruta_codigo = r.ruta_codigo and hr.fecha > r.fecha - 120 and hr.estado = 4 and h.orden is not null
                     and hv.cliente_codigo = v.cliente_codigo) as memoria,
                 jsonb_build_object(
                   'vt', l.venta_tienda_codigo, 'vn', l.venta_numero, 'estado', l.estado, 'orden', l.orden,
                   'prioritario', l.reparto_anterior_numero is not null, 'antes', l.estado_observaciones,
                   'cliente', coalesce(nullif(v.nombre_cliente, ''), c.nombre, l.contacto, 'Sin nombre'), 'cliente_codigo', v.cliente_codigo,
                   'contacto', l.contacto, 'direccion', l.direccion, 'poblacion', l.poblacion, 'cp', l.codigo_postal,
                   'telefono', coalesce(nullif(l.telefono_movil, ''), nullif(l.telefono_fijo, '')),
                   'total', v.total, 'pagado', v.total_pagado, 'factura', v.factura_numero, 'bultos', l.bultos,
                   'incidencia', l.incidencia, 'motivo', l.motivo_no_entrega, 'nota', l.nota_repartidor,
                   'intento1', l.intento1_en, 'intento2', l.intento2_en, 'entregado_en', l.entregado_en, 'comprobado', l.comprobado_en is not null) as j
            from reparto_linea l
            left join venta v on v.tienda_terminal_codigo = l.venta_tienda_codigo and v.numero = l.venta_numero
            left join cliente c on c.codigo = v.cliente_codigo
           where l.tienda_terminal_codigo = p_tienda and l.numero = p_numero and l.estado <> 'anulado'
        ) x), '[]'::jsonb));
end $$;

-- ------------------------------------------------------------------ App: acciones
-- p_accion: entregado | incidencia | no_entregado | deshacer.  p_detalle: tipo de incidencia o motivo.
-- p_en: hora en el móvil (para lo marcado sin cobertura); se acepta hasta 20 h atrás y nunca en el futuro.
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

create or replace function public.fn_app_rep_orden(p_token uuid, p_tienda text, p_numero integer, p_orden jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_rep text := reparto_privado.sesion(p_token); e jsonb; i int := 0;
begin
  perform reparto_privado.reparto(v_rep, p_tienda, p_numero);
  for e in select * from jsonb_array_elements(coalesce(p_orden, '[]'::jsonb)) loop
    i := i + 1;
    update reparto_linea set orden = i
     where tienda_terminal_codigo = p_tienda and numero = p_numero and venta_tienda_codigo = e ->> 'vt' and venta_numero = (e ->> 'vn')::int
       and orden is distinct from i;
  end loop;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.fn_app_rep_comprobar(p_token uuid, p_tienda text, p_numero integer, p_vt text, p_vn integer, p_ok boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_rep text := reparto_privado.sesion(p_token);
begin
  perform reparto_privado.reparto(v_rep, p_tienda, p_numero);
  update reparto_linea set comprobado_en = case when p_ok then coalesce(comprobado_en, now()) end
   where tienda_terminal_codigo = p_tienda and numero = p_numero and venta_tienda_codigo = p_vt and venta_numero = p_vn;
  return jsonb_build_object('ok', true);
end $$;

-- Posición mientras la ruta está abierta en la app (como mucho una cada 20 s; se guardan 30 días).
create or replace function public.fn_app_rep_posicion(p_token uuid, p_tienda text, p_numero integer, p_lat double precision, p_lng double precision, p_precision real default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_rep text := reparto_privado.sesion(p_token);
begin
  if p_lat is null or p_lng is null or p_lat not between 27 and 29.5 or p_lng not between -18.5 and -13 then
    return jsonb_build_object('ok', false);  -- fuera de Canarias: no se guarda
  end if;
  if exists (select 1 from reparto where tienda_terminal_codigo = p_tienda and numero = p_numero and estado = 2 and repartidor_codigo = v_rep)
     and not exists (select 1 from reparto_posicion where repartidor_codigo = v_rep and en > now() - interval '20 seconds') then
    insert into reparto_posicion (repartidor_codigo, tienda_terminal_codigo, numero, lat, lng, precision_m) values (v_rep, p_tienda, p_numero, p_lat, p_lng, p_precision);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Rutas abiertas hoy a las que se puede pasar un pedido.
create or replace function public.fn_app_rep_rutas_destino(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_rep text := reparto_privado.sesion(p_token);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('tienda', r.tienda_terminal_codigo, 'numero', r.numero, 'ruta', r.ruta_codigo,
                                                      'ruta_nombre', coalesce(rr.descripcion, r.ruta_codigo),
                                                      'repartidor', (select coalesce(nullif(nombre_corto, ''), nombre) from repartidor where codigo = r.repartidor_codigo))
                                   order by r.ruta_codigo)
                     from reparto r left join ruta_reparto rr on rr.codigo = r.ruta_codigo
                    where r.estado = 2 and r.fecha <= fn_app_rep_hoy()), '[]'::jsonb);
end $$;

-- Mueve un pedido a otra ruta, dejando constancia. Desde la app solo si el repartidor tiene permiso.
create or replace function reparto_privado.mover_linea(
  p_tienda text, p_numero integer, p_vt text, p_vn integer, p_dest_tienda text, p_dest_numero integer, p_motivo text, p_quien text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o reparto; d reparto;
begin
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indica por qué se cambia de ruta.'; end if;
  select * into o from reparto where tienda_terminal_codigo = p_tienda and numero = p_numero;
  select * into d from reparto where tienda_terminal_codigo = p_dest_tienda and numero = p_dest_numero;
  if o.estado is distinct from 2 or d.estado is distinct from 2 then raise exception 'Los dos repartos tienen que estar abiertos.'; end if;
  if o.tienda_terminal_codigo = d.tienda_terminal_codigo and o.numero = d.numero then raise exception 'Es la misma ruta.'; end if;
  if exists (select 1 from reparto_linea where tienda_terminal_codigo = p_dest_tienda and numero = p_dest_numero and venta_tienda_codigo = p_vt and venta_numero = p_vn) then
    raise exception 'Ese pedido ya está en la ruta de destino.';
  end if;
  update reparto_linea set tienda_terminal_codigo = p_dest_tienda, numero = p_dest_numero, orden = null, comprobado_en = null
   where tienda_terminal_codigo = p_tienda and numero = p_numero and venta_tienda_codigo = p_vt and venta_numero = p_vn;
  if not found then raise exception 'Ese pedido no está en esa ruta.'; end if;
  update venta set reparto_tienda_codigo = p_dest_tienda, reparto_numero = p_dest_numero where tienda_terminal_codigo = p_vt and numero = p_vn;
  insert into reparto_cambio_ruta (venta_tienda_codigo, venta_numero, de_tienda, de_numero, de_ruta, a_tienda, a_numero, a_ruta, quien, motivo)
  values (p_vt, p_vn, p_tienda, p_numero, o.ruta_codigo, p_dest_tienda, p_dest_numero, d.ruta_codigo, p_quien, left(trim(p_motivo), 500));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.fn_app_rep_cambiar_ruta(p_token uuid, p_tienda text, p_numero integer, p_vt text, p_vn integer, p_dest_tienda text, p_dest_numero integer, p_motivo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_rep text := reparto_privado.sesion(p_token);
begin
  perform reparto_privado.reparto(v_rep, p_tienda, p_numero);
  if not coalesce((select puede_cambiar_ruta from repartidor_pin where repartidor_codigo = v_rep), false) then
    raise exception 'No puedes cambiar pedidos de ruta: avisa en la oficina.';
  end if;
  return reparto_privado.mover_linea(p_tienda, p_numero, p_vt, p_vn, p_dest_tienda, p_dest_numero, p_motivo,
                                'Repartidor ' || coalesce((select coalesce(nullif(nombre_corto, ''), nombre) from repartidor where codigo = v_rep), v_rep));
end $$;

-- Desde el ERP (permiso de Repartos).
create or replace function public.fn_reparto_cambiar_ruta(p_tienda text, p_numero integer, p_vt text, p_vn integer, p_dest_tienda text, p_dest_numero integer, p_motivo text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not fn_puede('/repartos') then raise exception 'Sin permiso de Repartos.' using errcode = '42501'; end if;
  return reparto_privado.mover_linea(p_tienda, p_numero, p_vt, p_vn, p_dest_tienda, p_dest_numero, p_motivo, coalesce(fn_empleado_actual(), 'ERP'));
end $$;

-- ------------------------------------------------------------------ ERP: PIN, cierre y seguimiento
create or replace function public.fn_repartidor_pin_poner(p_repartidor text, p_pin text, p_puede_cambiar_ruta boolean default false) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not (fn_puede('/repartidores') or fn_puede('/repartos')) then raise exception 'Sin permiso.' using errcode = '42501'; end if;
  if p_pin !~ '^\d{4}$' then raise exception 'El PIN tiene que ser de 4 cifras.'; end if;
  if not exists (select 1 from repartidor where codigo = p_repartidor) then raise exception 'No existe ese repartidor.'; end if;
  insert into repartidor_pin (repartidor_codigo, pin_hash, puede_cambiar_ruta)
  values (p_repartidor, extensions.crypt(p_pin, extensions.gen_salt('bf')), coalesce(p_puede_cambiar_ruta, false))
  on conflict (repartidor_codigo) do update set pin_hash = excluded.pin_hash, puede_cambiar_ruta = excluded.puede_cambiar_ruta,
    fallos = 0, bloqueado_hasta = null, actualizado_en = now();
  update reparto_app_sesion set caduca_en = now() where repartidor_codigo = p_repartidor and caduca_en > now();  -- cierra sus sesiones
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.fn_repartidores_app() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when fn_puede('/repartidores') or fn_puede('/repartos') then coalesce(jsonb_agg(jsonb_build_object(
           'codigo', r.codigo, 'nombre', coalesce(nullif(r.nombre_corto, ''), r.nombre), 'con_pin', p.repartidor_codigo is not null,
           'puede_cambiar_ruta', coalesce(p.puede_cambiar_ruta, false)) order by coalesce(nullif(r.nombre_corto, ''), r.nombre)), '[]'::jsonb) end
    from repartidor r left join repartidor_pin p on p.repartidor_codigo = r.codigo
   where not coalesce(r.deshabilitado, false) $$;

-- Cierra un reparto: lo entregado queda; lo no entregado, con incidencia o sin marcar pasa al siguiente reparto
-- abierto de la misma ruta (o a uno nuevo para el siguiente día de reparto), arriba y marcado como «viene de anterior».
create or replace function public.fn_reparto_cerrar(p_tienda text, p_numero integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r reparto; s reparto; v_dia date; v_num integer; l reparto_linea; n_pasan int := 0; n_ok int := 0;
begin
  if not fn_puede('/repartos') then raise exception 'Sin permiso de Repartos.' using errcode = '42501'; end if;
  select * into r from reparto where tienda_terminal_codigo = p_tienda and numero = p_numero for update;
  if not found then raise exception 'No existe ese reparto.'; end if;
  if r.estado <> 2 then raise exception 'Ese reparto ya está cerrado.'; end if;

  for l in select * from reparto_linea where tienda_terminal_codigo = p_tienda and numero = p_numero
             and (estado in ('no_entregado', 'pendiente', 'viene_anterior') or (estado = 'entregado' and incidencia is not null)) loop
    if s.numero is null then
      select * into s from reparto where tienda_terminal_codigo = p_tienda and estado = 2 and ruta_codigo is not distinct from r.ruta_codigo
                                     and numero > p_numero order by numero limit 1;
      if not found then
        v_dia := greatest(r.fecha, fn_app_rep_hoy()) + 1;
        if extract(isodow from v_dia) = 7 then v_dia := v_dia + 1; end if;
        v_num := fn_siguiente_numero(p_tienda, 'reparto', '');
        insert into reparto (tienda_terminal_codigo, numero, fecha, ruta_codigo, repartidor_codigo, estado)
        values (p_tienda, v_num, v_dia, r.ruta_codigo, r.repartidor_codigo, 2) returning * into s;
      end if;
    end if;
    if l.estado in ('pendiente', 'viene_anterior') then
      update reparto_linea set estado = 'no_entregado', estado_observaciones = coalesce(estado_observaciones || ' · ', '') || 'Sin marcar al cerrar'
       where tienda_terminal_codigo = p_tienda and numero = p_numero and venta_tienda_codigo = l.venta_tienda_codigo and venta_numero = l.venta_numero;
    end if;
    insert into reparto_linea (tienda_terminal_codigo, numero, venta_tienda_codigo, venta_numero, zona_territorial_codigo, orden, contacto, direccion,
                               codigo_postal, provincia_codigo, pais_codigo, poblacion, telefono_fijo, telefono_movil, fax, email, estado,
                               reparto_anterior_tienda_codigo, reparto_anterior_numero, estado_observaciones, observaciones, bultos)
    values (s.tienda_terminal_codigo, s.numero, l.venta_tienda_codigo, l.venta_numero, l.zona_territorial_codigo, null, l.contacto, l.direccion,
            l.codigo_postal, l.provincia_codigo, l.pais_codigo, l.poblacion, l.telefono_fijo, l.telefono_movil, l.fax, l.email, 'viene_anterior',
            p_tienda, p_numero,
            'Anterior: ' || coalesce(case when l.estado in ('pendiente', 'viene_anterior') then 'sin marcar' else l.estado_observaciones end, 'no entregado'),
            l.observaciones, l.bultos)
    on conflict (tienda_terminal_codigo, numero, venta_tienda_codigo, venta_numero) do nothing;
    update venta set reparto_tienda_codigo = s.tienda_terminal_codigo, reparto_numero = s.numero
     where tienda_terminal_codigo = l.venta_tienda_codigo and numero = l.venta_numero;
    n_pasan := n_pasan + 1;
  end loop;

  select count(*) into n_ok from reparto_linea where tienda_terminal_codigo = p_tienda and numero = p_numero and estado = 'entregado' and incidencia is null;
  update reparto set estado = 4, fecha_hora_reparto = now(),
         total_ventas = (select coalesce(sum(v.total), 0) from reparto_linea x join venta v on v.tienda_terminal_codigo = x.venta_tienda_codigo and v.numero = x.venta_numero
                          where x.tienda_terminal_codigo = p_tienda and x.numero = p_numero),
         total_pagado = (select coalesce(sum(v.total_pagado), 0) from reparto_linea x join venta v on v.tienda_terminal_codigo = x.venta_tienda_codigo and v.numero = x.venta_numero
                          where x.tienda_terminal_codigo = p_tienda and x.numero = p_numero)
   where tienda_terminal_codigo = p_tienda and numero = p_numero;
  return jsonb_build_object('ok', true, 'entregados', n_ok, 'pasan', n_pasan,
                            'siguiente', case when s.numero is not null then s.tienda_terminal_codigo || '-' || s.numero end);
end $$;

-- Pantalla de seguimiento (TV): repartos del día, última posición, puntos marcados, ranking semanal y totales.
create or replace function public.fn_reparto_seguimiento(p_fecha date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_dia date := coalesce(p_fecha, fn_app_rep_hoy()); v_lunes date := date_trunc('week', coalesce(p_fecha, fn_app_rep_hoy()))::date;
begin
  if not fn_puede('/repartos') then raise exception 'Sin permiso de Repartos.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'fecha', v_dia,
    'rutas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tienda', r.tienda_terminal_codigo, 'numero', r.numero, 'estado', r.estado, 'ruta', r.ruta_codigo,
        'ruta_nombre', coalesce(rr.descripcion, r.ruta_codigo), 'repartidor', r.repartidor_codigo,
        'repartidor_nombre', coalesce(nullif(rp.nombre_corto, ''), rp.nombre),
        'total', k.total, 'entregados', k.entregados, 'incidencias', k.incidencias, 'no_entregados', k.no_entregados,
        'pendientes', k.pendientes, 'comprobados', k.comprobados,
        'posicion', (select jsonb_build_object('lat', p.lat, 'lng', p.lng, 'en', p.en) from reparto_posicion p
                      where p.tienda_terminal_codigo = r.tienda_terminal_codigo and p.numero = r.numero order by p.en desc limit 1),
        'puntos', (select coalesce(jsonb_agg(jsonb_build_object('lat', l.marcado_lat, 'lng', l.marcado_lng,
                            'estado', case when l.estado = 'entregado' and l.incidencia is not null then 'incidencia' else l.estado end)), '[]'::jsonb)
                     from reparto_linea l where l.tienda_terminal_codigo = r.tienda_terminal_codigo and l.numero = r.numero and l.marcado_lat is not null))
        order by r.ruta_codigo, r.numero)
      from reparto r
      left join ruta_reparto rr on rr.codigo = r.ruta_codigo
      left join repartidor rp on rp.codigo = r.repartidor_codigo
      cross join lateral (
        select count(*) total,
               count(*) filter (where estado in ('entregado', 'liquidado') and incidencia is null) entregados,
               count(*) filter (where estado = 'entregado' and incidencia is not null) incidencias,
               count(*) filter (where estado = 'no_entregado') no_entregados,
               count(*) filter (where estado in ('pendiente', 'viene_anterior')) pendientes,
               count(*) filter (where comprobado_en is not null) comprobados
          from reparto_linea l where l.tienda_terminal_codigo = r.tienda_terminal_codigo and l.numero = r.numero and l.estado <> 'anulado') k
      where r.fecha = v_dia or (r.estado = 2 and r.fecha < v_dia)), '[]'::jsonb),
    'ranking', coalesce((
      select jsonb_agg(jsonb_build_object('repartidor', x.nombre, 'entregados', x.n) order by x.n desc, x.nombre)
        from (select coalesce(nullif(rp.nombre_corto, ''), rp.nombre, r.repartidor_codigo) nombre, count(*) n
                from reparto_linea l join reparto r on r.tienda_terminal_codigo = l.tienda_terminal_codigo and r.numero = l.numero
                left join repartidor rp on rp.codigo = r.repartidor_codigo
               where l.estado in ('entregado', 'liquidado') and r.repartidor_codigo is not null
                 and coalesce((l.entregado_en at time zone 'Atlantic/Canary')::date, r.fecha) between v_lunes and v_lunes + 6
               group by 1) x), '[]'::jsonb),
    'totales', (
      select jsonb_build_object(
               'semana', count(*) filter (where d between v_lunes and v_lunes + 6),
               'mes', count(*) filter (where date_trunc('month', d) = date_trunc('month', v_dia)),
               'anio', count(*) filter (where date_trunc('year', d) = date_trunc('year', v_dia)))
        from (select coalesce((l.entregado_en at time zone 'Atlantic/Canary')::date, r.fecha) d
                from reparto_linea l join reparto r on r.tienda_terminal_codigo = l.tienda_terminal_codigo and r.numero = l.numero
               where l.estado in ('entregado', 'liquidado') and r.fecha >= date_trunc('year', v_dia)::date - 7) t));
end $$;

-- ------------------------------------------------------------------ Permisos de ejecución
-- Las funciones públicas comprueban la sesión (app) o fn_puede (ERP); las internas están en reparto_privado,
-- que la API no expone. Las tablas nuevas tienen RLS sin políticas: solo las leen estas funciones.

-- ------------------------------------------------------------------ Fichaje (03/11/2026, Rober)
-- Para entregar hay que haber fichado la entrada en Fichaje (fichaje.html, Firebase). La app lo comprueba leyendo
-- Fichaje; aquí solo se guarda qué persona de Fichaje es cada repartidor (llega en el botón «Mi reparto» de Fichaje).
-- La ruta del día siguiente se puede ver y comprobar la víspera (fn_app_rep_repartos: fecha <= hoy + 1).
alter table public.repartidor_pin add column if not exists fichaje_persona text;
create or replace function public.fn_app_rep_vincular_fichaje(p_token uuid, p_persona text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_rep text := reparto_privado.sesion(p_token);
begin
  if coalesce(trim(p_persona), '') = '' or length(p_persona) > 100 then raise exception 'Falta la persona de Fichaje.'; end if;
  update repartidor_pin set fichaje_persona = trim(p_persona) where repartidor_codigo = v_rep and fichaje_persona is distinct from trim(p_persona);
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.fn_app_rep_vincular_fichaje(uuid, text) to anon, authenticated;
-- fn_app_rep_login devuelve además 'fichaje_persona'; fn_app_rep_repartos devuelve 'manana' y admite fecha <= hoy + 1
-- (versiones completas aplicadas con execute_sql el 03/11/2026, iguales a las de arriba con esos dos cambios).

-- PIN de Fichaje elegido por cada persona (Rober, 03/11/2026): «ya tienen uno que llevan usando toda la vida». Todos
-- empiezan con el PIN 1234 (provisional); la primera vez que entran con él, la pantalla les pide su PIN nuevo y queda
-- guardado. Con el PIN provisional no se puede fichar. Gerencia puede volver a dejar a alguien con 1234 (si lo olvida).
alter table public.fichaje_pin add column if not exists provisional boolean not null default false;

-- Entrar: con el PIN provisional, en lugar del panel se pide el PIN nuevo.
create or replace function public.fn_fichaje_entrar(p_empleado text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not fichaje_privado.pin_ok(p_empleado, p_pin) then return jsonb_build_object('ok', false, 'error', 'PIN incorrecto.'); end if;
  if (select provisional from fichaje_pin where empleado_codigo = p_empleado) then
    return jsonb_build_object('ok', false, 'cambiar_pin', true,
      'nombre', (select coalesce(nullif(nombre_corto, ''), nombre) from empleado where codigo = p_empleado));
  end if;
  return fichaje_privado.panel(p_empleado);
end $$;

create or replace function public.fn_fichaje_pin_cambiar(p_empleado text, p_pin_actual text, p_pin_nuevo text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not fichaje_privado.pin_ok(p_empleado, p_pin_actual) then return jsonb_build_object('ok', false, 'error', 'PIN incorrecto.'); end if;
  if p_pin_nuevo !~ '^\d{4}$' then raise exception 'El PIN nuevo tiene que ser de 4 cifras.'; end if;
  if p_pin_nuevo = '1234' then raise exception 'Elige un PIN distinto de 1234.'; end if;
  perform set_config('erp.origen', 'Fichaje · cambio de PIN · ' || p_empleado, true);
  update fichaje_pin set pin_hash = extensions.crypt(p_pin_nuevo, extensions.gen_salt('bf')), provisional = false,
         fallos = 0, bloqueado_hasta = null, actualizado_en = now()
   where empleado_codigo = p_empleado;
  return fichaje_privado.panel(p_empleado);
end $$;
grant execute on function public.fn_fichaje_pin_cambiar(text, text, text) to anon, authenticated;

-- Fichar: con el PIN provisional no (primero hay que cambiarlo).
create or replace function fichaje_privado.pin_definitivo(p_emp text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if (select provisional from fichaje_pin where empleado_codigo = p_emp) then
    raise exception 'Primero elige tu PIN: entra con 1234 y pon el tuyo.';
  end if;
end $$;

create or replace function public.fn_fichaje_fichar(p_empleado text, p_pin text, p_tipo text,
  p_lat double precision default null, p_lng double precision default null, p_precision real default null, p_dispositivo text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_dia date := fichaje_privado.hoy(); v_estado text;
begin
  if not fichaje_privado.pin_ok(p_empleado, p_pin) then return jsonb_build_object('ok', false, 'error', 'PIN incorrecto.'); end if;
  perform fichaje_privado.pin_definitivo(p_empleado);
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

-- Gestión: dejar a alguien (o a todos los que no tienen) con el PIN inicial 1234.
create or replace function public.fn_fichaje_pin_inicial(p_empleado text default null) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare n integer;
begin
  if not fn_puede('/fichaje-gestion') then raise exception 'Sin permiso de Fichaje (gestión).' using errcode = '42501'; end if;
  if p_empleado is not null then
    insert into fichaje_pin (empleado_codigo, pin_hash, provisional) values (p_empleado, extensions.crypt('1234', extensions.gen_salt('bf')), true)
    on conflict (empleado_codigo) do update set pin_hash = excluded.pin_hash, provisional = true, fallos = 0, bloqueado_hasta = null, actualizado_en = now();
    return 1;
  end if;
  insert into fichaje_pin (empleado_codigo, pin_hash, provisional)
  select fe.empleado_codigo, extensions.crypt('1234', extensions.gen_salt('bf')), true
    from fichaje_empleado fe join empleado e on e.codigo = fe.empleado_codigo
   where fe.activo and e.activo and not exists (select 1 from fichaje_pin p where p.empleado_codigo = fe.empleado_codigo);
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.fn_fichaje_pin_inicial(text) to authenticated;

-- La plantilla de la gestión dice si el PIN es el provisional.
create or replace function public.fn_fichaje_plantilla() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when fn_puede('/fichaje-gestion') then coalesce(jsonb_agg(jsonb_build_object(
           'codigo', e.codigo, 'nombre', e.nombre, 'nombre_corto', e.nombre_corto, 'numero', e.numero_operario, 'activo', e.activo,
           'departamento', fe.departamento_codigo, 'repartidor', fe.repartidor_codigo, 'ficha', coalesce(fe.activo, false),
           'con_pin', p.empleado_codigo is not null, 'pin_provisional', coalesce(p.provisional, false),
           'horario_propio', exists (select 1 from fichaje_horario h where h.empleado_codigo = e.codigo))
         order by coalesce(nullif(e.nombre_corto, ''), e.nombre)), '[]'::jsonb) end
    from empleado e
    left join fichaje_empleado fe on fe.empleado_codigo = e.codigo
    left join fichaje_pin p on p.empleado_codigo = e.codigo
   where e.activo or fe.activo $$;
